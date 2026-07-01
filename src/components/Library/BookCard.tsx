import { useState, useRef } from 'react'
import { Book } from '../../types'
import { useLibraryStore } from '../../store/libraryStore'
import { sanitizeAuthor } from '../../utils/text'

interface Props {
  book: Book
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export default function BookCard({ book, selectionMode = false, selected = false, onToggleSelect }: Props) {
  const openBook = useLibraryStore((s) => s.openBook)
  const removeBook = useLibraryStore((s) => s.removeBook)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const progressPct = book.progress ? Math.round(book.progress * 100) : 0
  // Defensive sanitization: covers books imported before the author
  // placeholder fix existed, so old library entries display cleanly too.
  const displayAuthor = sanitizeAuthor(book.author)

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(book.id)
    } else {
      openBook(book.path)
    }
  }

  return (
    <div
      className={`group relative flex flex-col cursor-pointer rounded-xl overflow-visible transition-all duration-200 ${
        selectionMode ? '' : 'hover:shadow-pw-glow hover:-translate-y-0.5'
      }`}
      onClick={handleClick}
    >
      {/* Cover */}
      <div
        className={`w-full aspect-[2/3] rounded-xl overflow-hidden bg-pw-800 border shadow-pw-card transition-colors ${
          selectionMode && selected ? 'border-pw-400 ring-2 ring-pw-400' : 'border-pw-700/40'
        }`}
      >
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          // Placeholder cover: gradient with title
          <div className="w-full h-full bg-gradient-to-br from-pw-700 via-pw-600 to-pw-800 flex flex-col justify-end p-3">
            <span className="text-pw-100 text-xs font-semibold leading-snug line-clamp-4">
              {book.title}
            </span>
            <span className="text-pw-300 text-xs mt-1 leading-snug line-clamp-2">
              {displayAuthor}
            </span>
          </div>
        )}

        {/* Hover overlay (only outside selection mode) */}
        {!selectionMode && (
          <div className="absolute inset-0 rounded-xl bg-pw-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
        )}

        {/* Selection checkbox */}
        {selectionMode && (
          <div className="absolute inset-0 rounded-xl bg-pw-950/30">
            <div
              className={`absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                selected
                  ? 'bg-pw-400 border-pw-400'
                  : 'bg-pw-950/70 border-pw-300/60'
              }`}
            >
              {selected && (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </div>
        )}

        {/* 3-dot menu button (only outside selection mode) */}
        {!selectionMode && (
          <button
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-pw-950/70 backdrop-blur-sm border border-pw-600/40 flex items-center justify-center text-pw-200 hover:text-white hover:bg-pw-700/80 no-drag"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            title="Options"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5"/>
              <circle cx="8" cy="8" r="1.5"/>
              <circle cx="8" cy="13" r="1.5"/>
            </svg>
          </button>
        )}

        {/* Dropdown menu */}
        {!selectionMode && menuOpen && (
          <div
            ref={menuRef}
            className="absolute top-10 right-2 z-30 w-36 rounded-lg bg-pw-800 border border-pw-600/50 shadow-2xl overflow-hidden no-drag"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-pw-700/60 transition-colors"
              onClick={() => {
                removeBook(book.id)
                setMenuOpen(false)
              }}
            >
              Remove from library
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {progressPct > 0 && (
        <div className="mt-2 h-0.5 w-full bg-pw-700/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pw-500 to-pw-300 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Meta */}
      <div className="mt-2 px-0.5">
        <p className="text-xs font-semibold text-pw-100 truncate leading-snug">{book.title}</p>
        <p className="text-xs text-pw-300 truncate mt-0.5 leading-snug">{displayAuthor}</p>
      </div>
    </div>
  )
}
