import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Theme, ViewMode } from '../types'

interface SettingsState {
  theme: Theme
  fontSize: number
  fontFamily: string
  viewMode: ViewMode
  lineHeight: number
  maxWidth: number        // reading column max width in px
  setTheme: (theme: Theme) => void
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setViewMode: (mode: ViewMode) => void
  setLineHeight: (lh: number) => void
  setMaxWidth: (w: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      fontSize: 18,
      fontFamily: 'Georgia, serif',
      viewMode: 'paginated',
      lineHeight: 1.7,
      maxWidth: 720,
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setViewMode: (viewMode) => set({ viewMode }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      setMaxWidth: (maxWidth) => set({ maxWidth }),
    }),
    { name: 'pagewise-settings' }
  )
)
