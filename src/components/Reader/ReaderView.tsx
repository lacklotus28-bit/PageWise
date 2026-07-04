import { useEffect, useRef, useState, useCallback } from 'react'
import ePub from 'epubjs'
import { readBinaryFile } from '@tauri-apps/api/fs'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useClickOutside } from '../../hooks/useClickOutside'
import SettingsPanel from '../Settings/SettingsPanel'
import TocPanel from './TocPanel'
import BookmarksPanel from './BookmarksPanel'
import SearchBar from './SearchBar'
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
  const updateScrollOffset = useLibraryStore((s) => s.updateScrollOffset)
  const addBookmark = useLibraryStore((s) => s.addBookmark)
  const removeBookmark = useLibraryStore((s) => s.removeBookmark)
  const recordReadingTime = useLibraryStore((s) => s.recordReadingTime)
  const markChapterVisited = useLibraryStore((s) => s.markChapterVisited)
  const settings = useSettingsStore()

  const bookRef = useRef<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const globalCssRef = useRef<string>('')
  const sessionStartRef = useRef<number>(Date.now())
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeBookIdRef = useRef<string | null>(null)
  const tocRef = useRef<HTMLDivElement>(null)
  const bookmarksRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const tocButtonRef = useRef<HTMLButtonElement>(null)
  const bookmarksButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)

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

  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [matchCount, setMatchCount] = useState(0)

  const activeBook = books.find((b) => b.path === activeBookPath)
  const bookmarks = activeBook?.bookmarks ?? []
  const isCurrentBookmarked = bookmarks.some((bm) => bm.spineIndex === currentIndex)

  // Flush elapsed seconds to the store. Called before every chapter change and on unmount.
  const flushTime = useCallback(() => {
    if (!activeBook) return
    const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000)
    if (elapsed > 2) recordReadingTime(activeBook.id, elapsed)
    sessionStartRef.current = Date.now()
  }, [activeBook, recordReadingTime])

  useEffect(() => {
    return () => { flushTime() }
  }, [flushTime])

  // ---------- Scroll position persistence ----------
  // Saves how far the reader has scrolled through the *current* chapter, so
  // reopening a chapter (or the book) resumes at the exact spot instead of
  // always jumping back to the top.

  // Keep a ref to the active book id so save callbacks below don't need to
  // depend on the `activeBook` object itself (a new reference every render
  // whenever `books` changes) -- depending on it caused a save -> re-render ->
  // new callback identity -> cleanup fires -> save again infinite loop.
  useEffect(() => {
    activeBookIdRef.current = activeBook?.id ?? null
  }, [activeBook?.id])

  const flushScroll = useCallback(() => {
    const id = activeBookIdRef.current
    if (!id || !scrollRef.current) return
    const el = scrollRef.current
    const maxScroll = el.scrollHeight - el.clientHeight
    const fraction = maxScroll > 0 ? el.scrollTop / maxScroll : 0
    updateScrollOffset(id, fraction)
  }, [updateScrollOffset])

  const handleScroll = useCallback(() => {
    if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
    scrollSaveTimerRef.current = setTimeout(flushScroll, 400)
  }, [flushScroll])

  useEffect(() => {
    return () => {
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
      flushScroll()
    }
  }, [flushScroll])

  // ---------- Search ----------

  const clearHighlights = useCallback(() => {
    if (!contentRef.current) return
    contentRef.current.querySelectorAll('mark.pw-match').forEach((mark) => {
      const parent = mark.parentNode
      if (!parent) return
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
      parent.normalize()
    })
  }, [])

  const applyHighlights = useCallback((query: string): number => {
    if (!contentRef.current || query.length < 1) return 0
    clearHighlights()
    const lq = query.toLowerCase()
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          const tag = parent.tagName.toLowerCase()
          if (tag === 'style' || tag === 'script') return NodeFilter.FILTER_REJECT
          return node.textContent?.toLowerCase().includes(lq)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT
        },
      }
    )
    const textNodes: Text[] = []
    let node: Node | null
    while ((node = walker.nextNode())) textNodes.push(node as Text)

    let count = 0
    for (const textNode of textNodes) {
      const text = textNode.textContent || ''
      const ltext = text.toLowerCase()
      const fragments: Node[] = []
      let last = 0
      let idx = ltext.indexOf(lq)
      while (idx !== -1) {
        if (idx > last) fragments.push(document.createTextNode(text.slice(last, idx)))
        const mark = document.createElement('mark')
        mark.className = 'pw-match'
        mark.textContent = text.slice(idx, idx + query.length)
        fragments.push(mark)
        count++
        last = idx + query.length
        idx = ltext.indexOf(lq, last)
      }
      if (fragments.length > 0) {
        if (last < text.length) fragments.push(document.createTextNode(text.slice(last)))
        const parent = textNode.parentNode!
        fragments.forEach((f) => parent.insertBefore(f, textNode))
        parent.removeChild(textNode)
      }
    }
    return count
  }, [clearHighlights])

  const activateMatch = useCallback((idx: number) => {
    if (!contentRef.current) return
    const marks = contentRef.current.querySelectorAll('mark.pw-match')
    marks.forEach((m, i) => { m.classList.toggle('pw-match-active', i === idx) })
    const active = marks[idx] as HTMLElement | undefined
    active?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!showSearch || !contentRef.current) return
    if (searchQuery.trim().length < 1) {
      clearHighlights(); setMatchCount(0); setMatchIndex(0); return
    }
    const count = applyHighlights(searchQuery)
    setMatchCount(count); setMatchIndex(0)
    if (count > 0) activateMatch(0)
  }, [searchQuery, chapterHtml, showSearch, applyHighlights, clearHighlights, activateMatch])

  const goNextMatch = useCallback(() => {
    if (matchCount === 0) return
    const next = (matchIndex + 1) % matchCount
    setMatchIndex(next); activateMatch(next)
  }, [matchIndex, matchCount, activateMatch])

  const goPrevMatch = useCallback(() => {
    if (matchCount === 0) return
    const prev = (matchIndex - 1 + matchCount) % matchCount
    setMatchIndex(prev); activateMatch(prev)
  }, [matchIndex, matchCount, activateMatch])

  const closeSearch = useCallback(() => {
    setShowSearch(false); setSearchQuery('')
    clearHighlights(); setMatchCount(0); setMatchIndex(0)
  }, [clearHighlights])

  // ---------- Chapter loading ----------

  const loadChapter = useCallback(async (book: any, index: number, restoreScrollFraction?: number) => {
    flushTime()
    setLoading(true)
    closeSearch()
    try {
      const section = book.spine.get(index)
      if (!section) { setLoading(false); return }

      await section.load(book.load.bind(book))
      const doc: Document = section.document

      const images = doc.querySelectorAll('img, image')
      await Promise.all(Array.from(images).map(async (el) => {
        const src = el.getAttribute('src') || el.getAttribute('xlink:href') || el.getAttribute('href')
        if (!src) return
        try {
          const sectionDir = section.href.includes('/')
            ? section.href.substring(0, section.href.lastIndexOf('/') + 1) : ''
          const relativePath = src.startsWith('/')
            ? src.slice(1)
            : normalizeEpubPath(sectionDir + src)
          const mimeType = inferMimeType(relativePath)
          // `relativePath` is relative to the OPF file's own directory (e.g.
          // "Images/cover.jpg"), but the raw zip entries inside book.archive.zip
          // include the OPF's containing folder in their path (e.g.
          // "OEBPS/Images/cover.jpg" -- "OEBPS" is the conventional name but can
          // be anything the epub's author chose, or nothing at all). Looking up
          // `relativePath` directly in zip.files therefore misses almost every
          // real-world epub, which nests content under such a folder. book.resolve()
          // applies that same prefix (it's exactly what epub.js uses internally to
          // load chapter text), and book.archive.getBase64() does the matching zip
          // lookup, so reusing both here keeps image resolution consistent with how
          // the rest of the book is already loaded, instead of re-deriving it by hand.
          const archivePath = book.resolve(relativePath)
          const dataUrl: string | undefined = await book.archive.getBase64(archivePath, mimeType)
          if (!dataUrl) return
          const isSvgImage = el.tagName.toLowerCase() === 'image'
          if (isSvgImage) {
            el.setAttribute('xlink:href', dataUrl)
            el.setAttribute('href', dataUrl)
          } else {
            el.setAttribute('src', dataUrl)
            el.removeAttribute('xlink:href')
            el.removeAttribute('width')
            el.removeAttribute('height')
            const style = el.getAttribute('style') || ''
            const cleaned = style.split(';')
              .filter((s) => !/^\s*(width|height|max-width|max-height)\s*:/.test(s)).join(';')
            cleaned.trim() ? el.setAttribute('style', cleaned) : el.removeAttribute('style')
          }
        } catch { /* skip */ }
      }))

      Array.from(doc.querySelectorAll('svg')).forEach((svgEl) => {
        const imageEls = svgEl.querySelectorAll('image')
        if (imageEls.length !== 1) return
        const imageEl = imageEls[0]
        const href = imageEl.getAttribute('href') || imageEl.getAttribute('xlink:href')
        if (!href || !href.startsWith('data:')) return
        const img = doc.createElement('img')
        img.setAttribute('src', href); img.setAttribute('alt', '')
        svgEl.replaceWith(img)
      })

      const chapterStyles = Array.from(doc.querySelectorAll('style'))
        .map((s) => s.textContent || '').join('\n')
      const body = doc.body.cloneNode(true) as HTMLElement
      body.querySelectorAll('script, link').forEach((el) => el.remove())
      const combinedCss = globalCssRef.current + '\n' + chapterStyles
      const scopedCss = scopeCss(combinedCss, '.reader-content')
      const styleTag = scopedCss.trim() ? `<style>${scopedCss}</style>` : ''

      setChapterHtml(styleTag + body.innerHTML)
      sessionStartRef.current = Date.now()

      // Wait two frames so the freshly-injected HTML (and images) have been
      // laid out before we measure scrollHeight to restore/reset position.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = scrollRef.current
          if (!el) return
          if (restoreScrollFraction && restoreScrollFraction > 0) {
            const maxScroll = el.scrollHeight - el.clientHeight
            el.scrollTo({ top: maxScroll * restoreScrollFraction })
          } else {
            el.scrollTo({ top: 0 })
          }
        })
      })

      if (activeBook) {
        const progress = chapters.length > 0 ? index / chapters.length : 0
        updateProgress(activeBook.id, String(index), progress)
        markChapterVisited(activeBook.id, index)
        // A real chapter change (not a restore-on-open) starts fresh at the top.
        if (restoreScrollFraction === undefined) {
          updateScrollOffset(activeBook.id, 0)
        }
      }
    } catch (err) {
      console.error('[reader] chapter load error:', err)
      setChapterHtml('<p style="opacity:0.5">Failed to load this chapter.</p>')
    } finally {
      setLoading(false)
    }
  }, [activeBook, chapters, updateProgress, updateScrollOffset, closeSearch, flushTime, markChapterVisited])

  useEffect(() => {
    if (!activeBookPath) return
    const path = activeBookPath
    let cancelled = false

    async function init() {
      setLoading(true); setLoadError(null)
      try {
        const data = await readBinaryFile(path)
        // readBinaryFile's Uint8Array.buffer is ArrayBufferLike (which
        // includes SharedArrayBuffer); epubjs wants a plain ArrayBuffer.
        const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
        const book = ePub(arrayBuffer)
        bookRef.current = book

        await Promise.race([
          book.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
        ])
        if (cancelled) return

        try {
          const cssItems = Object.values(book.packaging.manifest as Record<string, any>)
            .filter((item) => item.type === 'text/css')
          const chunks = await Promise.all(
            cssItems.map(async (item) => {
              // book.load()'s return type is typed as the generic `object`,
              // but for a text/css manifest item it always resolves to the
              // raw stylesheet text. Going through `unknown` first (instead
              // of casting object -> string directly) satisfies tsc, since
              // `object` and `string` don't otherwise overlap.
              try { return (await book.load(item.href)) as unknown as string } catch { return '' }
            })
          )
          globalCssRef.current = chunks.filter(Boolean).join('\n')
        } catch { globalCssRef.current = '' }

        const meta = book.packaging.metadata
        setTitle(meta.title || 'Untitled')

        const items: ChapterItem[] = []
        book.spine.each((item: any) => {
          items.push({ index: item.index, href: item.href, idref: item.idref })
        })
        if (items.length === 0) throw new Error('This EPUB has no readable chapters')
        setChapters(items)

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
              if (index !== -1) flat.push({ label: navItem.label?.trim() || 'Untitled', index, depth })
              if (navItem.subitems?.length) walk(navItem.subitems, depth + 1)
            }
          }
          walk(navigation?.toc || [], 0)
          setToc(flat)
        } catch { setToc([]) }

        const startIndex = activeBook?.lastPosition
          ? Math.min(parseInt(activeBook.lastPosition, 10) || 0, items.length - 1) : 0
        setCurrentIndex(startIndex)
        await loadChapter(book, startIndex, activeBook?.scrollOffset)
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof Error && err.message === 'timeout'
            ? 'This book took too long to open. The file may be corrupt.'
            : err instanceof Error && err.message.includes('no such file')
            ? 'This file could not be found. It may have been moved or deleted.'
            : 'This book could not be opened. The file may be corrupt or unsupported.'
        setLoadError(message); setLoading(false)
      }
    }

    init().catch(console.error)
    return () => { cancelled = true; bookRef.current?.destroy() }
  }, [activeBookPath])

  const goNext = useCallback(async () => {
    if (currentIndex < chapters.length - 1) {
      const next = currentIndex + 1; setCurrentIndex(next)
      await loadChapter(bookRef.current, next)
    }
  }, [currentIndex, chapters, loadChapter])

  const goPrev = useCallback(async () => {
    if (currentIndex > 0) {
      const prev = currentIndex - 1; setCurrentIndex(prev)
      await loadChapter(bookRef.current, prev)
    }
  }, [currentIndex, loadChapter])

  const goToIndex = useCallback(async (index: number) => {
    setCurrentIndex(index); setShowToc(false); setShowBookmarks(false)
    await loadChapter(bookRef.current, index)
  }, [loadChapter])

  const toggleBookmark = useCallback(() => {
    if (!activeBook) return
    const existing = bookmarks.find((bm) => bm.spineIndex === currentIndex)
    if (existing) { removeBookmark(activeBook.id, existing.id); return }
    const tocLabel = toc.find((t) => t.index === currentIndex)?.label
    const newBookmark: Bookmark = {
      id: crypto.randomUUID(), spineIndex: currentIndex,
      label: tocLabel || `Chapter ${currentIndex + 1}`, createdAt: Date.now(),
    }
    addBookmark(activeBook.id, newBookmark)
  }, [activeBook, bookmarks, currentIndex, toc, addBookmark, removeBookmark])

  useClickOutside(tocRef, () => setShowToc(false), showToc, [tocButtonRef])
  useClickOutside(bookmarksRef, () => setShowBookmarks(false), showBookmarks, [bookmarksButtonRef])
  useClickOutside(settingsRef, () => setShowSettings(false), showSettings, [settingsButtonRef])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTypingTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )

      if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); setShowSearch(true); setFocusMode(false); return
      }
      if (isTypingTarget) return
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        setFocusMode((v) => !v)
      }
      if (e.key === 'Escape') {
        if (showSearch) { closeSearch(); return }
        setFocusMode(false); setShowSettings(false); setShowToc(false); setShowBookmarks(false)
      }
      if (!showSearch) {
        if (e.key === 'ArrowRight') goNext()
        if (e.key === 'ArrowLeft') goPrev()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, showSearch, closeSearch])

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
    .reader-content, .reader-content * {
      line-height: ${settings.lineHeight} !important;
      color: ${themeStyle.color} !important;
    }
    .reader-content img {
      width: auto !important; height: auto !important;
      max-width: 100% !important; display: block !important;
      visibility: visible !important; opacity: 1 !important;
      margin: 1em auto !important;
    }
    .reader-content svg {
      max-width: 100% !important; height: auto !important;
      display: block !important; margin: 0 auto !important;
    }
    .reader-content * { max-height: none !important; overflow: visible !important; }
    .reader-content { overflow-wrap: break-word !important; word-break: break-word !important; }
    .reader-content chapter, .reader-content section, .reader-content article {
      display: block !important; width: 100% !important; max-width: 100% !important;
    }
  `

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
            <p className="text-pw-100 font-semibold text-base">Couldn't open this book</p>
            <p className="text-pw-400 text-sm mt-1.5 max-w-sm">{loadError}</p>
          </div>
          <button onClick={closeBook} className="mt-1 px-5 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 text-white text-sm font-medium transition-all">
            Back to Library
          </button>
        </div>
      </div>
    )
  }

  const clickZoneTop = focusMode ? 'top-0' : 'top-14'
  const clickZoneHeight = focusMode ? '100%' : 'calc(100% - 3.5rem)'

  return (
    <div className="flex flex-col h-full" style={themeStyle}>
      <style>{comfortStyles}</style>

      {!focusMode && (
        <header className="drag-region flex items-center justify-between px-5 py-2.5 bg-pw-900 border-b border-pw-700/40 flex-shrink-0 z-10">
          <div className="no-drag flex items-center gap-3">
            <button className="flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors" onClick={closeBook}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10.5 3L5.5 8L10.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Library
            </button>
            <span className="w-px h-4 bg-pw-700/60" />
            <button
              ref={tocButtonRef}
              className="flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors px-2 py-1 rounded-lg hover:bg-pw-800/50"
              onClick={() => { setShowToc((v) => !v); setShowSettings(false); setShowBookmarks(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Contents
            </button>
            <button
              ref={bookmarksButtonRef}
              className="flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors px-2 py-1 rounded-lg hover:bg-pw-800/50"
              onClick={() => { setShowBookmarks((v) => !v); setShowSettings(false); setShowToc(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 2.5h8a.5.5 0 01.5.5v10.5l-4.5-2.5-4.5 2.5V3a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              {bookmarks.length > 0 && <span className="text-xs text-pw-400">{bookmarks.length}</span>}
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
              className="text-pw-300 hover:text-pw-100 transition-colors p-1.5 rounded-lg border border-pw-700/50 hover:border-pw-500/60 hover:bg-pw-800/50"
              onClick={() => { setShowSearch(true); setShowSettings(false); setShowToc(false); setShowBookmarks(false) }}
              title="Search in chapter (Ctrl+F)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              className={`p-1.5 rounded-lg border transition-colors ${
                isCurrentBookmarked
                  ? 'text-pw-300 border-pw-400/60 bg-pw-600/30'
                  : 'text-pw-300 border-pw-700/50 hover:border-pw-500/60 hover:bg-pw-800/50'
              }`}
              onClick={toggleBookmark}
              title={isCurrentBookmarked ? 'Remove bookmark' : 'Bookmark this chapter'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill={isCurrentBookmarked ? 'currentColor' : 'none'}>
                <path d="M4 2.5h8a.5.5 0 01.5.5v10.5l-4.5-2.5-4.5 2.5V3a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
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
              ref={settingsButtonRef}
              className="text-sm font-bold text-pw-300 hover:text-pw-100 transition-colors px-2.5 py-1 rounded-lg border border-pw-700/50 hover:border-pw-500/60 hover:bg-pw-800/50"
              onClick={() => { setShowSettings((v) => !v); setShowToc(false); setShowBookmarks(false) }}
            >
              Aa
            </button>
          </div>
        </header>
      )}

      {showSearch && !focusMode && (
        <SearchBar
          query={searchQuery} matchIndex={matchIndex} matchCount={matchCount}
          onChange={setSearchQuery} onNext={goNextMatch} onPrev={goPrevMatch} onClose={closeSearch}
        />
      )}

      <div className="h-0.5 w-full bg-pw-800 flex-shrink-0">
        <div className="h-full bg-gradient-to-r from-pw-500 to-pw-300 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative" onScroll={handleScroll}>
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
              ref={contentRef}
              className="mx-auto px-10 py-12 reader-content"
              style={{ maxWidth: `${settings.maxWidth}px` }}
              dangerouslySetInnerHTML={{ __html: chapterHtml }}
            />
          </>
        )}

        {showToc && (
          <div ref={tocRef} className="fixed left-4 top-14 z-20">
            <TocPanel toc={toc} currentIndex={currentIndex} onSelect={goToIndex} onClose={() => setShowToc(false)} />
          </div>
        )}
        {showBookmarks && (
          <div ref={bookmarksRef} className="fixed left-4 top-14 z-20">
            <BookmarksPanel
              bookmarks={bookmarks} currentIndex={currentIndex} onSelect={goToIndex}
              onRemove={(bookmarkId) => activeBook && removeBookmark(activeBook.id, bookmarkId)}
              onClose={() => setShowBookmarks(false)}
            />
          </div>
        )}
        {showSettings && (
          <div ref={settingsRef} className="fixed right-4 top-14 z-20">
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        )}
        {focusMode && (
          <button
            className="fixed top-4 right-4 z-30 w-9 h-9 rounded-full bg-pw-950/40 hover:bg-pw-900/90 backdrop-blur-sm border border-pw-600/30 hover:border-pw-500/60 flex items-center justify-center text-pw-300 hover:text-pw-100 opacity-30 hover:opacity-100 transition-all"
            onClick={() => setFocusMode(false)} title="Exit focus mode (Esc)"
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
          <button className="text-xs text-pw-300 hover:text-pw-100 transition-colors disabled:opacity-30 flex-shrink-0" onClick={goPrev} disabled={currentIndex === 0}>
            ← Prev
          </button>
          <div className="flex-1 h-0.5 bg-pw-700/40 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-pw-500 to-pw-300 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <button className="text-xs text-pw-300 hover:text-pw-100 transition-colors disabled:opacity-30 flex-shrink-0" onClick={goNext} disabled={currentIndex === chapters.length - 1}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

function inferMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
  }
  return map[ext] ?? 'image/jpeg'
}

// Resolves a relative EPUB-internal path (e.g. "Text/../Images/cover.jpg",
// produced by joining a chapter's own folder with an image's relative href)
// down to a clean, zip-entry-matching path ("Images/cover.jpg"). The
// previous version only stripped a literal "/./" and never touched "../"
// segments, so any image referenced from a sibling folder with a "../" style
// href (a common pattern in Sigil-authored EPUBs) resolved to a path that
// didn't exist in the zip, silently failed the lookup, and left the original
// unresolvable relative href in the DOM -- rendering as a broken image.
function normalizeEpubPath(path: string): string {
  const segments = path.split('/')
  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      resolved.pop()
    } else {
      resolved.push(segment)
    }
  }
  return resolved.join('/')
}

// EPUB stylesheets are written assuming they own the whole document (selectors
// like `html`, `body`, `a`, `img` are common). Since we inject them as a real
// <style> tag inside the reader pane, un-scoped selectors would otherwise leak
// out and restyle the actual app shell (header, sidebar, etc). This rewrites
// every selector so it can only ever match inside the given scope.
function scopeCss(css: string, scope: string): string {
  // Strip comments first so they don't confuse the brace matching below.
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')

  let result = ''
  let i = 0
  const len = css.length

  while (i < len) {
    while (i < len && /\s/.test(css[i])) i++
    if (i >= len) break

    if (css[i] === '@') {
      let j = i
      while (j < len && css[j] !== '{' && css[j] !== ';') j++
      if (css[j] === ';') {
        // @import, @charset, etc — no block, leave untouched.
        result += css.slice(i, j + 1) + '\n'
        i = j + 1
        continue
      }
      if (j >= len) { result += css.slice(i); break }
      const atRuleHeader = css.slice(i, j).trim()
      let depth = 0
      let k = j
      for (; k < len; k++) {
        if (css[k] === '{') depth++
        else if (css[k] === '}') { depth--; if (depth === 0) break }
      }
      const blockContent = css.slice(j + 1, k)
      const atLower = atRuleHeader.toLowerCase()
      if (atLower.startsWith('@media') || atLower.startsWith('@supports')) {
        result += atRuleHeader + ' {\n' + scopeCss(blockContent, scope) + '\n}\n'
      } else {
        // @font-face, @keyframes, @page, etc — scoping these makes no sense.
        result += css.slice(i, k + 1) + '\n'
      }
      i = k + 1
      continue
    }

    let j = i
    while (j < len && css[j] !== '{') j++
    if (j >= len) { result += css.slice(i); break }
    const selectorPart = css.slice(i, j)
    let depth = 0
    let k = j
    for (; k < len; k++) {
      if (css[k] === '{') depth++
      else if (css[k] === '}') { depth--; if (depth === 0) break }
    }
    const body = css.slice(j + 1, k)

    const scopedSelectors = selectorPart.split(',').map((sel) => {
      sel = sel.trim()
      if (!sel) return ''
      if (sel === '*' || sel.startsWith(':root')) return scope
      return `${scope} ${sel}`
    }).filter(Boolean).join(', ')

    if (scopedSelectors) result += `${scopedSelectors} { ${body} }\n`
    i = k + 1
  }

  return result
}
