import { useEffect, useRef, useState, useCallback } from 'react'
import ePub from 'epubjs'
import { readBinaryFile } from '@tauri-apps/api/fs'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import SettingsPanel from '../Settings/SettingsPanel'
import TocPanel from './TocPanel'
import BookmarksPanel from './BookmarksPanel'
import { Bookmark } from '../../types'

interface ChapterItem {
  index: number
  href: string
  idref: string
}

interface TocEntry {
  label: string
  index: number
  depth: number
}

export default function ReaderView() {
  const activeBookPath = useLibraryStore((s) => s.activeBookPath)
  const books = useLibraryStore((s) => s.books)
  const closeBook = useLibraryStore((s) => s.closeBook)
  const updateProgress = useLibraryStore((s) => s.updateProgress)
  const addBookmark = useLibraryStore((s) => s.addBookmark)
  const removeBookmark = useLibraryStore((s) => s.removeBookmark)
  const settings = useSettingsStore()

  const bookRef = useRef<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const globalCssRef = useRef<string>('')

  const [title, setTitle] = useState('')
  const [chapters, setChapters] = useState<ChapterItem[]>([])
  const [toc, setToc] = useState<TocEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [chapterHtml, setChapterHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showToc, setShowToc] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [focusMode, setFocusMode] = useState(false)

  const activeBook = books.find((b) => b.path === activeBookPath)
  const bookmarks = activeBook?.bookmarks ?? []
  const isCurrentBookmarked = bookmarks.some((bm) => bm.spineIndex === currentIndex)

  const loadChapter = useCallback(async (book: any, index: number) => {
    setLoading(true)
    try {
      const section = book.spine.get(index)
      if (!section) { setLoading(false); return }

      await section.load(book.load.bind(book))
      const doc: Document = section.document

      // Inline all images as data URLs
      const images = doc.querySelectorAll('img, image')
      await Promise.all(Array.from(images).map(async (el) => {
        const src = el.getAttribute('src') || el.getAttribute('xlink:href') || el.getAttribute('href')
        if (!src) return
        try {
          // epub.js 0.3.x Section has no resolve() — resolve manually.
          // Take the directory of the section's href and join the image src to it.
          const sectionDir = section.href.includes('/')
            ? section.href.substring(0, section.href.lastIndexOf('/') + 1)
            : ''
          const resolved = src.startsWith('/')
            ? src.slice(1)
            : (sectionDir + src).replace(/\/\.\//, '/')
          const mimeType = inferMimeType(resolved)

          // epub.js 0.3.x's Archive.request() has path-resolution quirks that
          // cause it to throw "File not found" even for files that ARE in the ZIP.
          // Bypass it entirely — access the underlying JSZip instance directly.
          const zip = (book.archive as any).zip as any
          const entry =
            zip.files[resolved] ??
            zip.files['/' + resolved] ??
            zip.files[resolved.replace(/^\//, '')]

          if (!entry) {
            console.error('[reader] image not in zip:', resolved,
              '| available:', Object.keys(zip.files).filter(k => /\.(jpe?g|png|gif|webp|svg)$/i.test(k)))
            return
          }

          const ab = await entry.async('arraybuffer') as ArrayBuffer
          const blob = new Blob([ab], { type: mimeType })
          const dataUrl = await blobToDataUrl(blob)

          const isSvgImage = el.tagName.toLowerCase() === 'image'
          if (isSvgImage) {
            // SVG <image> uses xlink:href/href -- never src
            // Keep width/height: they are SVG coordinate dimensions, not CSS stretching
            el.setAttribute('xlink:href', dataUrl)
            el.setAttribute('href', dataUrl)
          } else {
            // Regular <img>: use src, strip EPUB-authored size constraints
            el.setAttribute('src', dataUrl)
            el.removeAttribute('xlink:href')
            el.removeAttribute('width')
            el.removeAttribute('height')
            const style = el.getAttribute('style') || ''
            const cleaned = style.split(';')
              .filter((s) => !/^\s*(width|height|max-width|max-height)\s*:/.test(s))
              .join(';')
            cleaned.trim() ? el.setAttribute('style', cleaned) : el.removeAttribute('style')
          }
        } catch (err) {
          console.error('[reader] image load failed:', src, err)
        }
      }))

      // Fixed-layout comic/manga pages are often a full-page <svg> wrapping a single
      // <image>. Forcing that svg to stretch to the reading column width (via CSS
      // max-width:100%) upscales the embedded raster past its native resolution and
      // produces heavy blur. Unwrap these into plain <img> tags so they fall under
      // the same "never upscale past natural size" rule that regular <img>s use.
      Array.from(doc.querySelectorAll('svg')).forEach((svgEl) => {
        const imageEls = svgEl.querySelectorAll('image')
        if (imageEls.length !== 1) return // only unwrap single full-page-image svgs
        const imageEl = imageEls[0]
        const href = imageEl.getAttribute('href') || imageEl.getAttribute('xlink:href')
        if (!href || !href.startsWith('data:')) return

        const img = doc.createElement('img')
        img.setAttribute('src', href)
        img.setAttribute('alt', '')
        svgEl.replaceWith(img)
      })

      // Collect inline <style> blocks from the chapter
      const chapterStyles = Array.from(doc.querySelectorAll('style'))
        .map((s) => s.textContent || '')
        .join('\n')

      const body = doc.body.cloneNode(true) as HTMLElement
      body.querySelectorAll('script, link').forEach((el) => el.remove())

      const combinedCss = globalCssRef.current + '\n' + chapterStyles
      const styleTag = combinedCss.trim() ? `<style>${combinedCss}</style>` : ''

      setChapterHtml(styleTag + body.innerHTML)
      scrollRef.current?.scrollTo({ top: 0 })

      if (activeBook) {
        const progress = chapters.length > 0 ? index / chapters.length : 0
        updateProgress(activeBook.id, String(index), progress)
      }
    } catch (err) {
      console.error('[reader] chapter load error:', err)
      setChapterHtml('<p style="opacity:0.5">Failed to load this chapter.</p>')
    } finally {
      setLoading(false)
    }
  }, [activeBook, chapters, updateProgress])

  useEffect(() => {
    if (!activeBookPath) return
    let cancelled = false

    async function init() {
      setLoading(true)
      setLoadError(null)

      try {
        const data = await readBinaryFile(activeBookPath!)
        const book = ePub(data.buffer)
        bookRef.current = book

        // A genuinely corrupt or DRM-locked archive can leave book.ready
        // pending forever -- race it so the user always gets feedback
        // instead of a permanent "Loading..." screen.
        await Promise.race([
          book.ready,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 15000)
          ),
        ])

        if (cancelled) return

        try {
          const cssItems = Object.values(book.packaging.manifest as Record<string, any>)
            .filter((item) => item.type === 'text/css')

          const chunks = await Promise.all(
            cssItems.map(async (item) => {
              try { return await book.load(item.href) as string }
              catch { return '' }
            })
          )
          globalCssRef.current = chunks.filter(Boolean).join('\n')
          console.log('[reader] loaded', cssItems.length, 'CSS files from manifest')
        } catch {
          globalCssRef.current = ''
        }

        const meta = book.packaging.metadata
        setTitle(meta.title || 'Untitled')

        const items: ChapterItem[] = []
        book.spine.each((item: any) => {
          items.push({ index: item.index, href: item.href, idref: item.idref })
        })

        if (items.length === 0) {
          throw new Error('This EPUB has no readable chapters')
        }
        setChapters(items)

        // Build flattened table of contents, mapping each entry's href to a spine index
        try {
          const navigation = await book.loaded.navigation
          const flat: TocEntry[] = []

          const resolveToSpineIndex = (href: string): number => {
            const clean = href.split('#')[0]
            const match = items.find((it) =>
              it.href === clean || it.href.endsWith(clean) || clean.endsWith(it.href)
            )
            return match ? match.index : -1
          }

          const walk = (navItems: any[], depth: number) => {
            for (const navItem of navItems) {
              const index = resolveToSpineIndex(navItem.href || '')
              if (index !== -1) {
                flat.push({ label: navItem.label?.trim() || 'Untitled', index, depth })
              }
              if (navItem.subitems?.length) {
                walk(navItem.subitems, depth + 1)
              }
            }
          }

          walk(navigation?.toc || [], 0)
          setToc(flat)
          console.log('[reader] toc entries:', flat.length)
        } catch (err) {
          console.warn('[reader] toc load failed:', err)
          setToc([])
        }

        const startIndex = activeBook?.lastPosition
          ? Math.min(parseInt(activeBook.lastPosition, 10) || 0, items.length - 1)
          : 0
        setCurrentIndex(startIndex)
        await loadChapter(book, startIndex)
      } catch (err) {
        if (cancelled) return
        console.error('[reader] failed to open book:', err)
        const message =
          err instanceof Error && err.message === 'timeout'
            ? 'This book took too long to open. The file may be corrupt.'
            : err instanceof Error && err.message.includes('no such file')
            ? 'This file could not be found. It may have been moved or deleted.'
            : 'This book could not be opened. The file may be corrupt or unsupported.'
        setLoadError(message)
        setLoading(false)
      }
    }

    init().catch(console.error)
    return () => {
      cancelled = true
      bookRef.current?.destroy()
    }
  }, [activeBookPath])

  const goNext = useCallback(async () => {
    if (currentIndex < chapters.length - 1) {
      const next = currentIndex + 1
      setCurrentIndex(next)
      await loadChapter(bookRef.current, next)
    }
  }, [currentIndex, chapters, loadChapter])

  const goPrev = useCallback(async () => {
    if (currentIndex > 0) {
      const prev = currentIndex - 1
      setCurrentIndex(prev)
      await loadChapter(bookRef.current, prev)
    }
  }, [currentIndex, loadChapter])

  const goToIndex = useCallback(async (index: number) => {
    setCurrentIndex(index)
    setShowToc(false)
    setShowBookmarks(false)
    await loadChapter(bookRef.current, index)
  }, [loadChapter])

  // Quick-toggle: bookmark or unbookmark the chapter currently being read.
  // The label is taken from the matching TOC entry when one exists, since
  // that's far more meaningful than "Chapter 12" for navigation/EPUB files
  // that don't follow a strict numbered-chapter structure.
  const toggleBookmark = useCallback(() => {
    if (!activeBook) return
    const existing = bookmarks.find((bm) => bm.spineIndex === currentIndex)
    if (existing) {
      removeBookmark(activeBook.id, existing.id)
      return
    }
    const tocLabel = toc.find((t) => t.index === currentIndex)?.label
    const newBookmark: Bookmark = {
      id: crypto.randomUUID(),
      spineIndex: currentIndex,
      label: tocLabel || `Chapter ${currentIndex + 1}`,
      createdAt: Date.now(),
    }
    addBookmark(activeBook.id, newBookmark)
  }, [activeBook, bookmarks, currentIndex, toc, addBookmark, removeBookmark])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      // 'f' toggles focus mode; Escape only exits it (never opens it)
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) {
        setFocusMode((v) => !v)
      }
      if (e.key === 'Escape') {
        setFocusMode(false)
        setShowSettings(false)
        setShowToc(false)
        setShowBookmarks(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev])

  const themeStyle = {
    light: { background: '#ffffff', color: '#1a1a2e' },
    dark:  { background: '#111827', color: '#dde0ed' },
    sepia: { background: '#f8f0dc', color: '#4a3728' },
  }[settings.theme]

  const progress = chapters.length > 0 ? ((currentIndex + 1) / chapters.length) * 100 : 0

  const comfortStyles = `
    .reader-content {
      font-size: ${settings.fontSize}px !important;
      font-family: ${settings.fontFamily} !important;
      background: transparent !important;
    }
    /* line-height and color must hit every descendant, not just the container --
       EPUB stylesheets set these directly on paragraph classes (e.g. .block_4),
       and an explicit child value always wins over an inherited parent value,
       regardless of !important on the parent rule. */
    .reader-content, .reader-content * {
      line-height: ${settings.lineHeight} !important;
      color: ${themeStyle.color} !important;
    }
    /* Regular img: natural size, no stretching */
    .reader-content img {
      width: auto !important;
      height: auto !important;
      max-width: 100% !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      margin: 1em auto !important;
    }
    /* SVG container: scale to fit column */
    .reader-content svg {
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
      margin: 0 auto !important;
    }
    .reader-content * {
      max-height: none !important;
      overflow: visible !important;
    }
  `

  // Error state: file is corrupt, missing, or otherwise unreadable
  if (loadError) {
    return (
      <div className="flex flex-col h-full bg-pw-950">
        <header className="drag-region flex items-center px-5 py-2.5 bg-pw-900 border-b border-pw-700/40 flex-shrink-0">
          <button
            className="no-drag flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors"
            onClick={closeBook}
          >
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
            <p className="text-pw-100 font-semibold text-base">Couldn't open this book</p>
            <p className="text-pw-400 text-sm mt-1.5 max-w-sm">{loadError}</p>
          </div>
          <button
            onClick={closeBook}
            className="mt-1 px-5 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 text-white text-sm font-medium transition-all shadow-lg shadow-pw-500/30"
          >
            Back to Library
          </button>
        </div>
      </div>
    )
  }

  // Click-zone vertical offset/height depend on whether the toolbar is showing
  const clickZoneTop = focusMode ? 'top-0' : 'top-14'
  const clickZoneHeight = focusMode ? '100%' : 'calc(100% - 3.5rem)'

  return (
    <div className="flex flex-col h-full" style={themeStyle}>
      <style>{comfortStyles}</style>

      {!focusMode && (
        <header className="drag-region flex items-center justify-between px-5 py-2.5 bg-pw-900 border-b border-pw-700/40 flex-shrink-0 z-10">
          <div className="no-drag flex items-center gap-3">
            <button
              className="flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors"
              onClick={closeBook}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10.5 3L5.5 8L10.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Library
            </button>

            <span className="w-px h-4 bg-pw-700/60" />

            <button
              className="flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors px-2 py-1 rounded-lg hover:bg-pw-800/50"
              onClick={() => { setShowToc((v) => !v); setShowSettings(false); setShowBookmarks(false) }}
              title="Table of contents"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Contents
            </button>

            <button
              className="flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors px-2 py-1 rounded-lg hover:bg-pw-800/50"
              onClick={() => { setShowBookmarks((v) => !v); setShowSettings(false); setShowToc(false) }}
              title="Bookmarks"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 2.5h8a.5.5 0 01.5.5v10.5l-4.5-2.5-4.5 2.5V3a.5.5 0 01.5-.5z"
                  stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              {bookmarks.length > 0 && (
                <span className="text-xs text-pw-400">{bookmarks.length}</span>
              )}
            </button>
          </div>

          <div className="flex flex-col items-center min-w-0">
            <span className="text-xs font-medium text-pw-200 truncate max-w-sm">{title}</span>
            {chapters.length > 0 && (
              <span className="text-xs text-pw-400 mt-0.5">{currentIndex + 1} / {chapters.length}</span>
            )}
          </div>

          <div className="no-drag flex items-center gap-2">
            <button
              className={`p-1.5 rounded-lg border transition-colors ${
                isCurrentBookmarked
                  ? 'text-pw-300 border-pw-400/60 bg-pw-600/30'
                  : 'text-pw-300 border-pw-700/50 hover:border-pw-500/60 hover:bg-pw-800/50'
              }`}
              onClick={toggleBookmark}
              title={isCurrentBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill={isCurrentBookmarked ? 'currentColor' : 'none'}>
                <path d="M4 2.5h8a.5.5 0 01.5.5v10.5l-4.5-2.5-4.5 2.5V3a.5.5 0 01.5-.5z"
                  stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="text-pw-300 hover:text-pw-100 transition-colors p-1.5 rounded-lg border border-pw-700/50 hover:border-pw-500/60 hover:bg-pw-800/50"
              onClick={() => setFocusMode(true)}
              title="Focus mode (F)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 6V3a1 1 0 011-1h3M10 2h3a1 1 0 011 1v3M14 10v3a1 1 0 01-1 1h-3M6 14H3a1 1 0 01-1-1v-3"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="text-sm font-bold text-pw-300 hover:text-pw-100 transition-colors px-2.5 py-1 rounded-lg border border-pw-700/50 hover:border-pw-500/60 hover:bg-pw-800/50"
              onClick={() => { setShowSettings((v) => !v); setShowToc(false); setShowBookmarks(false) }}
            >
              Aa
            </button>
          </div>
        </header>
      )}

      <div className="h-0.5 w-full bg-pw-800 flex-shrink-0">
        <div
          className="h-full bg-gradient-to-r from-pw-500 to-pw-300 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-6 h-6 border-2 border-pw-500/30 border-t-pw-400 rounded-full animate-spin" />
            <span className="text-sm opacity-40" style={{ color: themeStyle.color }}>Loading...</span>
          </div>
        ) : (
          <>
            <div className={`fixed left-0 ${clickZoneTop} w-14 z-10 cursor-pointer`} style={{ height: clickZoneHeight }} onClick={goPrev} />
            <div className={`fixed right-0 ${clickZoneTop} w-14 z-10 cursor-pointer`} style={{ height: clickZoneHeight }} onClick={goNext} />

            <div
              className="mx-auto px-10 py-12 reader-content"
              style={{ maxWidth: `${settings.maxWidth}px` }}
              dangerouslySetInnerHTML={{ __html: chapterHtml }}
            />
          </>
        )}

        {showToc && (
          <div className="fixed left-4 top-14 z-20">
            <TocPanel
              toc={toc}
              currentIndex={currentIndex}
              onSelect={goToIndex}
              onClose={() => setShowToc(false)}
            />
          </div>
        )}

        {showBookmarks && (
          <div className="fixed left-4 top-14 z-20">
            <BookmarksPanel
              bookmarks={bookmarks}
              currentIndex={currentIndex}
              onSelect={goToIndex}
              onRemove={(bookmarkId) => activeBook && removeBookmark(activeBook.id, bookmarkId)}
              onClose={() => setShowBookmarks(false)}
            />
          </div>
        )}

        {showSettings && (
          <div className="fixed right-4 top-14 z-20">
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        )}

        {/* Focus mode: minimal floating exit button, dim by default, full opacity on hover */}
        {focusMode && (
          <button
            className="fixed top-4 right-4 z-30 w-9 h-9 rounded-full bg-pw-950/40 hover:bg-pw-900/90 backdrop-blur-sm border border-pw-600/30 hover:border-pw-500/60 flex items-center justify-center text-pw-300 hover:text-pw-100 opacity-30 hover:opacity-100 transition-all"
            onClick={() => setFocusMode(false)}
            title="Exit focus mode (Esc)"
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
          <button
            className="text-xs text-pw-300 hover:text-pw-100 transition-colors disabled:opacity-30 flex-shrink-0"
            onClick={goPrev}
            disabled={currentIndex === 0}
          >
            ← Prev
          </button>
          <div className="flex-1 h-0.5 bg-pw-700/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pw-500 to-pw-300 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            className="text-xs text-pw-300 hover:text-pw-100 transition-colors disabled:opacity-30 flex-shrink-0"
            onClick={goNext}
            disabled={currentIndex === chapters.length - 1}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function inferMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    avif: 'image/avif',
  }
  return map[ext] ?? 'image/jpeg'
}
