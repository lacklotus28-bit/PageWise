import { useRef, useEffect } from 'react'

interface Props {
  query: string
  matchIndex: number
  matchCount: number
  onChange: (q: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export default function SearchBar({ query, matchIndex, matchCount, onChange, onNext, onPrev, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-pw-900 border-b border-pw-700/40 flex-shrink-0">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-pw-400 flex-shrink-0">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.shiftKey ? onPrev() : onNext() }
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Search in chapter..."
        className="flex-1 bg-transparent text-sm text-pw-100 placeholder:text-pw-500 outline-none"
      />

      {query.length > 0 && (
        <span className="text-xs text-pw-400 flex-shrink-0 min-w-[3rem] text-right">
          {matchCount === 0 ? 'No results' : `${matchIndex + 1} / ${matchCount}`}
        </span>
      )}

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          className="p-1 rounded text-pw-400 hover:text-pw-100 disabled:opacity-30 transition-colors"
          onClick={onPrev}
          disabled={matchCount === 0}
          title="Previous match (Shift+Enter)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className="p-1 rounded text-pw-400 hover:text-pw-100 disabled:opacity-30 transition-colors"
          onClick={onNext}
          disabled={matchCount === 0}
          title="Next match (Enter)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className="p-1 rounded text-pw-400 hover:text-pw-100 transition-colors"
          onClick={onClose}
          title="Close search (Esc)"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
