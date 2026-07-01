import { useCallback, useMemo, useState } from 'react'
import BookCard from './BookCard'
import { useLibraryStore } from '../../store/libraryStore'
import { useBookImport } from '../../hooks/useBookImport'
import { useFileDrop } from '../../hooks/useFileDrop'
import { sanitizeAuthor } from '../../utils/text'
import { Book } from '../../types'

type SortKey = 'recent' | 'title' | 'author' | 'progress'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently Added' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'progress', label: 'Progress' },
]

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

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 select-none">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pw-600 via-pw-500 to-pw-400 flex items-center justify-center shadow-pw-glow">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 6.5C2 5.12 3.12 4 4.5 4H11V20H4.5C3.12 20 2 18.88 2 17.5V6.5Z" fill="white" fillOpacity="0.9"/>
          <path d="M13 4H19.5C20.88 4 22 5.12 22 6.5V17.5C22 18.88 20.88 20 19.5 20H13V4Z" fill="white" fillOpacity="0.6"/>
          <rect x="11" y="4" width="2" height="16" fill="white" fillOpacity="0.3"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-pw-100 font-semibold text-base">Your library is empty</p>
        <p className="text-pw-300 text-sm mt-1">Add your first EPUB to get started, or drag one in</p>
      </div>
      <button
        onClick={onImport}
        className="px-5 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 text-white text-sm font-medium transition-all shadow-lg shadow-pw-500/30"
      >
        Browse Files
      </button>
    </div>
  )
}

function NoResultsState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 select-none">
      <p className="text-pw-100 font-semibold text-base">No books match "{query}"</p>
      <p className="text-pw-400 text-sm">Try a different search term</p>
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

export default function LibraryView() {
  const books = useLibraryStore((s) => s.books)
  const removeBooks = useLibraryStore((s) => s.removeBooks)
  const { importBooks, importPaths, importing, errors, dismissErrors } = useBookImport()

  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('recent')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const handleDrop = useCallback((paths: string[]) => {
    importPaths(paths)
  }, [importPaths])

  const isDragging = useFileDrop(handleDrop)

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? books.filter((b) =>
          b.title.toLowerCase().includes(q) ||
          sanitizeAuthor(b.author).toLowerCase().includes(q)
        )
      : books
    return sortBooks(filtered, sortBy)
  }, [books, query, sortBy])

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
              {books.length === 0 ? 'No books' : `${books.length} ${books.length === 1 ? 'book' : 'books'}`}
            </p>
          </div>
        </div>

        <button
          className="no-drag flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 text-white text-sm font-medium transition-all shadow-lg shadow-pw-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={importBooks}
          disabled={importing}
        >
          <span className="text-base leading-none">+</span>
          {importing ? 'Importing...' : 'Add Books'}
        </button>
      </header>

      {/* Toolbar: search + sort + select (only when there are books) */}
      {books.length > 0 && (
        <div className="no-drag flex items-center gap-3 px-6 py-3 border-b border-pw-700/30 flex-shrink-0">
          {/* Search */}
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

          {/* Sort dropdown */}
          <div className="relative">
            <button
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
                      sortBy === opt.key
                        ? 'bg-pw-600/40 text-pw-50'
                        : 'text-pw-200 hover:bg-pw-700/50'
                    }`}
                    onClick={() => { setSortBy(opt.key); setSortMenuOpen(false) }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Select toggle */}
          {!selectionMode ? (
            <button
              className="text-sm text-pw-300 hover:text-pw-100 transition-colors px-3 py-1.5 rounded-lg border border-pw-700/40 hover:border-pw-500/50"
              onClick={() => setSelectionMode(true)}
            >
              Select
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                className="text-xs text-pw-400 hover:text-pw-100 transition-colors"
                onClick={selectAll}
              >
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

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 relative">
        {books.length === 0 ? (
          <EmptyState onImport={importBooks} />
        ) : filteredSorted.length === 0 ? (
          <NoResultsState query={query} />
        ) : (
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
        )}

        {isDragging && <DropOverlay />}
      </main>

      {/* Bulk action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-pw-800 border border-pw-600/50 shadow-2xl shadow-pw-950/80">
          <span className="text-sm text-pw-200">
            {selectedIds.size} selected
          </span>
          <button
            className="text-sm text-red-400 hover:text-red-300 transition-colors font-medium px-3 py-1 rounded-lg hover:bg-red-500/10"
            onClick={handleBulkRemove}
          >
            Remove
          </button>
        </div>
      )}

      {errors.length > 0 && <ErrorToast errors={errors} onDismiss={dismissErrors} />}
    </div>
  )
}
