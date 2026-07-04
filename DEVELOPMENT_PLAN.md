# Pagewise - Development Plan

> Windows EPUB and PDF reader built with Tauri + React + TypeScript

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri (Rust) |
| Frontend | React + TypeScript |
| EPUB rendering | epub.js (HTML extraction, not iframe renderer) |
| PDF rendering | pdfjs-dist |
| State management | Zustand |
| Styling | Tailwind CSS |
| Build tool | Vite |

---

## Features -- All Done

### Library
- [x] Import EPUB and PDF files via file picker, folder picker, or drag-and-drop
- [x] Drag-and-drop handles both files and folders (recursively scanned)
- [x] Concurrent import (3 files at a time) with live progress toast
- [x] Duplicate detection before any file I/O
- [x] Covers stored as JPEG files on disk (not base64 in localStorage)
- [x] One-time migration for legacy base64 covers on app startup
- [x] Automatic cover, title, and author extraction from metadata
- [x] Author metadata sanitization
- [x] Metadata editor (title, author, cover)
- [x] Shelves -- auto-created from import folder path, manual create/rename/delete
- [x] Auto-prune empty shelves when their last book is removed or moved
- [x] Filter by file type (All / EPUB / PDF)
- [x] Search by title or author
- [x] Sort by recently added, title, author, or progress
- [x] Multi-select bulk removal
- [x] Reading statistics panel

### EPUB Reader
- [x] Raw HTML extraction per chapter (epub.js iframe bypassed due to WebView2)
- [x] EPUB CSS loaded from manifest (item.type, not item['media-type'])
- [x] Images inlined as data URLs, with correct handling for SVG image elements
- [x] Table of contents panel with nested entry support
- [x] Bookmarks with TOC-aware labels
- [x] In-book text search (Ctrl+F) with DOM TreeWalker highlight cycling
- [x] Scroll position saved and restored within each chapter

### PDF Reader
- [x] Page-by-page canvas rendering via pdfjs-dist
- [x] Fit-width scaling, auto-adjusts on window resize
- [x] Scroll reset to top on every page change
- [x] Jump-to-page overlay (click the page counter)

### Both Readers
- [x] Keyboard and click-zone chapter/page navigation
- [x] Focus mode (F to toggle, Esc to exit)
- [x] Progress bar and position counter
- [x] Reading time tracking per session, flushed on navigation and unmount
- [x] Last position saved and restored on reopen
- [x] Error screen for corrupt, DRM-locked, or missing files

### Settings (EPUB)
- [x] Font size and family
- [x] Line spacing applied to all descendant elements
- [x] Reading column width presets
- [x] Light, dark, and sepia themes

### App
- [x] Zustand hydration guard -- blocks render until localStorage rehydration
      completes, preventing blank library on startup
- [x] Error boundary wrapping all views -- catches unexpected render crashes
      and shows a "Back to Library" recovery screen
- [x] App icon with proper multi-frame ICO (16/32/48/64/128/256px)

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
├── screenshots/
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
│   │   │   ├── PdfReaderView.tsx
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
│   │   ├── coverStorage.ts
│   │   └── text.ts
│   ├── types/index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
└── public/
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
  ArrayBuffer books. Fixed by loading all CSS from the manifest using
  item.type === 'text/css'.
- **SVG cover images blurry**: SVG image elements use xlink:href/href, not
  src. Fixed by setting the correct attributes and preserving SVG dimensions.
- **Line spacing not applying**: EPUB stylesheets set line-height on
  paragraph classes directly. Fixed by targeting .reader-content *.
- **Author showing as "---"**: Placeholder junk in EPUB metadata. Fixed
  with sanitizeAuthor() in utils/text.ts.
- **ICO with one frame**: Regenerated from 1024px source with
  16/32/48/64/128/256px frames embedded.
- **Empty shelf showing wrong state**: Fixed by distinguishing three cases:
  library empty, shelf empty, and search/filter returned nothing.
- **Blank library on startup**: Zustand persist rehydrates asynchronously.
  Fixed by blocking render behind persist.onFinishHydration().
- **Blank screen on render crash**: Fixed with an error boundary that
  catches uncaught throws during render/unmount and shows a recovery screen.
- **Library performance degrading with large collections**: Covers were
  stored as base64 data URLs in localStorage. Every state write
  (page turns, scroll saves) re-serialized every cover. Fixed by writing
  covers to disk as JPEG files and storing only the filename.
- **Per-book re-renders during folder import**: addBook() called once per
  file caused N re-renders for N books. Fixed by batching with addBooks()
  and flushing in groups of 8 or every 400ms.
- **pdf.destroy() not a function**: pdfjs-dist uses pdf.cleanup(), not
  pdf.destroy(). Fixed and wrapped in try/catch.
- **PDF page not resetting scroll on Next**: containerRef.current.scrollTo()
  added to goToPage() before rendering the new page.
- **useFileDrop re-registering on every render**: onDrop reference changed
  each render, causing the Tauri event listener to re-register in a loop.
  Fixed by storing the callback in a ref and using empty deps on the effect.

---

## Notes

- Progress is tracked per spine index for EPUB, per page number for PDF
- Zustand persist stores library and settings as localStorage JSON, but
  covers are written to the app data directory as JPEG files
- Shelves are keyed by folder path so renaming a shelf does not break
  auto-grouping of future imports from the same folder
- scrollOffset (0-1 fraction) is saved per EPUB book and restored after
  chapter load via requestAnimationFrame
- fileTypeFilter, searchQuery, and sortBy are all persisted so they
  survive app restarts
