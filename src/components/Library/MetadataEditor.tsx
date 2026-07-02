import { useState, useRef, useCallback } from 'react'
import { Book } from '../../types'
import { useLibraryStore } from '../../store/libraryStore'

interface Props {
  book: Book
  onClose: () => void
}

function resizeCover(dataUrl: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export default function MetadataEditor({ book, onClose }: Props) {
  const updateBook = useLibraryStore((s) => s.updateBook)

  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [coverUrl, setCoverUrl] = useState(book.coverUrl ?? '')
  const [coverPreview, setCoverPreview] = useState(book.coverUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [coverError, setCoverError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCoverFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setCoverError('File must be an image (JPEG, PNG, WebP)')
      return
    }
    setCoverError('')
    const reader = new FileReader()
    reader.onload = async () => {
      const raw = reader.result as string
      const resized = await resizeCover(raw, 400)
      setCoverUrl(resized)
      setCoverPreview(resized)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleCoverDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleCoverFile(file)
  }, [handleCoverFile])

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    setSaving(true)
    updateBook(book.id, {
      title: trimmedTitle,
      author: author.trim(),
      coverUrl: coverUrl || undefined,
    })
    setSaving(false)
    onClose()
  }, [book.id, title, author, coverUrl, updateBook, onClose])

  const handleRemoveCover = useCallback(() => {
    setCoverUrl('')
    setCoverPreview('')
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pw-950/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md mx-4 rounded-2xl bg-pw-900 border border-pw-700/40 shadow-2xl shadow-pw-950 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pw-700/40">
          <h2 className="text-sm font-semibold text-pw-50">Edit Book Info</h2>
          <button
            className="text-pw-400 hover:text-pw-100 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-pw-800/60"
            onClick={onClose}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Cover */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-pw-400 block mb-2">
              Cover
            </label>
            <div className="flex items-start gap-4">
              {/* Preview */}
              <div
                className="w-20 flex-shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-pw-800 border border-pw-700/40 cursor-pointer group relative"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleCoverDrop}
              >
                {coverPreview ? (
                  <>
                    <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-pw-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium">Change</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-pw-500 group-hover:text-pw-300 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                    <span className="text-xs">Add</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <button
                  className="w-full text-sm text-pw-300 hover:text-pw-100 border border-pw-700/40 hover:border-pw-500/50 rounded-lg px-3 py-2 transition-colors text-left"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose image file...
                </button>
                {coverPreview && (
                  <button
                    className="w-full text-sm text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg px-3 py-2 transition-colors text-left"
                    onClick={handleRemoveCover}
                  >
                    Remove cover
                  </button>
                )}
                {coverError && (
                  <p className="text-xs text-red-400">{coverError}</p>
                )}
                <p className="text-xs text-pw-500">JPEG, PNG, or WebP. You can also drag an image onto the cover.</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverFile(f) }}
            />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-pw-400 block mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm rounded-lg bg-pw-800/60 border border-pw-700/40 text-pw-100 placeholder:text-pw-500 px-3 py-2 focus:outline-none focus:border-pw-500/60"
              placeholder="Book title"
            />
          </div>

          {/* Author */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-pw-400 block mb-2">
              Author
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full text-sm rounded-lg bg-pw-800/60 border border-pw-700/40 text-pw-100 placeholder:text-pw-500 px-3 py-2 focus:outline-none focus:border-pw-500/60"
              placeholder="Author name"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-pw-700/40">
          <button
            className="text-sm text-pw-400 hover:text-pw-100 transition-colors px-4 py-2 rounded-lg hover:bg-pw-800/50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="text-sm font-medium text-white px-4 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
