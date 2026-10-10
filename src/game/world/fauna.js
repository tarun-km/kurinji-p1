import * as THREE from 'three'
import { Builder, G, jitter, mat } from '../gfx/kit'
import { heightAt } from './terrain'

/* Village fauna board: chickens (#A65A3A / cream), goats (#8B5A3E / cream), plus birds circling the valley. */

function chickenParts() {
  const body = new Builder(1)
  body.add(jitter(G.ico(0.17, 2), 0.025, 1), (f, cy) => new THREE.Color(cy > 0.35 ? 0xa65a3a : 0xead9c6), { at: [0, 0.3, 0], scale: [0.85, 0.85, 1.15], jit: 0.12 })
  for (const s of [-1, 1]) {
    // folded wing: layered feather wedges
    for (let i = 0; i < 4; i++) body.add(G.oct(0.07), i % 2 ? 0x8a4a2e : 0xb46a44, { at: [s * 0.13, 0.33 - i * 0.02, 0.02 - i * 0.05], scale: [0.25, 0.7, 1.4], rot: [0.2, s * 0.15, 0] })
  }
  // tail fan
  for (let i = 0; i < 6; i++) body.add(G.oct(0.06), i % 2 ? 0x5a2a1a : 0x8a4a2e, { at: [(i - 2.5) * 0.025, 0.42 + Math.sin(i / 5 * Math.PI) * 0.05, -0.2], scale: [0.3, 1.6, 0.6], rot: [-0.7, 0, (i - 2.5) * 0.15] })
  body.add(jitter(G.ico(0.085, 1), 0.012, 3), 0xb06a44, { at: [0, 0.52, 0.15], scale: [0.9, 1.05, 1] })
  body.add(G.cone(0.025, 0.07, 4).rotateX(Math.PI / 2), 0xe0a020, { at: [0, 0.51, 0.25] })
  for (let i = 0; i < 3; i++) body.add(G.oct(0.025), 0xd02a2a, { at: [0, 0.6 + (i === 1 ? 0.01 : 0), 0.13 + i * 0.025], scale: [0.4, 1.2, 0.8] })
  body.add(G.oct(0.022), 0xd02a2a, { at: [0, 0.45, 0.22], scale: [0.4, 1.3, 0.6] })
  for (const s of [-1, 1]) body.add(G.ico(0.012, 0), 0x1a1208, { at: [s * 0.06, 0.54, 0.2] })
  const legs = new Builder(2)
  for (const s of [-1, 1]) {
    legs.add(G.cyl(0.012, 0.014, 0.18, 5), 0xe0a020, { at: [s * 0.06, 0.09, 0] })
    for (const a of [-0.5, 0, 0.5]) legs.add(G.box(0.012, 0.008, 0.07), 0xe0a020, { at: [s * 0.06 + Math.sin(a) * 0.03, 0.004, 0.03 + Math.cos(a) * 0.01], rot: [0, a, 0] })
  }
  return [body.geometry('std'), legs.geometry('std')]
}
function goatParts() {
  const body = new Builder(3)
  const coat = (f, cy) => new THREE.Color(cy > 0.55 ? 0x8b5a3e : 0xdccbb6)
  body.add(jitter(G.ico(0.32, 2), 0.04, 4), coat, { at: [0, 0.74, 0], scale: [0.62, 0.68, 1.35], jit: 0.1 })
  body.add(jitter(G.ico(0.14, 1), 0.02, 5), 0x8b5a3e, { at: [0, 0.98, 0.42], scale: [0.85, 1, 1.1], rot: [-0.5, 0, 0] })
  body.add(jitter(G.ico(0.12, 1), 0.02, 6), 0xdccbb6, { at: [0, 1.0, 0.58], scale: [0.8, 0.9, 1.35], rot: [0.35, 0, 0] })
  body.add(G.box(0.08, 0.05, 0.06), 0x3a2a20, { at: [0, 0.94, 0.72] })
  body.add(G.cone(0.03, 0.12, 5), 0xd8ccb8, { at: [0, 0.86, 0.66], rot: [Math.PI, 0, 0] }) // beard
  for (const s of [-1, 1]) {
    // swept-back ridged horns
    for (let i = 0; i < 5; i++) body.add(G.cyl(0.026 - i * 0.004, 0.03 - i * 0.004, 0.06, 6), 0x5a4a3a, { at: [s * (0.05 + i * 0.006), 1.12 + Math.sin(i * 0.5) * 0.05, 0.5 - i * 0.045], rot: [-0.6 - i * 0.35, 0, s * 0.15] })
    body.add(G.oct(0.05), 0x8b5a3e, { at: [s * 0.12, 1.04, 0.5], scale: [1.6, 0.4, 0.8], rot: [0, 0, s * -0.4] })
    body.add(G.ico(0.014, 0), 0x2a1a08, { at: [s * 0.075, 1.04, 0.63] })
  }
  body.add(G.cone(0.04, 0.14, 5), 0xdccbb6, { at: [0, 0.92, -0.44], rot: [-2.3, 0, 0] })
  const leg = new Builder(4)
  leg.add(G.cyl(0.04, 0.028, 0.3, 6), 0x8b5a3e, { at: [0, -0.15, 0] })
  leg.add(G.cyl(0.026, 0.024, 0.26, 6), 0xdccbb6, { at: [0, -0.42, 0.01] })
  leg.add(G.chamfer(0.06, 0.06, 0.07, 0.01), 0x2a2420, { at: [0, -0.57, 0.015] })
  return [body.geometry('std'), leg.geometry('std')]
}

export class Fauna {
  constructor(scene, world) {
    this.scene = scene; this.world = world
    this.animals = []
    const [cb, cl] = chickenParts(), [gb, gl] = goatParts()
    const M = mat('std')
    const homes = [[-5, 6], [6, -6], [-12, -4], [12, 8], [4, 14], [-16, 10], [17, 18], [15, 20]]
    homes.forEach(([x, z], i) => {
      const g = new THREE.Group(), body = new THREE.Mesh(cb, M), legs = new THREE.Mesh(cl, M)
      body.castShadow = true; g.add(body, legs); scene.add(g)
      this.animals.push({ kind: 'chicken', g, body, home: new THREE.Vector2(x, z), pos: new THREE.Vector2(x, z), target: null, t: Math.random() * 5, speed: 0.9, wait: Math.random() * 2 })
    })
    for (const [x, z] of [[19, 24], [21, 20], [16, 26], [-3, 16]]) {
      const g = new THREE.Group(), body = new THREE.Mesh(gb, M); body.castShadow = true; g.add(body)
      const legs = [[-0.13, 0.5, 0.3], [0.13, 0.5, 0.3], [-0.13, 0.5, -0.3], [0.13, 0.5, -0.3]].map(([lx, ly, lz]) => { const l = new THREE.Mesh(gl, M); l.position.set(lx, ly, lz); g.add(l); return l })
      scene.add(g)
      this.animals.push({ kind: 'goat', g, body, legs, home: new THREE.Vector2(x, z), pos: new THREE.Vector2(x, z), target: null, t: Math.random() * 5, speed: 0.7, wait: Math.random() * 3 })
    }
    // herds out in the wider land (regions.js): goat flocks on the meadow, hens in the hamlet
    for (const h of world.herds || []) for (let i = 0; i < h.n; i++) {
      const x = h.x + Math.cos(i * 2.4) * (1 + i * 0.6), z = h.z + Math.sin(i * 2.4) * (1 + i * 0.6)
      const g = new THREE.Group(), body = new THREE.Mesh(h.kind === 'goat' ? gb : cb, M); body.castShadow = true; g.add(body); scene.add(g)
      if (h.kind === 'goat') {
        const legs = [[-0.13, 0.5, 0.3], [0.13, 0.5, 0.3], [-0.13, 0.5, -0.3], [0.13, 0.5, -0.3]].map(([lx, ly, lz]) => { const l = new THREE.Mesh(gl, M); l.position.set(lx, ly, lz); g.add(l); return l })
        this.animals.push({ kind: 'goat', g, body, legs, home: new THREE.Vector2(x, z), pos: new THREE.Vector2(x, z), target: null, t: Math.random() * 5, speed: 0.7, wait: Math.random() * 3 })
      } else { g.add(new THREE.Mesh(cl, M)); this.animals.push({ kind: 'chicken', g, body, home: new THREE.Vector2(x, z), pos: new THREE.Vector2(x, z), target: null, t: Math.random() * 5, speed: 0.9, wait: Math.random() * 2 }) }
    }
    // birds: a faceted body, beak and fanned tail; wings flap in the vertex shader (aWing = 0 at the
    // shoulder → 1 at the tip). Flocks wheel together, small birds dart low over the settlements,
    // eagles soar on thermals high above the valley.
    const pos = [], wing = []
    const tri = (a, b, c, w) => { pos.push(...a, ...b, ...c); wing.push(...w) }
    tri([0, 0.04, 0.32], [0.07, 0, 0], [-0.07, 0, 0], [0, 0, 0]); tri([0.07, 0, 0], [0, -0.05, -0.05], [-0.07, 0, 0], [0, 0, 0])
    tri([0, 0.04, 0.32], [0, 0.0, 0.42], [0.025, 0.02, 0.3], [0, 0, 0])
    tri([0.05, 0, -0.2], [-0.05, 0, -0.2], [0, 0.01, -0.42], [0, 0, 0]); tri([0.14, 0, -0.44], [-0.14, 0, -0.44], [0, 0.01, -0.3], [0, 0, 0])
    for (const sx of [-1, 1]) {
      tri([sx * 0.06, 0.01, 0.12], [sx * 0.42, 0.04, 0.02], [sx * 0.06, 0.01, -0.12], [0, 0.55, 0])
      tri([sx * 0.42, 0.04, 0.02], [sx * 0.82, 0.02, -0.12], [sx * 0.42, 0.03, -0.14], [0.55, 1, 0.55])
      tri([sx * 0.06, 0.01, -0.12], [sx * 0.42, 0.04, 0.02], [sx * 0.42, 0.03, -0.14], [0, 0.55, 0.55])
    }
    const bg = new THREE.BufferGeometry()
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1))
    bg.computeVertexNormals()
    const N = 72
    const phase = new Float32Array(N), speed = new Float32Array(N)
    const bm = new THREE.MeshLambertMaterial({ color: 0x3a3236, side: THREE.DoubleSide, flatShading: true })
    bm.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.birdTime = { value: 0 }
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWing; attribute float aPhase; attribute float aFlap; uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fl = sin(uTime * aFlap + aPhase);
          transformed.y += fl * aWing * 0.3;
          transformed.x *= 1.0 - abs(fl) * aWing * 0.12;`)
    }
    bm.customProgramCacheKey = () => 'birds'
    this.birds = new THREE.InstancedMesh(bg, bm, N)
    const kinds = []
    // 5 flocks of 9, 15 low darting birds, 12 eagles
    for (let f = 0; f < 5; f++) { const c = new THREE.Vector3((Math.random() - 0.5) * 300, 55 + Math.random() * 35, -150 + Math.random() * 390); for (let i = 0; i < 9; i++) kinds.push({ kind: 'flock', c, r: 30 + f * 8, sp: 0.12 + f * 0.015, ph: f * 1.7, off: new THREE.Vector3((i % 3 - 1) * 1.6, (i % 2) * 0.6, Math.floor(i / 3) * 1.4 - 1.4), scale: 0.9 }) }
    const hubs = [[0, 0], [-8, 98], [-112, 180], [108, 20], [-50, 240], [0, -72]]
    for (let i = 0; i < 15; i++) { const h = hubs[i % hubs.length]; kinds.push({ kind: 'low', c: new THREE.Vector3(h[0], 0, h[1]), r: 6 + Math.random() * 14, sp: 0.35 + Math.random() * 0.25, ph: Math.random() * 6, off: new THREE.Vector3(), scale: 0.55 }) }
    for (let i = 0; i < 12; i++) kinds.push({ kind: 'eagle', c: new THREE.Vector3((Math.random() - 0.5) * 340, 95 + Math.random() * 40, -160 + Math.random() * 410), r: 25 + Math.random() * 40, sp: 0.05 + Math.random() * 0.04, ph: Math.random() * 6, off: new THREE.Vector3(), scale: 2.4 })
    kinds.forEach((k, i) => { phase[i] = Math.random() * 6.28; speed[i] = k.kind === 'eagle' ? 2.2 : k.kind === 'low' ? 18 : 11 })
    bg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1)); bg.setAttribute('aFlap', new THREE.InstancedBufferAttribute(speed, 1))
    this.birdData = kinds
    this.birds.frustumCulled = false; this.birds.castShadow = false; scene.add(this.birds)
    this.visible = true
  }
  setVisible(v) { this.visible = v; for (const a of this.animals) a.g.visible = v }
  /** Chickens scatter from a point (e.g. the player running through). */
  scare(p) { for (const a of this.animals) if (a.kind === 'chicken' && a.pos.distanceTo(new THREE.Vector2(p.x, p.z)) < 3) { const d = a.pos.clone().sub(new THREE.Vector2(p.x, p.z)).normalize().multiplyScalar(4); a.target = a.pos.clone().add(d); a.speed = 3; a.wait = 0 } }
  update(dt, t, player) {
    if (this.visible) for (const a of this.animals) {
      if (player && Math.abs(a.pos.x - player.x) + Math.abs(a.pos.y - player.z) > 140) { a.g.visible = false; continue } else a.g.visible = true
      a.t += dt
      if (player && a.kind === 'chicken' && a.pos.distanceToSquared(new THREE.Vector2(player.x, player.z)) < 4 && a.speed < 2) this.scare(player)
      if (!a.target) {
        a.wait -= dt
        if (a.wait <= 0) { const ang = Math.random() * 6.28, d = Math.random() * (a.kind === 'goat' ? 4 : 3); a.target = a.home.clone().add(new THREE.Vector2(Math.cos(ang) * d, Math.sin(ang) * d)); a.speed = a.kind === 'goat' ? 0.7 : 0.9 }
      }
      let moving = false
      if (a.target) {
        const d = a.target.clone().sub(a.pos), L = d.length()
        if (L < 0.08) { a.target = null; a.wait = 1 + Math.random() * 4 }
        else { a.pos.addScaledVector(d.normalize(), Math.min(L, a.speed * dt)); a.g.rotation.y = Math.atan2(d.x, d.y); moving = true }
      }
      a.g.position.set(a.pos.x, heightAt(a.pos.x, a.pos.y), a.pos.y)
      if (a.kind === 'chicken') {
        a.body.rotation.x = moving ? Math.sin(a.t * 14) * 0.08 : Math.max(0, Math.sin(a.t * 3)) * 0.6 // walk bob / peck
        a.body.position.y = moving ? Math.abs(Math.sin(a.t * 14)) * 0.03 : 0
      } else {
        a.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(a.t * 8 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.4 : 0 })
        a.body.rotation.x = moving ? 0 : Math.sin(a.t * 0.8) * 0.05 - 0.05
      }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3()
    if (this.birdTime) this.birdTime.value = t
    this.birdData.forEach((b, i) => {
      const a = t * b.sp + b.ph, glide = b.kind === 'eagle'
      const y0 = b.kind === 'low' ? heightAt(b.c.x, b.c.z) + 7 + Math.sin(a * 3) * 2 : b.c.y
      p.set(b.c.x + Math.cos(a) * b.r, y0 + Math.sin(a * 2) * (glide ? 4 : 3), b.c.z + Math.sin(a) * b.r)
      // formation offset rotates with the flock's heading
      const hd = -a; p.x += b.off.x * Math.cos(hd) - b.off.z * Math.sin(hd); p.z += b.off.x * Math.sin(hd) + b.off.z * Math.cos(hd); p.y += b.off.y
      e.set(0, -a, (glide ? 0.35 : 0.22) + Math.sin(a * 3) * 0.08); q.setFromEuler(e)
      s.setScalar(b.scale)
      this.birds.setMatrixAt(i, m.compose(p, q, s))
    })
    this.birds.instanceMatrix.needsUpdate = true
  }
}
