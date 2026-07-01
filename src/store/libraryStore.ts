import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Book, Bookmark } from '../types'

interface LibraryState {
  books: Book[]
  activeBookPath: string | null
  addBook: (book: Book) => void
  removeBook: (id: string) => void
  removeBooks: (ids: string[]) => void
  openBook: (path: string) => void
  closeBook: () => void
  updateProgress: (id: string, cfi: string, progress: number) => void
  addBookmark: (bookId: string, bookmark: Bookmark) => void
  removeBookmark: (bookId: string, bookmarkId: string) => void
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      books: [],
      activeBookPath: null,

      addBook: (book) =>
        set((s) => ({
          books: s.books.some((b) => b.path === book.path)
            ? s.books
            : [book, ...s.books],
        })),

      removeBook: (id) =>
        set((s) => ({ books: s.books.filter((b) => b.id !== id) })),

      removeBooks: (ids) =>
        set((s) => {
          const idSet = new Set(ids)
          return { books: s.books.filter((b) => !idSet.has(b.id)) }
        }),

      openBook: (path) =>
        set((s) => ({
          activeBookPath: path,
          books: s.books.map((b) =>
            b.path === path ? { ...b, lastOpenedAt: Date.now() } : b
          ),
        })),

      closeBook: () => set({ activeBookPath: null }),

      updateProgress: (id, cfi, progress) =>
        set((s) => ({
          books: s.books.map((b) =>
            b.id === id ? { ...b, lastPosition: cfi, progress } : b
          ),
        })),

      addBookmark: (bookId, bookmark) =>
        set((s) => ({
          books: s.books.map((b) =>
            b.id === bookId
              ? { ...b, bookmarks: [...(b.bookmarks ?? []), bookmark] }
              : b
          ),
        })),

      removeBookmark: (bookId, bookmarkId) =>
        set((s) => ({
          books: s.books.map((b) =>
            b.id === bookId
              ? { ...b, bookmarks: (b.bookmarks ?? []).filter((bm) => bm.id !== bookmarkId) }
              : b
          ),
        })),
    }),
    { name: 'pagewise-library' }
  )
)
