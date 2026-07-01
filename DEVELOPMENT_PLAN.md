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

### Reader UX (v1)
- [x] Page turn via keyboard arrows or click zones
- [x] Full-screen / focus reading mode
- [x] Progress bar showing chapter and overall position
- [ ] Scroll mode toggle (paginated vs continuous scroll)
- [x] Adjustable reading column width
- [x] Error screen for corrupt/missing files instead of infinite loading

### v2 Additions
- [ ] Bookmarks per book
- [ ] Highlight text with color options
- [ ] Notes/annotations on highlights
- [ ] Search within a book
- [ ] Reading statistics (time read, pages per session)

### v3 Additions
- [ ] PDF support (via pdf.js)
- [ ] Collections / shelves for organizing the library
- [ ] Metadata editor (title, author, cover)
- [ ] Export highlights and notes to a text file

---

## Project Structure

```
Pagewise/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   └── main.rs
│   ├── icons/
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── src/                    # React frontend
│   ├── components/
│   │   ├── Library/
│   │   │   ├── LibraryView.tsx
│   │   │   └── BookCard.tsx
│   │   ├── Reader/
│   │   │   ├── ReaderView.tsx
│   │   │   └── TocPanel.tsx
│   │   └── Settings/
│   │       └── SettingsPanel.tsx
│   ├── store/
│   │   ├── libraryStore.ts
│   │   └── settingsStore.ts
│   ├── hooks/
│   │   ├── useBookImport.ts
│   │   └── useFileDrop.ts
│   ├── utils/
│   │   └── text.ts
│   ├── types/
│   │   └── index.ts
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
- [x] Initialize Tauri + React + TS project
- [x] Set up Tailwind and Zustand
- [x] Basic window and routing

### Milestone 2 - Library (Done)
- [x] File picker to add EPUB files
- [x] Drag-and-drop EPUB import onto the library view
- [x] Parse and display metadata (cover, title, author)
- [x] Persist library list via Zustand persist
- [x] Cover thumbnails resized client-side to fit localStorage
- [x] Per-file import error handling (one bad file doesn't block the batch)
- [x] Author metadata sanitization (filters out literal placeholder
      junk like "---", "N/A", "Unknown" that some EPUBs put in the
      author field instead of leaving it empty)
- [x] Search by title/author
- [x] Sort by recently added, title, author, or reading progress
- [x] Multi-select mode for bulk-removing books from the library

### Milestone 3 - Reader (Done)
- [x] Render EPUB chapters as raw HTML (epub.js iframe renderer is blocked
      by Tauri's WebView2 sandboxing, so chapters are extracted and injected
      directly into the DOM instead)
- [x] Inline EPUB CSS (loaded from manifest, not per-chapter links)
- [x] Inline images as data URLs, with correct handling for both `<img>`
      and SVG `<image>` elements
- [x] Keyboard and click navigation
- [x] Save and restore last position (per spine index)
- [x] Table of contents panel built from `book.loaded.navigation`, mapped
      to spine indices for jump-to-chapter navigation
- [x] Focus mode: hides the toolbar and bottom nav bar for distraction-free
      reading, toggled via a header button, the `F` key, or exited with `Esc`

### Milestone 4 - Settings (Done)
- [x] Font size and family controls
- [x] Light, dark, and sepia themes
- [x] Reading column width presets
- [x] Line spacing (applied to all descendant elements, not just the
      container, so it actually overrides EPUB-authored line-height)
- [ ] Scroll vs paginated mode toggle (currently scroll only)

### Milestone 5 - Polish (In Progress)
- [x] Table of contents panel (jump to any chapter, not just next/prev)
- [x] Error handling for corrupt, DRM-locked, or missing EPUB files --
      both at import time (file never enters the library) and at open
      time (friendly "Couldn't open this book" screen with a way back)
- [x] Drag-and-drop EPUB import directly onto the library view
- [x] Empty/missing author metadata fallback display
- [x] Library search, sort, and multi-select removal
- [x] Full-screen / focus reading mode
- [ ] Loading state polish (spinner added; could use chapter-level
      skeleton or progress indicator for very large books)
- [ ] App icon refinement and installer via Tauri bundler

---

## Known Issues Resolved

- **Vite EBUSY crash**: Windows file locking on Cargo build artifacts.
  Fixed by excluding `src-tauri/target` from Vite's file watcher.
- **Missing icon.ico**: Tauri requires `icon.ico` in `src-tauri/icons/`
  before it can generate the Windows resource file.
- **File dialog opening behind the window**: fixed by calling
  `appWindow.setFocus()` before invoking the dialog.
- **`book.ready` hanging indefinitely**: caused by epub.js trying to fetch
  a blob: URL, which WebView2 blocks. Fixed by passing the raw
  `ArrayBuffer` directly to `ePub()` instead of a blob URL. Also now
  raced against a 15s timeout so a genuinely corrupt file can't hang
  the UI forever.
- **epub.js iframe renderer blank screen**: WebView2 sandboxing blocks
  scripts inside the iframe epub.js creates. Worked around entirely by
  extracting each chapter's HTML via `section.load()` and injecting it
  into a normal React-rendered div.
- **EPUB CSS not loading**: chapter-level `<link>` href resolution was
  unreliable when the book was loaded from an `ArrayBuffer`. Fixed by
  loading all CSS upfront from `book.packaging.manifest`, filtering on
  `item.type === 'text/css'` (not `item['media-type']`, which doesn't
  exist on the manifest object).
- **SVG cover images appearing as blurry/broken**: SVG `<image>` elements
  use `xlink:href`/`href`, not `src`. The image-inlining code was setting
  `src` and stripping `xlink:href`, breaking the only working reference.
  Also fixed by no longer stripping `width`/`height` on SVG images, since
  those are coordinate dimensions for the SVG viewport, not CSS sizing.
- **Line spacing setting appearing to do nothing**: the comfort-style
  override only targeted `.reader-content` (the container div). EPUB
  stylesheets set `line-height` directly on specific paragraph classes
  (e.g. `.block_4`), and an explicit child value always wins over an
  inherited parent value regardless of `!important` on the parent rule.
  Fixed by applying `line-height` and `color` overrides to
  `.reader-content, .reader-content *` so every descendant is covered.
- **Author showing as "---"**: some EPUBs (especially fan/scanlation
  releases) put literal placeholder junk in the author metadata field
  instead of leaving it empty, so a simple `||` fallback didn't catch
  it. Fixed with `sanitizeAuthor()` in `utils/text.ts`, which checks
  against a list of known placeholder patterns and falls back to
  "Unknown Author". Applied both at import time (new books) and at
  display time in `BookCard` (so books imported before this fix also
  display cleanly without needing to be re-imported).
- **Stale localStorage data on relaunch**: cleared manually via
  `localStorage.clear()` in DevTools during development.

---

## Notes

- PDF support is deferred to v3 because pdf.js requires separate integration work
- The reader currently has no true CFI-based position tracking; progress is
  tracked per spine index, which is coarser but reliable across the HTML
  extraction approach
- Zustand persist middleware handles settings and library data as localStorage JSON
- Tauri allowlist in tauri.conf.json must explicitly enable fs, dialog, and
  window (setFocus) APIs. Drag-and-drop file events do not require an
  allowlist entry -- `fileDropEnabled` defaults to true on the window.
- Cover images are stored as resized JPEG data URLs directly in the
  persisted Zustand state to avoid blob URL invalidation on reload
- Import-time errors (corrupt EPUB, timeout, non-EPUB file) are collected
  per-file and shown as a dismissible toast, auto-clearing after 6s, so a
  bad file in a multi-file drop never blocks the good ones
- Library search/sort/selection state lives as local component state in
  LibraryView rather than the persisted Zustand store, since it's a
  transient view preference, not data that should survive between sessions
- `removeBooks(ids: string[])` was added to libraryStore alongside the
  existing single `removeBook(id)` so bulk deletion is one state update
  instead of N sequential ones
- Focus mode is reader-local state, not persisted -- it always starts off
  when reopening a book, which matches how most readers behave. The thin
  progress sliver at the very top stays visible even in focus mode so
  there's always a passive sense of how far through the chapter you are,
  without it counting as "chrome" the way the toolbar/nav bar do
