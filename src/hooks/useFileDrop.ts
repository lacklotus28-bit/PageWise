import { useEffect, useRef, useState } from 'react'
import { appWindow } from '@tauri-apps/api/window'

export function useFileDrop(onDrop: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false)
  // Store the latest callback in a ref so the effect never needs to re-run
  // when onDrop changes reference. Without this, importPaths changing on
  // each render causes the listener to re-register in a loop, tearing down
  // the previous one before the drop event can fire.
  const onDropRef = useRef(onDrop)
  useEffect(() => { onDropRef.current = onDrop })

  useEffect(() => {
    let unlisten: (() => void) | undefined

    appWindow.onFileDropEvent((event) => {
      if (event.payload.type === 'hover') {
        setIsDragging(true)
      } else if (event.payload.type === 'drop') {
        setIsDragging(false)
        // Keep supported book files as-is, but also pass through anything
        // without a recognized file extension (likely a dropped folder --
        // Tauri gives us raw paths with no way to tell here). The consumer
        // (importDroppedPaths) probes each path with readDir to confirm
        // whether it's actually a folder before treating it as one.
        const relevant = event.payload.paths.filter((p) => {
          const fileName = p.split(/[\\/]/).pop() ?? ''
          const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : ''
          return !ext || ext === 'epub' || ext === 'pdf'
        })
        if (relevant.length > 0) onDropRef.current(relevant)
      } else {
        setIsDragging(false)
      }
    }).then((fn) => { unlisten = fn })

    return () => { unlisten?.() }
  }, []) // empty deps -- registers once, uses ref for fresh callback

  return isDragging
}
