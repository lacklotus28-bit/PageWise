# Pagewise - Development Plan

> Windows EPUB reader built with Tauri + React + TypeScript

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri (Rust) |
| Frontend | React + TypeScript |
| EPUB rendering | epub.js (HTML extraction, not iframe renderer) |
| State management | Zustand |
| Styling | Tailwind CSS |
| Build tool | Vite |

---

## Features

### Core (v1) -- Done
- [x] Import EPUB files via file picker and drag-and-drop
- [x] Concurrent import (3 files at a time) with progress toast
- [x] Duplicate detection before any file I/O
- [x] Cover, title, and author extraction from EPUB metadata
- [x] Author metadata sanitization
- [x] Metadata editor (title, author, cover)
- [x] Shelves -- auto-created from import folder, manual creation, rename, delete
- [x] Search by title or author
- [x] Sort by recently added, title, author, or progress
- [x] Multi-select bulk removal
- [x] Reading statistics panel

### Reader (v1) -- Done
- [x] Raw HTML extraction per chapter (epub.js iframe bypassed)
- [x] EPUB CSS loaded from manifest
- [x] Images inlined as data URLs (img and SVG image elements)
- [x] Keyboard and click-zone chapter navigation
- [x] Scroll position saved and restored within each chapter
- [x] Table of contents panel
- [x] Bookmarks with TOC-aware labels
- [x] In-book text search (Ctrl+F) with highlight cycling
- [x] Focus mode (F to toggle, Esc to exit)
- [x] Progress bar and chapter counter
- [x] Reading time tracking per session
- [x] Unique chapter visited tracking

### Settings (v1) -- Done
- [x] Font size and family
- [x] Line spacing
- [x] Reading column width presets
- [x] Light, dark, and sepia themes

### Remaining
- [ ] PDF support via pdf.js
- [ ] Highlights and annotations

---

## Project Structure

```
Pagewise/
├── src-tauri/
│   ├── src/main.rs
│   ├── icons/
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── src/
│   ├── components/
│   │   ├── Library/
│   │   │   ├── LibraryView.tsx
│   │   │   ├── BookCard.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MetadataEditor.tsx
│   │   │   └── StatsPanel.tsx
│   │   ├── Reader/
│   │   │   ├── ReaderView.tsx
│   │   │   ├── TocPanel.tsx
│   │   │   ├── BookmarksPanel.tsx
│   │   │   └── SearchBar.tsx
│   │   └── Settings/
│   │       └── SettingsPanel.tsx
│   ├── store/
│   │   ├── libraryStore.ts
│   │   └── settingsStore.ts
│   ├── hooks/
│   │   ├── useBookImport.ts
│   │   ├── useFileDrop.ts
│   │   └── useClickOutside.ts
│   ├── utils/
│   │   └── text.ts
│   ├── types/index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

---

## Known Issues Resolved

- **Vite EBUSY crash**: Cargo build artifacts locked by Windows. Fixed by
  excluding src-tauri/target from Vite's file watcher.
- **File dialog behind window**: Fixed by calling appWindow.setFocus()
  before opening the dialog.
- **book.ready hanging**: epub.js fetches blob URLs which WebView2 blocks.
  Fixed by passing ArrayBuffer directly to ePub(). Raced against a 15s
  timeout so corrupt files cannot hang the UI.
- **epub.js iframe blank**: WebView2 sandboxes iframe scripts. Fixed by
  extracting chapter HTML via section.load() and injecting into the DOM.
- **EPUB CSS not loading**: Per-chapter href resolution fails with
  ArrayBuffer books. Fixed by loading all CSS upfront from the manifest
  using item.type === 'text/css' (not item['media-type']).
- **SVG cover images blurry**: SVG image elements use xlink:href/href, not
  src. Fixed by setting the correct attributes and preserving SVG width/height.
- **Line spacing not applying**: EPUB stylesheets set line-height on
  paragraph classes directly. Fixed by targeting .reader-content * instead
  of just the container.
- **Author showing as "---"**: Placeholder junk in EPUB metadata. Fixed with
  sanitizeAuthor() in utils/text.ts.
- **ICO with one frame**: Old icon only had a 128px frame. Regenerated from
  1024px source with 16/32/48/64/128/256px frames embedded.
- **Empty shelf showing wrong state**: Selecting an empty shelf fell through
  to the search-no-results message. Fixed by distinguishing three cases:
  library empty, shelf empty, and search returned nothing.

---

## Notes

- PDF support is next and requires a separate rendering pipeline via pdf.js
- Progress is tracked per spine index, not CFI
- Zustand persist stores library and settings as localStorage JSON
- Cover images stored as resized JPEG data URLs to survive app restarts
- Shelves are keyed by folder path, not name, so renaming a shelf does not
  break auto-grouping of future imports from the same folder
- scrollOffset (0-1 fraction) is saved per book and restored after chapter load
