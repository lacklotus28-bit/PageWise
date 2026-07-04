export interface Bookmark {
  id: string
  spineIndex: number
  label: string
  createdAt: number
}

export interface Collection {
  id: string
  name: string
  createdAt: number
  folderPath?: string
}

export interface Book {
  id: string
  path: string
  title: string
  author: string
  // Filename (not full path) of the cover JPEG on disk, under the app's
  // covers directory -- see src/utils/coverStorage.ts. Kept as a bare
  // filename rather than a base64 data URL so the persisted library JSON
  // stays small; a book with an embedded base64 cover cost tens of KB of
  // localStorage on every single write (even for unrelated changes like a
  // page turn), which is what caused the app to get laggier as the library
  // grew. Old libraries saved before this change may still have `coverUrl`
  // set to a data: URL -- see migrateLegacyCovers in libraryStore.ts.
  coverPath?: string
  coverUrl?: string
  addedAt: number
  lastPosition?: string
  scrollOffset?: number
  lastOpenedAt?: number
  progress?: number
  bookmarks?: Bookmark[]
  readingTime?: number
  chaptersVisited?: number[]
  collectionId?: string
  fileType?: 'epub' | 'pdf'  // undefined treated as 'epub' for existing books
}

export type Theme = 'light' | 'dark' | 'sepia'
export type ViewMode = 'paginated' | 'scroll'

export interface ReaderSettings {
  theme: Theme
  fontSize: number
  fontFamily: string
  viewMode: ViewMode
  lineHeight: number
}
