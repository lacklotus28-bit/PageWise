<div align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="96" alt="Pagewise icon" />
  <h1>Pagewise</h1>
  <p>A clean, fast EPUB reader for Windows built with Tauri and React.</p>

  ![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)
  ![License](https://img.shields.io/badge/license-MIT-purple?style=flat-square)
  ![Stack](https://img.shields.io/badge/stack-Tauri%20%2B%20React%20%2B%20TypeScript-blueviolet?style=flat-square)
</div>

---

## Features

**Library**
- Import EPUB files via file picker or drag-and-drop
- Concurrent import with per-file error reporting and a progress toast
- Duplicate detection before any file I/O
- Automatic cover, title, and author extraction from EPUB metadata
- Metadata editor -- fix title, author, or cover after import
- Shelves for organizing books, auto-created from import folder names
- Search by title or author, sort by recently added, title, author, or progress
- Multi-select mode for bulk removal
- Reading statistics: total time, chapters read, books completed

**Reader**
- Renders chapter HTML directly, no WebView2 iframe sandboxing issues
- Preserves original EPUB formatting and stylesheets
- Inline images including SVG cover pages
- Keyboard and click-zone navigation (arrow keys, click left/right edge)
- Table of contents panel for direct chapter navigation
- Bookmarks -- save and jump back to any chapter
- In-book text search (Ctrl+F) with match highlighting and cycling
- Focus mode for distraction-free reading (F to toggle, Esc to exit)
- Progress bar and chapter counter
- Scroll position saved and restored within each chapter

**Customization**
- Font family and font size
- Line spacing
- Reading column width (Narrow / Medium / Wide / Full)
- Light, dark, and sepia themes

**Reliability**
- Corrupt, DRM-locked, or missing files show a clear error instead of hanging
- Per-file import errors in batch drops -- one bad file does not block the rest
- Author metadata sanitization handles placeholder junk from scanlation EPUBs

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri](https://tauri.app/) (Rust) |
| Frontend | React + TypeScript |
| EPUB parsing | [epub.js](https://github.com/futurepress/epub.js/) |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Build | [Vite](https://vitejs.dev/) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri prerequisites for Windows](https://tauri.app/v1/guides/getting-started/prerequisites#windows): Microsoft C++ Build Tools and WebView2

### Run in development

```bash
git clone https://github.com/YOUR_USERNAME/pagewise.git
cd pagewise
npm install
npm run tauri dev
```

The first build takes a few minutes while Cargo downloads and compiles dependencies. Subsequent runs are fast.

### Build a release installer

```bash
npm run tauri build
```

The installer and standalone executable will be in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
pagewise/
├── src-tauri/          # Rust backend (Tauri config, icons, main.rs)
└── src/
    ├── components/
    │   ├── Library/    # LibraryView, BookCard, Sidebar, MetadataEditor, StatsPanel
    │   ├── Reader/     # ReaderView, TocPanel, BookmarksPanel, SearchBar
    │   └── Settings/   # SettingsPanel
    ├── hooks/          # useBookImport, useFileDrop, useClickOutside
    ├── store/          # Zustand stores (library, settings)
    ├── types/          # Shared TypeScript types
    └── utils/          # Text sanitization helpers
```

---

## Known Limitations

- **epub.js iframe renderer is bypassed.** Tauri's WebView2 blocks scripts inside epub.js's iframe. Pagewise extracts each chapter's raw HTML and injects it directly into the DOM instead. Some advanced EPUB layouts may render differently than in a browser-based reader.
- **No DRM support.** EPUB files protected by Adobe DRM or similar will fail to open.
- **macOS / Linux not tested.** The codebase is cross-platform in principle but has only been developed and tested on Windows.

---

## Roadmap

- [ ] PDF support
- [ ] Highlights and annotations

---

## License

MIT -- see [LICENSE](LICENSE) for details.
