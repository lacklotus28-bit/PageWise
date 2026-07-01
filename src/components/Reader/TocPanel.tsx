interface TocEntry {
  label: string
  index: number
  depth: number
}

interface Props {
  toc: TocEntry[]
  currentIndex: number
  onSelect: (index: number) => void
  onClose: () => void
}

export default function TocPanel({ toc, currentIndex, onSelect, onClose }: Props) {
  return (
    <div className="w-72 max-h-[70vh] flex flex-col rounded-xl bg-pw-800 border border-pw-600/40 shadow-2xl shadow-pw-950/80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pw-700/40 flex-shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-pw-300">
          Contents
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
        {toc.length === 0 ? (
          <p className="px-4 py-3 text-xs text-pw-400">
            No table of contents found in this book.
          </p>
        ) : (
          toc.map((entry, i) => {
            const isActive = entry.index === currentIndex
            return (
              <button
                key={i}
                className={`w-full text-left px-4 py-2 text-sm transition-colors truncate ${
                  isActive
                    ? 'bg-pw-600/40 text-pw-50 font-medium'
                    : 'text-pw-200 hover:bg-pw-700/40 hover:text-pw-50'
                }`}
                style={{ paddingLeft: `${1 + entry.depth * 0.85}rem` }}
                onClick={() => onSelect(entry.index)}
                title={entry.label}
              >
                {entry.label}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
