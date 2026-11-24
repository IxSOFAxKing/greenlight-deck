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

export type ConsoleModel = 'seriesX' | 'seriesS' | 'oneX' | 'oneS' | 'one'

export function consoleModel(type: string): ConsoleModel {
  const t = type.toLowerCase()
  if (t.includes('seriesx')) return 'seriesX'
  if (t.includes('seriess')) return 'seriesS'
  if (t.includes('onex')) return 'oneX'
  if (t.includes('ones')) return 'oneS'
  if (t.includes('one')) return 'one'
  return 'seriesX'
}

/** Simple, generic drawings of each console shape (no logos or trademarks). */
export function ConsoleArt({ type }: { type: string }) {
  const model = consoleModel(type)
  if (model === 'seriesX') {
    return (
      <svg viewBox="0 0 120 160" className="console-art tall" aria-hidden="true">
        <defs>
          <linearGradient id="ca-tower" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#2a2f36" /><stop offset="1" stopColor="#14171b" />
          </linearGradient>
        </defs>
        <rect x="28" y="10" width="64" height="140" rx="6" fill="url(#ca-tower)" stroke="#3a4048" />
        <ellipse cx="60" cy="22" rx="24" ry="6" fill="#0d0f12" />
        <g fill="#0b0c0e">{Array.from({ length: 6 }, (_, i) => <circle key={i} cx={44 + i * 6.5} cy="22" r="1.6" />)}</g>
        <circle cx="40" cy="140" r="3" fill="var(--accent)" />
        <rect x="46" y="138" width="22" height="3" rx="1.5" fill="#2e343c" />
      </svg>
    )
  }
  if (model === 'seriesS') {
    return (
      <svg viewBox="0 0 160 120" className="console-art" aria-hidden="true">
        <rect x="20" y="34" width="120" height="58" rx="6" fill="#e9ecef" stroke="#c9ced4" />
        <circle cx="104" cy="63" r="20" fill="#1b1e22" />
        <g fill="#2a2e33">{Array.from({ length: 5 }, (_, i) => <circle key={i} cx={96 + i * 4} cy="63" r="1.4" />)}</g>
        <circle cx="34" cy="82" r="3" fill="var(--accent)" />
      </svg>
    )
  }
  // Xbox One family: wide, flat boxes seen slightly from above.
  const oneX = model === 'oneX'
  const oneS = model === 'oneS'
  const top = oneS ? '#f1f3f5' : oneX ? '#22262c' : '#1d2126'
  const front = oneS ? '#d9dde2' : oneX ? '#15181c' : '#121518'
  const edge = oneS ? '#c3c8ce' : '#363c44'
  return (
    <svg viewBox="0 0 200 130" className="console-art wide" aria-hidden="true">
      {/* top face */}
      <path d={oneX ? 'M30 52 L58 30 L178 30 L170 52 Z' : 'M24 56 L54 30 L184 30 L176 56 Z'} fill={top} stroke={edge} />
      {/* front face */}
      <rect x={oneX ? 30 : 24} y={oneX ? 52 : 56} width={oneX ? 140 : 152} height={oneX ? 30 : 38} rx="3" fill={front} stroke={edge} />
      {model === 'one' && <path d="M54 30 L104 30 L80 56 L24 56 Z" fill="#2b3037" opacity="0.9" />}
      {model === 'one' && <rect x="24" y="56" width="62" height="38" fill="#262b31" />}
      {oneS && <g fill="#aab1b9">{Array.from({ length: 18 }, (_, i) => <circle key={i} cx={66 + (i % 9) * 5 + (i > 8 ? 2.5 : 0)} cy={38 + Math.floor(i / 9) * 5} r="1.3" />)}</g>}
      {oneX && <path d="M58 30 L178 30" stroke="#3d444d" strokeWidth="1.5" />}
      {/* disc slot */}
      <rect x={oneX ? 44 : 38} y={oneX ? 62 : 66} width={oneX ? 54 : 58} height="2.5" rx="1.25" fill={oneS ? '#b5bcc4' : '#0a0b0d'} />
      {/* power light */}
      <circle cx={oneX ? 158 : 164} cy={oneX ? 67 : 75} r="3.2" fill="var(--accent)" />
      <ellipse cx="100" cy={oneX ? 92 : 102} rx="76" ry="5" fill="#000" opacity="0.25" />
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
