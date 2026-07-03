import { useState, useCallback, useRef } from 'react'
import { open } from '@tauri-apps/api/dialog'
import { readBinaryFile } from '@tauri-apps/api/fs'
import { appWindow } from '@tauri-apps/api/window'
import { Book } from '../types'
import { useLibraryStore } from '../store/libraryStore'
import { sanitizeAuthor } from '../utils/text'
import ePub from 'epubjs'

export interface ImportError {
  fileName: string
  message: string
}

export interface ImportProgress {
  total: number
  completed: number
  // File names currently being read/parsed (more than one when running concurrently)
  active: string[]
}

// How many files to process at once. EPUB parsing + cover extraction is a mix of
// I/O and canvas work, so a small pool overlaps nicely without saturating the
// main thread the way unlimited concurrency would.
const IMPORT_CONCURRENCY = 3

export interface DuplicateNotice {
  fileName: string
}

export function useBookImport() {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [errors, setErrors] = useState<ImportError[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateNotice[]>([])
  const addBook = useLibraryStore((s) => s.addBook)
  const books = useLibraryStore((s) => s.books)
  const getOrCreateCollectionForFolder = useLibraryStore((s) => s.getOrCreateCollectionForFolder)
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const duplicateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDuplicatesLater = useCallback(() => {
    if (duplicateTimeoutRef.current) clearTimeout(duplicateTimeoutRef.current)
    duplicateTimeoutRef.current = setTimeout(() => setDuplicates([]), 6000)
  }, [])

  const clearErrorsLater = useCallback(() => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
    errorTimeoutRef.current = setTimeout(() => setErrors([]), 6000)
  }, [])

  // Shared by both the file picker and drag-and-drop import paths.
  // Each file is processed independently so one corrupt/DRM-locked EPUB
  // doesn't stop the rest of the batch from importing. Files are processed
  // through a small worker pool (IMPORT_CONCURRENCY at a time) instead of
  // strictly one-at-a-time, since parsing/cover-extraction is mostly waiting
  // on I/O and there's no reason file 2 can't start while file 1 is still
  // extracting its cover.
  const importPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return

    setImporting(true)
    const failed: ImportError[] = []
    const skippedDuplicates: DuplicateNotice[] = []
    let completed = 0
    const active = new Set<string>()

    // Snapshot of paths already in the library, mutated as the batch imports
    // so two copies of the same file in one drag-drop batch also get caught,
    // not just duplicates against books already in the library.
    const knownPaths = new Set(books.map((b) => b.path))

    setProgress({ total: paths.length, completed: 0, active: [] })
    const pushProgress = () =>
      setProgress({ total: paths.length, completed, active: Array.from(active) })

    const processOne = async (path: string) => {
      const fileName = path.split(/[\\/]/).pop() || path

      // Duplicate check happens before any file I/O or parsing -- cheapest
      // possible rejection, and avoids wasted cover-extraction work.
      if (knownPaths.has(path)) {
        skippedDuplicates.push({ fileName })
        completed += 1
        pushProgress()
        return
      }
      knownPaths.add(path)

      active.add(fileName)
      pushProgress()

      try {
        if (!path.toLowerCase().endsWith('.epub')) {
          throw new Error('NOT_EPUB')
        }

        const data = await readBinaryFile(path)
        const book = ePub(data.buffer)

        // book.ready can hang forever on a genuinely corrupt archive --
        // race it against a timeout so the UI never gets stuck on a bad file.
        await Promise.race([
          book.ready,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timed out opening file')), 15000)
          ),
        ])

        const meta = book.packaging.metadata

        let coverUrl: string | undefined
        try {
          const blobUrl = await book.coverUrl()
          if (blobUrl) {
            const fullDataUrl = await fetchToDataUrl(blobUrl)
            coverUrl = await resizeCover(fullDataUrl, 400)
          }
        } catch {
          console.warn('[import] cover extraction failed for', fileName)
        }

        // Some EPUBs (fan/scanlation releases especially) put literal
        // placeholder junk like "---" in the author field instead of
        // leaving it empty. sanitizeAuthor() catches that and falls
        // back to a clean "Unknown Author" label.

        // Auto-shelve by parent folder: every file resolves its shelf
        // independently (not just within a batch), keyed by folder path so
        // files imported today and files imported months later from the same
        // folder still land on the same shelf, even after renames.
        const pathParts = path.split(/[\\/]/)
        const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : ''
        const folderPath = pathParts.slice(0, -1).join('/')
        const collectionId = folderName
          ? getOrCreateCollectionForFolder(folderPath, folderName)
          : undefined

        const newBook: Book = {
          id: crypto.randomUUID(),
          path,
          title: meta.title || fileName.replace(/\.epub$/i, ''),
          author: sanitizeAuthor(meta.creator || meta.publisher),
          coverUrl,
          addedAt: Date.now(),
          collectionId,
        }

        addBook(newBook)
        console.log('[import] added:', newBook.title)
        book.destroy()
      } catch (err) {
        console.error('[import] failed:', fileName, err)
        const message =
          err instanceof Error && err.message === 'NOT_EPUB'
            ? 'Not an EPUB file'
            : err instanceof Error && err.message === 'Timed out opening file'
              ? 'Took too long to open (file may be corrupt)'
              : 'Could not read this file (corrupt or unsupported EPUB)'
        failed.push({ fileName, message })
      } finally {
        active.delete(fileName)
        completed += 1
        pushProgress()
      }
    }

    // Simple worker-pool: each worker pulls the next path off the shared
    // queue as soon as it's free, so at most IMPORT_CONCURRENCY files are
    // being read/parsed/cover-extracted at any one time.
    let nextIndex = 0
    const worker = async () => {
      while (nextIndex < paths.length) {
        const path = paths[nextIndex++]
        await processOne(path)
      }
    }
    const workerCount = Math.min(IMPORT_CONCURRENCY, paths.length)
    await Promise.all(Array.from({ length: workerCount }, worker))

    if (failed.length > 0) {
      setErrors(failed)
      clearErrorsLater()
    }
    if (skippedDuplicates.length > 0) {
      setDuplicates(skippedDuplicates)
      clearDuplicatesLater()
    }
    setImporting(false)
    setProgress(null)
  }, [addBook, books, getOrCreateCollectionForFolder, clearErrorsLater, clearDuplicatesLater])

  const importBooks = useCallback(async () => {
    try {
      await appWindow.setFocus()

      const selected = await open({
        multiple: true,
        filters: [{ name: 'EPUB', extensions: ['epub'] }],
      })

      const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
      await importPaths(paths)
    } catch (err) {
      console.error('[import] dialog failed:', err)
    }
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
    importPaths,
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

// Resize cover to max width using canvas, returns compressed JPEG data URL
function resizeCover(dataUrl: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => resolve(dataUrl) // fallback to original if resize fails
    img.src = dataUrl
  })
}
