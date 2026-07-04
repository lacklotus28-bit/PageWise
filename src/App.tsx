import { useEffect, useState, Component, ReactNode } from 'react'
import LibraryView from './components/Library/LibraryView'
import ReaderView from './components/Reader/ReaderView'
import PdfReaderView from './components/Reader/PdfReaderView'
import { useLibraryStore } from './store/libraryStore'
import { initCoverStorage } from './utils/coverStorage'

// Without this, an uncaught throw anywhere below (e.g. during a reader's
// unmount/cleanup when closing a book) unmounts the entire React tree with
// no visible error, leaving a blank window until the app is refreshed. This
// catches that and offers a way back to the library instead of a blank screen.
interface ErrorBoundaryState { hasError: boolean }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[app] unhandled render error:', error, info)
  }

  handleReset = () => {
    useLibraryStore.setState({ activeBookPath: null })
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-pw-950 flex flex-col items-center justify-center gap-4 text-center px-8">
          <p className="text-pw-100 font-semibold text-base">Something went wrong</p>
          <p className="text-pw-400 text-sm max-w-sm">
            This view ran into an unexpected error. You can go back to your library and try again.
          </p>
          <button
            onClick={this.handleReset}
            className="mt-1 px-5 py-2 rounded-lg bg-gradient-to-r from-pw-500 to-pw-400 hover:from-pw-400 hover:to-pw-300 text-white text-sm font-medium transition-all"
          >
            Back to Library
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const activeBookPath = useLibraryStore((s) => s.activeBookPath)
  const books = useLibraryStore((s) => s.books)
  const [hydrated, setHydrated] = useState(false)
  const [coversReady, setCoversReady] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('dark')

    // Resolve the on-disk covers directory once up front so BookCard's
    // synchronous resolveCoverUrl() calls have something to resolve against
    // as soon as the library renders.
    initCoverStorage().finally(() => setCoversReady(true))

    // Wait for the Zustand persist middleware to finish rehydrating from
    // localStorage before rendering. Without this the library flashes blank
    // on every open because the store starts with empty defaults.
    const unsub = useLibraryStore.persist.onFinishHydration(() => {
      setHydrated(true)
    })

    // If hydration already finished synchronously (rare but possible), set immediately
    if (useLibraryStore.persist.hasHydrated()) {
      setHydrated(true)
    }

    return () => unsub()
  }, [])

  // Once both hydration and cover-dir setup are done, migrate any legacy
  // base64 covers left over from before covers were stored as files. This
  // runs once per app launch and is a no-op for libraries already migrated.
  useEffect(() => {
    if (hydrated && coversReady) {
      useLibraryStore.getState().migrateLegacyCovers()
    }
  }, [hydrated, coversReady])

  if (!hydrated || !coversReady) {
    return (
      <div className="h-screen w-screen bg-pw-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-pw-500/30 border-t-pw-400 rounded-full animate-spin" />
      </div>
    )
  }

  const activeBook = books.find((b) => b.path === activeBookPath)
  const isPdf =
    activeBook?.fileType === 'pdf' ||
    (!activeBook?.fileType && activeBookPath?.toLowerCase().endsWith('.pdf'))

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      <ErrorBoundary key={activeBookPath ?? 'library'}>
        {!activeBookPath && <LibraryView />}
        {activeBookPath && isPdf && <PdfReaderView />}
        {activeBookPath && !isPdf && <ReaderView />}
      </ErrorBoundary>
    </div>
  )
}

export default App
