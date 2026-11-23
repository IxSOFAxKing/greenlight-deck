import type { ReactNode } from 'react'

export type GlyphName = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'L3R3' | 'Menu' | 'View'

export function Glyph({ name }: { name: GlyphName }) {
  if (name === 'L3R3') {
    return <span className="glyph-combo"><span className="glyph glyph-stick">L3</span>+<span className="glyph glyph-stick">R3</span></span>
  }
  const cls = name.length === 1 ? `glyph glyph-face glyph-${name.toLowerCase()}` : `glyph glyph-shoulder`
  return <span className={cls}>{name === 'Menu' ? '≡' : name === 'View' ? '⧉' : name}</span>
}

export interface Hint { glyph: GlyphName; label: string; onClick?: () => void }

export function HintBar({ hints, left }: { hints: Hint[]; left?: ReactNode }) {
  return (
    <footer className="hintbar">
      <div className="hintbar-left">{left}</div>
      <div className="hintbar-right">
        {hints.map(h => (
          <button key={h.glyph + h.label} className="hint" onClick={h.onClick} tabIndex={-1}>
            <Glyph name={h.glyph} /> <span>{h.label}</span>
          </button>
        ))}
      </div>
    </footer>
  )
}

export function Spinner({ size = 48 }: { size?: number }) {
  return <div className="spinner" style={{ width: size, height: size }} aria-label="Loading" />
}

export function ConsoleArt({ type }: { type: string }) {
  // A generic tower / compact console silhouette (not a brand logo).
  const tall = /SeriesX|One(X)?$/i.test(type) && !/SeriesS/i.test(type)
  return tall ? (
    <svg viewBox="0 0 120 160" className="console-art" aria-hidden="true">
      <defs>
        <linearGradient id="tower" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#2a2f36" /><stop offset="1" stopColor="#14171b" />
        </linearGradient>
      </defs>
      <rect x="28" y="10" width="64" height="140" rx="6" fill="url(#tower)" stroke="#3a4048" />
      <ellipse cx="60" cy="22" rx="24" ry="6" fill="#0d0f12" />
      <g fill="#0b0c0e">{Array.from({ length: 6 }, (_, i) => <circle key={i} cx={44 + i * 6.5} cy="22" r="1.6" />)}</g>
      <circle cx="40" cy="140" r="3" fill="var(--accent)" />
      <rect x="46" y="138" width="22" height="3" rx="1.5" fill="#2e343c" />
    </svg>
  ) : (
    <svg viewBox="0 0 160 120" className="console-art" aria-hidden="true">
      <rect x="20" y="34" width="120" height="58" rx="6" fill="#e9ecef" stroke="#c9ced4" />
      <circle cx="104" cy="63" r="20" fill="#1b1e22" />
      <g fill="#2a2e33">{Array.from({ length: 5 }, (_, i) => <circle key={i} cx={96 + i * 4} cy="63" r="1.4" />)}</g>
      <circle cx="34" cy="82" r="3" fill="var(--accent)" />
    </svg>
  )
}

export function consoleLabel(type: string) {
  const map: Record<string, string> = {
    XboxSeriesX: 'Xbox Series X', XboxSeriesS: 'Xbox Series S',
    XboxOne: 'Xbox One', XboxOneS: 'Xbox One S', XboxOneX: 'Xbox One X',
  }
  return map[type] ?? type
}

export function powerLabel(state: string) {
  if (state === 'On') return { text: 'On', cls: 'on' }
  if (state === 'ConnectedStandby') return { text: 'Sleep', cls: 'standby' }
  if (state === 'Off') return { text: 'Off', cls: 'off' }
  return { text: state || 'Unknown', cls: 'off' }
}
