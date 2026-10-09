// Arrow-key focus movement for the title menus: list order for the main menu, nearest-in-direction
// for the chapter grid. Only enabled, visible controls take part.
const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

export const arrowDirection = e => DIRS[e.key] || null

export function focusables(root, selector = '[data-nav]') {
  return [...(root?.querySelectorAll(selector) || [])].filter(el => !el.disabled && el.offsetParent !== null)
}

/** Next/previous in DOM order, wrapping. */
export function stepFocus(items, from, delta) {
  if (!items.length) return null
  const i = items.indexOf(from)
  return items[i < 0 ? (delta > 0 ? 0 : items.length - 1) : (i + delta + items.length) % items.length]
}

/** The control nearest to `from` in a screen direction (falls back to list order for left/right). */
export function spatialFocus(items, from, dir) {
  if (!from || !items.includes(from)) return items[0] || null
  const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2
  let best = null, score = Infinity
  for (const el of items) {
    if (el === from) continue
    const b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay
    const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
    if (main <= 4) continue
    const s = main + (dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)) * 2.2
    if (s < score) { score = s; best = el }
  }
  if (!best && (dir === 'left' || dir === 'right')) best = stepFocus(items, from, dir === 'right' ? 1 : -1)
  return best
}
