import { useRef } from 'react'
import { useInputLayer } from '../input/layers'
import { sound } from '../input/sound'
import { Glyph, HintBar } from './ui'

const ROWS = [
  '1234567890'.split(''),
  'qwertyuiop'.split(''),
  "asdfghjkl'".split(''),
  'zxcvbnm-:&'.split(''),
]

interface Props {
  value: string
  onChange: (v: string) => void
  onDone: () => void
  label?: string
}

/**
 * Controller-friendly keyboard. D-pad to pick keys, A to type,
 * X backspace, Y space, ≡ or B done. A physical keyboard (or Steam's
 * keyboard via Steam + X) types straight into the text field.
 */
export function OnScreenKeyboard({ value, onChange, onDone, label = 'Search' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const type = (ch: string) => onChange((valueRef.current + ch).slice(0, 60))
  const backspace = () => onChange(valueRef.current.slice(0, -1))

  useInputLayer(ref, (action) => {
    if (action === 'back' || action === 'menu') { sound.back(); onDone(); return true }
    if (action === 'x') { backspace(); sound.move(); return true }
    if (action === 'y') { type(' '); sound.move(); return true }
    if (action === 'lb' || action === 'rb') return true
  })

  return (
    <div className="modal osk-modal" ref={ref} role="dialog" aria-label={label}>
      <div className="osk">
        <label className="osk-field">
          <span className="muted small">{label}</span>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onDone() }}
            placeholder="Type a game name…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="osk-keys">
          {ROWS.map((row, r) => (
            <div className="osk-row" key={r} data-nav-group>
              {row.map((k, i) => (
                <button key={k} className="osk-key" data-nav data-autofocus={r === 1 && i === 0 || undefined} onClick={() => type(k)}>{k}</button>
              ))}
            </div>
          ))}
          <div className="osk-row" data-nav-group>
            <button className="osk-key wide" data-nav onClick={() => type(' ')}>Space</button>
            <button className="osk-key" data-nav onClick={backspace} aria-label="Backspace">⌫</button>
            <button className="osk-key" data-nav onClick={() => onChange('')}>Clear</button>
            <button className="osk-key done" data-nav onClick={onDone}>Done</button>
          </div>
        </div>
      </div>
      <HintBar hints={[
        { glyph: 'A', label: 'Type' },
        { glyph: 'X', label: 'Delete', onClick: backspace },
        { glyph: 'Y', label: 'Space', onClick: () => type(' ') },
        { glyph: 'B', label: 'Done', onClick: onDone },
      ]} left={<span className="muted small">Results update as you type · <Glyph name="Menu" /> also closes</span>} />
    </div>
  )
}
