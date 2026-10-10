import * as THREE from 'three'
import { Builder, G, jitter, mat } from '../gfx/kit'

/* ===========================================================================
   Aruvan's horse: a faceted Marwari-style mount (curled ears, arched neck,
   flowing mane and tail), with hinged legs for a walk → trot → gallop gait.
   The horse stands at the origin facing +z; saddle top ≈ 1.42 m.
=========================================================================== */
export const SADDLE_Y = 1.42
export const COATS = {
  bay: { coat: 0x6a3a1e, dark: 0x241410, mane: 0x15100c, blaze: 0xe8dcc8 },
  white: { coat: 0xe8e2d6, dark: 0xb8b0a2, mane: 0xd8d0c4, blaze: 0xf4f0e8 },
  black: { coat: 0x221c1a, dark: 0x120e0c, mane: 0x0a0806, blaze: 0x3a3230 },
  dapple: { coat: 0x9a9690, dark: 0x5a5650, mane: 0x2a2624, blaze: 0xe8e4dc },
}
export const BLANKETS = { saffron: 0xd9822b, crimson: 0x8a1a1a, indigo: 0x2a3a7a, jade: 0x2f7a5f }

function legGeo(c, upper) {
  const b = new Builder(upper ? 31 : 32)
  if (upper) {
    b.add(jitter(G.ico(0.16, 1), 0.02, 3), c.coat, { at: [0, -0.12, 0], scale: [0.9, 1.6, 1.1] })
    b.add(G.cyl(0.09, 0.07, 0.42, 7), c.coat, { at: [0, -0.42, 0] })
  } else {
    b.add(G.cyl(0.055, 0.05, 0.42, 7), c.dark, { at: [0, -0.21, 0] })
    b.add(G.sphere(0.075, 7, 5), c.dark, { at: [0, -0.42, 0] })
    b.add(G.cyl(0.07, 0.085, 0.1, 8), 0x1a1410, { at: [0, -0.5, 0.01] })
    b.add(G.cyl(0.075, 0.08, 0.06, 8), c.blaze, { at: [0, -0.43, 0] })
  }
  return b.geometry('std')
}

export class Horse {
  constructor(scene, { coat = 'bay', blanket = 'saffron' } = {}) {
    this.scene = scene; this.root = new THREE.Group(); this.root.name = 'horse'
    this.phase = 0; this.speed = 0; this.t = 0
    this.build(coat, blanket)
    scene.add(this.root)
  }
  build(coatKey, blanketKey) {
    for (const m of [...this.root.children]) { m.traverse(o => o.geometry?.dispose()); this.root.remove(m) }
    const c = COATS[coatKey] || COATS.bay, blanket = BLANKETS[blanketKey] ?? BLANKETS.saffron
    this.coat = coatKey; this.blanket = blanketKey
    const M = mat('std'), C = mat('cloth'), L = mat('wood')
    const body = new Builder(30)
    // barrel, chest, haunches
    body.add(jitter(G.ico(0.5, 2), 0.03, 1), c.coat, { at: [0, 1.15, 0.05], scale: [0.62, 0.68, 1.45], grad: 0.25 })
    body.add(jitter(G.ico(0.38, 1), 0.03, 2), c.coat, { at: [0, 1.2, 0.6], scale: [0.85, 1.05, 0.9] })
    body.add(jitter(G.ico(0.4, 1), 0.03, 3), c.coat, { at: [0, 1.22, -0.55], scale: [0.9, 0.95, 0.95] })
    // neck (arched) + head
    // neck: a smooth arch of overlapping rounded sections from the withers to the poll
    for (let i = 0; i < 8; i++) { const t = i / 7; body.add(jitter(G.ico(0.23 - t * 0.08, 1), 0.012, 10 + i), c.coat, { at: [0, 1.36 + t * 0.52, 0.72 + Math.sin(t * 1.25) * 0.42], scale: [0.78, 1.05, 1.0], grad: 0 }) }
    const head = new THREE.Group(); head.position.set(0, 1.92, 1.16); head.rotation.x = 0.35
    const hb = new Builder(33)
    hb.add(jitter(G.ico(0.16, 1), 0.015, 4), c.coat, { at: [0, 0, 0], scale: [0.85, 1, 1.05] })
    hb.add(G.cyl(0.075, 0.11, 0.42, 8), c.coat, { at: [0, -0.12, 0.2], rot: [1.15, 0, 0] })
    hb.add(G.sphere(0.085, 8, 6), c.dark, { at: [0, -0.22, 0.38], scale: [1, 0.8, 1.1] })
    hb.add(G.box(0.05, 0.22, 0.02), c.blaze, { at: [0, -0.02, 0.15], rot: [1.2, 0, 0] })
    for (const s of [-1, 1]) {
      hb.add(G.cone(0.045, 0.16, 5), c.coat, { at: [s * 0.08, 0.17, -0.03], rot: [-0.2, 0, -s * 0.35] }) // curled Marwari ears
      hb.add(G.sphere(0.022, 6, 4), 0x0a0806, { at: [s * 0.11, 0.03, 0.06] })
      hb.add(G.torus(0.09, 0.012, 3, 10), 0x5a3420, { at: [s * 0.06, -0.12, 0.22], rot: [0, Math.PI / 2, 0] })   // bridle
    }
    const headMesh = new THREE.Mesh(hb.geometry('std'), M); headMesh.castShadow = true; head.add(headMesh)
    this.head = head
    // mane: a row of faceted locks down the neck crest
    for (let i = 0; i < 11; i++) { const t = i / 10; body.add(G.cone(0.045, 0.22, 4), c.mane, { at: [(i % 2 - 0.5) * 0.05, 1.5 + t * 0.5, 0.66 + Math.sin(t * 1.25) * 0.36], rot: [-1.9 + t * 0.4, 0, (i % 2 - 0.5) * 0.6], jit: 0.1 }) }
    // saddle blanket, saddle, girth, reins
    body.add(G.chamfer(0.78, 0.04, 0.82, 0.02), blanket, { at: [0, 1.5, 0.05], m: 'cloth' })
    for (const s of [-1, 1]) body.add(G.chamfer(0.04, 0.42, 0.78, 0.02), blanket, { at: [s * 0.4, 1.32, 0.05], m: 'cloth' })
    for (const s of [-1, 1]) body.add(G.box(0.03, 0.06, 0.74), 0xc9a24a, { at: [s * 0.42, 1.13, 0.05], m: 'gold' })
    body.add(G.chamfer(0.5, 0.12, 0.62, 0.04), 0x4a2a16, { at: [0, 1.56, 0.05], m: 'wood' })
    body.add(G.chamfer(0.36, 0.16, 0.1, 0.03), 0x4a2a16, { at: [0, 1.66, 0.33], m: 'wood' })
    body.add(G.chamfer(0.4, 0.2, 0.1, 0.03), 0x4a2a16, { at: [0, 1.68, -0.22], m: 'wood' })
    body.add(G.box(0.02, 0.62, 0.04), 0x3a2a1a, { at: [0, 1.15, 0.05], rot: [0, 0, Math.PI / 2], scale: [1, 1, 1] })
    for (const s of [-1, 1]) body.add(G.cyl(0.008, 0.008, 0.9, 3), 0x5a3420, { at: [s * 0.14, 1.75, 0.92], rot: [1.0, 0, 0] })
    // tail
    for (let i = 0; i < 6; i++) body.add(G.cone(0.09, 0.7, 5), c.mane, { at: [(i % 3 - 1) * 0.04, 1.02 - i * 0.03, -0.98 - i * 0.04], rot: [-2.75 + i * 0.05, 0, (i % 2 - 0.5) * 0.3], jit: 0.12 })
    const groups = body.groups
    for (const [k, list] of Object.entries(groups)) {
      const b2 = new Builder(1); b2.groups[k] = list
      const mesh = new THREE.Mesh(b2.geometry(k), k === 'cloth' ? C : k === 'wood' ? L : mat(k)); mesh.castShadow = true; mesh.receiveShadow = true
      this.root.add(mesh)
    }
    this.root.add(head)
    // legs: hip pivot → upper, knee pivot → lower
    const up = legGeo(c, true), lo = legGeo(c, false)
    this.legs = [[0.17, 0.62], [-0.17, 0.62], [0.17, -0.58], [-0.17, -0.58]].map(([x, z], i) => {
      const hip = new THREE.Group(); hip.position.set(x, 1.0, z)
      const u = new THREE.Mesh(up, M); u.castShadow = true; hip.add(u)
      const knee = new THREE.Group(); knee.position.set(0, -0.52, 0); hip.add(knee)
      const l = new THREE.Mesh(lo, M); l.castShadow = true; knee.add(l)
      this.root.add(hip)
      return { hip, knee, front: i < 2, side: x > 0 ? 1 : -1 }
    })
  }
  /** speed in m/s; walk < 3, trot < 7.5, gallop above. */
  update(dt, speed, air = false) {
    this.t += dt; this.speed += (speed - this.speed) * Math.min(1, dt * 6)
    const s = this.speed, gallop = Math.min(1, Math.max(0, (s - 6.5) / 3)), freq = 1.4 + s * 0.42
    this.phase += dt * freq * Math.PI * 2 * (s > 0.15 ? 1 : 0)
    const stride = Math.min(1, s / 4)
    // gait offsets: walk = 4-beat, trot = diagonal pairs, gallop = front/back pairs
    const off = [[0, 0.5, 0.25, 0.75], [0, 0.5, 0.5, 0], [0, 0.1, 0.55, 0.65]]
    const g = s < 3 ? off[0] : s < 7.5 ? off[1] : off[2]
    this.legs.forEach((L, i) => {
      const p = this.phase + g[i] * Math.PI * 2, sw = Math.sin(p), lift = Math.max(0, Math.cos(p))
      L.hip.rotation.x = (air ? (L.front ? -0.9 : 0.7) : sw * (0.35 + gallop * 0.35) * stride)
      L.knee.rotation.x = air ? (L.front ? 1.3 : -0.6) : (L.front ? 1 : -1) * lift * (0.5 + gallop * 0.5) * stride + (L.front ? 0.05 : -0.05)
    })
    // body: rocking canter, breathing at rest, head bob
    const bob = Math.sin(this.phase * 2) * 0.03 * stride + gallop * Math.sin(this.phase) * 0.05
    this.root.children.forEach(m => { if (m.isMesh) { m.position.y = bob; m.rotation.x = gallop * Math.sin(this.phase) * 0.06 } })
    this.head.position.y = 1.92 + bob + (s < 0.15 ? Math.sin(this.t * 0.7) * 0.03 : Math.sin(this.phase * 2) * 0.04)
    this.head.rotation.x = s < 0.15 ? 0.45 + Math.sin(this.t * 0.4) * 0.15 : 0.3 - 0.15 * gallop
    return bob
  }
  dispose() { this.root.traverse(o => o.geometry?.dispose()); this.root.removeFromParent() }
}
