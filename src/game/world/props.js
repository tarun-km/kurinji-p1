import * as THREE from 'three'
import { G, jitter, rock, tileSlope, rng } from '../gfx/kit'
import { blossomGeo } from './nature'

/* ===========================================================================
   Prop kit — one function per board item. Each adds faceted parts into a
   Builder `b` at a local transform (push/pop). Colours from the boards.
=========================================================================== */

export const P = {
  wood: 0x6e4a2a, woodDark: 0x4a2f1e, woodLight: 0x8a6440, door: 0x3a2414, timber: 0x5b4636,
  plaster: 0xf0e4cc, plaster2: 0xe2d2b2, plaster3: 0xd8c4a0, charred: 0x2a2420,
  tile: 0xc4573a, tile2: 0xb04a2e, tileDark: 0x8a3a22,
  stone: 0x9a8f80, stoneDark: 0x7a7470, granite: 0x6e6a64, step: 0xa8a090,
  iron: 0x26262c, ironDark: 0x1a1a1e, gold: 0xd4af37, brass: 0xc9a24a, bronze: 0x6a5a2a,
  crimson: 0x8a0a0a, red: 0x8a2a1a, saffron: 0xd9822b, leaf: 0x3a6a30, leaf2: 0x4e8a3a, marigold: 0xf08a1a,
  lamp: 0xffc066, ember: 0xff5a20, kurinji: 0x8a7cf0, cream: 0xe0cfa0, straw: 0xc9a25a, burlap: 0xb8955a,
}

/* ---------------- lights & fire holders ---------------- */
export function stoneLantern(b, at, rot = 0) {
  b.push(at, [0, rot, 0])
  b.add(G.chamfer(0.62, 0.22, 0.62, 0.05), P.stoneDark, { at: [0, 0.11, 0], m: 'stone' })
  b.add(G.cyl(0.13, 0.17, 0.8, 6), P.stone, { at: [0, 0.62, 0], m: 'stone' })
  b.add(G.chamfer(0.5, 0.1, 0.5, 0.03), P.stone, { at: [0, 1.07, 0], m: 'stone' })
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) b.add(G.box(0.07, 0.32, 0.07), P.stoneDark, { at: [x, 1.28, z], m: 'stone' })
  b.add(G.box(0.3, 0.28, 0.3), P.lamp, { at: [0, 1.28, 0], m: 'glow', hdr: 2.2, jit: 0.02, grad: 0 })
  b.add(G.cone(0.46, 0.3, 4), P.stoneDark, { at: [0, 1.6, 0], rot: [0, Math.PI / 4, 0], m: 'stone' })
  b.add(G.cone(0.08, 0.16, 6), P.stone, { at: [0, 1.82, 0], m: 'stone' })
  b.pop()
  return [at[0], at[1] + 1.3, at[2]]
}
export function lanternPost(b, at, rot = 0) {
  b.push(at, [0, rot, 0])
  b.add(rock(0.35, 3, 0.6, 0), P.granite, { at: [0, 0.1, 0], m: 'stone' })
  b.add(G.chamfer(0.16, 2.5, 0.16, 0.03), P.woodDark, { at: [0, 1.25, 0] , m: 'wood' })
  b.add(G.chamfer(0.75, 0.12, 0.12, 0.02), P.woodDark, { at: [0.3, 2.35, 0] , m: 'wood' })
  b.add(G.box(0.1, 0.42, 0.1), P.woodDark, { at: [0.12, 2.12, 0], rot: [0, 0, 0.75] , m: 'wood' })
  b.add(G.cyl(0.005, 0.005, 0.2, 3), P.iron, { at: [0.6, 2.2, 0] , m: 'iron' })
  b.add(G.cyl(0.16, 0.13, 0.34, 6), P.lamp, { at: [0.6, 1.95, 0], m: 'glow', hdr: 2.4, grad: 0 })
  b.add(G.cone(0.2, 0.14, 6), P.iron, { at: [0.6, 2.18, 0], m: 'iron' })
  b.add(G.cyl(0.17, 0.17, 0.03, 6), P.iron, { at: [0.6, 1.77, 0], m: 'iron' })
  b.pop()
  const c = Math.cos(rot), s = Math.sin(rot)
  return [at[0] + 0.6 * c, at[1] + 1.95, at[2] - 0.6 * s]
}
export function brassLamp(b, at, h = 1.1) {
  b.push(at)
  b.add(G.cyl(0.16, 0.2, 0.06, 8), P.brass, { at: [0, 0.03, 0], m: 'brass' })
  b.add(G.cyl(0.035, 0.05, h, 6), P.brass, { at: [0, h / 2, 0], m: 'brass' })
  for (const y of [0.35, 0.7]) if (y < h) b.add(G.cyl(0.08, 0.05, 0.05, 8), P.brass, { at: [0, y * h, 0], m: 'brass' })
  b.add(G.cyl(0.16, 0.05, 0.08, 8), P.brass, { at: [0, h + 0.03, 0], m: 'brass' })
  b.add(G.cone(0.035, 0.12, 5), 0xffd27a, { at: [0, h + 0.13, 0], m: 'glow', hdr: 3, grad: 0 })
  b.pop()
  return [at[0], at[1] + h + 0.15, at[2]]
}
export function torch(b, at) {
  b.push(at)
  b.add(G.cyl(0.07, 0.09, 2.2, 6), P.wood, { at: [0, 1.1, 0] , m: 'wood' })
  for (const y of [0.6, 1.4]) b.add(G.cyl(0.1, 0.1, 0.12, 6), 0xb89a6a, { at: [0, y, 0] })
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.add(G.box(0.04, 0.32, 0.04), P.iron, { at: [Math.cos(a) * 0.15, 2.3, Math.sin(a) * 0.15], rot: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], m: 'iron' }) }
  b.add(G.cyl(0.14, 0.1, 0.12, 6), P.iron, { at: [0, 2.16, 0], m: 'iron' })
  b.add(G.ico(0.13, 0), P.ember, { at: [0, 2.25, 0], m: 'glow', hdr: 2, grad: 0 })
  b.pop()
  return [at[0], at[1] + 2.45, at[2]]
}
export function brazier(b, at, lit = true) {
  b.push(at)
  b.add(G.chamfer(0.9, 0.18, 0.9, 0.04), P.ironDark, { at: [0, 0.09, 0], m: 'iron' })
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; b.add(G.box(0.12, 1.3, 0.12), P.iron, { at: [Math.cos(a) * 0.24, 0.8, Math.sin(a) * 0.24], rot: [Math.sin(a) * -0.18, 0, Math.cos(a) * 0.18], m: 'iron' }) }
  b.add(G.cyl(0.22, 0.32, 0.5, 8), P.iron, { at: [0, 0.75, 0], m: 'iron' })
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.add(G.cone(0.05, 0.42, 4), P.iron, { at: [Math.cos(a) * 0.48, 1.75, Math.sin(a) * 0.48], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], m: 'iron' }) }
  b.add(G.cyl(0.5, 0.36, 0.3, 10, true), P.iron, { at: [0, 1.55, 0], m: 'iron' })
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; b.add(G.oct(0.06), P.gold, { at: [Math.cos(a) * 0.36, 1.1, Math.sin(a) * 0.36], m: 'gold' }) }
  if (lit) b.add(G.ico(0.32, 0), P.ember, { at: [0, 1.5, 0], scale: [1, 0.5, 1], m: 'glow', hdr: 2.2, grad: 0 })
  b.pop()
  return [at[0], at[1] + 1.7, at[2]]
}

/* ---------------- garlands & cloth ---------------- */
/** Mango-leaf thoranam (with jasmine) or marigold string between two points. */
export function garland(b, a, c, { sag = 0.45, kind = 'mango', n } = {}) {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c), L = A.distanceTo(C)
  n = n ?? Math.max(4, Math.round(L / (kind === 'mango' ? 0.22 : 0.075)))
  const r = rng(Math.round(L * 100 + A.x * 7))
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = A.clone().lerp(C, t); p.y -= Math.sin(Math.PI * t) * sag
    if (kind === 'mango') {
      const g = new THREE.OctahedronGeometry(0.11, 0); g.scale(0.45, 1.2, 0.12)
      b.add(g, i % 2 ? P.leaf : P.leaf2, { at: [p.x, p.y - 0.13, p.z], rot: [(r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.3], m: 'cloth', jit: 0.12, grad: 0 })
      if (i % 3 === 0) b.add(G.ico(0.035, 0), i % 6 ? 0xf6f0de : 0xe8c040, { at: [p.x, p.y - 0.05, p.z], m: 'std', grad: 0 })
    } else {
      b.add(G.ico(0.032, 0), i % 4 === 0 ? 0xf6c430 : P.marigold, { at: [p.x, p.y, p.z], m: 'std', jit: 0.1, grad: 0 })
    }
  }
  b.add(new THREE.CylinderGeometry(0.008, 0.008, L, 3).rotateZ(Math.PI / 2), 0x8a6a40, { at: [(A.x + C.x) / 2, (A.y + C.y) / 2 - sag * 0.6, (A.z + C.z) / 2], rot: [0, -Math.atan2(C.z - A.z, C.x - A.x), 0] })
}
/** Hanging marigold strands (vertical) — porch / shrine decoration. */
export function marigoldStrand(b, at, len = 0.8) {
  for (let i = 0; i < len / 0.11; i++) b.add(G.ico(0.05, 0), i % 3 ? P.marigold : 0xf6c430, { at: [at[0], at[1] - i * 0.11, at[2]], grad: 0, jit: 0.1 })
}
/** Faceted awning cloth slung between four poles. */
export function awning(b, at, rot, color, w = 2.6, d = 1.8, h = 2.3) {
  b.push(at, [0, rot, 0])
  const g = new THREE.PlaneGeometry(w, d, 4, 3); g.rotateX(-Math.PI / 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, -Math.cos((x / w) * Math.PI) * 0.12 - (z / d + 0.5) * 0.35 + (i % 3) * 0.02) }
  b.add(g, color, { at: [0, h, 0], m: 'cloth', jit: 0.14 })
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) b.add(G.cyl(0.04, 0.05, h + (z < 0 ? 0.3 : -0.1), 5), P.woodDark, { at: [x, (h + (z < 0 ? 0.3 : -0.1)) / 2, z] , m: 'wood' })
  b.pop()
}
export function banner(b, at, rot = 0, w = 1.2, h = 3.2, color = P.crimson) {
  b.push(at, [0, rot, 0])
  b.add(G.cyl(0.04, 0.04, w + 0.4, 6).rotateZ(Math.PI / 2), P.ironDark, { at: [0, 0, 0], m: 'iron' })
  for (const s of [-1, 1]) b.add(G.cone(0.06, 0.16, 4).rotateZ(-s * Math.PI / 2), P.ironDark, { at: [s * (w / 2 + 0.28), 0, 0], m: 'iron' })
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, -h + 0.45); sh.lineTo(0, -h); sh.lineTo(-w / 2, -h + 0.45); sh.closePath()
  b.add(new THREE.ShapeGeometry(sh), color, { at: [0, -0.05, 0.02], m: 'cloth', jit: 0.1, grad: 0.3 })
  // gold border + black anvil sigil
  for (const s of [-1, 1]) b.add(G.box(0.05, h - 0.6, 0.01), P.gold, { at: [s * (w / 2 - 0.08), -h / 2 + 0.2, 0.035] , m: 'gold' })
  b.add(G.box(w * 0.46, 0.14, 0.012), 0x141414, { at: [0, -h * 0.5, 0.04] })
  b.add(G.box(w * 0.22, 0.12, 0.012), 0x141414, { at: [0, -h * 0.5 - 0.12, 0.04] })
  b.add(G.box(w * 0.36, 0.08, 0.012), 0x141414, { at: [0, -h * 0.5 - 0.24, 0.04] })
  b.add(G.box(0.1, h * 0.2, 0.012), 0x141414, { at: [0, -h * 0.3, 0.04] })
  b.add(G.oct(0.09), 0x141414, { at: [0, -h * 0.66, 0.04], scale: [1, 1, 0.12] })
  b.pop()
}

/* ---------------- market ---------------- */
export function crate(b, at, rot = 0, s = 1) {
  b.push(at, [0, rot, 0], s)
  b.add(G.box(1, 1, 1), P.wood, { at: [0, 0.5, 0] , m: 'wood' })
  for (const [x, z, ry] of [[0, 0.505, 0], [0, -0.505, 0], [0.505, 0, Math.PI / 2], [-0.505, 0, Math.PI / 2]]) {
    b.push([x, 0.5, z], [0, ry, 0])
    b.add(G.box(1.02, 0.1, 0.03), P.woodLight, { at: [0, 0.45, 0] , m: 'wood' }); b.add(G.box(1.02, 0.1, 0.03), P.woodLight, { at: [0, -0.45, 0] , m: 'wood' })
    b.add(G.box(0.1, 1.22, 0.03), P.woodLight, { rot: [0, 0, 0.78] , m: 'wood' })
    b.pop()
  }
  b.pop()
}
export function barrel(b, at, rot = 0, s = 1) {
  b.push(at, [0, rot, 0], s)
  b.add(G.lathe([[0, 0], [0.38, 0], [0.45, 0.25], [0.48, 0.55], [0.45, 0.85], [0.38, 1.1], [0, 1.1]], 10), P.wood, { jit: 0.1 , m: 'wood' })
  for (const y of [0.12, 0.38, 0.72, 0.98]) b.add(G.cyl(0.475 - Math.abs(y - 0.55) * 0.15, 0.475 - Math.abs(y - 0.55) * 0.15, 0.06, 10, true), P.iron, { at: [0, y, 0], m: 'iron' })
  b.pop()
}
export function table(b, at, rot = 0, L = 2, W = 0.8) {
  b.push(at, [0, rot, 0])
  for (let i = 0; i < 4; i++) b.add(G.chamfer(L, 0.07, W / 4 - 0.01, 0.015), P.wood, { at: [0, 0.75, -W / 2 + W / 8 + i * W / 4] , m: 'wood' })
  for (const s of [-1, 1]) {
    b.add(G.box(0.08, 0.72, 0.08), P.woodDark, { at: [s * (L / 2 - 0.25), 0.36, -W / 2 + 0.08], rot: [0, 0, s * 0.12] , m: 'wood' })
    b.add(G.box(0.08, 0.72, 0.08), P.woodDark, { at: [s * (L / 2 - 0.25), 0.36, W / 2 - 0.08], rot: [0, 0, s * 0.12] , m: 'wood' })
    b.add(G.box(0.08, 0.08, W), P.woodDark, { at: [s * (L / 2 - 0.25), 0.68, 0] , m: 'wood' })
  }
  b.add(G.box(L - 0.6, 0.07, 0.07), P.woodDark, { at: [0, 0.3, 0] , m: 'wood' })
  b.pop()
}
export function fruit(b, at, kind = 'orange', n = 9) {
  const col = { orange: 0xf08a1a, red: 0xd02a2a, green: 0x9ab83a, banana: 0xf0c838, coconut: 0x6a4a22 }[kind]
  const r = rng(n * 13 + at[0] * 7)
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 0.28, y = (i > 5 ? 0.12 : 0) + 0.07
    b.add(G.ico(0.085, 1), col, { at: [at[0] + Math.cos(a) * d, at[1] + y, at[2] + Math.sin(a) * d], jit: 0.08, grad: 0.3 })
  }
}
export function basket(b, at, s = 1, content = 'herbs') {
  b.push(at, [0, 0, 0], s)
  b.add(G.lathe([[0, 0], [0.22, 0], [0.3, 0.18], [0.32, 0.28], [0.3, 0.3]], 9), 0x9a6a3a, { jit: 0.14 })
  b.add(G.torus(0.3, 0.02, 3, 9), 0x7a5228, { at: [0, 0.29, 0], rot: [Math.PI / 2, 0, 0] })
  if (content === 'herbs') for (let i = 0; i < 6; i++) b.add(G.oct(0.09), i % 2 ? P.leaf : P.leaf2, { at: [Math.cos(i) * 0.14, 0.33, Math.sin(i) * 0.14], scale: [0.6, 1.6, 0.3], rot: [0.4, i, 0], m: 'cloth' })
  else if (content) fruit(b, [0, 0.2, 0], content, 6)
  b.pop()
}
export function pot(b, at, s = 1, color = 0xb0603a, plant = null) {
  b.push(at, [0, 0, 0], s)
  b.add(G.lathe([[0, 0], [0.16, 0], [0.24, 0.12], [0.26, 0.26], [0.2, 0.4], [0.16, 0.44], [0.2, 0.48], [0.16, 0.48]], 9), color, { jit: 0.1 })
  if (plant === 'tulsi') for (let i = 0; i < 7; i++) b.add(G.oct(0.08), 0x4a7a32, { at: [Math.cos(i * 0.9) * 0.1, 0.55 + (i % 3) * 0.08, Math.sin(i * 0.9) * 0.1], scale: [0.7, 1.4, 0.4], rot: [0.3, i, 0], m: 'cloth' })
  b.pop()
}
export function stall(b, at, rot, color, fruits = ['orange', 'red', 'green']) {
  b.push(at, [0, rot, 0])
  table(b, [0, 0, 0], 0, 2, 0.8)
  fruits.forEach((k, i) => fruit(b, [-0.6 + i * 0.6, 0.79, 0], k, 9))
  basket(b, [1.35, 0, 0.5], 0.9, 'banana'); basket(b, [-1.4, 0, 0.4], 0.8, 'herbs')
  crate(b, [1.3, 0, -0.6], 0.3, 0.55)
  awning(b, [0, 0, -0.1], 0, color, 2.9, 2.0, 2.3)
  b.pop()
}

/* ---------------- forge ---------------- */
export function furnace(b, at) {
  b.push(at)
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + ring * 0.26
    b.add(G.chamfer(0.5, 0.32, 0.38, 0.05), [P.stoneDark, 0x8a8478, 0x6a6560][(i + ring) % 3], { at: [Math.cos(a) * 0.82, 0.16 + ring * 0.32, Math.sin(a) * 0.82], rot: [0, -a, 0], m: 'stone' })
  }
  b.add(G.torus(0.98, 0.04, 4, 16), P.iron, { at: [0, 0.62, 0], rot: [Math.PI / 2, 0, 0], m: 'iron' })
  const r = rng(5)
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 0.62; b.add(G.ico(0.1 + r() * 0.06, 0), r() < 0.55 ? 0xff5a1a : 0x2a1a14, { at: [Math.cos(a) * d, 0.82 + r() * 0.08, Math.sin(a) * d], m: r() < 0.55 ? 'glow' : 'std', hdr: 2.6, grad: 0 }) }
  for (const s of [-1, 1]) b.add(G.box(0.08, 1.3, 0.08), P.wood, { at: [s * 1.05, 0.65, -0.3] , m: 'wood' })
  b.pop()
  return [at[0], at[1] + 0.95, at[2]]
}
export function anvil(b, at, rot = 0) {
  b.push(at, [0, rot, 0])
  b.add(G.cyl(0.28, 0.34, 0.5, 8), 0x4a3424, { at: [0, 0.25, 0] , m: 'wood' })
  b.add(G.chamfer(0.36, 0.2, 0.28, 0.03), P.iron, { at: [0, 0.6, 0], m: 'iron' })
  b.add(G.chamfer(0.62, 0.16, 0.26, 0.03), P.iron, { at: [0.02, 0.78, 0], m: 'iron' })
  b.add(G.cone(0.12, 0.34, 4).rotateZ(-Math.PI / 2), P.iron, { at: [0.48, 0.79, 0], rot: [Math.PI / 4, 0, 0], m: 'iron' })
  b.pop()
}
export function hammerProp(b, at, rot = [0, 0, 0], s = 1) {
  b.push(at, rot, s)
  b.add(G.cyl(0.035, 0.04, 0.9, 6), P.wood, { at: [0, 0.45, 0] , m: 'wood' })
  b.add(G.chamfer(0.3, 0.14, 0.14, 0.02), P.iron, { at: [0, 0.92, 0], m: 'iron' })
  b.pop()
}
export function toolRack(b, at, rot = 0) {
  b.push(at, [0, rot, 0])
  for (const s of [-1, 1]) b.add(G.chamfer(0.12, 1.4, 0.12, 0.02), P.wood, { at: [s * 0.9, 0.7, 0] , m: 'wood' })
  for (const y of [0.4, 1.2]) b.add(G.chamfer(2, 0.1, 0.1, 0.02), P.wood, { at: [0, y, 0] , m: 'wood' })
  for (let i = 0; i < 6; i++) hammerProp(b, [-0.7 + i * 0.28, 0.25, 0.08], [0, 0, 0], 0.7)
  b.pop()
}
export function bucket(b, at) {
  b.push(at)
  b.add(G.cyl(0.32, 0.27, 0.55, 9, false), P.wood, { at: [0, 0.27, 0] , m: 'wood' })
  for (const y of [0.1, 0.45]) b.add(G.cyl(0.33, 0.31, 0.05, 9, true), P.iron, { at: [0, y, 0], m: 'iron' })
  b.add(G.cyl(0.3, 0.3, 0.02, 9), 0x2a4a5a, { at: [0, 0.5, 0], m: 'metal' })
  b.pop()
}
export function plough(b, at, rot = 0) {
  b.push(at, [0, rot, 0])
  b.add(G.chamfer(2.2, 0.12, 0.12, 0.02), P.wood, { at: [0.4, 0.5, 0], rot: [0, 0, 0.25] , m: 'wood' })
  b.add(G.chamfer(0.12, 1, 0.12, 0.02), P.wood, { at: [-0.6, 0.45, 0], rot: [0, 0, -0.5] , m: 'wood' })
  b.add(G.cone(0.18, 0.5, 4).rotateZ(Math.PI / 2), P.iron, { at: [-0.95, 0.1, 0], m: 'iron' })
  b.pop()
}

/* ---------------- training & defense ---------------- */
export function dummy(b, at, rot = 0, variant = 0) {
  b.push(at, [0, rot, 0])
  for (const [x, z] of [[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) b.add(G.box(Math.abs(x) * 2 || 0.1, 0.12, Math.abs(z) * 2 || 0.1), P.woodDark, { at: [x / 2, 0.06, z / 2] , m: 'wood' })
  b.add(G.chamfer(0.14, 1.3, 0.14, 0.02), P.wood, { at: [0, 0.7, 0] , m: 'wood' })
  b.add(jitter(G.cyl(0.26, 0.2, 0.62, 7), 0.05, variant), P.burlap, { at: [0, 1.5, 0] })
  b.add(jitter(G.ico(0.17, 0), 0.04, variant + 3), P.burlap, { at: [0, 1.98, 0], scale: [1, 1.15, 1] })
  for (const s of [-1, 1]) b.add(G.cone(0.08, 0.5, 5).rotateZ(s * Math.PI / 2), P.straw, { at: [s * 0.45, 1.66, 0] })
  if (variant === 1 || variant === 3) b.add(G.box(0.2, 0.18, 0.02), 0x9a3a2a, { at: [0.08, 1.55, 0.21] })
  if (variant === 3) b.add(G.cyl(0.27, 0.27, 0.06, 7, true), 0xd8c8a0, { at: [0, 1.3, 0] })
  b.pop()
}
export function weaponRack(b, at, rot = 0) {
  b.push(at, [0, rot, 0])
  for (const s of [-1, 1]) { b.add(G.chamfer(0.1, 1.2, 0.1, 0.02), P.wood, { at: [s * 0.8, 0.6, 0] , m: 'wood' }); b.add(G.box(0.1, 0.1, 0.6), P.wood, { at: [s * 0.8, 0.05, 0] , m: 'wood' }) }
  b.add(G.chamfer(1.7, 0.08, 0.1, 0.02), P.wood, { at: [0, 1.05, 0] , m: 'wood' }); b.add(G.chamfer(1.7, 0.08, 0.3, 0.02), P.wood, { at: [0, 0.2, 0] , m: 'wood' })
  for (let i = 0; i < 6; i++) b.add(G.cyl(0.03, 0.035, 2, 5), i % 2 ? P.woodLight : P.wood, { at: [-0.6 + i * 0.24, 1.05, 0.05], rot: [0.12, 0, 0] })
  b.pop()
}
export function spear(b, at, rot = [0, 0, 0]) {
  b.push(at, rot)
  b.add(G.cyl(0.025, 0.03, 2.2, 5), P.wood, { at: [0, 1.1, 0] , m: 'wood' })
  b.add(G.oct(0.07), 0x9a9aa2, { at: [0, 2.3, 0], scale: [0.6, 2.4, 0.25], m: 'metal' })
  b.pop()
}

/* ---------------- household & trades ---------------- */
export function herbRack(b, at, rot = 0, w = 1.6) {
  b.push(at, [0, rot, 0])
  b.add(G.chamfer(w, 0.08, 0.08, 0.02), P.wood, { at: [0, 0, 0] , m: 'wood' })
  for (let i = 0; i < Math.round(w / 0.32); i++) {
    const x = -w / 2 + 0.2 + i * 0.32
    b.add(G.cyl(0.004, 0.004, 0.12, 3), 0x8a6a40, { at: [x, -0.06, 0] })
    b.add(jitter(G.cone(0.1, 0.42, 6), 0.03, i).rotateX(Math.PI), [0x5a7a3a, 0x6a8a3a, 0x8a7a3a][i % 3], { at: [x, -0.32, 0], m: 'cloth' })
  }
  b.pop()
}
export function mortar(b, at) {
  b.push(at)
  b.add(G.lathe([[0, 0], [0.18, 0], [0.24, 0.12], [0.26, 0.24], [0.2, 0.26], [0.12, 0.14], [0, 0.12]], 8), 0x8a8478, { m: 'stone' })
  b.add(G.cyl(0.04, 0.05, 0.32, 6), 0x8a8478, { at: [0.05, 0.3, 0], rot: [0, 0, -0.4], m: 'stone' })
  b.pop()
}
export function beehive(b, at) {
  b.push(at)
  for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) b.add(G.box(0.08, 0.5, 0.08), P.woodDark, { at: [x, 0.25, z] , m: 'wood' })
  b.add(G.chamfer(0.7, 0.06, 0.7, 0.01), P.wood, { at: [0, 0.5, 0] , m: 'wood' })
  for (let i = 0; i < 5; i++) b.add(G.cyl(0.33 - i * 0.025, 0.34 - i * 0.025, 0.14, 10, true), 0xa87a40, { at: [0, 0.6 + i * 0.13, 0] })
  b.add(G.cone(0.42, 0.35, 10), 0xb08a4a, { at: [0, 1.38, 0], jit: 0.12 })
  b.add(G.box(0.12, 0.06, 0.04), 0x2a1a10, { at: [0, 0.62, 0.32] })
  b.pop()
}
export function fence(b, a, c, h = 1.0) {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c), L = A.distanceTo(C), n = Math.max(1, Math.round(L / 1.4))
  const ang = -Math.atan2(C.z - A.z, C.x - A.x)
  for (let i = 0; i <= n; i++) { const p = A.clone().lerp(C, i / n); b.add(G.chamfer(0.12, h + 0.2, 0.12, 0.02), P.woodDark, { at: [p.x, p.y + (h + 0.2) / 2 - 0.1, p.z] , m: 'wood' }) }
  for (const y of [h * 0.45, h * 0.9]) b.add(G.chamfer(L, 0.09, 0.07, 0.015), P.wood, { at: [(A.x + C.x) / 2, (A.y + C.y) / 2 + y, (A.z + C.z) / 2], rot: [0, ang, 0] , m: 'wood' })
}
export function clothLine(b, a, c, colors = [0xd9822b, 0x2a4a8a, 0x8a2a3a, 0x3a7a5a]) {
  b.add(G.cyl(0.05, 0.06, 2.2, 5), P.woodDark, { at: [a[0], a[1] + 1.1, a[2]] , m: 'wood' })
  b.add(G.cyl(0.05, 0.06, 2.2, 5), P.woodDark, { at: [c[0], c[1] + 1.1, c[2]] , m: 'wood' })
  const A = new THREE.Vector3(a[0], a[1] + 2.05, a[2]), C = new THREE.Vector3(c[0], c[1] + 2.05, c[2]), ang = -Math.atan2(C.z - A.z, C.x - A.x)
  colors.forEach((col, i) => { const t = (i + 0.7) / (colors.length + 0.4), p = A.clone().lerp(C, t); p.y -= Math.sin(Math.PI * t) * 0.2; b.add(G.plane(0.6, 0.9, 2, 2), col, { at: [p.x, p.y - 0.45, p.z], rot: [0, ang, 0], m: 'cloth', jit: 0.1 }) })
}
export function bench(b, at, rot = 0, L = 1.6) {
  b.push(at, [0, rot, 0])
  b.add(G.chamfer(L, 0.08, 0.36, 0.02), P.wood, { at: [0, 0.45, 0] , m: 'wood' })
  for (const s of [-1, 1]) b.add(G.box(0.08, 0.42, 0.3), P.woodDark, { at: [s * (L / 2 - 0.15), 0.21, 0] , m: 'wood' })
  b.pop()
}
export function woolBundle(b, at) { b.add(jitter(G.ico(0.35, 1), 0.08, 3), 0xe8e0d0, { at: [at[0], at[1] + 0.25, at[2]], scale: [1.2, 0.7, 1] }) }
export function stoneBlock(b, at, rot = 0, s = 1) { b.add(G.chamfer(0.9 * s, 0.5 * s, 0.6 * s, 0.05), 0xb0a898, { at: [at[0], at[1] + 0.25 * s, at[2]], rot: [0, rot, 0], m: 'stone' }) }
export function scaffold(b, at, rot = 0, w = 3, h = 3) {
  b.push(at, [0, rot, 0])
  for (const x of [-w / 2, w / 2]) for (const z of [-0.5, 0.5]) b.add(G.cyl(0.05, 0.06, h, 5), P.woodLight, { at: [x, h / 2, z] , m: 'wood' })
  for (const y of [h * 0.45, h * 0.95]) { b.add(G.chamfer(w + 0.2, 0.08, 1.1, 0.01), P.woodLight, { at: [0, y, 0] , m: 'wood' }) }
  b.add(G.cyl(0.04, 0.04, Math.hypot(w, h), 4), P.woodLight, { at: [0, h / 2, 0.55], rot: [0, 0, Math.atan2(w, h)] , m: 'wood' })
  b.pop()
}

/* ---------------- sacred & royal ---------------- */
/** Golden seated meditating figure (shrine statue). */
export function seatedStatue(b, at, rot = 0, s = 1, color = P.gold, mtl = 'gold') {
  b.push(at, [0, rot, 0], s)
  b.add(G.chamfer(1.4, 0.3, 1.0, 0.05), color, { at: [0, 0.15, 0], m: mtl })
  b.add(G.lathe([[0, 0], [0.7, 0], [0.75, 0.12], [0.6, 0.28], [0, 0.32]], 8), color, { at: [0, 0.3, 0], scale: [1, 1, 0.75], m: mtl })
  b.add(G.cyl(0.26, 0.38, 0.75, 8), color, { at: [0, 0.95, 0], m: mtl })
  for (const sx of [-1, 1]) { b.add(G.cyl(0.08, 0.1, 0.5, 6), color, { at: [sx * 0.36, 0.88, 0.1], rot: [0.4, 0, sx * 0.35], m: mtl }); b.add(G.cyl(0.07, 0.08, 0.4, 6), color, { at: [sx * 0.2, 0.62, 0.3], rot: [1.3, 0, sx * -0.6], m: mtl }) }
  b.add(G.ico(0.2, 1), color, { at: [0, 1.5, 0], scale: [0.9, 1.1, 0.95], m: mtl })
  b.add(G.cone(0.1, 0.22, 6), color, { at: [0, 1.75, 0], m: mtl })
  b.add(G.torus(0.42, 0.04, 4, 14), color, { at: [0, 1.5, -0.12], m: mtl })
  b.pop()
}
/** The temple Buddha: lotus pedestal, dhyana mudra, robe over the left shoulder, ushnisha and flame halo. */
export function buddha(b, at, rot = 0, s = 1) {
  const g = { m: 'gold', jit: 0.05 }
  b.push(at, [0, rot, 0], s)
  // stepped pedestal + double lotus
  b.add(G.cyl(0.95, 1.05, 0.28, 12), 0x8a8070, { at: [0, 0.14, 0], m: 'stone' })
  b.add(G.cyl(0.8, 0.88, 0.2, 12), 0xb08a3a, { ...g, at: [0, 0.38, 0] })
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 16; i++) {
    const a = (i + ring * 0.5) / 16 * Math.PI * 2, r = 0.78 - ring * 0.1
    const pg = new THREE.OctahedronGeometry(0.13, 0); pg.scale(0.7, 1.3, 0.35); pg.translate(0, 0.1, 0)
    b.add(pg, ring ? 0xe2b755 : 0xc9a24a, { ...g, at: [Math.sin(a) * r, 0.5 + ring * 0.06, Math.cos(a) * r], rot: [0.55 - ring * 0.2, a, 0] })
  }
  // crossed legs with soles turned up
  b.add(G.lathe([[0, 0], [0.62, 0], [0.7, 0.1], [0.62, 0.24], [0.3, 0.3], [0, 0.3]], 12), 0xd4a845, { ...g, at: [0, 0.55, 0], scale: [1, 1, 0.68] })
  for (const sx of [-1, 1]) b.add(G.ico(0.09, 0), 0xd4a845, { ...g, at: [sx * 0.24, 0.84, 0.2], scale: [1.4, 0.45, 0.8], rot: [0, sx * 0.4, 0] })
  // torso + robe (bare right shoulder, drape over the left)
  b.add(G.cyl(0.25, 0.36, 0.7, 10), 0xd4a845, { ...g, at: [0, 1.18, -0.02], scale: [1, 1, 0.78] })
  b.add(G.ico(0.27, 1), 0xd4a845, { ...g, at: [0, 1.52, -0.02], scale: [1.25, 0.55, 0.8] })
  b.add(G.box(0.1, 0.78, 0.5), 0xc49434, { ...g, at: [0.08, 1.2, 0.02], rot: [0, 0, -0.5] })
  for (const sx of [-1, 1]) {
    b.add(G.cyl(0.075, 0.09, 0.42, 7), 0xd4a845, { ...g, at: [sx * 0.33, 1.32, 0.04], rot: [0.25, 0, sx * 0.2] })
    b.add(G.cyl(0.065, 0.075, 0.36, 7), 0xd4a845, { ...g, at: [sx * 0.2, 1.02, 0.24], rot: [1.45, 0, sx * -0.85] })
  }
  b.add(G.ico(0.1, 0), 0xe2b755, { ...g, at: [0, 0.95, 0.32], scale: [1.4, 0.45, 0.8] }) // hands in the lap (dhyana mudra)
  // head: serene face, long earlobes, ushnisha with curls
  b.add(G.cyl(0.07, 0.09, 0.14, 8), 0xd4a845, { ...g, at: [0, 1.72, 0] })
  b.add(G.ico(0.2, 2), 0xe0b450, { ...g, at: [0, 1.95, 0.02], scale: [0.92, 1.12, 0.95] })
  b.add(G.ico(0.035, 0), 0xe0b450, { ...g, at: [0, 1.93, 0.215], scale: [0.6, 1.2, 0.8] })
  for (const sx of [-1, 1]) {
    b.add(G.box(0.07, 0.01, 0.01), 0x6a4a18, { at: [sx * 0.07, 1.98, 0.19], rot: [0, 0, sx * -0.12] })   // closed eyes
    b.add(G.box(0.04, 0.16, 0.035), 0xd4a845, { ...g, at: [sx * 0.19, 1.86, 0.0] })                     // long earlobes
  }
  b.add(G.box(0.06, 0.008, 0.01), 0x6a4a18, { at: [0, 1.84, 0.19] })
  for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, rr = i < 14 ? 0.17 : 0.1, yy = i < 14 ? 2.1 : 2.19; b.add(G.ico(0.035, 0), 0x8a6a28, { ...g, at: [Math.sin(a) * rr, yy, Math.cos(a) * rr * 0.95 + 0.01] }) }
  b.add(G.ico(0.09, 1), 0x8a6a28, { ...g, at: [0, 2.2, 0] })
  b.add(G.cone(0.05, 0.12, 6), 0xe2b755, { ...g, at: [0, 2.32, 0] })
  // halo + flame-edged prabhavali
  b.add(G.torus(0.34, 0.03, 4, 24), 0xe2b755, { ...g, at: [0, 1.98, -0.22] })
  b.add(G.torus(0.78, 0.04, 4, 32, Math.PI * 1.15), 0xc9a24a, { ...g, at: [0, 1.25, -0.3], rot: [0, 0, -0.07 * Math.PI] })
  for (let i = 0; i < 15; i++) { const a = -0.07 * Math.PI + i / 14 * Math.PI * 1.15; b.add(G.cone(0.05, 0.16, 4), 0xe2b755, { ...g, at: [Math.cos(a) * 0.86, 1.25 + Math.sin(a) * 0.86, -0.3], rot: [0, 0, a - Math.PI / 2] }) }
  b.pop()
}
/** Ganesha village shrine (primary choice on the ritual board). */
export function ganeshaShrine(b, at, rot = 0) {
  b.push(at, [0, rot, 0])
  b.add(G.chamfer(1.8, 0.5, 1.2, 0.05), 0x8a8478, { at: [0, 0.25, 0], m: 'stone' })
  for (const s of [-1, 1]) b.add(G.chamfer(0.3, 1.6, 0.3, 0.04), 0x7a7470, { at: [s * 0.75, 1.3, -0.35], m: 'stone' })
  b.add(G.chamfer(1.9, 0.3, 0.6, 0.04), 0x7a7470, { at: [0, 2.2, -0.35], m: 'stone' })
  b.add(G.cone(0.6, 0.6, 4), 0x7a7470, { at: [0, 2.65, -0.35], rot: [0, Math.PI / 4, 0], m: 'stone' })
  const st = 0xa89a88
  b.add(G.ico(0.32, 1), st, { at: [0, 0.85, -0.3], scale: [1, 0.9, 0.8], m: 'stone' })
  b.add(G.ico(0.22, 1), st, { at: [0, 1.32, -0.3], m: 'stone' })
  b.add(G.cone(0.06, 0.4, 5), st, { at: [0.05, 1.12, -0.12], rot: [0.5, 0, 0.2], m: 'stone' })
  for (const s of [-1, 1]) b.add(G.oct(0.16), st, { at: [s * 0.22, 1.35, -0.32], scale: [0.4, 1, 0.9], m: 'stone' })
  b.add(G.cone(0.12, 0.22, 6), P.gold, { at: [0, 1.58, -0.3], m: 'gold' })
  b.add(G.box(0.7, 0.03, 0.5), 0xf4ead8, { at: [0, 0.52, 0.25], m: 'cloth' })
  fruit(b, [0.3, 0.5, 0.3], 'banana', 4)
  for (const s of [-1, 1]) brassLamp(b, [s * 0.6, 0.5, 0.35], 0.5)
  garland(b, [-0.9, 2.05, -0.15], [0.9, 2.05, -0.15], { sag: 0.25, kind: 'marigold' })
  b.pop()
}
export function bell(b) { // bronze temple bell (lathe), local origin at the crown
  b.add(G.lathe([[0, 0], [0.18, 0], [0.24, -0.12], [0.36, -0.55], [0.5, -1.15], [0.62, -1.42], [0.6, -1.5], [0, -1.5]], 12), P.bronze, { m: 'brass', jit: 0.05 })
  b.add(G.torus(0.6, 0.05, 4, 14), 0x8a7a3a, { at: [0, -1.38, 0], rot: [Math.PI / 2, 0, 0], m: 'gold' })
  b.add(G.torus(0.1, 0.035, 4, 8), P.bronze, { at: [0, 0.08, 0], m: 'brass' })
}
export function ironThrone(b, at, rot = 0) {
  b.push(at, [0, rot, 0])
  const I = P.ironDark
  b.add(G.chamfer(1.9, 0.5, 1.5, 0.06), I, { at: [0, 0.25, 0], m: 'metal' })
  b.add(G.chamfer(1.5, 0.35, 1.1, 0.05), I, { at: [0, 0.68, 0.05], m: 'metal' })
  b.add(G.box(0.5, 0.02, 1.4), P.crimson, { at: [0, 0.87, 0.35], m: 'cloth' })
  b.add(G.box(0.5, 0.9, 0.02), P.crimson, { at: [0, 0.42, 0.78], m: 'cloth' })
  for (const s of [-1, 1]) {
    b.add(G.chamfer(0.3, 0.85, 1.2, 0.04), I, { at: [s * 0.82, 1.05, 0.05], m: 'metal' })
    b.add(G.oct(0.07), P.gold, { at: [s * 0.82, 1.5, 0.62], m: 'gold' })
  }
  b.add(G.chamfer(1.6, 3.0, 0.32, 0.05), I, { at: [0, 2.0, -0.55], m: 'metal' })
  for (let i = 0; i < 5; i++) {
    const x = -0.68 + i * 0.34, hh = i === 2 ? 0.25 : 0
    b.add(G.chamfer(0.26, 0.4 + hh, 0.34, 0.03), I, { at: [x, 3.55 + hh / 2, -0.55], m: 'metal' })
    b.add(G.cone(0.1, 0.55, 4), P.gold, { at: [x, 4.0 + hh, -0.55], rot: [0, Math.PI / 4, 0], m: 'gold' })
  }
  for (const s of [-1, 1]) b.add(G.box(0.08, 2.4, 0.04), P.gold, { at: [s * 0.55, 2.1, -0.38], m: 'gold' })
  b.add(G.oct(0.18), P.gold, { at: [0, 2.7, -0.37], scale: [1, 1.5, 0.3], m: 'gold' })
  b.pop()
}
export function crown(b, at, s = 1) {
  b.push(at, [0, 0, 0], s)
  b.add(G.cyl(0.19, 0.18, 0.1, 14, true), P.gold, { m: 'gold' })
  b.add(G.cyl(0.17, 0.17, 0.08, 14, true), P.crimson, { at: [0, 0.01, 0], m: 'cloth' })
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; b.add(G.cone(0.035, i % 2 ? 0.16 : 0.22, 4), P.gold, { at: [Math.cos(a) * 0.185, 0.12, Math.sin(a) * 0.185], m: 'gold' }) }
  b.pop()
}
export function chain(b, a, c, link = 0.16) {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c), n = Math.round(A.distanceTo(C) / link)
  for (let i = 0; i < n; i++) { const p = A.clone().lerp(C, (i + 0.5) / n); p.y -= Math.sin(Math.PI * (i + 0.5) / n) * 0.25; b.add(G.torus(0.07, 0.02, 3, 6), P.iron, { at: p.toArray(), rot: [i % 2 ? Math.PI / 2 : 0, Math.atan2(C.x - A.x, C.z - A.z), 0], m: 'iron' }) }
}
export function slagHeap(b, at, s = 1) {
  const r = rng(at[0] * 3 + at[2])
  for (let i = 0; i < 9; i++) b.add(rock(0.35 * s * (0.5 + r()), i + 90, 0.6, 0), r() < 0.4 ? 0x5a2a1a : 0x2a2626, { at: [at[0] + (r() - 0.5) * 1.6 * s, at[1] + r() * 0.3 * s, at[2] + (r() - 0.5) * 1.6 * s], m: 'stone', jit: 0.15 })
}

/* ---------------- birds & small story props ---------------- */
export function carvedBird(b, at, rot = 0, kind = 'kingfisher', s = 1) {
  const C = { kingfisher: [0x2a6ab0, 0xd96a2a], sparrow: [0x8a5a3a, 0xc8a070], mynah: [0x2a2620, 0xe0b020] }[kind]
  b.push(at, [0, rot, 0], s)
  b.add(G.chamfer(0.16, 0.06, 0.12, 0.02), 0x6e4a2a, { at: [0, 0.03, 0] })
  b.add(jitter(G.ico(0.07, 0), 0.02, 2), C[1], { at: [0, 0.12, 0], scale: [0.8, 1, 1.3] })
  b.add(jitter(G.ico(0.07, 0), 0.02, 3), C[0], { at: [0, 0.15, -0.03], scale: [0.85, 0.9, 1.35] })
  b.add(G.ico(0.045, 0), C[0], { at: [0, 0.22, 0.06] })
  b.add(G.cone(0.015, kind === 'kingfisher' ? 0.12 : 0.05, 4).rotateX(Math.PI / 2), kind === 'mynah' ? 0xe0b020 : 0x1a1a1a, { at: [0, 0.22, 0.13] })
  b.add(G.box(0.05, 0.015, 0.1), C[0], { at: [0, 0.14, -0.12], rot: [-0.4, 0, 0] })
  b.pop()
}
export { blossomGeo }
