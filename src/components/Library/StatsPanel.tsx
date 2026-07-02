import { useMemo } from 'react'
import { Book } from '../../types'
import { sanitizeAuthor } from '../../utils/text'

interface Props {
  books: Book[]
  onClose: () => void
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-pw-750/60 rounded-lg px-4 py-3 border border-pw-700/30">
      <span className="text-xs text-pw-400 uppercase tracking-wider">{label}</span>
      <span className="text-lg font-bold text-pw-50">{value}</span>
    </div>
  )
}

export default function StatsPanel({ books, onClose }: Props) {
  const stats = useMemo(() => {
    const totalTime = books.reduce((acc, b) => acc + (b.readingTime ?? 0), 0)
    const totalChapters = books.reduce((acc, b) => acc + (b.chaptersVisited?.length ?? 0), 0)
    const completed = books.filter((b) => (b.progress ?? 0) >= 0.9).length
    const inProgress = books.filter((b) => {
      const p = b.progress ?? 0
      return p > 0 && p < 0.9
    }).length

    // Sort by reading time for top books list
    const topBooks = [...books]
      .filter((b) => (b.readingTime ?? 0) > 0)
      .sort((a, b) => (b.readingTime ?? 0) - (a.readingTime ?? 0))
      .slice(0, 5)

    return { totalTime, totalChapters, completed, inProgress, topBooks }
  }, [books])

  return (
    <div className="flex flex-col h-full bg-pw-950">
      {/* Header */}
      <header className="drag-region flex items-center justify-between px-6 py-4 bg-pw-900 border-b border-pw-700/40">
        <div className="no-drag">
          <h2 className="text-sm font-bold text-pw-50">Reading Stats</h2>
          <p className="text-xs text-pw-400 mt-0.5">{books.length} books in library</p>
        </div>
        <button
          className="no-drag text-pw-400 hover:text-pw-100 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-pw-800/50"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total reading time" value={formatTime(stats.totalTime)} />
          <StatCard label="Chapters read" value={String(stats.totalChapters)} />
          <StatCard label="Completed" value={`${stats.completed} book${stats.completed !== 1 ? 's' : ''}`} />
          <StatCard label="In progress" value={`${stats.inProgress} book${stats.inProgress !== 1 ? 's' : ''}`} />
        </div>

        {/* Per-book breakdown */}
        {stats.topBooks.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-pw-400 mb-3">
              Most read
            </h3>
            <div className="space-y-2">
              {stats.topBooks.map((book) => {
                const pct = Math.round((book.progress ?? 0) * 100)
                return (
                  <div key={book.id} className="flex items-center gap-3 bg-pw-800/40 rounded-lg px-3 py-2.5 border border-pw-700/30">
                    {book.coverUrl ? (
                      <img src={book.coverUrl} alt="" className="w-8 h-11 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-11 rounded bg-gradient-to-br from-pw-700 to-pw-800 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-pw-100 truncate">{book.title}</p>
                      <p className="text-xs text-pw-400 truncate">{sanitizeAuthor(book.author)}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-0.5 bg-pw-700/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-pw-500 to-pw-300 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-pw-500 flex-shrink-0">{pct}%</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs font-semibold text-pw-200">{formatTime(book.readingTime ?? 0)}</p>
                      <p className="text-xs text-pw-500 mt-0.5">
                        {book.chaptersVisited?.length ?? 0} ch
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {stats.topBooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-pw-300 text-sm font-medium">No reading data yet</p>
            <p className="text-pw-500 text-xs mt-1">Stats are recorded as you read</p>
          </div>
        )}
      </div>
    </div>
  )
}
