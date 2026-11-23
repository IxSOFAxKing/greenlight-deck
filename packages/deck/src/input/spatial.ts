// Geometry-based focus movement: pick the nearest [data-nav] element in the
// pressed direction inside the active layer's scope element.

export type Direction = 'up' | 'down' | 'left' | 'right'

const SELECTOR = '[data-nav]:not([disabled]):not([aria-hidden="true"])'

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

export function focusables(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(SELECTOR)].filter(visible)
}

export function focusEl(el: HTMLElement | null | undefined) {
  if (!el) return false
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  return true
}

/** Focus the scope's [data-autofocus] element, or its first focusable. */
export function focusFirst(scope: ParentNode) {
  const auto = scope.querySelector<HTMLElement>('[data-autofocus]')
  if (auto && visible(auto)) return focusEl(auto)
  return focusEl(focusables(scope)[0])
}

/** Make sure focus is somewhere inside the scope. */
export function ensureFocus(scope: HTMLElement) {
  const active = document.activeElement as HTMLElement | null
  if (active && scope.contains(active) && active.matches(SELECTOR) && visible(active)) return
  focusFirst(scope)
}

export function moveFocus(scope: HTMLElement, dir: Direction): boolean {
  const current = document.activeElement as HTMLElement | null
  if (!current || !scope.contains(current) || !current.matches(SELECTOR)) {
    return focusFirst(scope)
  }

  // A focused element may trap a direction (e.g. a row that handles left/right itself).
  const group = current.closest<HTMLElement>('[data-nav-group]')
  const items = focusables(scope)
  const from = current.getBoundingClientRect()
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2

  let best: HTMLElement | undefined
  let bestScore = Infinity

  for (const el of items) {
    if (el === current) continue
    const r = el.getBoundingClientRect()
    const ex = r.left + r.width / 2
    const ey = r.top + r.height / 2

    let primary: number
    let ortho: number
    switch (dir) {
      case 'right': primary = r.left - from.right; ortho = Math.abs(ey - cy); if (ex <= cx + 1) continue; break
      case 'left': primary = from.left - r.right; ortho = Math.abs(ey - cy); if (ex >= cx - 1) continue; break
      case 'down': primary = r.top - from.bottom; ortho = Math.abs(ex - cx); if (ey <= cy + 1) continue; break
      case 'up': primary = from.top - r.bottom; ortho = Math.abs(ex - cx); if (ey >= cy - 1) continue; break
    }

    // Overlapping elements count as distance 0 on the main axis.
    primary = Math.max(0, primary)
    let score = primary + ortho * 2.2
    // Prefer staying in the same group (row) for left/right moves.
    if (group && (dir === 'left' || dir === 'right') && !group.contains(el)) score += 4000
    if (score < bestScore) { bestScore = score; best = el }
  }

  return focusEl(best)
}
