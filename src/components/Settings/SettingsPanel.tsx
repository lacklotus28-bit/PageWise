import { useSettingsStore } from '../../store/settingsStore'
import { Theme } from '../../types'

interface Props {
  onClose: () => void
}

const FONTS = [
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'System', value: 'system-ui, sans-serif' },
]

const THEMES: { label: string; value: Theme; bg: string; border: string; color: string }[] = [
  { label: 'Light', value: 'light', bg: '#ffffff', border: '#e2e2e2', color: '#1a1a2e' },
  { label: 'Dark',  value: 'dark',  bg: '#111827', border: '#374151', color: '#dde0ed' },
  { label: 'Sepia', value: 'sepia', bg: '#f8f0dc', border: '#d4b896', color: '#4a3728' },
]

const WIDTH_PRESETS = [
  { label: 'Narrow', value: 560 },
  { label: 'Medium', value: 720 },
  { label: 'Wide',   value: 920 },
  { label: 'Full',   value: 1200 },
]

export default function SettingsPanel({ onClose }: Props) {
  const {
    theme, fontSize, fontFamily, lineHeight, maxWidth,
    setTheme, setFontSize, setFontFamily, setLineHeight, setMaxWidth,
  } = useSettingsStore()

  return (
    <div className="w-64 rounded-xl bg-pw-800 border border-pw-600/40 shadow-2xl shadow-pw-950/80 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-pw-300">
          Reading
        </h3>
        <button
          className="text-pw-400 hover:text-pw-100 transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-pw-700/50"
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Theme */}
      <div className="mb-4">
        <label className="text-xs text-pw-400 uppercase tracking-wider mb-2 block">Theme</label>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                theme === t.value
                  ? 'ring-2 ring-pw-400 ring-offset-1 ring-offset-pw-800'
                  : 'opacity-60 hover:opacity-90'
              }`}
              style={{ background: t.bg, borderColor: t.border, color: t.color }}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Width */}
      <div className="mb-4">
        <label className="text-xs text-pw-400 uppercase tracking-wider mb-2 block">Width</label>
        <div className="flex gap-1.5">
          {WIDTH_PRESETS.map((w) => (
            <button
              key={w.value}
              className={`flex-1 py-1 rounded-lg text-xs font-medium border transition-all ${
                maxWidth === w.value
                  ? 'bg-pw-600/60 border-pw-400 text-pw-100'
                  : 'border-pw-600/40 text-pw-400 hover:text-pw-200 hover:border-pw-500/50'
              }`}
              onClick={() => setMaxWidth(w.value)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div className="mb-4">
        <div className="flex justify-between mb-2">
          <label className="text-xs text-pw-400 uppercase tracking-wider">Font Size</label>
          <span className="text-xs text-pw-200 font-medium">{fontSize}px</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-pw-400 text-xs">A</span>
          <input
            type="range"
            min={12}
            max={32}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-pw-400 h-1"
          />
          <span className="text-pw-200 text-sm font-medium">A</span>
        </div>
      </div>

      {/* Font family */}
      <div className="mb-4">
        <label className="text-xs text-pw-400 uppercase tracking-wider mb-2 block">Font</label>
        <select
          className="w-full text-sm rounded-lg border border-pw-600/50 bg-pw-750 text-pw-100 px-3 py-1.5 focus:outline-none focus:border-pw-400"
          style={{ background: '#201A47' }}
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
        >
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Line height */}
      <div>
        <div className="flex justify-between mb-2">
          <label className="text-xs text-pw-400 uppercase tracking-wider">Spacing</label>
          <span className="text-xs text-pw-200 font-medium">{lineHeight}x</span>
        </div>
        <input
          type="range"
          min={1.2}
          max={2.2}
          step={0.1}
          value={lineHeight}
          onChange={(e) => setLineHeight(Number(e.target.value))}
          className="w-full accent-pw-400 h-1"
        />
      </div>
    </div>
  )
}
