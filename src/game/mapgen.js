import { heightAt, trailDist, pathX, REGIONS, PLACES, BOUNDS, streamInfo } from './world/terrain'

/* ===========================================================================
   A painted map of the land, generated once from the real terrain:
   hillshade + altitude tints (meadow → forest → rock → snow), packed-earth
   roads and trails, the stream, the pond and the river, settlements and
   landmarks, on a parchment ground with a soft vignette.
   map.toPx(x, z) / map.toWorld(px, py) convert between world metres and pixels.
=========================================================================== */
const PAD = 18
export const MAP = {
  x0: BOUNDS.minX - PAD, z0: BOUNDS.minZ - PAD,
  w: BOUNDS.maxX - BOUNDS.minX + PAD * 2, d: BOUNDS.maxZ - BOUNDS.minZ + PAD * 2,
}
const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const C = {
  low: [146, 170, 98], meadow: [118, 150, 80], forest: [74, 108, 62], high: [128, 132, 118], rock: [140, 132, 120], snow: [242, 240, 232],
  path: [176, 140, 96], plaza: [196, 168, 124], water: [74, 128, 150], parch: [233, 222, 196], ink: [70, 52, 34],
}

export function makeMap(scale = 1.15) {
  const W = Math.round(MAP.w * scale), H = Math.round(MAP.d * scale)
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H), px = img.data
  const hs = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hs[j * W + i] = heightAt(MAP.x0 + i / scale, MAP.z0 + j / scale)
  const R = REGIONS
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = MAP.x0 + i / scale, z = MAP.z0 + j / scale, h = hs[j * W + i]
    const hx = hs[j * W + Math.min(W - 1, i + 1)] - hs[j * W + Math.max(0, i - 1)], hz = hs[Math.min(H - 1, j + 1) * W + i] - hs[Math.max(0, j - 1) * W + i]
    const slope = Math.hypot(hx, hz) * scale * 0.5
    // altitude & slope tint
    let c = mix(C.low, C.meadow, ss(10, 35, h))
    c = mix(c, C.forest, ss(30, 55, h) * 0.8)
    c = mix(c, C.high, ss(62, 85, h))
    c = mix(c, C.rock, ss(0.55, 1.2, slope) * 0.85)
    c = mix(c, C.snow, ss(88, 102, h))
    // roads, trails, yards, water
    const onRoad = Math.abs(x - pathX(z)) < 2.2 && z > -96 && z < 182 ? 1 : 0
    const td = trailDist(x, z)
    c = mix(c, C.path, Math.max(onRoad * 0.85, (1 - ss(1.2, 2.6, td)) * 0.85))
    for (const g of R) { const d = Math.hypot(x - g.x, z - g.z); if (d < g.r) c = mix(c, C.plaza, 0.45 * (1 - ss(g.r * 0.4, g.r, d))) }
    for (const k of ['village', 'thennur']) { const p = PLACES[k], d = Math.hypot(x - p.x, z - p.z); if (d < 20) c = mix(c, C.plaza, 0.4 * (1 - ss(8, 20, d))) }
    if (z > 50 && z < 150 && x > 8 && streamInfo(x, z)[0] < 1.8) c = C.water
    if (Math.hypot(x + 128, z - 80) < 8.5) c = C.water                       // lotus pond
    if (x > -85 && x < 15 && z > 245 && z < 254) c = C.water                // the river below the ghats
    if (x > 26 && h < -2) c = mix(c, C.water, 0.55 * ss(-2, -4.5, h))       // the gorge floor
    // hillshade (light from the north-west), contour lines every 10 m
    const shade = Math.max(-0.5, Math.min(0.5, (-hx + -hz) * scale * 0.06))
    let k = 1 + shade
    if (Math.abs((h / 10) % 1) < 0.06 && slope < 1.4) k *= 0.9
    // parchment wash and vignette toward the border
    const ex = Math.min(i, W - 1 - i) / W, ez = Math.min(j, H - 1 - j) / H
    const v = ss(0, 0.06, Math.min(ex, ez))
    c = mix(C.parch, c, 0.86 * v + 0.05)
    const o = (j * W + i) * 4
    px[o] = c[0] * k; px[o + 1] = c[1] * k; px[o + 2] = c[2] * k; px[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  // ink border
  ctx.strokeStyle = 'rgba(70,52,34,0.75)'; ctx.lineWidth = 3; ctx.strokeRect(6, 6, W - 12, H - 12)
  ctx.lineWidth = 1; ctx.strokeRect(11, 11, W - 22, H - 22)
  return {
    canvas, W, H, scale,
    toPx: (x, z) => [(x - MAP.x0) * scale, (z - MAP.z0) * scale],
    toWorld: (px, py) => [MAP.x0 + px / scale, MAP.z0 + py / scale],
  }
}

/** Named places shown on the map (story settlements + the ten landmarks). */
export function mapPlaces() {
  return [
    { key: 'temple', name: 'Mountain Temple', x: PLACES.temple.x, z: PLACES.temple.z, kind: 'temple' },
    { key: 'rock', name: 'Meditation Rock', x: PLACES.rock.x, z: PLACES.rock.z, kind: 'rock' },
    { key: 'village', name: 'Kurinji', x: PLACES.village.x, z: PLACES.village.z, kind: 'village' },
    { key: 'gate', name: 'The Gate', x: PLACES.gate.x, z: PLACES.gate.z, kind: 'gate' },
    { key: 'thennur', name: 'Thennur', x: PLACES.thennur.x, z: PLACES.thennur.z, kind: 'village' },
    { key: 'fortress', name: "Dunkan's Fortress", x: -4, z: 172, kind: 'fortress' },
    ...REGIONS.map(g => ({ key: g.key, name: g.name, x: g.x, z: g.z, kind: 'landmark' })),
  ]
}
