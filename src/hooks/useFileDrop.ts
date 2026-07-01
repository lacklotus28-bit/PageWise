import { useEffect, useState } from 'react'
import { appWindow } from '@tauri-apps/api/window'

/**
 * Listens for the OS-level drag-and-drop of files onto the app window.
 * Tauri intercepts the browser's native drop event, so this uses the
 * dedicated window API instead of onDrop/onDragOver DOM handlers.
 */
export function useFileDrop(onDrop: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined

    appWindow.onFileDropEvent((event) => {
      if (event.payload.type === 'hover') {
        setIsDragging(true)
      } else if (event.payload.type === 'drop') {
        setIsDragging(false)
        const epubPaths = event.payload.paths.filter((p) =>
          p.toLowerCase().endsWith('.epub')
        )
        if (epubPaths.length > 0) onDrop(epubPaths)
      } else {
        // 'cancel'
        setIsDragging(false)
      }
    }).then((fn) => { unlisten = fn })

    return () => { unlisten?.() }
  }, [onDrop])

  return isDragging
}
