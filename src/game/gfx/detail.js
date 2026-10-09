import { settings } from '../settings'

/**
 * Graphics detail level shared by every builder and shader:
 *   0 = low (phones)  1 = medium  2 = high  3 = ultra
 * For the 'custom' preset it is derived from render scale, foliage density and shadows.
 * Use it to scale OPTIONAL detail (extra bevels, small props, shader octaves) — never to
 * change gameplay geometry or colliders.
 */
export function detailLevel() {
  const p = settings.preset
  if (p === 'low') return 0
  if (p === 'medium') return 1
  if (p === 'high') return 2
  if (p === 'ultra') return 3
  // custom: score the individual options
  const rs = settings.renderScale ?? 1, fol = settings.foliage ?? 1, sh = settings.shadows
  let s = 0
  s += rs >= 1.15 ? 3 : rs >= 0.95 ? 2 : rs >= 0.8 ? 1 : 0
  s += fol >= 1.2 ? 3 : fol >= 0.9 ? 2 : fol >= 0.6 ? 1 : 0
  s += sh === 'ultra' ? 3 : sh === 'high' ? 2 : sh === 'low' ? 1 : 0
  return Math.max(0, Math.min(3, Math.round(s / 3)))
}
