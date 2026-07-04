import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { readBinaryFile } from '@tauri-apps/api/fs'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export default function PdfReaderView() {
  const activeBookPath = useLibraryStore((s) => s.activeBookPath)
  const books = useLibraryStore((s) => s.books)
  const closeBook = useLibraryStore((s) => s.closeBook)
  const updateProgress = useLibraryStore((s) => s.updateProgress)
  const recordReadingTime = useLibraryStore((s) => s.recordReadingTime)
  const settings = useSettingsStore()

  const pdfRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<any>(null)
  const sessionStartRef = useRef<number>(Date.now())

  const [title, setTitle] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [jumpInput, setJumpInput] = useState('')
  const [showJump, setShowJump] = useState(false)

  const activeBook = books.find((b) => b.path === activeBookPath)

  const flushTime = useCallback(() => {
    if (!activeBook) return
    const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000)
    if (elapsed > 2) recordReadingTime(activeBook.id, elapsed)
    sessionStartRef.current = Date.now()
  }, [activeBook, recordReadingTime])

  useEffect(() => { return () => { flushTime() } }, [flushTime])

  const renderPage = useCallback(async (pdf: any, pageNum: number) => {
    if (!canvasRef.current || !containerRef.current) return
    setPageLoading(true)

    // If a render is already in flight, cancel it and wait for it to actually
    // finish tearing down before starting a new one on the same canvas.
    // pdf.js cancellation is asynchronous -- calling .cancel() and
    // immediately starting a new render() races both against the same
    // canvas and throws "Cannot use the same canvas during multiple
    // render() operations". Awaiting the (rejected) promise first ensures
    // the canvas is actually free.
    if (renderTaskRef.current) {
      const prevTask = renderTaskRef.current
      try { prevTask.cancel() } catch { /* ignore */ }
      try { await prevTask.promise } catch { /* expected: cancellation rejects */ }
      if (renderTaskRef.current === prevTask) renderTaskRef.current = null
    }

    try {
      const page = await pdf.getPage(pageNum)
      const containerWidth = containerRef.current.clientWidth - 80
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.max(0.5, containerWidth / baseViewport.width)
      const viewport = page.getViewport({ scale })

      const canvas = canvasRef.current
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)

      const ctx = canvas.getContext('2d')!
      const task = page.render({ canvas, canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise
      if (renderTaskRef.current === task) renderTaskRef.current = null
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException') return
      console.error('[pdf] render error:', err)
    } finally {
      setPageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!activeBookPath) return
    const path = activeBookPath
    let cancelled = false

    async function init() {
      setLoading(true); setLoadError(null)
      try {
        const data = await readBinaryFile(path)
        // readBinaryFile's Uint8Array.buffer is ArrayBufferLike (which
        // includes SharedArrayBuffer); pdfjs-dist wants a plain ArrayBuffer.
        const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
        const pdf = await Promise.race([
          pdfjsLib.getDocument({ data: arrayBuffer }).promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 20000)
          ),
        ])
        pdfRef.current = pdf
        if (cancelled) return

        const meta = await pdf.getMetadata().catch(() => ({ info: {} }))
        const info = (meta?.info as any) ?? {}
        setTitle(
          info.Title ||
          path.split(/[\\/]/).pop()?.replace(/\.pdf$/i, '') ||
          'Untitled'
        )
        setTotalPages(pdf.numPages)

        const startPage = activeBook?.lastPosition
          ? Math.min(Math.max(1, parseInt(activeBook.lastPosition, 10) || 1), pdf.numPages)
          : 1
        setCurrentPage(startPage)
        containerRef.current?.scrollTo({ top: 0 })
        await renderPage(pdf, startPage)
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error && err.message === 'timeout'
          ? 'This PDF took too long to open. The file may be corrupt.'
          : 'This PDF could not be opened. The file may be corrupt or unsupported.'
        setLoadError(msg)
      } finally {
        setLoading(false)
      }
    }

    init().catch(console.error)
    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch { /* ignore */ }
      }
      // pdf.destroy() can throw/reject depending on pdfjs-dist version and
      // document state. An uncaught throw here during unmount (e.g. when
      // closing the book to go back to the library) crashes the whole React
      // tree with no error boundary to catch it, leaving a blank window
      // until the app is manually refreshed. Guard defensively and fall back
      // to cleanup() if destroy isn't available.
      const pdf = pdfRef.current
      pdfRef.current = null
      try {
        const result = typeof pdf?.destroy === 'function' ? pdf.destroy() : pdf?.cleanup?.()
        if (result && typeof result.catch === 'function') {
          result.catch(() => { /* ignore */ })
        }
      } catch { /* ignore */ }
    }
  }, [activeBookPath])

  const goToPage = useCallback(async (pageNum: number) => {
    if (!pdfRef.current || totalPages === 0) return
    flushTime()
    const clamped = Math.max(1, Math.min(pageNum, totalPages))
    setCurrentPage(clamped)
    containerRef.current?.scrollTo({ top: 0 })
    await renderPage(pdfRef.current, clamped)
    if (activeBook) {
      const progress = (clamped - 1) / totalPages
      updateProgress(activeBook.id, String(clamped), progress)
    }
    sessionStartRef.current = Date.now()
  }, [totalPages, activeBook, updateProgress, flushTime, renderPage])

  const goNext = useCallback(() => {
    if (currentPage < totalPages) goToPage(currentPage + 1)
  }, [currentPage, totalPages, goToPage])

  const goPrev = useCallback(() => {
    if (currentPage > 1) goToPage(currentPage - 1)
  }, [currentPage, goToPage])

  useEffect(() => {
    if (!pdfRef.current || totalPages === 0) return
    const observer = new ResizeObserver(() => {
      renderPage(pdfRef.current, currentPage)
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [currentPage, totalPages, renderPage])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showJump) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) setFocusMode((v) => !v)
      if (e.key === 'Escape') { setFocusMode(false); setShowJump(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, showJump])

  const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0

  const bgColor = {
    light: '#e5e5e5',
    dark: '#111827',
    sepia: '#d6ccb4',
  }[settings.theme]

  if (loadError) {
    return (
      <div className="flex flex-col h-full bg-pw-950">
        <header className="drag-region flex items-center px-5 py-2.5 bg-pw-900 border-b border-pw-700/40 flex-shrink-0">
          <button className="no-drag flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors" onClick={closeBook}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10.5 3L5.5 8L10.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Library
          </button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-pw-800 border border-red-500/30 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 8v5M12 16h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="#f87171" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-pw-100 font-semibold text-base">Couldn't open this PDF</p>
            <p className="text-pw-400 text-sm mt-1.5 max-w-sm">{loadError}</p>
          </div>
          <button onClick={closeBook} className="mt-1 px-5 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 text-white text-sm font-medium transition-all">
            Back to Library
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: bgColor }}>
      {!focusMode && (
        <header className="drag-region flex items-center justify-between px-5 py-2.5 bg-pw-900 border-b border-pw-700/40 flex-shrink-0 z-10">
          <button
            className="no-drag flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors"
            onClick={closeBook}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10.5 3L5.5 8L10.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Library
          </button>

          <div className="flex flex-col items-center min-w-0">
            <span className="text-xs font-medium text-pw-200 truncate max-w-sm">{title}</span>
            {totalPages > 0 && (
              <button
                className="text-xs text-pw-400 mt-0.5 hover:text-pw-200 transition-colors"
                onClick={() => { setJumpInput(''); setShowJump(true) }}
                title="Jump to page"
              >
                {currentPage} / {totalPages}
              </button>
            )}
          </div>

          <button
            className="no-drag text-pw-300 hover:text-pw-100 transition-colors p-1.5 rounded-lg border border-pw-700/50 hover:border-pw-500/60 hover:bg-pw-800/50"
            onClick={() => setFocusMode(true)}
            title="Focus mode (F)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 6V3a1 1 0 011-1h3M10 2h3a1 1 0 011 1v3M14 10v3a1 1 0 01-1 1h-3M6 14H3a1 1 0 01-1-1v-3"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </header>
      )}

      <div className="h-0.5 w-full bg-pw-800 flex-shrink-0">
        <div
          className="h-full bg-gradient-to-r from-pw-500 to-pw-300 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto relative flex items-start justify-center py-8"
      >
        <div className="fixed left-0 top-0 w-14 h-full z-10 cursor-pointer" onClick={goPrev} />
        <div className="fixed right-0 top-0 w-14 h-full z-10 cursor-pointer" onClick={goNext} />

        {loading ? (
          <div className="flex flex-col items-center gap-3 mt-32">
            <div className="w-6 h-6 border-2 border-pw-500/30 border-t-pw-400 rounded-full animate-spin" />
            <span className="text-sm text-pw-400">Loading...</span>
          </div>
        ) : (
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="shadow-2xl shadow-black/40 rounded"
              style={{ opacity: pageLoading ? 0.4 : 1, transition: 'opacity 0.15s', maxWidth: '100%' }}
            />
            {pageLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-pw-400/40 border-t-pw-400 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}

        {showJump && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-pw-950/50 backdrop-blur-sm"
            onClick={() => setShowJump(false)}
          >
            <div
              className="bg-pw-800 border border-pw-600/50 rounded-xl px-5 py-4 shadow-2xl flex flex-col gap-3 w-56"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-pw-400">Go to page</p>
              <input
                autoFocus
                type="number"
                min={1}
                max={totalPages}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { const n = parseInt(jumpInput, 10); if (!isNaN(n)) goToPage(n); setShowJump(false) }
                  if (e.key === 'Escape') setShowJump(false)
                }}
                placeholder={`1 - ${totalPages}`}
                className="w-full text-sm rounded-lg border border-pw-600/50 text-pw-100 px-3 py-2 focus:outline-none focus:border-pw-400"
                style={{ background: '#201A47' }}
              />
              <button
                className="text-sm font-medium text-white px-3 py-1.5 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 transition-all"
                onClick={() => { const n = parseInt(jumpInput, 10); if (!isNaN(n)) goToPage(n); setShowJump(false) }}
              >
                Go
              </button>
            </div>
          </div>
        )}

        {focusMode && (
          <button
            className="fixed top-4 right-4 z-30 w-9 h-9 rounded-full bg-pw-950/40 hover:bg-pw-900/90 backdrop-blur-sm border border-pw-600/30 hover:border-pw-500/60 flex items-center justify-center text-pw-300 hover:text-pw-100 opacity-30 hover:opacity-100 transition-all"
            onClick={() => setFocusMode(false)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v3M10 2h3a1 1 0 011 1v3M2 10v3a1 1 0 001 1h3M14 10v3a1 1 0 01-1 1h-3"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {!focusMode && (
        <div className="flex items-center gap-4 px-6 py-2 bg-pw-900 border-t border-pw-700/40 flex-shrink-0">
          <button className="text-xs text-pw-300 hover:text-pw-100 transition-colors disabled:opacity-30 flex-shrink-0" onClick={goPrev} disabled={currentPage <= 1}>
            ← Prev
          </button>
          <div className="flex-1 h-0.5 bg-pw-700/40 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-pw-500 to-pw-300 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <button className="text-xs text-pw-300 hover:text-pw-100 transition-colors disabled:opacity-30 flex-shrink-0" onClick={goNext} disabled={currentPage >= totalPages}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
