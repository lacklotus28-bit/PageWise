import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Book, Bookmark, Collection } from '../types'
import { saveCoverToDisk, deleteCoverFromDisk } from '../utils/coverStorage'

export type LibrarySortKey = 'recent' | 'title' | 'author' | 'progress'
export type LibraryFileTypeFilter = 'all' | 'epub' | 'pdf'

// Auto-deletes shelves (manually created or folder-derived) that no longer
// contain any books, checked only against the given candidate ids for
// efficiency -- callers pass in the collection ids that could have just lost
// their last book (e.g. a removed book's old shelf).
function pruneEmptyCollections(
  collections: Collection[],
  books: Book[],
  candidateIds: string[]
): Collection[] {
  if (candidateIds.length === 0) return collections
  const stillOccupied = new Set(books.map((b) => b.collectionId).filter(Boolean))
  const toRemove = new Set(candidateIds.filter((id) => !stillOccupied.has(id)))
  if (toRemove.size === 0) return collections
  return collections.filter((c) => !toRemove.has(c.id))
}

interface LibraryState {
  books: Book[]
  collections: Collection[]
  activeBookPath: string | null
  activeCollectionId: string | null // null = "All Books"
  sidebarOpen: boolean
  searchQuery: string
  sortBy: LibrarySortKey
  fileTypeFilter: LibraryFileTypeFilter
  addBook: (book: Book) => void
  addBooks: (books: Book[]) => void
  removeBook: (id: string) => void
  removeBooks: (ids: string[]) => void
  updateBook: (id: string, patch: Partial<Pick<Book, 'title' | 'author' | 'coverPath'>>) => void
  // One-time migration: moves any legacy base64 coverUrl (from before covers
  // were stored as files on disk) out to a real file and clears coverUrl so
  // it stops bloating the persisted JSON. Safe to call repeatedly -- it's a
  // no-op once no book has a data: URL left in coverUrl.
  migrateLegacyCovers: () => Promise<void>
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
  setFileTypeFilter: (filter: LibraryFileTypeFilter) => void
  // Collections / shelves
  createCollection: (name: string) => string | null
  renameCollection: (id: string, name: string) => boolean
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
      fileTypeFilter: 'all',

      addBook: (book) =>
        set((s) => ({
          books: s.books.some((b) => b.path === book.path)
            ? s.books
            : [book, ...s.books],
        })),

      // Adds many books in a single state update instead of one set() call
      // per book. During a large folder import, calling addBook() in a loop
      // triggers a React re-render of every subscribed component (library
      // grid, sidebar, toolbar) once per book -- for a 100-book import
      // that's 100 redundant re-renders competing with the actual PDF/EPUB
      // parsing for main-thread time. Batching collapses that to one.
      addBooks: (newBooks) =>
        set((s) => {
          const existingPaths = new Set(s.books.map((b) => b.path))
          const toAdd = newBooks.filter((b) => !existingPaths.has(b.path))
          if (toAdd.length === 0) return s
          return { books: [...toAdd, ...s.books] }
        }),

      removeBook: (id) =>
        set((s) => {
          const removedBook = s.books.find((b) => b.id === id)
          const books = s.books.filter((b) => b.id !== id)
          const collections = pruneEmptyCollections(
            s.collections,
            books,
            removedBook?.collectionId ? [removedBook.collectionId] : []
          )
          const activeCollectionId = collections.some((c) => c.id === s.activeCollectionId)
            ? s.activeCollectionId
            : null
          // Fire-and-forget: don't block the state update on disk cleanup.
          void deleteCoverFromDisk(removedBook?.coverPath)
          return { books, collections, activeCollectionId }
        }),

      removeBooks: (ids) =>
        set((s) => {
          const idSet = new Set(ids)
          const affectedCollectionIds = Array.from(
            new Set(
              s.books
                .filter((b) => idSet.has(b.id) && b.collectionId)
                .map((b) => b.collectionId as string)
            )
          )
          const removedBooks = s.books.filter((b) => idSet.has(b.id))
          const books = s.books.filter((b) => !idSet.has(b.id))
          const collections = pruneEmptyCollections(s.collections, books, affectedCollectionIds)
          const activeCollectionId = collections.some((c) => c.id === s.activeCollectionId)
            ? s.activeCollectionId
            : null
          removedBooks.forEach((b) => void deleteCoverFromDisk(b.coverPath))
          return { books, collections, activeCollectionId }
        }),

      updateBook: (id, patch) =>
        set((s) => ({
          books: s.books.map((b) => b.id === id ? { ...b, ...patch } : b),
        })),

      migrateLegacyCovers: async () => {
        const legacyBooks = get().books.filter((b) => b.coverUrl?.startsWith('data:'))
        if (legacyBooks.length === 0) return
        console.log(`[library] migrating ${legacyBooks.length} legacy cover(s) to disk...`)
        for (const book of legacyBooks) {
          const coverPath = await saveCoverToDisk(book.coverUrl!, book.id)
          set((s) => ({
            books: s.books.map((b) =>
              b.id === book.id ? { ...b, coverPath, coverUrl: undefined } : b
            ),
          }))
        }
      },

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
      setFileTypeFilter: (fileTypeFilter) => set({ fileTypeFilter }),

      createCollection: (name) => {
        const trimmed = name.trim() || 'Untitled Shelf'
        const lower = trimmed.toLowerCase()
        const dupe = get().collections.some((c) => c.name.trim().toLowerCase() === lower)
        if (dupe) return null

        const id = crypto.randomUUID()
        set((s) => ({
          collections: [...s.collections, { id, name: trimmed, createdAt: Date.now() }],
        }))
        return id
      },

      renameCollection: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return false
        const lower = trimmed.toLowerCase()
        const dupe = get().collections.some(
          (c) => c.id !== id && c.name.trim().toLowerCase() === lower
        )
        if (dupe) return false

        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === id ? { ...c, name: trimmed } : c
          ),
        }))
        return true
      },

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
        set((s) => {
          const movedBook = s.books.find((b) => b.id === bookId)
          const previousCollectionId = movedBook?.collectionId
          const books = s.books.map((b) =>
            b.id === bookId ? { ...b, collectionId: collectionId ?? undefined } : b
          )
          const collections = previousCollectionId && previousCollectionId !== collectionId
            ? pruneEmptyCollections(s.collections, books, [previousCollectionId])
            : s.collections
          const activeCollectionId = collections.some((c) => c.id === s.activeCollectionId)
            ? s.activeCollectionId
            : null
          return { books, collections, activeCollectionId }
        }),

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
        fileTypeFilter: s.fileTypeFilter,
      }),
    }
  )
)
