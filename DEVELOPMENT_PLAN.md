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

### Core (v1)
- [x] Add EPUB files to a local library (file picker + drag-and-drop)
- [x] Library view with cover, title, and author display
- [x] Open and read EPUB, chapter by chapter
- [x] Remember last read position per book (spine index based)
- [x] Table of contents navigation
- [x] Basic settings: font size, font family, line spacing, light/dark/sepia theme
- [x] Library search, sort, and multi-select removal
- [x] Metadata editor (title, author, cover)

### Reader UX (v1)
- [x] Page turn via keyboard arrows or click zones
- [x] Full-screen / focus reading mode (F to toggle, Esc to exit)
- [x] Progress bar showing chapter and overall position
- [x] Adjustable reading column width
- [x] Error screen for corrupt/missing files instead of infinite loading
- [x] In-book text search (Ctrl+F)
- [x] Bookmarks per book
- [x] Reading statistics

### v2 Additions
- [ ] Collections / shelves for organizing the library
- [ ] PDF support (via pdf.js)
- [ ] Highlights and annotations
- [ ] Export highlights and notes to a text file

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

## Milestones

### Milestone 1 - Scaffold (Done)
- [x] Tauri + React + TS project initialized
- [x] Tailwind and Zustand configured
- [x] Basic window and routing

### Milestone 2 - Library (Done)
- [x] File picker and drag-and-drop EPUB import
- [x] Metadata extraction (cover, title, author)
- [x] Persisted library via Zustand
- [x] Cover thumbnails resized to fit localStorage
- [x] Per-file import error handling with progress toast
- [x] Concurrent import with worker pool (3 files at a time)
- [x] Author metadata sanitization
- [x] Search by title or author
- [x] Sort by recently added, title, author, or progress
- [x] Multi-select bulk removal
- [x] Metadata editor (title, author, cover image)
- [x] Book card hover tooltip for full title/author
- [x] Click-outside handling for menus and dropdowns

### Milestone 3 - Reader (Done)
- [x] Raw HTML extraction per chapter (epub.js iframe bypassed due to WebView2 sandboxing)
- [x] EPUB CSS loaded from manifest (item.type, not item['media-type'])
- [x] Images inlined as data URLs, with separate handling for SVG image elements
- [x] Keyboard and click-zone navigation
- [x] Last position saved and restored per spine index
- [x] Table of contents panel with nested entry support
- [x] Focus mode (hides toolbar and nav bar)
- [x] In-book search via DOM TreeWalker with match highlighting and cycling
- [x] Bookmarks with TOC-aware labels
- [x] Reading time tracking per session, flushed on chapter change and unmount
- [x] Unique chapter visited tracking

### Milestone 4 - Settings (Done)
- [x] Font size and family
- [x] Light, dark, and sepia themes
- [x] Reading column width presets
- [x] Line spacing applied to all descendant elements

### Milestone 5 - Polish (Done)
- [x] Full-screen focus mode
- [x] Error handling for corrupt, DRM-locked, or missing files
- [x] Drag-and-drop import
- [x] Author metadata fallback
- [x] Library search, sort, and multi-select
- [x] Reading statistics panel (time, chapters, completed, in-progress, most read)
- [x] Metadata editor
- [x] App icon regenerated from 1024px source with multi-frame ICO

### Next (v2)
- [ ] Collections / shelves
- [ ] PDF support via pdf.js
- [ ] Highlights and annotations

---

## Known Issues Resolved

- **Vite EBUSY crash**: Cargo build artifacts locked by Windows. Fixed by
  excluding src-tauri/target from Vite's file watcher.
- **File dialog behind window**: Fixed by calling appWindow.setFocus()
  before opening the dialog.
- **book.ready hanging**: epub.js fetches blob URLs which WebView2 blocks.
  Fixed by passing ArrayBuffer directly to ePub(). Also raced against a
  15s timeout so corrupt files cannot hang the UI.
- **epub.js iframe blank**: WebView2 sandboxes iframe scripts. Fixed by
  extracting chapter HTML via section.load() and injecting into the DOM.
- **EPUB CSS not loading**: Per-chapter href resolution fails with
  ArrayBuffer books. Fixed by loading all CSS upfront from the manifest
  using item.type === 'text/css'.
- **SVG cover images blurry**: SVG image elements use xlink:href/href, not
  src. Fixed by setting the correct attributes and preserving SVG width/height.
- **Line spacing not applying**: EPUB stylesheets set line-height on
  paragraph classes directly. Fixed by targeting .reader-content * instead
  of just the container.
- **Author showing as "---"**: Placeholder junk in EPUB metadata. Fixed with
  sanitizeAuthor() in utils/text.ts, applied at import and display time.
- **ICO with one frame**: Old icon only had a 128px frame. Regenerated from
  1024px source with 16/32/48/64/128/256px frames embedded.

---

## Notes

- PDF support deferred: pdf.js requires a separate rendering pipeline
- Progress is tracked per spine index, not CFI. Coarser but reliable.
- Zustand persist stores library and settings as localStorage JSON
- Cover images stored as resized JPEG data URLs to survive app restarts
- searchQuery and sortBy are persisted in the library store so they survive
  restarts
- scrollOffset field on Book is available for sub-chapter scroll restoration
  if needed in future
