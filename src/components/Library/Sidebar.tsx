import { useMemo, useRef, useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useClickOutside } from '../../hooks/useClickOutside'

function ShelfRow({ id, name, count }: { id: string | null; name: string; count: number }) {
  const activeCollectionId = useLibraryStore((s) => s.activeCollectionId)
  const setActiveCollection = useLibraryStore((s) => s.setActiveCollection)
  const renameCollection = useLibraryStore((s) => s.renameCollection)
  const deleteCollection = useLibraryStore((s) => s.deleteCollection)

  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [renameError, setRenameError] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen, [menuButtonRef])

  const isActive = activeCollectionId === id
  const isAllBooks = id === null

  const commitRename = () => {
    if (!id) { setRenaming(false); return }
    if (draftName.trim() === name.trim()) { setRenaming(false); setRenameError(false); return }
    const ok = renameCollection(id, draftName)
    if (!ok) {
      setRenameError(true)
      return
    }
    setRenaming(false)
    setRenameError(false)
  }

  if (renaming && id) {
    return (
      <div className="px-2 py-1">
        <input
          autoFocus
          value={draftName}
          onChange={(e) => { setDraftName(e.target.value); setRenameError(false) }}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setDraftName(name); setRenaming(false); setRenameError(false) }
          }}
          className={`w-full text-sm rounded-md bg-pw-800 border text-pw-100 px-2 py-1.5 focus:outline-none ${
            renameError ? 'border-red-500/60' : 'border-pw-500/60'
          }`}
        />
        {renameError && (
          <p className="text-xs text-red-400 mt-1 px-0.5">A shelf with this name already exists</p>
        )}
      </div>
    )
  }

  return (
    <div className="group relative">
      <button
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
          isActive ? 'bg-pw-600/40 text-pw-50' : 'text-pw-300 hover:bg-pw-800/60 hover:text-pw-100'
        }`}
        onClick={() => setActiveCollection(id)}
      >
        <span className="truncate flex items-center gap-2">
          {isAllBooks ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <path d="M2 5.5C2 4.67 2.67 4 3.5 4h3l1.5 1.5h5.5c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5h-9C2.67 14 2 13.33 2 12.5v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          )}
          <span className="truncate">{name}</span>
        </span>
        <span className="text-xs text-pw-500 flex-shrink-0">{count}</span>
      </button>

      {!isAllBooks && (
        <button
          ref={menuButtonRef}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center text-pw-400 hover:text-pw-100 hover:bg-pw-700/60"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          title="Shelf options"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.4"/>
            <circle cx="8" cy="8" r="1.4"/>
            <circle cx="8" cy="13" r="1.4"/>
          </svg>
        </button>
      )}

      {menuOpen && id && (
        <div
          ref={menuRef}
          className="absolute left-2 right-2 top-8 z-30 rounded-lg bg-pw-800 border border-pw-600/50 shadow-2xl overflow-hidden"
        >
          <button
            className="w-full text-left px-3 py-2 text-sm text-pw-200 hover:bg-pw-700/60 transition-colors"
            onClick={() => { setRenaming(true); setDraftName(name); setMenuOpen(false) }}
          >
            Rename
          </button>
          <div className="h-px bg-pw-700/40 mx-2" />
          <button
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-pw-700/60 transition-colors"
            onClick={() => { deleteCollection(id); setMenuOpen(false) }}
          >
            Delete shelf
          </button>
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const books = useLibraryStore((s) => s.books)
  const collections = useLibraryStore((s) => s.collections)
  const createCollection = useLibraryStore((s) => s.createCollection)
  const setActiveCollection = useLibraryStore((s) => s.setActiveCollection)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState(false)

  const countsByCollection = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of books) {
      if (b.collectionId) map.set(b.collectionId, (map.get(b.collectionId) ?? 0) + 1)
    }
    return map
  }, [books])

  const sortedCollections = useMemo(
    () => [...collections].sort((a, b) => a.name.localeCompare(b.name)),
    [collections]
  )

  const commitCreate = () => {
    const name = newName.trim()
    if (!name) { setCreating(false); setCreateError(false); return }
    const id = createCollection(name)
    if (!id) {
      setCreateError(true)
      return
    }
    setActiveCollection(id)
    setNewName('')
    setCreating(false)
    setCreateError(false)
  }

  return (
    <aside className="w-64 flex-shrink-0 border-l border-pw-700/30 flex flex-col py-4 px-2 overflow-y-auto">
      <div className="px-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-pw-500">Library</span>
      </div>

      <div className="space-y-0.5 mb-4">
        <ShelfRow id={null} name="All Books" count={books.length} />
      </div>

      <div className="px-2 mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-pw-500">Shelves</span>
        <button
          className="text-pw-500 hover:text-pw-200 transition-colors w-5 h-5 flex items-center justify-center rounded"
          onClick={() => setCreating(true)}
          title="New shelf"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="space-y-0.5 flex-1">
        {sortedCollections.length === 0 && !creating && (
          <p className="px-3 text-xs text-pw-500 leading-relaxed">
            Shelves are created automatically from the folders your books are imported from, or you can add one manually.
          </p>
        )}
        {sortedCollections.map((c) => (
          <ShelfRow key={c.id} id={c.id} name={c.name} count={countsByCollection.get(c.id) ?? 0} />
        ))}
        {creating && (
          <div className="px-2 py-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setCreateError(false) }}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate()
                if (e.key === 'Escape') { setNewName(''); setCreating(false); setCreateError(false) }
              }}
              placeholder="Shelf name..."
              className={`w-full text-sm rounded-md bg-pw-800 border text-pw-100 placeholder:text-pw-500 px-2 py-1.5 focus:outline-none ${
                createError ? 'border-red-500/60' : 'border-pw-500/60'
              }`}
            />
            {createError && (
              <p className="text-xs text-red-400 mt-1 px-0.5">A shelf with this name already exists</p>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
