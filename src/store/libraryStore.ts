import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Book, Bookmark, Collection } from '../types'

export type LibrarySortKey = 'recent' | 'title' | 'author' | 'progress'

interface LibraryState {
  books: Book[]
  collections: Collection[]
  activeBookPath: string | null
  activeCollectionId: string | null // null = "All Books"
  sidebarOpen: boolean
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
  // Collections / shelves
  createCollection: (name: string) => string
  renameCollection: (id: string, name: string) => void
  deleteCollection: (id: string) => void
  moveBookToCollection: (bookId: string, collectionId: string | null) => void
  setActiveCollection: (id: string | null) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  // Resolves (or creates) the shelf for a given folder path, keyed by path
  // rather than name so a later rename doesn't break future auto-grouping.
  // Returns the collection id.
  getOrCreateCollectionForFolder: (folderPath: string, folderName: string) => string
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      collections: [],
      activeBookPath: null,
      activeCollectionId: null,
      sidebarOpen: true,
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

      createCollection: (name) => {
        const id = crypto.randomUUID()
        const trimmed = name.trim() || 'Untitled Shelf'
        set((s) => ({
          collections: [...s.collections, { id, name: trimmed, createdAt: Date.now() }],
        }))
        return id
      },

      renameCollection: (id, name) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === id ? { ...c, name: name.trim() || c.name } : c
          ),
        })),

      deleteCollection: (id) =>
        set((s) => ({
          collections: s.collections.filter((c) => c.id !== id),
          // Unassign rather than delete the books themselves.
          books: s.books.map((b) =>
            b.collectionId === id ? { ...b, collectionId: undefined } : b
          ),
          activeCollectionId: s.activeCollectionId === id ? null : s.activeCollectionId,
        })),

      moveBookToCollection: (bookId, collectionId) =>
        set((s) => ({
          books: s.books.map((b) =>
            b.id === bookId ? { ...b, collectionId: collectionId ?? undefined } : b
          ),
        })),

      setActiveCollection: (id) => set({ activeCollectionId: id }),

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      getOrCreateCollectionForFolder: (folderPath, folderName) => {
        const existing = get().collections.find((c) => c.folderPath === folderPath)
        if (existing) return existing.id

        const id = crypto.randomUUID()
        const name = folderName.trim() || 'Untitled Shelf'
        set((s) => ({
          collections: [...s.collections, { id, name, createdAt: Date.now(), folderPath }],
        }))
        return id
      },
    }),
    {
      name: 'pagewise-library',
      partialize: (s) => ({
        books: s.books,
        collections: s.collections,
        activeBookPath: s.activeBookPath,
        activeCollectionId: s.activeCollectionId,
        sidebarOpen: s.sidebarOpen,
        searchQuery: s.searchQuery,
        sortBy: s.sortBy,
      }),
    }
  )
)
