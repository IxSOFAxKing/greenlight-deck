// Geometry-based focus movement: pick the nearest [data-nav] element in the
// pressed direction inside the active layer's scope element.

export type Direction = 'up' | 'down' | 'left' | 'right'

const SELECTOR = '[data-nav]:not([disabled]):not([aria-hidden="true"])'

// Cheap check (no style recalculation per element): it has a box on the page.
function visible(el: HTMLElement) {
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

export function focusables(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(SELECTOR)].filter(visible)
}

/** Space kept between the highlight and the edge of a scrolling area. */
const EDGE_MARGIN = 28
/** Items this close to the start of a list scroll it all the way back to the start. */
const SNAP_TO_START_PX = 240

let lastMove = 0

function isScroller(el: HTMLElement, axis: 'x' | 'y') {
  const style = getComputedStyle(el)
  const overflow = axis === 'y' ? style.overflowY : style.overflowX
  if (overflow !== 'auto' && overflow !== 'scroll') return false
  return axis === 'y' ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1
}

function reveal(el: HTMLElement, scroller: HTMLElement, axis: 'x' | 'y', instant: boolean) {
  const r = el.getBoundingClientRect()
  const p = scroller.getBoundingClientRect()
  const start = axis === 'y' ? r.top : r.left
  const end = axis === 'y' ? r.bottom : r.right
  const pStart = axis === 'y' ? p.top : p.left
  const pEnd = axis === 'y' ? p.bottom : p.right
  const current = axis === 'y' ? scroller.scrollTop : scroller.scrollLeft
  const offsetInContent = start - pStart + current

  let target = current
  if (offsetInContent < SNAP_TO_START_PX) target = 0
  else if (start < pStart + EDGE_MARGIN) target = current - (pStart + EDGE_MARGIN - start)
  else if (end > pEnd - EDGE_MARGIN) target = current + (end - (pEnd - EDGE_MARGIN))
  if (Math.abs(target - current) < 1) return

  scroller.scrollTo({ [axis === 'y' ? 'top' : 'left']: target, behavior: instant ? 'auto' : 'smooth' })
}

export function focusEl(el: HTMLElement | null | undefined) {
  if (!el) return false
  el.focus({ preventScroll: true })

  // Holding a direction fires a move every ~100 ms: jump instantly so the page
  // never falls behind the highlight. Single presses still scroll smoothly.
  const now = performance.now()
  const instant = now - lastMove < 250
  lastMove = now

  let foundY = false
  let foundX = false
  for (let p = el.parentElement; p && (!foundY || !foundX); p = p.parentElement) {
    if (!foundY && isScroller(p, 'y')) { reveal(el, p, 'y', instant); foundY = true }
    if (!foundX && isScroller(p, 'x')) { reveal(el, p, 'x', instant); foundX = true }
  }
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
