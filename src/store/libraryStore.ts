import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Book, Bookmark } from '../types'

export type LibrarySortKey = 'recent' | 'title' | 'author' | 'progress'

interface LibraryState {
  books: Book[]
  activeBookPath: string | null
  searchQuery: string
  sortBy: LibrarySortKey
  addBook: (book: Book) => void
  removeBook: (id: string) => void
  removeBooks: (ids: string[]) => void
  updateBook: (id: string, patch: Partial<Pick<Book, 'title' | 'author' | 'coverUrl'>>) => void
  openBook: (path: string) => void
  closeBook: () => void
  updateProgress: (id: string, cfi: string, progress: number) => void
  updateScrollOffset: (id: string, offset: number) => void
  addBookmark: (bookId: string, bookmark: Bookmark) => void
  removeBookmark: (bookId: string, bookmarkId: string) => void
  recordReadingTime: (bookId: string, seconds: number) => void
  markChapterVisited: (bookId: string, spineIndex: number) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sortBy: LibrarySortKey) => void
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      books: [],
      activeBookPath: null,
      searchQuery: '',
      sortBy: 'recent',

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

      updateBook: (id, patch) =>
        set((s) => ({
          books: s.books.map((b) => b.id === id ? { ...b, ...patch } : b),
        })),

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

      updateScrollOffset: (id, offset) =>
        set((s) => ({
          books: s.books.map((b) =>
            b.id === id ? { ...b, scrollOffset: offset } : b
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

      recordReadingTime: (bookId, seconds) =>
        set((s) => ({
          books: s.books.map((b) =>
            b.id === bookId
              ? { ...b, readingTime: (b.readingTime ?? 0) + Math.floor(seconds) }
              : b
          ),
        })),

      markChapterVisited: (bookId, spineIndex) =>
        set((s) => ({
          books: s.books.map((b) => {
            if (b.id !== bookId) return b
            const visited = b.chaptersVisited ?? []
            if (visited.includes(spineIndex)) return b
            return { ...b, chaptersVisited: [...visited, spineIndex] }
          }),
        })),

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSortBy: (sortBy) => set({ sortBy }),
    }),
    {
      name: 'pagewise-library',
      partialize: (s) => ({
        books: s.books,
        activeBookPath: s.activeBookPath,
        searchQuery: s.searchQuery,
        sortBy: s.sortBy,
      }),
    }
  )
)
