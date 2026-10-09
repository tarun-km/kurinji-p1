import * as THREE from 'three'
import { G, jitter, rock, tileSlope, rng, detailLevel } from '../gfx/kit'
import { P, brassLamp, garland, marigoldStrand, banner, torch, bell, ironThrone } from './props'

/* ===========================================================================
   Architecture kit: South Indian hill-village house, mountain temple with a
   stepped Dravidian-inspired tower, bell tower, palisade gate, fortress.
   All dimensions follow MODELING_GUIDE (metres).
=========================================================================== */

/** Gable roof of clay tiles. Ridge runs along local x; slopes fall toward ±z. */
export function tileRoof(b, w, dFront, dBack, ridgeY, pitch = 0.5, color = P.tile) {
  const front = dFront / Math.cos(pitch), back = dBack / Math.cos(pitch)
  b.add(tileSlope(w, front), color, { at: [0, ridgeY, 0], rot: [pitch, 0, 0], jit: 0.1, grad: 0, m: 'tile' })
  b.add(tileSlope(w, back), color, { at: [0, ridgeY, 0], rot: [-pitch, Math.PI, 0], jit: 0.1, grad: 0, m: 'tile' })
  // underside boards (so the roof reads solid from below)
  b.add(G.box(w, 0.06, front), P.woodDark, { at: [0, ridgeY - Math.sin(pitch) * front / 2 - 0.06, Math.cos(pitch) * front / 2], rot: [pitch, 0, 0] , m: 'wood' })
  b.add(G.box(w, 0.06, back), P.woodDark, { at: [0, ridgeY - Math.sin(pitch) * back / 2 - 0.06, -Math.cos(pitch) * back / 2], rot: [-pitch, 0, 0] , m: 'wood' })
  b.add(G.cyl(0.13, 0.13, w + 0.1, 5).rotateZ(Math.PI / 2), P.tileDark, { at: [0, ridgeY + 0.04, 0] , m: 'tile' })
}
/** Triangular gable wall. */
function gable(b, d1, d2, h, color, at, rot = 0) {
  const s = new THREE.Shape(); s.moveTo(-d2, 0); s.lineTo(d1, 0); s.lineTo(0, h); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false }); g.translate(0, 0, -0.11)
  b.add(g, color, { at, rot: [0, rot + Math.PI / 2, 0], jit: 0.06, m: 'plaster' })
}
function kolamTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const x = c.getContext('2d'); x.strokeStyle = 'rgba(250,246,236,0.95)'; x.fillStyle = x.strokeStyle; x.lineWidth = 5; x.lineCap = 'round'
  const n = 5, s = 256 / (n + 1)
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) { x.beginPath(); x.arc(i * s, j * s, 4, 0, 6.28); x.fill() }
  for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) { x.beginPath(); x.arc((i + 0.5) * s, (j + 0.5) * s, s * 0.52, (i + j) % 2 ? 0 : Math.PI / 2, (i + j) % 2 ? Math.PI : Math.PI * 1.5); x.stroke() }
  x.beginPath(); x.arc(128, 128, 110, 0, 6.28); x.stroke()
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; x.beginPath(); x.ellipse(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110, 16, 9, a, 0, 6.28); x.stroke() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
let kolamMat
export function kolam(scene, x, y, z, rot = 0, s = 1.6) {
  kolamMat ||= new THREE.MeshStandardMaterial({ map: kolamTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), kolamMat)
  m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y + 0.03, z); m.receiveShadow = true
  scene.add(m); return m
}

/**
 * Village house (11-house kit). Local frame: door faces +z. state: normal | burning | ruined | rebuilt
 * Returns anchor points (porch, fire spots) in local space.
 */
export function house(b, { w = 4.8, d = 4, wall = P.plaster, roof = P.tile, state = 'normal', seed = 1, porch = true, plinth = 0.45 } = {}) {
  const r = rng(seed), out = { fires: [], porch: [0, plinth, d / 2 + 0.9] }
  const charred = state === 'ruined', H = 2.6
  const wallCol = charred ? (f, cy) => new THREE.Color(wall).lerp(new THREE.Color(P.charred), 0.45 + (1 - cy) * 0.1 + (r() < 0.35 ? 0.35 : 0)) : wall
  // plinth & steps
  b.add(G.chamfer(w + 0.5, plinth, d + (porch ? 2.1 : 0.5), 0.05), 0x8e877c, { at: [0, plinth / 2, porch ? 0.8 : 0], m: 'stone' })
  b.add(G.box(w + 0.45, 2.2, d + (porch ? 2.05 : 0.45)), 0x7a7268, { at: [0, -1.1, porch ? 0.8 : 0], m: 'stone' })
  if (porch) { b.add(G.chamfer(1.6, plinth * 0.5, 0.4, 0.03), 0x9a9288, { at: [0, plinth * 0.25, d / 2 + 2.05], m: 'stone' }) }
  // walls (ruins: broken, uneven tops)
  const wallTop = charred ? () => H * (0.45 + r() * 0.45) : () => H
  const panel = (len, x, z, ry, door) => {
    const segs = Math.max(2, Math.round(len / 1.2))
    for (let i = 0; i < segs; i++) {
      const sl = len / segs, cx = -len / 2 + sl * (i + 0.5)
      const h = wallTop(); if (charred && r() < 0.15) continue
      const isDoor = door && Math.abs(cx) < sl * 0.6
      const bh = isDoor ? h - 2.0 : h
      if (bh > 0.05) b.add(G.chamfer(sl + 0.02, bh, 0.24, 0.04), wallCol, { at: [x + Math.cos(ry) * cx, plinth + (isDoor ? 2.0 + bh / 2 : bh / 2), z - Math.sin(ry) * cx], rot: [0, ry, 0], jit: 0.07, m: 'plaster' })
    }
  }
  panel(w, 0, d / 2, 0, true); panel(w, 0, -d / 2, 0, false); panel(d, -w / 2, 0, Math.PI / 2, false); panel(d, w / 2, 0, Math.PI / 2, false)
  // door + frame, window + bars
  const doorCol = charred ? 0x1a1410 : P.door
  b.add(G.box(1.0, 2.0, 0.08), doorCol, { at: [0, plinth + 1.0, d / 2 - 0.05] })
  if (!charred && detailLevel() > 0) {
    for (let i = -2; i <= 2; i++) b.add(G.box(0.012, 1.91, 0.012), P.woodDark, { at: [i * 0.19, plinth + 1, d / 2], m: 'wood', grad: 0 })
    for (const y of [0.5, 1.55]) b.add(G.chamfer(0.92, 0.06, 0.045, 0.008), P.iron, { at: [0, plinth + y, d / 2 + 0.045], m: 'iron' })
    b.add(G.torus(0.055, 0.012, 3, 8), P.brass, { at: [0.25, plinth + 1, d / 2 + 0.08], m: 'brass' })
  }
  b.add(G.box(1.22, 0.14, 0.3), P.woodDark, { at: [0, plinth + 2.07, d / 2 + 0.02] , m: 'wood' })
  for (const s of [-1, 1]) b.add(G.box(0.12, 2.05, 0.3), P.woodDark, { at: [s * 0.56, plinth + 1.02, d / 2 + 0.02] , m: 'wood' })
  if (!charred) for (const s of [-1, 1]) {
    const wx = s * (w / 2 - 0.95)
    b.add(G.box(0.85, 0.75, 0.1), state === 'burning' ? 0xffa040 : 0x2a1c12, { at: [wx, plinth + 1.45, d / 2 + 0.04], m: state === 'burning' ? 'glow' : 'std', hdr: state === 'burning' ? 1.8 : 1 })
    b.add(G.box(1.0, 0.1, 0.18), P.woodDark, { at: [wx, plinth + 1.05, d / 2 + 0.08] , m: 'wood' }); b.add(G.box(1.0, 0.1, 0.18), P.woodDark, { at: [wx, plinth + 1.85, d / 2 + 0.08] , m: 'wood' })
    for (let k = -1; k <= 1; k++) b.add(G.box(0.05, 0.75, 0.06), P.woodDark, { at: [wx + k * 0.22, plinth + 1.45, d / 2 + 0.1] , m: 'wood' })
  }
  if (state === 'ruined') {
    // fallen charred beams and rubble instead of a roof
    for (let i = 0; i < 4; i++) b.add(G.box(0.18, 0.18, d * (0.6 + r() * 0.5)), 0x1a1410, { at: [(r() - 0.5) * w * 0.8, plinth + 0.4 + r() * 1.5, (r() - 0.5) * d * 0.4], rot: [(r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.5] , m: 'wood' })
    for (let i = 0; i < 10; i++) b.add(rock(0.18 + r() * 0.2, i + seed, 0.6, 0), r() < 0.5 ? P.tileDark : 0x3a322a, { at: [(r() - 0.5) * (w + 1.5), plinth + 0.1, (r() - 0.5) * (d + 1.5)], m: 'stone' })
    for (const s of [-1, 1]) if (r() < 0.7) b.add(G.chamfer(0.18, 2.2, 0.18, 0.03), 0x1a1410, { at: [s * (w / 2 - 0.5), plinth + 1.1, d / 2 + 1.5], rot: [0, 0, s * 0.15] , m: 'wood' })
    return out
  }
  // gables + roof
  const ridge = plinth + H + 1.15, pitch = 0.5
  for (const s of [-1, 1]) gable(b, d / 2, d / 2, 1.15, wall, [s * (w / 2), plinth + H, 0])
  const front = porch ? d / 2 + 2.0 : d / 2 + 0.45
  tileRoof(b, w + 0.9, front, d / 2 + 0.45, ridge, pitch, roof)
  // porch posts & thinnai bench
  if (porch) {
    for (const s of [-1, 1]) {
      b.add(G.chamfer(0.22, 0.22, 0.22, 0.03), 0x8e877c, { at: [s * (w / 2 - 0.2), plinth + 0.11, d / 2 + 1.6], m: 'stone' })
      const ph = ridge - Math.tan(pitch) * (d / 2 + 1.6) - plinth - 0.25
      b.add(G.chamfer(0.18, ph, 0.18, 0.03), P.woodDark, { at: [s * (w / 2 - 0.2), plinth + 0.22 + ph / 2, d / 2 + 1.6] , m: 'wood' })
    }
    const beamY = ridge - Math.tan(pitch) * (d / 2 + 1.6) - 0.05
    b.add(G.chamfer(w + 0.3, 0.16, 0.18, 0.03), P.woodDark, { at: [0, beamY, d / 2 + 1.6] , m: 'wood' })
    for (const s of [-1, 1]) b.add(G.chamfer(1.4, 0.42, 0.7, 0.05), 0xd8ccb4, { at: [s * (w / 2 - 1.1), plinth + 0.21, d / 2 + 0.4], m: 'stone' })
    garland(b, [-0.75, plinth + 2.25, d / 2 + 0.12], [0.75, plinth + 2.25, d / 2 + 0.12], { sag: 0.12, kind: 'mango' })
    out.beamY = beamY
  }
  if (state === 'burning') out.fires.push([(r() - 0.5) * w * 0.6, ridge - 0.2, 0.3], [(r() - 0.5) * w * 0.6, ridge - 0.6, d / 2 + 0.4], [w / 2 - 0.3, plinth + 1.6, d / 2 + 1.2])
  return out
}

/* ------------------------------ Mountain temple ------------------------------ */
export const TEMPLE_LAYOUT = {
  stair: { count: 5, width: 5.2, rise: 0.4, run: 0.88, front: 8.4 },
  pillars: [[-5.2, 3.6], [-1.9, 3.6], [1.9, 3.6], [5.2, 3.6], [-5.2, 0.4], [5.2, 0.4], [-5.2, -2.8], [5.2, -2.8]],
}
export function temple(b, s = {}) {
  const st = P.stone, burnt = s.state === 'burning'
  const block = (w, h, d, at, col = st) => b.add(G.chamfer(w, h, d, 0.06), col, { at, m: 'stone', jit: 0.09 })
  // base platform 18 × 14, upper 14 × 10 (masonry blocks on the faces)
  // A stair recess in the base keeps the first two treads above their actual
  // ground surface. A solid 18×14 box buried them and blocked the entrance.
  block(18, 1, 11, [0, 0.5, -1.5], 0x8f8576)
  for (const sx of [-1, 1]) block(6.4, 1, 3, [sx * 5.8, 0.5, 5.5], 0x8f8576)
  block(14, 1, 10, [0, 1.5, -1], 0x9a8f80)
  const r = rng(9)
  for (const [w, d, y, oz] of [[18, 14, 0.5, 0], [14, 10, 1.5, -1]]) {
    for (let x = -w / 2 + 0.6; x < w / 2; x += 1.2) for (const z of [-d / 2, d / 2]) if (!(z > 0 && Math.abs(x) < 2.6)) b.add(G.chamfer(1.15, 0.45, 0.2, 0.04), [0x9a8f80, 0x8a8070, 0xa69a88][(r() * 3) | 0], { at: [x, y - 0.22 + (r() < 0.5 ? 0.45 : 0), z + oz + Math.sign(z) * 0.05], m: 'stone' })
    for (let z = -d / 2 + 0.6; z < d / 2; z += 1.2) for (const x of [-w / 2, w / 2]) b.add(G.chamfer(0.2, 0.45, 1.15, 0.04), [0x9a8f80, 0x8a8070, 0xa69a88][(r() * 3) | 0], { at: [x + Math.sign(x) * 0.05, y - 0.22 + (r() < 0.5 ? 0.45 : 0), z + oz], m: 'stone' })
  }
  // five front steps
  const stair = TEMPLE_LAYOUT.stair
  for (let i = 0; i < stair.count; i++) {
    const height = stair.rise * (i + 1), z = stair.front - (i + 0.5) * stair.run
    block(stair.width, height, stair.run, [0, height / 2, z], P.step)
    if (detailLevel() > 0) for (const sx of [-1, 1]) b.add(G.chamfer(1.0, 0.035, 0.15, 0.008), 0xbeb3a1, { at: [sx * 1.8, height + 0.012, z + stair.run * 0.32], m: 'stone', grad: 0 })
  }
  // 8 red pillars, 4 m (front row + sides)
  const pillars = TEMPLE_LAYOUT.pillars
  const top = 2 + 4
  for (const [x, z] of pillars) {
    b.add(G.chamfer(0.75, 0.35, 0.75, 0.05), 0x8a8070, { at: [x, 2.18, z], m: 'stone' })
    b.add(G.chamfer(0.46, 3.3, 0.46, 0.06), burnt ? 0x5a1a10 : P.red, { at: [x, 2.35 + 1.65, z], jit: 0.08, m: 'plaster' })
    b.add(G.chamfer(0.7, 0.3, 0.7, 0.05), 0xc9a24a, { at: [x, top - 0.15, z], m: 'gold' })
    for (const y of [3.0, 4.6]) b.add(G.box(0.5, 0.1, 0.5), 0xc9a24a, { at: [x, y, z], m: 'gold' })
    if (detailLevel() > 0) for (const sx of [-1, 1]) b.add(G.chamfer(0.12, 0.5, 0.42, 0.02), 0xbcb09c, { at: [x + sx * 0.27, top - 0.52, z], rot: [0, 0, sx * 0.65], m: 'stone' })
  }
  // mandapam roof: stone slab + red clay-tile eave band + parapet
  block(12.4, 0.45, 8.6, [0, top + 0.22, 0.4], 0xd8c9a8)
  for (const [w, d, at, ry] of [[12.8, 1.6, [0, top + 0.05, 4.75], 0], [12.8, 1.6, [0, top + 0.05, -3.95], Math.PI], [8.8, 1.6, [6.35, top + 0.05, 0.4], -Math.PI / 2], [8.8, 1.6, [-6.35, top + 0.05, 0.4], Math.PI / 2]])
    { b.push(at, [0, ry, 0]); b.add(tileSlope(w, d), burnt ? 0x5a2a1a : P.tile2, { rot: [0.42, 0, 0], jit: 0.1, grad: 0, m: 'tile' }); b.pop() }
  for (let i = 0; i < 9; i++) for (const z of [4.4, -3.6]) b.add(G.cone(0.14, 0.4, 6), P.gold, { at: [-6 + i * 1.5, top + 0.65, z], m: 'gold' })
  // shrine hall (cream plaster) at the back with the golden statue inside
  // hollow sanctum: back + side walls, front wall with an open doorway, ceiling slab
  block(6.4, 3.8, 0.4, [0, 2 + 1.9, -4.6], 0xd8c9a8)
  for (const sx of [-1, 1]) block(0.4, 3.8, 4.4, [sx * 3.0, 2 + 1.9, -2.6], 0xd8c9a8)
  for (const sx of [-1, 1]) block(1.9, 3.8, 0.4, [sx * 2.15, 2 + 1.9, -0.6], 0xd8c9a8)
  block(2.4, 0.95, 0.4, [0, 2 + 3.33, -0.6], 0xd8c9a8)
  block(6.4, 0.5, 4.4, [0, 2 + 3.85, -2.6], 0xd8c9a8)
  b.add(G.box(5.6, 0.04, 3.6), 0x6a3a1a, { at: [0, 2.03, -2.6], m: 'cloth' }) // red floor runner
  b.add(G.chamfer(2.7, 0.3, 0.35, 0.05), 0xc9a24a, { at: [0, 2 + 2.95, -0.3], m: 'gold' })
  for (const sx of [-1, 1]) b.add(G.chamfer(0.3, 2.9, 0.35, 0.05), 0xc9a24a, { at: [sx * 1.25, 2 + 1.45, -0.3], m: 'gold' })
  // gopuram: stepped Dravidian-inspired tower over the shrine (cream/gold, kudu niches)
  const tiers = [[7.0, 1.25], [5.9, 1.15], [4.8, 1.05], [3.8, 1.0], [2.8, 0.9]]
  let y = top + 0.45
  tiers.forEach(([w, h], i) => {
    const col = burnt ? 0x6a5a4a : [0xe4d3a6, 0xdcc89a, 0xe8d8ae][i % 3]
    b.add(G.chamfer(w, h, w * 0.78, 0.07), col, { at: [0, y + h / 2, -2.6], m: 'stone', jit: 0.06 })
    b.add(G.chamfer(w + 0.25, 0.14, w * 0.78 + 0.25, 0.03), 0xc9a24a, { at: [0, y + h, -2.6], m: 'stone' })
    // niches + miniature corner shrines
    const n = Math.max(1, Math.round(w / 1.3))
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + (k + 0.5) * w / n
      b.add(G.box(0.38, h * 0.55, 0.12), 0x4a3a28, { at: [x, y + h * 0.48, -2.6 + w * 0.39 + 0.02] })
      b.add(G.cone(0.26, 0.32, 4), col, { at: [x, y + h * 0.88, -2.6 + w * 0.39], rot: [0, Math.PI / 4, 0], m: 'stone' })
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(G.cone(0.2, 0.45, 4), 0xc9a24a, { at: [sx * (w / 2 - 0.2), y + h + 0.25, -2.6 + sz * (w * 0.39 - 0.2)], rot: [0, Math.PI / 4, 0], m: 'gold' })
    y += h + 0.14
  })
  b.add(G.lathe([[0, 0], [1.2, 0], [1.4, 0.35], [1.25, 0.8], [0.7, 1.15], [0, 1.25]], 8), burnt ? 0x6a5a4a : 0xe4d3a6, { at: [0, y, -2.6], scale: [1, 1, 0.82], m: 'stone' })
  b.add(G.lathe([[0, 0], [0.22, 0], [0.3, 0.2], [0.18, 0.4], [0.08, 0.7], [0, 0.9]], 8), P.gold, { at: [0, y + 1.2, -2.6], m: 'gold' })
  // altar, lamps, bells and garlands
  const lamps = []
  for (const [x, z] of [[-6.4, 6.3], [6.4, 6.3], [-3.5, 6.8], [3.5, 6.8], [-6.4, -0.8], [6.4, -0.8], [-1.6, 0.6], [1.6, 0.6]]) lamps.push(brassLamp(b, [x, z > 4 ? 1.0 : 2.0, z], 1.15))
  for (const x of [-3.55, 0, 3.55]) {
    b.add(G.cyl(0.006, 0.006, 0.9, 3), 0x6a5a2a, { at: [x, top - 0.6, 3.6] })
    b.add(G.lathe([[0, 0], [0.08, 0], [0.12, -0.18], [0.14, -0.24], [0, -0.24]], 8), P.brass, { at: [x, top - 1.05, 3.6], m: 'brass' })
  }
  if (!burnt) for (let i = 0; i < 3; i++) { const x0 = [-5.2, -1.9, 1.9][i], x1 = [-1.9, 1.9, 5.2][i]; garland(b, [x0, top - 0.35, 3.85], [x1, top - 0.35, 3.85], { sag: 0.5, kind: 'mango' }); marigoldStrand(b, [x0 + 0.1, top - 0.4, 3.85], 0.9); marigoldStrand(b, [x1 - 0.1, top - 0.4, 3.85], 0.9) }
  return { lamps, statue: [0, 2.6, -3.0], top }
}

/* ------------------------------ Bell tower ------------------------------ */
export function bellTower(b) {
  b.add(G.chamfer(3.2, 0.5, 2.2, 0.05), 0x8e877c, { at: [0, 0.25, 0], m: 'stone' })
  for (const s of [-1, 1]) {
    b.add(G.chamfer(0.6, 0.5, 0.6, 0.06), 0xa69a88, { at: [s * 1.1, 0.75, 0], m: 'stone' })
    b.add(G.chamfer(0.38, 3.5, 0.38, 0.05), P.woodDark, { at: [s * 1.1, 2.25, 0], m: 'wood' })
    b.add(G.chamfer(0.12, 0.9, 0.12, 0.02), P.woodDark, { at: [s * 0.78, 3.7, 0], rot: [0, 0, s * 0.8], m: 'wood' })
  }
  b.add(G.chamfer(3.0, 0.32, 0.45, 0.04), P.woodDark, { at: [0, 4.1, 0], m: 'wood' })
  b.add(G.chamfer(2.6, 0.18, 0.3, 0.04), P.woodDark, { at: [0, 3.9, 0], m: 'wood' })
  b.add(G.cone(2.35, 1.1, 4), P.tile, { at: [0, 4.8, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.78], jit: 0.08, m: 'tile' })
  b.add(G.cone(0.12, 0.3, 6), P.gold, { at: [0, 5.5, 0], m: 'gold' })
  // striker log on ropes
  b.add(G.cyl(0.13, 0.13, 1.3, 7).rotateZ(Math.PI / 2), P.wood, { at: [-1.0, 2.8, 0.45], m: 'wood' })
  for (const x of [-1.5, -0.5]) b.add(G.cyl(0.01, 0.01, 1.15, 3), 0x8a6a40, { at: [x, 3.375, 0.45], m: 'cloth' })
}
export function bellMesh(b) { bell(b) }

/* ------------------------------ Palisade gate (68 m, logs 4–4.8 m) ------------------------------ */
export function palisadeLog(b, x, y, z, h, seed) {
  const g = jitter(new THREE.CylinderGeometry(0.15, 0.17, h, 7, 1), 0.03, seed)
  b.add(g, [0x5b4636, 0x4a3828, 0x6a5240][seed % 3], { at: [x, y + h / 2 - 0.3, z], jit: 0.1, m: 'bark' })
  b.add(G.cone(0.155, 0.6, 7), 0x8a6a48, { at: [x, y + h + 0.0, z], jit: 0.08, m: 'wood' })
}
export function watchtower(b, at, h = 7) {
  b.push(at)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(G.chamfer(0.3, h + 1.6, 0.3, 0.04), 0x4a3424, { at: [x, h / 2 - 0.8, z] , m: 'wood' })
  for (const y of [1.6, 3.8]) for (const s of [-1, 1]) { b.add(G.box(2.2, 0.12, 0.12), 0x5b4636, { at: [0, y, s], rot: [0, 0, (y > 2 ? 1 : -1) * 0.55] , m: 'wood' }); b.add(G.box(0.12, 0.12, 2.2), 0x5b4636, { at: [s, y, 0], rot: [(y > 2 ? 1 : -1) * 0.55, 0, 0] , m: 'wood' }) }
  b.add(G.chamfer(2.8, 0.18, 2.8, 0.03), 0x6a5240, { at: [0, h - 1.4, 0] , m: 'wood' })
  for (const s of [-1, 1]) { b.add(G.box(2.8, 0.9, 0.12), 0x5b4636, { at: [0, h - 0.9, s * 1.35] , m: 'wood' }); b.add(G.box(0.12, 0.9, 2.8), 0x5b4636, { at: [s * 1.35, h - 0.9, 0] , m: 'wood' }) }
  b.add(G.cone(2.3, 1.5, 4), P.tile, { at: [0, h + 0.7, 0], rot: [0, Math.PI / 4, 0], jit: 0.08 , m: 'tile' })
  b.pop()
}

/* ------------------------------ Fortress pieces ------------------------------ */
export function fortWall(b, x1, z1, x2, z2, h = 7, col = 0x3a3638) {
  const len = Math.hypot(x2 - x1, z2 - z1), ang = -Math.atan2(z2 - z1, x2 - x1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2
  const r = rng(Math.round(len * 10 + x1))
  b.push([mx, 0, mz], [0, ang, 0])
  // coursed masonry: rows of big chamfered blocks
  for (let y = -2.7; y < h; y += 0.9) for (let x = -len / 2; x < len / 2 - 0.1; x += 1.6) {
    const bw = Math.min(1.6, len / 2 - x), off = (Math.round(y / 0.9) % 2) * 0.8
    const xx = Math.min(len / 2 - bw / 2, x + bw / 2 + (off && x + bw + off < len / 2 ? off : 0))
    b.add(G.chamfer(bw, 0.88, 1.7, 0.06), [col, 0x332f31, 0x45403f][(r() * 3) | 0], { at: [xx, y + 0.45, 0], m: 'stone', jit: 0.06 })
  }
  for (let x = -len / 2 + 0.5; x < len / 2; x += 1.6) b.add(G.chamfer(0.9, 0.9, 1.75, 0.05), col, { at: [x, h + 0.45, 0], m: 'stone' })
  b.pop()
}
export function roundTower(b, at, h = 11, banners = true) {
  b.push(at)
  const rr = rng(Math.round(at[0] * 3 + at[2]))
  for (let y = -2.55; y < h; y += 0.85) for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + (Math.round(y / 0.85) % 2) * 0.26
    b.add(G.chamfer(1.25, 0.82, 0.7, 0.05), [0x2a2628, 0x332e2f, 0x241f21][(rr() * 3) | 0], { at: [Math.cos(a) * 2.05, y + 0.41, Math.sin(a) * 2.05], rot: [0, -a + Math.PI / 2, 0], m: 'stone' })
  }
  b.add(G.cyl(2.4, 2.4, 0.4, 12), 0x2a2628, { at: [0, h + 0.2, 0], m: 'stone' })
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.add(G.chamfer(0.7, 0.8, 0.5, 0.04), 0x2a2628, { at: [Math.cos(a) * 2.2, h + 0.8, Math.sin(a) * 2.2], rot: [0, -a, 0], m: 'stone' }) }
  b.add(G.cone(2.7, 3.2, 10), 0x5a0e0e, { at: [0, h + 2.5, 0], jit: 0.08 , m: 'tile' })
  b.add(G.cyl(0.04, 0.04, 1.6, 4), P.ironDark, { at: [0, h + 4.6, 0], m: 'iron' })
  b.add(G.plane(0.9, 0.5), P.crimson, { at: [0.45, h + 5.1, 0], m: 'cloth' })
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; b.add(G.box(0.18, 0.7, 0.3), 0x0a0808, { at: [Math.cos(a) * 2.38, h - 2.2, Math.sin(a) * 2.38], rot: [0, -a, 0] }) }
  b.pop()
  if (banners) banner(b, [at[0], at[1] + h - 1.5, at[2] + 2.55], 0, 1.3, 4.2)
}
export { ironThrone, torch }
