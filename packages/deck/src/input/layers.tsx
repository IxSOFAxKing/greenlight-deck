// Input layers: screens and modals register a layer; only the topmost layer
// receives controller actions. Directions move focus within the layer's scope
// element and "accept" clicks the focused element, unless the layer's handler
// returns true to say it handled the action itself.

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { controller, type Action } from './controller'
import { ensureFocus, moveFocus } from './spatial'
import { sound } from './sound'

export type LayerHandler = (action: Action) => boolean | void

interface Layer {
  id: number
  scope: RefObject<HTMLElement | null>
  handler: RefObject<LayerHandler | undefined>
}

const stack: Layer[] = []
let nextId = 1

controller.on((action) => {
  const top = stack[stack.length - 1]
  if (!top) return
  if (top.handler.current?.(action)) return

  const scope = top.scope.current
  if (!scope) return
  if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
    if (moveFocus(scope, action)) sound.move()
  } else if (action === 'accept') {
    const active = document.activeElement as HTMLElement | null
    if (active && scope.contains(active)) { sound.select(); active.click() }
  }
})

export function useInputLayer(
  scope: RefObject<HTMLElement | null>,
  handler?: LayerHandler,
  active = true,
) {
  const handlerRef = useRef<LayerHandler | undefined>(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!active) return
    const layer: Layer = { id: nextId++, scope, handler: handlerRef }
    const previous = document.activeElement as HTMLElement | null
    stack.push(layer)

    // Give the new layer focus once it has rendered.
    const t = requestAnimationFrame(() => { if (scope.current) ensureFocus(scope.current) })

    // If the focused element is removed (view swapped, list reloaded), refocus.
    let pending = 0
    const observer = new MutationObserver(() => {
      if (pending || stack[stack.length - 1]?.id !== layer.id) return
      pending = requestAnimationFrame(() => {
        pending = 0
        const el = scope.current
        if (el && stack[stack.length - 1]?.id === layer.id) ensureFocus(el)
      })
    })
    if (scope.current) observer.observe(scope.current, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(t)
      cancelAnimationFrame(pending)
      observer.disconnect()
      const idx = stack.findIndex(l => l.id === layer.id)
      if (idx >= 0) stack.splice(idx, 1)
      // Restore focus to where it was before this layer opened.
      const below = stack[stack.length - 1]
      requestAnimationFrame(() => {
        if (previous && document.contains(previous) && below?.scope.current?.contains(previous)) {
          previous.focus({ preventScroll: true })
        } else if (below?.scope.current) {
          ensureFocus(below.scope.current)
        }
      })
    }
  }, [active, scope])
}
