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

export function useBookImport() {
  const [importing, setImporting] = useState(false)
  const [errors, setErrors] = useState<ImportError[]>([])
  const addBook = useLibraryStore((s) => s.addBook)
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearErrorsLater = useCallback(() => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
    errorTimeoutRef.current = setTimeout(() => setErrors([]), 6000)
  }, [])

  // Shared by both the file picker and drag-and-drop import paths.
  // Each file is processed independently so one corrupt/DRM-locked EPUB
  // doesn't stop the rest of the batch from importing.
  const importPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return

    setImporting(true)
    const failed: ImportError[] = []

    for (const path of paths) {
      const fileName = path.split(/[\\/]/).pop() || path

      if (!path.toLowerCase().endsWith('.epub')) {
        failed.push({ fileName, message: 'Not an EPUB file' })
        continue
      }

      try {
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
        const newBook: Book = {
          id: crypto.randomUUID(),
          path,
          title: meta.title || fileName.replace(/\.epub$/i, ''),
          author: sanitizeAuthor(meta.creator || meta.publisher),
          coverUrl,
          addedAt: Date.now(),
        }

        addBook(newBook)
        console.log('[import] added:', newBook.title)
        book.destroy()
      } catch (err) {
        console.error('[import] failed:', fileName, err)
        const message =
          err instanceof Error && err.message === 'Timed out opening file'
            ? 'Took too long to open (file may be corrupt)'
            : 'Could not read this file (corrupt or unsupported EPUB)'
        failed.push({ fileName, message })
      }
    }

    if (failed.length > 0) {
      setErrors(failed)
      clearErrorsLater()
    }
    setImporting(false)
  }, [addBook, clearErrorsLater])

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

  return { importBooks, importPaths, importing, errors, dismissErrors }
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
