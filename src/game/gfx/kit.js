import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { patchFog } from './Renderer'

/* ===========================================================================
   Faceted art kit. Everything is flat-shaded with per-face colour variation
   ("visible polygon planes"), a soft vertical gradient (painterly AO) and
   merged into one mesh per material so whole districts are a few draw calls.
=========================================================================== */

export function rng(seed = 1) {
  let a = seed >>> 0
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
export const hex = h => new THREE.Color(h)

/* ------------------------------ shared materials ------------------------------ */
export const WIND = { uTime: { value: 0 }, uWind: { value: 1 } }
function windHook(strength) {
  return shader => {
    patchFog(shader)
    Object.assign(shader.uniforms, WIND)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wWp = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wWp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        float wH = max(transformed.y, 0.0);
        float wS = sin(uTime * 1.7 + wWp.x * 0.35 + wWp.z * 0.21) + 0.5 * sin(uTime * 3.1 + wWp.z * 0.6);
        transformed.x += wS * wH * wH * ${strength.toFixed(4)} * uWind;
        transformed.z += cos(uTime * 1.3 + wWp.x * 0.27) * wH * wH * ${(strength * 0.6).toFixed(4)} * uWind;`)
  }
}
const cache = {}
export function mat(key) {
  if (cache[key]) return cache[key]
  const base = { vertexColors: true, flatShading: true }
  const M = {
    std: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.88, metalness: 0 }),
    stone: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.95, metalness: 0 }),
    metal: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.42, metalness: 0.65 }),
    gold: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.3, metalness: 0.9 }),
    glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    cloth: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.92, side: THREE.DoubleSide }),
    leaf: () => { const m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.8, side: THREE.DoubleSide }); m.onBeforeCompile = windHook(0.0028); m.customProgramCacheKey = () => 'leaf'; return m },
    grass: () => { const m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.9, side: THREE.DoubleSide }); m.onBeforeCompile = windHook(0.12); m.customProgramCacheKey = () => 'grass'; return m },
    tree: () => { const m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.85 }); m.onBeforeCompile = windHook(0.0007); m.customProgramCacheKey = () => 'tree'; return m },
  }
  const material = (M[key] || M.std)()
  material.userData.sharedKit = true
  return (cache[key] = material)
}

/* ------------------------------ primitive geometry ------------------------------ */
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  chamfer: (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.2, h / 2.2, d / 2.2)),
  cyl: (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  cone: (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg),
  sphere: (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  oct: r => new THREE.OctahedronGeometry(r, 0),
  dodeca: r => new THREE.DodecahedronGeometry(r, 0),
  tetra: r => new THREE.TetrahedronGeometry(r, 0),
  torus: (r, t, rs = 5, ts = 10, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  lathe: (pts, seg = 10) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg),
  plane: (w, h, ws = 1, hs = 1) => new THREE.PlaneGeometry(w, h, ws, hs),
}

/** Displace merged vertices (keeps the mesh closed) for organic faceted forms. */
export function jitter(geo, amt, seed = 1, keepBottom = false) {
  const src = geo.clone(); for (const k of Object.keys(src.attributes)) if (k !== 'position') src.deleteAttribute(k)
  const g = mergeVertices(src, 1e-4)
  const r = rng(seed), p = g.attributes.position
  g.computeBoundingBox(); const minY = g.boundingBox.min.y
  for (let i = 0; i < p.count; i++) {
    if (keepBottom && p.getY(i) < minY + 1e-3) continue
    p.setXYZ(i, p.getX(i) + (r() - 0.5) * amt, p.getY(i) + (r() - 0.5) * amt, p.getZ(i) + (r() - 0.5) * amt)
  }
  return g
}
/** Angular rock / boulder. */
export function rock(r = 1, seed = 1, squash = 0.7, detail = 1) {
  const g = jitter(new THREE.IcosahedronGeometry(r, detail), r * 0.45, seed)
  g.scale(1, squash, 1.1)
  return g
}

/** Corrugated clay-tile roof slope: rows of ridged tiles from ridge to eave (local: x along roof, y up, z down-slope). */
export function tileSlope(len, slope, { ridge = 0.32, course = 0.42 } = {}) {
  const pos = [], nx = Math.max(2, Math.round(len / ridge)), nz = Math.max(1, Math.round(slope / course))
  const dx = len / nx, dz = slope / nz
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x0 = -len / 2 + i * dx, x1 = x0 + dx, xm = x0 + dx / 2
    const z0 = j * dz, z1 = z0 + dz, lift = 0.07, lap = 0.04  // each course overlaps the next (stepped)
    const a = [x0, 0, z0], b = [xm, lift, z0], c = [x1, 0, z0]
    const d = [x0, -lap, z1], e = [xm, lift - lap, z1], f = [x1, -lap, z1]
    pos.push(...a, ...d, ...b, ...b, ...d, ...e, ...b, ...e, ...c, ...c, ...e, ...f)
    // tile lip
    const g2 = [x0, -lap - 0.05, z1], h2 = [xm, lift - lap - 0.05, z1], i2 = [x1, -lap - 0.05, z1]
    pos.push(...d, ...g2, ...e, ...e, ...g2, ...h2, ...e, ...h2, ...f, ...f, ...h2, ...i2)
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return geo
}

/* ------------------------------ Builder ------------------------------ */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3()
export function tf(at = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e)
  typeof scale === 'number' ? _s.setScalar(scale) : _s.set(...scale)
  return new THREE.Matrix4().compose(_p.set(...at), _q, _s)
}

export class Builder {
  constructor(seed = 1) { this.groups = {}; this.r = rng(seed); this.stack = [] }
  /** Group transform for subsequent adds (push/pop). */
  push(at, rot, scale) { const m = tf(at, rot, scale); this.stack.push(this.stack.length ? this.stack[this.stack.length - 1].clone().multiply(m) : m); return this }
  pop() { this.stack.pop(); return this }
  /**
   * @param geo   BufferGeometry (consumed)
   * @param color hex | THREE.Color | (faceIndex, centroidY01) => Color
   * @param o     { m: material key, at, rot, scale, jit: per-face value jitter, grad: bottom darkening, hdr: colour multiplier }
   */
  add(geo, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k)
    g.computeBoundingBox()
    const bb = g.boundingBox, hgt = Math.max(1e-4, bb.max.y - bb.min.y)
    const M = o.matrix || tf(o.at, o.rot, o.scale ?? 1)
    if (this.stack.length) M.premultiply(this.stack[this.stack.length - 1])
    const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3)
    const base = typeof color === 'function' ? null : (color.isColor ? color : new THREE.Color(color))
    const jit = o.jit ?? 0.07, grad = o.grad ?? 0.22, hdr = o.hdr ?? 1, c = new THREE.Color()
    for (let f = 0; f < n; f += 3) {
      const cy = ((p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3 - bb.min.y) / hgt
      if (base) c.copy(base); else c.copy(color(f / 3, cy, p, f))
      const v = 1 + (this.r() - 0.5) * 2 * jit
      const sh = (1 - grad) + grad * Math.min(1, cy * 1.4)
      const k = v * sh * hdr, tint = 1 + (this.r() - 0.5) * jit * 0.4
      for (let i = 0; i < 3; i++) { col[(f + i) * 3] = c.r * k; col[(f + i) * 3 + 1] = c.g * k; col[(f + i) * 3 + 2] = c.b * k * tint }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.applyMatrix4(M)
    g.computeVertexNormals()
    ;(this.groups[o.m || 'std'] ||= []).push(g)
    return this
  }
  /** Merge everything into a Group (one mesh per material). */
  build({ shadows = true, receive = true } = {}) {
    const grp = new THREE.Group()
    for (const [k, list] of Object.entries(this.groups)) {
      if (!list.length) continue
      const geo = mergeGeometries(list, false)
      const mesh = new THREE.Mesh(geo, mat(k))
      mesh.castShadow = shadows && k !== 'glow'
      mesh.receiveShadow = receive && k !== 'glow'
      mesh.name = k
      grp.add(mesh)
    }
    this.groups = {}
    return grp
  }
  /** Merge into a single geometry for one material (for InstancedMesh sources). */
  geometry(key = 'std') { const g = mergeGeometries(this.groups[key] || [], false); delete this.groups[key]; return g }
}

/** Build a mesh straight from a builder callback. */
export function make(fn, seed, opts) { const b = new Builder(seed); fn(b); return b.build(opts) }
