import { appDataDir, join } from '@tauri-apps/api/path'
import { createDir, writeBinaryFile, removeFile, exists } from '@tauri-apps/api/fs'
import { convertFileSrc } from '@tauri-apps/api/tauri'

// Covers used to be stored as base64 data URLs directly inside the
// zustand-persisted library JSON (localStorage). That meant every single
// state update -- including things as small as a page-turn or a scroll-offset
// save -- re-serialized every cover of every book in the library on every
// write. With more than a couple hundred books (or a handful of large
// covers) this made the whole app progressively laggier the more books were
// imported, not just the import step itself.
//
// Instead, covers are written once as small JPEG files under the app's data
// directory, and only the filename is kept in the persisted store. Rendering
// a cover just needs `convertFileSrc()` to turn that file path into a URL
// the webview can load directly, with no serialization cost on every save.

const COVERS_DIR = 'covers'

let coversDirReady: Promise<string> | null = null

// Resolves (and lazily creates) the covers directory, caching the promise so
// concurrent imports don't race to create it multiple times.
async function ensureCoversDir(): Promise<string> {
  if (!coversDirReady) {
    coversDirReady = (async () => {
      const base = await appDataDir()
      const dir = await join(base, COVERS_DIR)
      if (!(await exists(dir))) {
        await createDir(dir, { recursive: true })
      }
      return dir
    })()
  }
  return coversDirReady
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Persists a cover (as a JPEG data URL) to disk under a unique filename and
 * returns the filename to store on the Book record. Returns undefined if
 * writing fails, so callers can gracefully fall back to "no cover".
 */
export async function saveCoverToDisk(dataUrl: string, bookId: string): Promise<string | undefined> {
  try {
    const dir = await ensureCoversDir()
    const fileName = `${bookId}.jpg`
    const bytes = dataUrlToBytes(dataUrl)
    await writeBinaryFile(await join(dir, fileName), bytes)
    return fileName
  } catch (err) {
    console.error('[cover] failed to save to disk:', err)
    return undefined
  }
}

/** Deletes a previously-saved cover file. Safe to call even if it doesn't exist. */
export async function deleteCoverFromDisk(fileName: string | undefined): Promise<void> {
  if (!fileName) return
  try {
    const dir = await ensureCoversDir()
    const path = await join(dir, fileName)
    if (await exists(path)) await removeFile(path)
  } catch (err) {
    console.error('[cover] failed to delete from disk:', err)
  }
}

// convertFileSrc needs an absolute path, but Book records only store the
// filename (so the library stays portable if the app's data dir ever moves).
// The absolute covers directory is resolved once, up front, and cached here
// so resolveCoverUrl() below can stay synchronous -- BookCard renders can't
// easily await a promise just to fill in an <img src>.
let cachedCoversDirPath: string | null = null

/**
 * Call once during app startup (before rendering the library) to warm the
 * cache that resolveCoverUrl() relies on.
 */
export async function initCoverStorage(): Promise<void> {
  cachedCoversDirPath = await ensureCoversDir()
}

/**
 * Resolves a stored cover filename to a URL the webview can load. Returns
 * undefined for books with no cover, or if initCoverStorage() hasn't
 * resolved yet -- callers should call initCoverStorage() once at app
 * startup so this is populated before the library renders.
 */
export function resolveCoverUrl(fileName: string | undefined): string | undefined {
  if (!fileName || !cachedCoversDirPath) return undefined
  return convertFileSrc(`${cachedCoversDirPath}/${fileName}`)
}
