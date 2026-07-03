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
  // Folder path this shelf was auto-created from, if any. Lets later imports
  // from the same folder resolve to this shelf by path rather than by name
  // (so renaming the shelf doesn't break future auto-grouping).
  folderPath?: string
}

export interface Book {
  id: string
  path: string
  title: string
  author: string
  coverUrl?: string
  addedAt: number
  lastPosition?: string
  scrollOffset?: number    // 0-1 fraction scrolled within the chapter at lastPosition
  lastOpenedAt?: number
  progress?: number        // 0-1
  bookmarks?: Bookmark[]
  readingTime?: number     // total seconds spent reading
  chaptersVisited?: number[] // unique spine indices visited
  collectionId?: string    // shelf this book belongs to, if any (one shelf per book)
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
