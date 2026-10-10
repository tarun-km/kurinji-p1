import * as THREE from 'three'
import { Builder, G, jitter, rock, rng, mat, hex } from '../gfx/kit'
import { heightAt, pathX, fbm, smooth, PLACES, STREAM, streamInfo, INNER, REGIONS, trailDist } from './terrain'
import { settings } from '../settings'

/* ===========================================================================
   Vegetation from the forest / Kurinji / terrain boards. Everything is
   instanced; foliage density (settings) simply trims instance counts.
=========================================================================== */

const TRUNK = 0x4a3020, EUC_TRUNK = 0xc6b59e, SHOLA_TRUNK = 0x5e5442

function conifer() {
  const b = new Builder(3)
  b.add(G.cyl(0.11, 0.24, 2.2, 6), TRUNK, { at: [0, 1.1, 0], grad: 0.3 })
  for (let i = 0; i < 4; i++) {
    const r = 1.55 - i * 0.33, h = 1.7 - i * 0.12
    b.add(jitter(G.cone(r, h, 8), 0.16, 10 + i), [0x2c5430, 0x325e34, 0x3a6a3a, 0x42723e][i], { at: [0, 1.5 + i * 0.95, 0], grad: 0.45 })
  }
  return b.geometry('std')
}
function cypress() {
  const b = new Builder(4)
  b.add(G.cyl(0.1, 0.18, 1.2, 6), TRUNK, { at: [0, 0.6, 0] })
  b.add(jitter(new THREE.ConeGeometry(0.85, 6.4, 8, 3), 0.18, 2), 0x2a4a2c, { at: [0, 4, 0], grad: 0.4 })
  b.add(jitter(new THREE.IcosahedronGeometry(0.8, 0), 0.15, 3), 0x2f5232, { at: [0, 1.9, 0], scale: [1, 1.4, 1], grad: 0.4 })
  return b.geometry('std')
}
function eucalyptus() {
  const b = new Builder(5)
  b.add(G.cyl(0.12, 0.26, 4.2, 6), EUC_TRUNK, { at: [0, 2.1, 0], rot: [0.05, 0, 0.06], grad: 0.25 })
  b.add(G.cyl(0.06, 0.11, 2.4, 5), EUC_TRUNK, { at: [0.55, 4.6, 0.1], rot: [0, 0, -0.55] })
  b.add(G.cyl(0.06, 0.1, 2.1, 5), EUC_TRUNK, { at: [-0.45, 4.9, -0.2], rot: [0.3, 0, 0.45] })
  for (const [x, y, z, s] of [[1.2, 6.0, 0.2, 1.1], [-0.9, 6.3, -0.4, 1.0], [0.1, 7.0, 0.3, 0.9], [0.4, 5.5, -0.9, 0.8], [-0.4, 5.4, 0.9, 0.75]])
    b.add(jitter(new THREE.IcosahedronGeometry(s, 0), 0.25, x * 10 + y), 0x6a8a46, { at: [x, y, z], scale: [1.3, 0.55, 1.1], grad: 0.35 })
  return b.geometry('std')
}
function shola() {
  const b = new Builder(6)
  b.add(G.cyl(0.24, 0.42, 2.2, 7), SHOLA_TRUNK, { at: [0, 1.1, 0], grad: 0.3 })
  b.add(G.cyl(0.1, 0.18, 1.6, 5), SHOLA_TRUNK, { at: [0.5, 2.4, 0], rot: [0, 0, -0.6] })
  b.add(G.cyl(0.1, 0.18, 1.6, 5), SHOLA_TRUNK, { at: [-0.4, 2.4, 0.3], rot: [0.4, 0, 0.6] })
  for (const [x, y, z, s] of [[0, 3.6, 0, 1.6], [1.2, 3.1, 0.3, 1.2], [-1.1, 3.2, -0.4, 1.25], [0.3, 3.0, 1.1, 1.1], [-0.2, 3.1, -1.2, 1.1], [0.2, 4.4, 0.1, 1.0]])
    b.add(jitter(new THREE.IcosahedronGeometry(s, 1), 0.3, x * 7 + z), [0x3c6a2e, 0x2e5a26, 0x447634][(x * 3 + 5 | 0) % 3], { at: [x, y, z], scale: [1, 0.8, 1], grad: 0.45 })
  return b.geometry('std')
}
function frond(b, len, ang, droop, col) {
  // a palm frond: central rib with chevron leaflets, curving down
  const seg = 7
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg
    const p = t => new THREE.Vector3(Math.cos(ang) * len * t, -droop * t * t * len + 0.25 * len * t, Math.sin(ang) * len * t)
    const a = p(t0), c = p(t1), w = 0.5 * Math.sin(Math.PI * (t0 * 0.85 + 0.12)) + 0.08
    const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(w)
    const tip = c.clone().add(new THREE.Vector3(0, -0.15, 0))
    for (const s of [1, -1]) {
      const g = new THREE.BufferGeometry()
      const q = a.clone().addScaledVector(side, s).add(new THREE.Vector3(0, -0.22, 0))
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...q.toArray(), ...tip.toArray()], 3))
      b.add(g, col, { m: 'leaf', jit: 0.12, grad: 0 })
    }
  }
}
function palm() {
  const b = new Builder(8)
  let x = 0, z = 0
  for (let i = 0; i < 9; i++) {
    const r0 = 0.19 - i * 0.008
    b.add(G.cyl(r0 - 0.015, r0, 0.78, 7), i % 2 ? 0x7a6448 : 0x6a5640, { at: [x, 0.39 + i * 0.74, z], rot: [0, 0, -0.04 * i], m: 'leaf', grad: 0.1 })
    x += 0.04 * i * 0.6
  }
  const top = new THREE.Vector3(x, 6.7, z)
  b.push(top.toArray())
  for (let i = 0; i < 10; i++) frond(b, 2.6 + (i % 3) * 0.3, i / 10 * Math.PI * 2, 0.55 + (i % 2) * 0.2, i % 2 ? 0x4e7e34 : 0x5a8a3a)
  for (let i = 0; i < 4; i++) b.add(G.ico(0.16, 0), 0x6a4a22, { at: [Math.cos(i * 1.6) * 0.2, -0.25, Math.sin(i * 1.6) * 0.2], m: 'leaf' })
  b.pop()
  return b.geometry('leaf')
}
function broadleaf() {
  const b = new Builder(9)
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3, L = 0.9 + (i % 3) * 0.2
    const g = new THREE.BufferGeometry()
    const base = [Math.cos(a) * 0.15, 0.25 + i * 0.04, Math.sin(a) * 0.15]
    const tip = [Math.cos(a) * L, 0.45 + (i % 2) * 0.25, Math.sin(a) * L]
    const mid = [Math.cos(a) * L * 0.55, 0.7 + (i % 2) * 0.2, Math.sin(a) * L * 0.55]
    const sx = -Math.sin(a) * 0.32, sz = Math.cos(a) * 0.32
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      ...base, mid[0] + sx, mid[1], mid[2] + sz, ...mid, ...base, ...mid, mid[0] - sx, mid[1] - 0.05, mid[2] - sz,
      ...mid, mid[0] + sx, mid[1], mid[2] + sz, ...tip, ...mid, ...tip, mid[0] - sx, mid[1] - 0.05, mid[2] - sz], 3))
    b.add(g, i % 2 ? 0x3e7a32 : 0x4a8a3a, { m: 'leaf', jit: 0.1, grad: 0.3 })
  }
  return b.geometry('leaf')
}
function kurinjiShrub() {
  const b = new Builder(10)
  b.add(G.cyl(0.04, 0.07, 0.4, 5), 0x5a3a24, { at: [0, 0.2, 0] })
  const pts = [[0, 0.62, 0, 0.42], [0.42, 0.48, 0.1, 0.34], [-0.4, 0.5, -0.12, 0.36], [0.1, 0.46, 0.42, 0.32], [-0.12, 0.46, -0.44, 0.33], [0.3, 0.72, -0.25, 0.28], [-0.28, 0.72, 0.26, 0.28]]
  for (const [x, y, z, s] of pts) b.add(jitter(new THREE.IcosahedronGeometry(s, 0), s * 0.35, x * 17 + z * 31), [0x3a5a30, 0x335228, 0x446a36][(x * 9 + 7 | 0) % 3], { at: [x, y, z], scale: [1.1, 0.85, 1.1], grad: 0.5, jit: 0.12 })
  // closed violet buds standing above the leaves (waiting season)
  const r = rng(77)
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.5
    b.add(G.cone(0.035, 0.13, 5), 0x6a5ac8, { at: [Math.cos(a) * d, 0.86 + r() * 0.16 - d * 0.25, Math.sin(a) * d], rot: [(r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4], jit: 0.1, grad: 0 })
  }
  return b.geometry('std')
}
/** One five-petal Kurinji blossom (shared by shrubs, Malli's flower, memory blossoms). */
export function blossomGeo(r = 0.07, petalColor = 0x8a7cf0, centre = 0xf0e0ff) {
  const b = new Builder(12)
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2
    const g = new THREE.OctahedronGeometry(r, 0); g.scale(0.55, 0.18, 1.1); g.translate(0, 0, r * 0.9)
    b.add(g, petalColor, { rot: [0.35, a, 0], jit: 0.08, grad: 0 })
  }
  b.add(G.ico(r * 0.28, 0), centre, { at: [0, r * 0.12, 0], grad: 0 })
  return b.geometry('std')
}
function blossomCluster() {
  const b = new Builder(13), r = rng(91)
  const one = blossomGeo(0.075)
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.6
    const g = one.clone()
    const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, 0.84 + r() * 0.18 - d * 0.22, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.8, r() * 6, (r() - 0.5) * 0.8)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + r() * 0.5))
    g.applyMatrix4(m)
    ;(b.groups.std ||= []).push(g)
  }
  return b.geometry('std')
}
function grassTuft() {
  const b = new Builder(14), r = rng(15)
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + r(), lean = 0.15 + r() * 0.25, h = 0.35 + r() * 0.3, w = 0.05
    const g = new THREE.BufferGeometry()
    const bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05, tx = Math.cos(a) * lean, tz = Math.sin(a) * lean
    g.setAttribute('position', new THREE.Float32BufferAttribute([bx - w * Math.sin(a), 0, bz + w * Math.cos(a), bx + w * Math.sin(a), 0, bz - w * Math.cos(a), tx, h, tz], 3))
    b.add(g, (f, cy) => new THREE.Color(0x5f8a3a).lerp(new THREE.Color(0x9ab45a), cy), { m: 'grass', jit: 0.1, grad: 0 })
  }
  return b.geometry('grass')
}
function wildflowers() {
  const b = new Builder(16), r = rng(17)
  const white = blossomGeo(0.05, 0xf4f0e0, 0xe8c040), yellow = blossomGeo(0.05, 0xf0c838, 0xc07a20)
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.28, d = r() * 0.25, h = 0.18 + r() * 0.2
    b.add(G.cyl(0.006, 0.008, h, 3), 0x5a8a3a, { at: [Math.cos(a) * d, h / 2, Math.sin(a) * d], m: 'grass', grad: 0 })
    const g = (i % 2 ? white : yellow).clone(); g.translate(Math.cos(a) * d, h, Math.sin(a) * d); (b.groups.grass ||= []).push(g)
  }
  return b.geometry('grass')
}
function boulder(seed, moss = true) {
  const b = new Builder(seed)
  b.add(rock(1, seed, 0.72, 1), (f, cy) => moss && cy > 0.78 ? new THREE.Color(0x5a7a3a) : new THREE.Color(0x7a746c), { jit: 0.12, grad: 0.35, m: 'stone' })
  return b.geometry('stone')
}
function forestBlob() {
  const b = new Builder(18)
  b.add(jitter(new THREE.IcosahedronGeometry(1, 0), 0.3, 2), 0x2c4a26, { at: [0, 1, 0], scale: [1, 1.3, 1], grad: 0.5 })
  b.add(G.cyl(0.1, 0.15, 0.6, 4), TRUNK, { at: [0, 0.2, 0] })
  return b.geometry('std')
}

/* ---------------- placement ---------------- */
export class Nature {
  constructor(scene, world) {
    this.scene = scene; this.world = world
    this.sets = []
    this.bloom = 0
    const r = rng(2024)
    const blocked = (x, z, pad) => world.blocked(x, z, pad)
    const place = (n, tries, fn) => { const out = []; for (let i = 0; i < tries && out.length < n; i++) { const p = fn(r); if (p) out.push(p) } return out }
    const inValley = (x, z) => x > INNER.x0 + 4 && x < INNER.x0 + INNER.w - 4 && z > INNER.z0 + 4 && z < INNER.z0 + INNER.d - 4
    const ok = (x, z, pad, maxH = 64) => {
      if (!inValley(x, z)) return false
      const ax = Math.abs(x - pathX(z)); if (ax < pad + 1.6) return false
      if (blocked(x, z, pad)) return false
      if (z > 50 && z < 150 && x > 8 && streamInfo(x, z)[0] < 3 + pad) return false
      // the wider land: keep trails walkable and landmark yards open
      if ((Math.abs(x) > 16 || z < -80 || z > 184) && trailDist(x, z) < pad + 2.2) return false
      for (const g of REGIONS) if ((x - g.x) ** 2 + (z - g.z) ** 2 < (g.r * 0.85 + pad) ** 2) return false
      const h = heightAt(x, z); if (h > maxH) return false
      return h
    }
    const ring = (x, z, R) => Math.hypot(x - PLACES.rock.x, z - PLACES.rock.z) < R
    // ---- trees
    const tree = (name, geo, material, n, fn, shadow = true) => this.add(name, geo, material, place(n, n * 12, fn), { shadow, cell: shadow ? 64 : 160, maxDist: shadow ? 240 : 0 })
    const forestDensity = (x, z) => fbm(x * 0.03 + 50, z * 0.03) // clumps
    tree('conifer', conifer(), 'treeSway', 2100, r => {
      const x = (r() - 0.5) * 400, z = -195 + r() * 480, h = ok(x, z, 6, 88)
      if (h === false || ring(x, z, 18) || Math.abs(x) < 12 || forestDensity(x, z) < 0.42) return null
      return { x, y: h - 0.2, z, s: 0.7 + r() * 0.6, ry: r() * 6 }
    })
    tree('cypress', cypress(), 'tree', 70, r => {
      const near = r() < 0.6, x = near ? (r() - 0.5) * 50 : (r() - 0.5) * 120, z = near ? -100 + r() * 50 : -60 + r() * 120, h = ok(x, z, 4)
      if (h === false || ring(x, z, 18)) return null
      return { x, y: h - 0.1, z, s: 0.8 + r() * 0.5, ry: r() * 6 }
    })
    tree('eucalyptus', eucalyptus(), 'treeSway', 420, r => {
      const x = (r() - 0.5) * 380, z = -170 + r() * 440, h = ok(x, z, 5)
      if (h === false || ring(x, z, 18) || Math.abs(x) < 10) return null
      return { x, y: h - 0.1, z, s: 0.8 + r() * 0.5, ry: r() * 6 }
    })
    tree('shola', shola(), 'treeSway', 640, r => {
      const x = (r() - 0.5) * 380, z = -180 + r() * 450, h = ok(x, z, 5)
      if (h === false || ring(x, z, 18) || forestDensity(x, z) < 0.35) return null
      return { x, y: h - 0.15, z, s: 0.75 + r() * 0.55, ry: r() * 6 }
    })
    tree('palm', palm(), 'leafSway', 260, r => {
      // palms gather in the warm lower land: village, gate, Thennur, the stream, the hamlet, ghats, pond, terraces
      const hubs = [[0, 0, 34], [0, 46, 22], [-8, 98, 30], [18, 90, 30], [8, 150, 40], [-112, 180, 34], [-50, 240, 26], [-128, 80, 26], [98, 205, 34], [108, 20, 26]]
      const [hx, hz, R] = hubs[(r() * hubs.length) | 0], a = r() * 6.28, d = 10 + r() * R
      const x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d, h = ok(x, z, 3.5, 45)
      if (h === false) return null
      return { x, y: h - 0.1, z, s: 0.8 + r() * 0.4, ry: r() * 6 }
    })
    tree('forest', forestBlob(), 'tree', 2600, r => {
      // outer hills beyond the valley walls
      const a = r() * 6.28, R = 160 + r() * 520, x = Math.cos(a) * R, z = Math.sin(a) * R + 40
      if (Math.abs(x) < 232 && z > -242 && z < 322) return null
      const h = heightAt(x, z); if (h > 80 || h < -20 || fbm(x * 0.02, z * 0.02) < 0.38) return null
      return { x, y: h, z, s: 2.2 + r() * 2.5, ry: r() * 6 }
    }, false)
    // ---- undergrowth, rocks, grass
    this.add('broadleaf', broadleaf(), 'leafSway', place(2400, 30000, r => {
      const x = (r() - 0.5) * 350, z = -176 + r() * 436, h = ok(x, z, 0.6, 70)
      if (h === false || fbm(x * 0.15, z * 0.15) < 0.45) return null
      return { x, y: h, z, s: 0.7 + r() * 0.8, ry: r() * 6 }
    }), { shadow: true, maxDist: 120 })
    const rocks = []
    for (let k = 0; k < 3; k++) rocks.push(boulder(30 + k))
    for (let k = 0; k < 3; k++) this.add('rock' + k, rocks[k], 'stone', place(380, 12000, r => {
      const x = (r() - 0.5) * 350, z = -176 + r() * 436, h = ok(x, z, 1.2, 96)
      if (h === false) return null
      const big = r() < 0.18
      return { x, y: h - 0.25, z, s: big ? 1.3 + r() * 1.3 : 0.35 + r() * 0.6, ry: r() * 6, rx: (r() - 0.5) * 0.3, collide: big }
    }), { shadow: true, density: false, maxDist: 170 })
    // path-side boulders, as on every board (granite lining the winding path)
    this.add('pathrock', rocks[1], 'stone', place(220, 3000, r => {
      const z = -66 + r() * 230, side = r() < 0.5 ? -1 : 1, x = pathX(z) + side * (2.4 + r() * 2.2), h = ok(x, z, 0.4, 70)
      if (h === false) return null
      return { x, y: h - 0.2, z, s: 0.3 + r() * 0.65, ry: r() * 6, rx: (r() - 0.5) * 0.4 }
    }), { shadow: true, density: false })
    this.add('grass', grassTuft(), 'grass', place(40000, 170000, r => {
      const x = (r() - 0.5) * 350, z = -178 + r() * 440, h = ok(x, z, -1.2, 78)
      if (h === false) return null
      return { x, y: h - 0.02, z, s: 0.7 + r() * 0.9, ry: r() * 6 }
    }), { shadow: false, maxDist: 70 })
    this.add('flowers', wildflowers(), 'grass', place(4600, 60000, r => {
      const hubs = [[0, 0, 40], [0, -70, 30], [14, 10, 20], [0, 46, 25], ...REGIONS.map(g => [g.x, g.z, g.r + 22])]
      const [hx, hz, R] = hubs[(r() * hubs.length) | 0], a = r() * 6.28, d = Math.sqrt(r()) * R
      const x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d, h = ok(x, z, -0.8, 60)
      if (h === false || fbm(x * 0.2, z * 0.2) < 0.5) return null
      return { x, y: h, z, s: 0.8 + r() * 0.6, ry: r() * 6 }
    }), { shadow: false, maxDist: 80 })
    // ---- Kurinji shrubs (waiting buds) + blossoms that open with the bloom wave
    const shrubs = place(8200, 150000, r => {
      const x = (r() - 0.5) * 350, z = -178 + r() * 440, h = ok(x, z, 0.4, 80)
      if (h === false || fbm(x * 0.05 + 10, z * 0.05) < 0.45) return null
      return { x, y: h - 0.05, z, s: 0.8 + r() * 0.6, ry: r() * 6, dist: Math.hypot(x - PLACES.rock.x, z - PLACES.rock.z) }
    })
    // shrubs ring the meditation rock and line the temple approach (boards)
    for (let i = 0; i < 220; i++) {
      const a = r() * 6.28, d = 3 + r() * 14, x = PLACES.rock.x + Math.cos(a) * d, z = PLACES.rock.z + Math.sin(a) * d, h = ok(x, z, 0.2, 70)
      if (h !== false) shrubs.push({ x, y: h - 0.05, z, s: 0.7 + r() * 0.5, ry: r() * 6, dist: d })
    }
    shrubs.sort((a, b) => a.dist - b.dist) // nearest the rock first: blossoms open as a prefix
    this.shrubData = shrubs
    this.add('kurinji', kurinjiShrub(), 'std', shrubs, { shadow: true, maxDist: 150 })
    this.blossomMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, emissive: 0x3a2a9a, emissiveIntensity: 0.6 })
    this.blossoms = this.add('blossom', blossomCluster(), this.blossomMat, shrubs, { shadow: false, maxDist: 180 })
    this.setBloom(0)
    this.applyDensity()
  }

  /**
   * Instanced set split into spatial chunks so the frustum culls what is off-screen and
   * small foliage (maxDist) disappears beyond its useful range.
   */
  add(name, geo, material, list, { shadow = true, density = true, cell = 36, maxDist = 0 } = {}) {
    if (!geo.boundingBox) geo.computeBoundingBox()
    const foot = Math.max(0.15, Math.min(1.2, (geo.boundingBox.max.x - geo.boundingBox.min.x) * 0.22))
    for (const p of list) {
      const r = foot * p.s, ground = Math.min(heightAt(p.x, p.z), heightAt(p.x + r, p.z), heightAt(p.x - r, p.z), heightAt(p.x, p.z + r), heightAt(p.x, p.z - r))
      p.y = Math.min(p.y, ground - 0.06 * p.s)
      if (p.collide) this.world.solid(p.x, p.z, p.s * 0.9)
    }
    const M = material?.isMaterial ? material : material ? mat(material) : mat('std')
    const cells = new Map()
    list.forEach((p, i) => { const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`; let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(i) })
    const set = { name, list, chunks: [], material: M }
    const d = new THREE.Object3D()
    for (const idx of cells.values()) {
      const m = new THREE.InstancedMesh(geo, M, idx.length)
      idx.forEach((i, j) => { const p = list[i]; d.position.set(p.x, p.y, p.z); d.rotation.set(p.rx || 0, p.ry || 0, 0); d.scale.setScalar(p.s); d.updateMatrix(); m.setMatrixAt(j, d.matrix) })
      m.userData = { total: idx.length, density, idx, maxDist }
      m.castShadow = shadow; m.receiveShadow = true; m.name = name
      m.computeBoundingSphere()
      this.scene.add(m); set.chunks.push(m); this.sets.push(m)
    }
    return set
  }
  applyDensity() {
    const f = Math.min(1, settings.foliage / 1.35)
    for (const m of this.sets) m.userData.count = m.userData.density ? Math.round(m.userData.total * f) : m.userData.total
    this._applyCounts()
  }
  _applyCounts() {
    for (const m of this.sets) m.count = Math.min(m.userData.count ?? m.userData.total, m.userData.limit ?? Infinity)
  }
  /** Per-frame: hide chunks of small foliage beyond their draw distance. */
  cull(cam) {
    if (!cam) return
    const k = 0.6 + 0.4 * Math.min(1, settings.foliage)
    for (const m of this.sets) {
      const md = m.userData.maxDist; if (!md) continue
      const s = m.boundingSphere
      m.visible = m.count > 0 && cam.distanceTo(s.center) - s.radius < md * k
    }
  }
  /** 0 -> waiting buds, 1 -> the whole mountain in bloom (spreads outward from the meditation rock). */
  setBloom(b) {
    this.bloom = b
    const front = b * 420, d = new THREE.Object3D()
    for (const m of this.blossoms.chunks) {
      // instances are sorted nearest-first, so only the opened prefix is drawn
      let open = 0
      m.userData.idx.forEach((i, j) => {
        const p = this.shrubData[i], k = Math.min(1, Math.max(0, (front - p.dist) / 22))
        if (k > 0) open = j + 1
        d.position.set(p.x, p.y + (1 - k) * -0.25, p.z); d.rotation.set(0, p.ry, 0); d.scale.setScalar(p.s * (0.001 + k)); d.updateMatrix()
        m.setMatrixAt(j, d.matrix)
      })
      m.userData.limit = open
      m.instanceMatrix.needsUpdate = true
    }
    this._applyCounts()
    this.blossomMat.emissiveIntensity = 0.45 + b * 0.9
  }
}
