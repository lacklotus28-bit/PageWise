import { Bookmark } from '../../types'

interface Props {
  bookmarks: Bookmark[]
  currentIndex: number
  onSelect: (spineIndex: number) => void
  onRemove: (bookmarkId: string) => void
  onClose: () => void
}

export default function BookmarksPanel({ bookmarks, currentIndex, onSelect, onRemove, onClose }: Props) {
  const sorted = [...bookmarks].sort((a, b) => a.spineIndex - b.spineIndex)

  return (
    <div className="w-72 max-h-[70vh] flex flex-col rounded-xl bg-pw-800 border border-pw-600/40 shadow-2xl shadow-pw-950/80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pw-700/40 flex-shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-pw-300">
          Bookmarks
        </h3>
        <button
          className="text-pw-400 hover:text-pw-100 transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-pw-700/50"
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto py-2 flex-1">
        {sorted.length === 0 ? (
          <p className="px-4 py-3 text-xs text-pw-400">
            No bookmarks yet. Tap the ribbon icon to save your place.
          </p>
        ) : (
          sorted.map((bm) => {
            const isActive = bm.spineIndex === currentIndex
            return (
              <div
                key={bm.id}
                className={`group flex items-center gap-2 px-4 py-2 transition-colors ${
                  isActive ? 'bg-pw-600/40' : 'hover:bg-pw-700/40'
                }`}
              >
                <button
                  className={`flex-1 text-left text-sm truncate ${
                    isActive ? 'text-pw-50 font-medium' : 'text-pw-200'
                  }`}
                  onClick={() => onSelect(bm.spineIndex)}
                  title={bm.label}
                >
                  {bm.label}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-pw-400 hover:text-red-400 w-5 h-5 flex items-center justify-center flex-shrink-0"
                  onClick={() => onRemove(bm.id)}
                  title="Remove bookmark"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4h10M6.5 4V2.5a1 1 0 011-1h1a1 1 0 011 1V4M4.5 4l.5 9a1 1 0 001 1h4a1 1 0 001-1l.5-9"
                      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
