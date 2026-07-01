export interface Bookmark {
  id: string
  spineIndex: number
  label: string        // auto-generated from chapter title, or user-renamed
  createdAt: number
}

export interface Book {
  id: string
  path: string
  title: string
  author: string
  coverUrl?: string
  addedAt: number
  lastPosition?: string  // CFI string
  lastOpenedAt?: number
  progress?: number      // 0-1
  bookmarks?: Bookmark[]
}

export type Theme = 'light' | 'dark' | 'sepia'
export type ViewMode = 'paginated' | 'scroll'

export interface ReaderSettings {
  theme: Theme
  fontSize: number       // px, e.g. 18
  fontFamily: string
  viewMode: ViewMode
  lineHeight: number     // e.g. 1.6
}
