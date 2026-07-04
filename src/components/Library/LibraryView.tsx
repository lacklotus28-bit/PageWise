import { useCallback, useMemo, useRef, useState } from 'react'
import BookCard from './BookCard'
import StatsPanel from './StatsPanel'
import Sidebar from './Sidebar'
import { useLibraryStore, LibrarySortKey, LibraryFileTypeFilter } from '../../store/libraryStore'
import { useBookImport } from '../../hooks/useBookImport'
import { useFileDrop } from '../../hooks/useFileDrop'
import { useClickOutside } from '../../hooks/useClickOutside'
import { sanitizeAuthor } from '../../utils/text'
import { Book } from '../../types'

type SortKey = LibrarySortKey

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently Added' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'progress', label: 'Progress' },
]

const FILE_TYPE_OPTIONS: { key: LibraryFileTypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'epub', label: 'EPUB' },
  { key: 'pdf', label: 'PDF' },
]

// Books saved before the fileType field existed have it undefined and were
// always EPUBs at the time, so treat missing fileType as 'epub' -- same
// convention already used elsewhere (e.g. App.tsx's isPdf check).
function matchesFileType(book: Book, filter: LibraryFileTypeFilter): boolean {
  if (filter === 'all') return true
  const type = book.fileType ?? 'epub'
  return type === filter
}

function sortBooks(books: Book[], sortBy: SortKey): Book[] {
  const sorted = [...books]
  switch (sortBy) {
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title))
    case 'author':
      return sorted.sort((a, b) =>
        sanitizeAuthor(a.author).localeCompare(sanitizeAuthor(b.author))
      )
    case 'progress':
      return sorted.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    case 'recent':
    default:
      return sorted.sort((a, b) => b.addedAt - a.addedAt)
  }
}

function EmptyState({ onImport, onImportFolder }: { onImport: () => void; onImportFolder: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 select-none">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pw-600 via-pw-500 to-pw-400 flex items-center justify-center shadow-pw-glow">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <path d="M2 6.5C2 5.12 3.12 4 4.5 4H11V20H4.5C3.12 20 2 18.88 2 17.5V6.5Z" fill="white" fillOpacity="0.9"/>
          <path d="M13 4H19.5C20.88 4 22 5.12 22 6.5V17.5C22 18.88 20.88 20 19.5 20H13V4Z" fill="white" fillOpacity="0.6"/>
          <rect x="11" y="4" width="2" height="16" fill="white" fillOpacity="0.3"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-pw-100 font-semibold text-base">Your library is empty</p>
        <p className="text-pw-300 text-sm mt-1">Add your first EPUB or PDF to get started, or drag one in</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onImport}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 text-white text-sm font-medium transition-all shadow-lg shadow-pw-500/30"
        >
          Browse Files
        </button>
        <button
          onClick={onImportFolder}
          className="px-5 py-2 rounded-lg text-pw-200 hover:text-pw-100 border border-pw-700/40 hover:border-pw-500/50 text-sm font-medium transition-colors"
        >
          Browse Folder
        </button>
      </div>
    </div>
  )
}

function EmptyShelfState({ shelfName }: { shelfName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 select-none">
      <p className="text-pw-100 font-semibold text-base">{shelfName} is empty</p>
      <p className="text-pw-400 text-sm">
        Move books here from the card menu, or import files from this folder.
      </p>
    </div>
  )
}

function NoResultsState({ query, filtered }: { query: string; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 select-none">
      <p className="text-pw-100 font-semibold text-base">
        {query ? `No books match "${query}"` : 'No books match this filter'}
      </p>
      <p className="text-pw-400 text-sm">
        {query && filtered
          ? 'Try a different search term or file type filter'
          : query
          ? 'Try a different search term'
          : 'Try a different file type filter'}
      </p>
    </div>
  )
}

function DropOverlay() {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-pw-950/80 backdrop-blur-sm border-2 border-dashed border-pw-400 m-3 rounded-2xl pointer-events-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pw-600 via-pw-500 to-pw-400 flex items-center justify-center shadow-pw-glow">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 4v12m0-12l-4 4m4-4l4 4M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="text-pw-100 font-semibold text-base">Drop to add to your library</p>
      </div>
    </div>
  )
}

function ImportProgressToast({ progress }: { progress: { total: number; completed: number; active: string[] } }) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100)
  return (
    <div className="fixed bottom-5 right-5 z-40 w-80 rounded-xl bg-pw-800 border border-pw-600/50 shadow-2xl shadow-pw-950/80 overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-pw-300">
            Importing {progress.completed} of {progress.total}
          </span>
          <span className="text-xs text-pw-400">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-pw-700/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-pw-500 to-pw-400 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {progress.active.length > 0 && (
          <div className="mt-2.5 space-y-1">
            {progress.active.map((name) => (
              <div key={name} className="flex items-center gap-2 text-xs text-pw-300">
                <span className="w-1.5 h-1.5 rounded-full bg-pw-400 animate-pulse flex-shrink-0" />
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ErrorToast({ errors, onDismiss }: { errors: { fileName: string; message: string }[]; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-40 w-80 rounded-xl bg-pw-800 border border-red-500/30 shadow-2xl shadow-pw-950/80 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pw-700/40">
        <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
          {errors.length} {errors.length === 1 ? 'file' : 'files'} couldn't be added
        </span>
        <button
          className="text-pw-400 hover:text-pw-100 transition-colors w-5 h-5 flex items-center justify-center rounded"
          onClick={onDismiss}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto py-1">
        {errors.map((e, i) => (
          <div key={i} className="px-4 py-1.5">
            <p className="text-xs text-pw-100 truncate font-medium">{e.fileName}</p>
            <p className="text-xs text-pw-400">{e.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function DuplicateToast({ duplicates, onDismiss }: { duplicates: { fileName: string }[]; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-40 w-80 rounded-xl bg-pw-800 border border-pw-600/50 shadow-2xl shadow-pw-950/80 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pw-700/40">
        <span className="text-xs font-semibold uppercase tracking-wider text-pw-300">
          {duplicates.length} already in your library
        </span>
        <button
          className="text-pw-400 hover:text-pw-100 transition-colors w-5 h-5 flex items-center justify-center rounded"
          onClick={onDismiss}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto py-1">
        {duplicates.map((d, i) => (
          <div key={i} className="px-4 py-1.5">
            <p className="text-xs text-pw-100 truncate font-medium">{d.fileName}</p>
            <p className="text-xs text-pw-400">Skipped — already imported</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LibraryView() {
  const books = useLibraryStore((s) => s.books)
  const removeBooks = useLibraryStore((s) => s.removeBooks)
  const query = useLibraryStore((s) => s.searchQuery)
  const setQuery = useLibraryStore((s) => s.setSearchQuery)
  const sortBy = useLibraryStore((s) => s.sortBy)
  const setSortBy = useLibraryStore((s) => s.setSortBy)
  const fileTypeFilter = useLibraryStore((s) => s.fileTypeFilter)
  const setFileTypeFilter = useLibraryStore((s) => s.setFileTypeFilter)
  const activeCollectionId = useLibraryStore((s) => s.activeCollectionId)
  const collections = useLibraryStore((s) => s.collections)
  const sidebarOpen = useLibraryStore((s) => s.sidebarOpen)
  const toggleSidebar = useLibraryStore((s) => s.toggleSidebar)
  const { importBooks, importFolders, importDroppedPaths, importing, progress, errors, dismissErrors, duplicates, dismissDuplicates } = useBookImport()

  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const sortButtonRef = useRef<HTMLButtonElement>(null)
  useClickOutside(sortMenuRef, () => setSortMenuOpen(false), sortMenuOpen, [sortButtonRef])

  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showStats, setShowStats] = useState(false)

  const handleDrop = useCallback((paths: string[]) => {
    importDroppedPaths(paths)
  }, [importDroppedPaths])

  const isDragging = useFileDrop(handleDrop)

  const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null

  const filteredSorted = useMemo(() => {
    const byCollection = activeCollectionId
      ? books.filter((b) => b.collectionId === activeCollectionId)
      : books
    const byType = byCollection.filter((b) => matchesFileType(b, fileTypeFilter))
    const q = query.trim().toLowerCase()
    const filtered = q
      ? byType.filter((b) =>
          b.title.toLowerCase().includes(q) ||
          sanitizeAuthor(b.author).toLowerCase().includes(q)
        )
      : byType
    return sortBooks(filtered, sortBy)
  }, [books, activeCollectionId, query, sortBy, fileTypeFilter])

  // Books in the active shelf before the search filter is applied.
  // Used to distinguish "shelf is empty" from "search found nothing".
  const shelfBooks = useMemo(() => {
    if (!activeCollectionId) return books
    return books.filter((b) => b.collectionId === activeCollectionId)
  }, [books, activeCollectionId])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const handleBulkRemove = useCallback(() => {
    removeBooks(Array.from(selectedIds))
    exitSelectionMode()
  }, [removeBooks, selectedIds, exitSelectionMode])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredSorted.map((b) => b.id)))
  }, [filteredSorted])

  if (showStats) {
    return <StatsPanel books={books} onClose={() => setShowStats(false)} />
  }

  // Determine what to render in the main content area.
  const renderGrid = () => {
    // Case 1: whole library is empty
    if (books.length === 0) return <EmptyState onImport={importBooks} onImportFolder={importFolders} />
    // Case 2: a shelf is selected and has no books yet
    if (activeCollectionId && shelfBooks.length === 0) {
      return <EmptyShelfState shelfName={activeCollection?.name ?? 'This shelf'} />
    }
    // Case 3: search or file-type filter returned nothing
    if (filteredSorted.length === 0) return <NoResultsState query={query} filtered={fileTypeFilter !== 'all'} />
    // Case 4: normal grid
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 pb-16">
        {filteredSorted.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            selectionMode={selectionMode}
            selected={selectedIds.has(book.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-pw-950 relative">
      {/* Titlebar */}
      <header className="drag-region flex items-center justify-between px-6 py-3.5 bg-pw-900 border-b border-pw-700/40 flex-shrink-0">
        <div className="no-drag flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pw-500 to-pw-400 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M2 6.5C2 5.12 3.12 4 4.5 4H11V20H4.5C3.12 20 2 18.88 2 17.5V6.5Z" fill="white" fillOpacity="0.95"/>
              <path d="M13 4H19.5C20.88 4 22 5.12 22 6.5V17.5C22 18.88 20.88 20 19.5 20H13V4Z" fill="white" fillOpacity="0.6"/>
              <rect x="11" y="4" width="2" height="16" fill="white" fillOpacity="0.3"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-pw-50 leading-none">Pagewise</h1>
            <p className="text-xs text-pw-300 mt-0.5 leading-none">
              {activeCollectionId
                ? `${shelfBooks.length} ${shelfBooks.length === 1 ? 'book' : 'books'} · ${activeCollection?.name ?? 'Shelf'}`
                : books.length === 0 ? 'No books' : `${books.length} ${books.length === 1 ? 'book' : 'books'}`}
            </p>
          </div>
        </div>

        <div className="no-drag flex items-center gap-2">
          {books.length > 0 && (
            <button
              className={`p-2 rounded-lg border transition-colors ${
                sidebarOpen
                  ? 'text-pw-100 border-pw-500/50 bg-pw-700/30'
                  : 'text-pw-300 hover:text-pw-100 border-pw-700/40 hover:border-pw-500/50'
              }`}
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Hide shelves' : 'Show shelves'}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <line x1="10.5" y1="2.5" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            </button>
          )}
          <button
            className="p-2 rounded-lg text-pw-300 hover:text-pw-100 border border-pw-700/40 hover:border-pw-500/50 transition-colors"
            onClick={() => setShowStats(true)}
            title="Reading stats"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M2 12V8M6 12V5M10 12V7M14 12V3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-pw-300 hover:text-pw-100 border border-pw-700/40 hover:border-pw-500/50 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={importFolders}
            disabled={importing}
            title="Import all EPUB/PDF files from a folder (including subfolders)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 5.5C2 4.67 2.67 4 3.5 4h3l1.5 1.5h5.5c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5h-9C2.67 14 2 13.33 2 12.5v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
            Add Folder
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 text-white text-sm font-medium transition-all shadow-lg shadow-pw-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={importBooks}
            disabled={importing}
          >
            <span className="text-base leading-none">+</span>
            {importing && progress
              ? `Importing ${progress.completed}/${progress.total}...`
              : 'Add Books'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0">
          {/* Toolbar */}
          {books.length > 0 && (
            <div className="no-drag flex items-center gap-3 px-6 py-3 border-b border-pw-700/30 flex-shrink-0">
              <div className="relative flex-1 max-w-xs">
                <svg
                  width="14" height="14" viewBox="0 0 16 16" fill="none"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-pw-400 pointer-events-none"
                >
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title or author..."
                  className="w-full text-sm rounded-lg bg-pw-800/60 border border-pw-700/40 text-pw-100 placeholder:text-pw-500 pl-8 pr-3 py-1.5 focus:outline-none focus:border-pw-500/60"
                />
              </div>

              <div className="relative" ref={sortMenuRef}>
                <button
                  ref={sortButtonRef}
                  className="flex items-center gap-1.5 text-sm text-pw-300 hover:text-pw-100 transition-colors px-3 py-1.5 rounded-lg border border-pw-700/40 hover:border-pw-500/50"
                  onClick={() => setSortMenuOpen((v) => !v)}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4h10M5 8h6M7 12h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  {SORT_OPTIONS.find((o) => o.key === sortBy)?.label}
                </button>
                {sortMenuOpen && (
                  <div className="absolute top-9 left-0 z-30 w-44 rounded-lg bg-pw-800 border border-pw-600/50 shadow-2xl overflow-hidden">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          sortBy === opt.key ? 'bg-pw-600/40 text-pw-50' : 'text-pw-200 hover:bg-pw-700/50'
                        }`}
                        onClick={() => { setSortBy(opt.key); setSortMenuOpen(false) }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-pw-700/40">
                {FILE_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      fileTypeFilter === opt.key
                        ? 'bg-pw-600/50 text-pw-50'
                        : 'text-pw-400 hover:text-pw-100'
                    }`}
                    onClick={() => setFileTypeFilter(opt.key)}
                    title={opt.key === 'all' ? 'Show all file types' : `Show only ${opt.label} files`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex-1" />

              {!selectionMode ? (
                <button
                  className="text-sm text-pw-300 hover:text-pw-100 transition-colors px-3 py-1.5 rounded-lg border border-pw-700/40 hover:border-pw-500/50"
                  onClick={() => setSelectionMode(true)}
                >
                  Select
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button className="text-xs text-pw-400 hover:text-pw-100 transition-colors" onClick={selectAll}>
                    Select all
                  </button>
                  <button
                    className="text-sm text-pw-300 hover:text-pw-100 transition-colors px-3 py-1.5 rounded-lg border border-pw-700/40 hover:border-pw-500/50"
                    onClick={exitSelectionMode}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-6 relative">
            {renderGrid()}
            {isDragging && <DropOverlay />}
          </main>
        </div>

        {books.length > 0 && sidebarOpen && <Sidebar />}
      </div>

      {selectionMode && selectedIds.size > 0 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-pw-800 border border-pw-600/50 shadow-2xl shadow-pw-950/80">
          <span className="text-sm text-pw-200">{selectedIds.size} selected</span>
          <button
            className="text-sm text-red-400 hover:text-red-300 transition-colors font-medium px-3 py-1 rounded-lg hover:bg-red-500/10"
            onClick={handleBulkRemove}
          >
            Remove
          </button>
        </div>
      )}

      {progress && <ImportProgressToast progress={progress} />}
      {!progress && errors.length > 0 && <ErrorToast errors={errors} onDismiss={dismissErrors} />}
      {!progress && errors.length === 0 && duplicates.length > 0 && (
        <DuplicateToast duplicates={duplicates} onDismiss={dismissDuplicates} />
      )}
    </div>
  )
}
