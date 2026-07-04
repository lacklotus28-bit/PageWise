import { useState, useCallback, useRef } from 'react'
import { open } from '@tauri-apps/api/dialog'
import { readBinaryFile, readDir, FileEntry } from '@tauri-apps/api/fs'
import { appWindow } from '@tauri-apps/api/window'
import { useLibraryStore } from '../store/libraryStore'
import { sanitizeAuthor } from '../utils/text'
import { saveCoverToDisk } from '../utils/coverStorage'
import { Book } from '../types'
import ePub from 'epubjs'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export interface ImportError { fileName: string; message: string }
export interface ImportProgress { total: number; completed: number; active: string[] }
export interface DuplicateNotice { fileName: string }

const IMPORT_CONCURRENCY = 3

export function useBookImport() {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [errors, setErrors] = useState<ImportError[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateNotice[]>([])
  const addBooks = useLibraryStore((s) => s.addBooks)
  // Read via getState() inside importPaths rather than subscribing with the
  // selector hook. A large folder import flushes newly-added books to the
  // store every ~400ms (see queueBook below), which previously changed the
  // `books` reference and re-created importPaths (and rebuilt knownPaths)
  // on every flush -- for a 500-book import that's over a thousand needless
  // duplicate-Set rebuilds competing with actual parsing for main-thread time.
  const getOrCreateCollectionForFolder = useLibraryStore((s) => s.getOrCreateCollectionForFolder)
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const duplicateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearErrorsLater = useCallback(() => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
    errorTimeoutRef.current = setTimeout(() => setErrors([]), 6000)
  }, [])

  const clearDuplicatesLater = useCallback(() => {
    if (duplicateTimeoutRef.current) clearTimeout(duplicateTimeoutRef.current)
    duplicateTimeoutRef.current = setTimeout(() => setDuplicates([]), 6000)
  }, [])

  const importPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    setImporting(true)
    const failed: ImportError[] = []
    const skippedDuplicates: DuplicateNotice[] = []
    let completed = 0
    const active = new Set<string>()
    const knownPaths = new Set(useLibraryStore.getState().books.map((b) => b.path))

    setProgress({ total: paths.length, completed: 0, active: [] })
    const pushProgress = () =>
      setProgress({ total: paths.length, completed, active: Array.from(active) })

    // Buffer newly-imported books and flush them to the store in batches
    // instead of calling addBook() once per file. Each store update
    // re-renders every subscribed component (library grid, sidebar,
    // toolbar) -- for a large folder import that's a lot of redundant
    // re-render work competing with the actual PDF/EPUB parsing for
    // main-thread time. Flushing periodically still shows books appearing
    // progressively, just far less often.
    let pendingBooks: Book[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flushPending = () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      if (pendingBooks.length === 0) return
      addBooks(pendingBooks)
      pendingBooks = []
    }
    const queueBook = (book: Book) => {
      pendingBooks.push(book)
      // Flush immediately once a small batch has built up, otherwise on a
      // short debounce so the UI still updates promptly for small imports.
      if (pendingBooks.length >= 8) {
        flushPending()
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushPending, 400)
      }
    }

    const processOne = async (path: string) => {
      const fileName = path.split(/[\\/]/).pop() || path

      if (knownPaths.has(path)) {
        skippedDuplicates.push({ fileName })
        completed += 1; pushProgress(); return
      }
      knownPaths.add(path)
      active.add(fileName); pushProgress()

      const ext = path.split('.').pop()?.toLowerCase()

      try {
        if (ext !== 'epub' && ext !== 'pdf') throw new Error('NOT_SUPPORTED')

        const pathParts = path.split(/[\\/]/)
        const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : ''
        const folderPath = pathParts.slice(0, -1).join('/')
        const collectionId = folderName
          ? getOrCreateCollectionForFolder(folderPath, folderName)
          : undefined

        const data = await readBinaryFile(path)
        // readBinaryFile returns a Uint8Array whose .buffer is typed as
        // ArrayBufferLike (which includes SharedArrayBuffer under newer TS
        // lib defs), but pdfjs-dist/epubjs require a concrete ArrayBuffer.
        // .slice() copies into a fresh, plain ArrayBuffer.
        const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer

        if (ext === 'pdf') {
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
          const pdf = await Promise.race([
            loadingTask.promise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 15000)
            ),
          ])

          const meta = await pdf.getMetadata().catch(() => ({ info: {} }))
          const info = (meta?.info as any) ?? {}

          const bookId = crypto.randomUUID()
          let coverPath: string | undefined
          try {
            const page = await pdf.getPage(1)
            // Render directly at the final thumbnail width instead of
            // rendering once at a fixed scale and then resizing the result
            // through a second canvas pass -- pdf.js can render straight to
            // the target size, so there's no need to encode/decode twice.
            const baseViewport = page.getViewport({ scale: 1 })
            const targetWidth = 400
            const scale = Math.min(1, targetWidth / baseViewport.width)
            const viewport = page.getViewport({ scale })
            const canvas = document.createElement('canvas')
            canvas.width = viewport.width
            canvas.height = viewport.height
            await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
            // Written to disk (not kept as base64 in the Book record) so the
            // persisted library JSON stays small -- see coverStorage.ts.
            coverPath = await saveCoverToDisk(dataUrl, bookId)
          } catch { /* skip cover */ }

          queueBook({
            id: bookId,
            path,
            title: info.Title || fileName.replace(/\.pdf$/i, ''),
            author: sanitizeAuthor(info.Author),
            coverPath,
            addedAt: Date.now(),
            collectionId,
            fileType: 'pdf',
          })

          // pdf.destroy() does not exist in pdfjs-dist -- cleanup() frees
          // resources without throwing
          try { await pdf.cleanup() } catch { /* ignore */ }
        } else {
          const book = ePub(arrayBuffer)
          await Promise.race([
            book.ready,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 15000)
            ),
          ])

          const meta = book.packaging.metadata
          const bookId = crypto.randomUUID()
          let coverPath: string | undefined
          try {
            const blobUrl = await book.coverUrl()
            if (blobUrl) {
              const fullDataUrl = await fetchToDataUrl(blobUrl)
              const resized = await resizeCover(fullDataUrl, 400)
              // Written to disk (not kept as base64 in the Book record) so
              // the persisted library JSON stays small -- see coverStorage.ts.
              coverPath = await saveCoverToDisk(resized, bookId)
            }
          } catch { /* skip cover */ }

          queueBook({
            id: bookId,
            path,
            title: meta.title || fileName.replace(/\.epub$/i, ''),
            author: sanitizeAuthor(meta.creator || meta.publisher),
            coverPath,
            addedAt: Date.now(),
            collectionId,
            fileType: 'epub',
          })
          book.destroy()
        }

        console.log('[import] added:', fileName)
      } catch (err) {
        console.error('[import] failed:', fileName, err)
        const msg = err instanceof Error
          ? err.message === 'NOT_SUPPORTED'
            ? 'Not an EPUB or PDF file'
            : err.message === 'timeout'
            ? 'Took too long to open (file may be corrupt)'
            : 'Could not read this file (corrupt or unsupported)'
          : 'Unknown error'
        failed.push({ fileName, message: msg })
      } finally {
        active.delete(fileName)
        completed += 1; pushProgress()
      }
    }

    let nextIndex = 0
    const worker = async () => {
      while (nextIndex < paths.length) {
        const path = paths[nextIndex++]
        await processOne(path)
      }
    }
    const workerCount = Math.min(IMPORT_CONCURRENCY, paths.length)
    await Promise.all(Array.from({ length: workerCount }, worker))

    flushPending()
    if (failed.length > 0) { setErrors(failed); clearErrorsLater() }
    if (skippedDuplicates.length > 0) { setDuplicates(skippedDuplicates); clearDuplicatesLater() }
    setImporting(false)
    setProgress(null)
  }, [addBooks, getOrCreateCollectionForFolder, clearErrorsLater, clearDuplicatesLater])

  const importBooks = useCallback(async () => {
    try {
      await appWindow.setFocus()
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Books', extensions: ['epub', 'pdf'] }],
      })
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
      await importPaths(paths)
    } catch (err) {
      console.error('[import] dialog failed:', err)
    }
  }, [importPaths])

  // Opens a native "choose folder(s)" dialog, recursively scans each folder
  // for supported files, then imports them the same way as manually-picked
  // files. Books get auto-assigned to a shelf named after their immediate
  // parent folder, same as drag-and-drop.
  const importFolders = useCallback(async () => {
    try {
      await appWindow.setFocus()
      const selected = await open({ multiple: true, directory: true })
      const folderPaths = Array.isArray(selected) ? selected : selected ? [selected] : []
      if (folderPaths.length === 0) return

      setImporting(true)
      const nestedResults = await Promise.all(
        folderPaths.map((folderPath) =>
          collectSupportedFilesFromFolder(folderPath).catch((err) => {
            console.error('[import] failed to scan folder:', folderPath, err)
            return [] as string[]
          })
        )
      )
      const filePaths = Array.from(new Set(nestedResults.flat()))
      setImporting(false)

      if (filePaths.length === 0) {
        setErrors([{ fileName: folderPaths.map((p) => p.split(/[\\/]/).pop()).join(', '), message: 'No EPUB or PDF files found in this folder' }])
        clearErrorsLater()
        return
      }
      await importPaths(filePaths)
    } catch (err) {
      console.error('[import] folder dialog failed:', err)
      setImporting(false)
    }
  }, [importPaths, clearErrorsLater])

  // Drag-and-drop can hand us a mix of files and folders in one drop. Tauri's
  // file-drop event gives raw paths without indicating which are folders, so
  // each path is probed with readDir -- if that succeeds it's a folder and
  // gets scanned recursively, otherwise it's treated as a regular file.
  const importDroppedPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    setImporting(true)
    const resolved = await Promise.all(
      paths.map(async (path) => {
        try {
          const entries = await readDir(path, { recursive: true })
          return collectSupportedFilesFromEntries(entries)
        } catch {
          // Not a directory (or unreadable as one) -- treat as a plain file.
          return [path]
        }
      })
    )
    setImporting(false)
    const filePaths = Array.from(new Set(resolved.flat()))
    await importPaths(filePaths)
  }, [importPaths])

  const dismissErrors = useCallback(() => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
    setErrors([])
  }, [])

  const dismissDuplicates = useCallback(() => {
    if (duplicateTimeoutRef.current) clearTimeout(duplicateTimeoutRef.current)
    setDuplicates([])
  }, [])

  return {
    importBooks,
    importFolders,
    importPaths,
    importDroppedPaths,
    importing,
    progress,
    errors,
    dismissErrors,
    duplicates,
    dismissDuplicates,
  }
}

async function fetchToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Recursively walks a directory tree (Tauri's readDir with recursive:true
// already returns nested `children`, this just flattens the result down to
// a list of supported book file paths).
async function collectSupportedFilesFromEntries(entries: FileEntry[]): Promise<string[]> {
  const results: string[] = []
  for (const entry of entries) {
    if (entry.children) {
      results.push(...(await collectSupportedFilesFromEntries(entry.children)))
    } else if (entry.path) {
      const ext = entry.path.split('.').pop()?.toLowerCase()
      if (ext === 'epub' || ext === 'pdf') results.push(entry.path)
    }
  }
  return results
}

async function collectSupportedFilesFromFolder(folderPath: string): Promise<string[]> {
  const entries = await readDir(folderPath, { recursive: true })
  return collectSupportedFilesFromEntries(entries)
}

function resizeCover(dataUrl: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
