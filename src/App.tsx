import { useEffect } from 'react'
import LibraryView from './components/Library/LibraryView'
import ReaderView from './components/Reader/ReaderView'
import { useLibraryStore } from './store/libraryStore'

function App() {
  const activeBookPath = useLibraryStore((s) => s.activeBookPath)

  // App chrome is always dark -- add class so any dark: variants still resolve
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      {activeBookPath ? <ReaderView /> : <LibraryView />}
    </div>
  )
}

export default App
