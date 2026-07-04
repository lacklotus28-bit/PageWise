import { useMemo, useState, useRef } from 'react'
import { Book } from '../../types'
import { useLibraryStore } from '../../store/libraryStore'
import { useClickOutside } from '../../hooks/useClickOutside'
import { sanitizeAuthor } from '../../utils/text'
import { resolveCoverUrl } from '../../utils/coverStorage'
import MetadataEditor from './MetadataEditor'

interface Props {
  book: Book
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export default function BookCard({ book, selectionMode = false, selected = false, onToggleSelect }: Props) {
  const openBook = useLibraryStore((s) => s.openBook)
  const removeBook = useLibraryStore((s) => s.removeBook)
  const collections = useLibraryStore((s) => s.collections)
  const moveBookToCollection = useLibraryStore((s) => s.moveBookToCollection)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shelfSubmenuOpen, setShelfSubmenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  useClickOutside(menuRef, () => { setMenuOpen(false); setShelfSubmenuOpen(false) }, menuOpen, [menuButtonRef])

  const progressPct = book.progress ? Math.round(book.progress * 100) : 0
  const displayAuthor = sanitizeAuthor(book.author)
  // Legacy libraries may still have a base64 coverUrl (pre-migration); prefer
  // the on-disk coverPath once available, falling back so covers don't pop
  // out during the brief window before migrateLegacyCovers() finishes.
  const displayCoverUrl = useMemo(
    () => resolveCoverUrl(book.coverPath) ?? book.coverUrl,
    [book.coverPath, book.coverUrl]
  )

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(book.id)
    } else {
      openBook(book.path)
    }
  }

  return (
    <>
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
          {displayCoverUrl ? (
            <img src={displayCoverUrl} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-pw-700 via-pw-600 to-pw-800 flex flex-col justify-end p-3">
              <span className="text-pw-100 text-xs font-semibold leading-snug line-clamp-4">{book.title}</span>
              <span className="text-pw-300 text-xs mt-1 leading-snug line-clamp-2">{displayAuthor}</span>
            </div>
          )}

          {!selectionMode && (
            <div className="absolute inset-0 rounded-xl bg-pw-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
          )}

          {selectionMode && (
            <div className="absolute inset-0 rounded-xl bg-pw-950/30">
              <div
                className={`absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                  selected ? 'bg-pw-400 border-pw-400' : 'bg-pw-950/70 border-pw-300/60'
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

          {!selectionMode && (
            <button
              ref={menuButtonRef}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-pw-950/70 backdrop-blur-sm border border-pw-600/40 flex items-center justify-center text-pw-200 hover:text-white hover:bg-pw-700/80 no-drag"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
              title="Options"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <circle cx="8" cy="13" r="1.5"/>
              </svg>
            </button>
          )}

          {!selectionMode && menuOpen && (
            <div
              ref={menuRef}
              className="absolute top-10 right-2 z-30 w-40 rounded-lg bg-pw-800 border border-pw-600/50 shadow-2xl overflow-visible no-drag"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full text-left px-3 py-2 text-sm text-pw-200 hover:bg-pw-700/60 transition-colors"
                onClick={() => { setEditOpen(true); setMenuOpen(false) }}
              >
                Edit info
              </button>
              <div className="h-px bg-pw-700/40 mx-2" />
              <div className="relative">
                <button
                  className="w-full flex items-center justify-between text-left px-3 py-2 text-sm text-pw-200 hover:bg-pw-700/60 transition-colors"
                  onClick={() => setShelfSubmenuOpen((v) => !v)}
                >
                  Move to shelf
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {shelfSubmenuOpen && (
                  <div className="absolute top-0 right-full mr-1 w-40 rounded-lg bg-pw-800 border border-pw-600/50 shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                    <button
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        !book.collectionId ? 'text-pw-50 bg-pw-600/30' : 'text-pw-200 hover:bg-pw-700/60'
                      }`}
                      onClick={() => { moveBookToCollection(book.id, null); setMenuOpen(false); setShelfSubmenuOpen(false) }}
                    >
                      None
                    </button>
                    {collections.length > 0 && <div className="h-px bg-pw-700/40 mx-2" />}
                    {collections.map((c) => (
                      <button
                        key={c.id}
                        className={`w-full text-left px-3 py-2 text-sm truncate transition-colors ${
                          book.collectionId === c.id ? 'text-pw-50 bg-pw-600/30' : 'text-pw-200 hover:bg-pw-700/60'
                        }`}
                        onClick={() => { moveBookToCollection(book.id, c.id); setMenuOpen(false); setShelfSubmenuOpen(false) }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="h-px bg-pw-700/40 mx-2" />
              <button
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-pw-700/60 transition-colors"
                onClick={() => { removeBook(book.id); setMenuOpen(false) }}
              >
                Remove from library
              </button>
            </div>
          )}
        </div>

        {progressPct > 0 && (
          <div className="mt-2 h-0.5 w-full bg-pw-700/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pw-500 to-pw-300 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        <div className="mt-2 px-0.5 relative group/meta">
          <p className="text-xs font-semibold text-pw-100 truncate leading-snug">{book.title}</p>
          <p className="text-xs text-pw-300 truncate mt-0.5 leading-snug">{displayAuthor}</p>

          <div className="pointer-events-none absolute bottom-full left-0 right-0 mb-2 z-40 opacity-0 translate-y-1 group-hover/meta:opacity-100 group-hover/meta:translate-y-0 transition-all duration-150">
            <div className="rounded-lg bg-pw-800 border border-pw-600/50 shadow-2xl shadow-pw-950/80 px-3 py-2">
              <p className="text-xs font-semibold text-pw-50 leading-snug">{book.title}</p>
              <p className="text-xs text-pw-300 leading-snug mt-0.5">{displayAuthor}</p>
            </div>
            <div className="w-2.5 h-2.5 bg-pw-800 border-r border-b border-pw-600/50 rotate-45 -mt-1.5 ml-3" />
          </div>
        </div>
      </div>

      {editOpen && (
        <MetadataEditor book={book} onClose={() => setEditOpen(false)} />
      )}
    </>
  )
}
