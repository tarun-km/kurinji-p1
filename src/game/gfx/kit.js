import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { patchFog } from './chunks'
import { detailLevel } from './detail'
import { surfaceHook, surfaceKey, setWindUniforms, EDGE_KEYS, SURF, applySurface } from './surface'

/* ===========================================================================
   Faceted art kit. Everything is flat-shaded with per-face colour variation
   ("visible polygon planes"), a soft vertical gradient (painterly AO) and
   merged into one mesh per material so whole districts are a few draw calls.

   detailLevel()  0 = low (phones) · 1 = medium · 2 = high · 3 = ultra.
                  Use it to scale OPTIONAL detail only (extra bevels, trims, small
                  props); 'low' must stay light. For the 'custom' preset it is
                  derived from render scale / foliage / shadows.

   mat(key)       SHARED cached materials — clone before changing one object.
                  Keys (each has a procedural surface recipe, see surface.js):
                    std · stone · plaster · wood · bark · tile · cloth · metal · iron
                    gold · brass · skin · leaf · tree · grass · glow
                  Unknown keys fall back to the 'std' recipe.

   Builder        add(geo, colour, { m: key, at, rot, scale, jit, grad, hdr })
                  Geometry of edge-aware keys (std, stone, plaster, wood, bark, tile,
                  metal, iron, gold, brass) carries an `aEdge` attribute (normalized
                  uint16 x4): distance to hard convex/concave edges + a grain axis.
                  The surface shader turns it into worn edges and grimy creases —
                  so bevels/chamfers you model get highlighted automatically.
                  Merged Builder geometry therefore has position, color, normal
                  (+ aEdge). If you mergeGeometries() it with foreign geometry, use
                  matchAttributes() first.
=========================================================================== */

export { detailLevel, SURF, applySurface }

export function rng(seed = 1) {
  let a = seed >>> 0
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
export const hex = h => new THREE.Color(h)

/* ------------------------------ shared materials ------------------------------ */
export const WIND = { uTime: { value: 0 }, uWind: { value: 1 } }
setWindUniforms(WIND)
/** Legacy sway hook (kept for external callers); kit materials use surfaceHook(..., { wind }). */
export function windHook(strength) {
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

/* Base PBR values per key (the surface recipe adds variation on top). */
const BASE = {
  std:     { roughness: 0.88, metalness: 0 },
  stone:   { roughness: 0.92, metalness: 0 },
  plaster: { roughness: 0.93, metalness: 0 },
  wood:    { roughness: 0.82, metalness: 0 },
  bark:    { roughness: 0.92, metalness: 0 },
  tile:    { roughness: 0.78, metalness: 0 },
  cloth:   { roughness: 0.95, metalness: 0, side: THREE.DoubleSide },
  metal:   { roughness: 0.42, metalness: 0.65 },
  iron:    { roughness: 0.5,  metalness: 0.78 },
  gold:    { roughness: 0.3,  metalness: 0.9 },
  brass:   { roughness: 0.36, metalness: 0.85 },
  skin:    { roughness: 0.6,  metalness: 0 },
  // Trees, palms and bushes stand still (only grass sways); swaying whole trees read as jitter.
  leaf:    { roughness: 0.8,  metalness: 0, side: THREE.DoubleSide },
  tree:    { roughness: 0.85, metalness: 0 },
  grass:   { roughness: 0.9,  metalness: 0, side: THREE.DoubleSide, wind: 0.12 },
}
const cache = {}
export function mat(key) {
  if (cache[key]) return cache[key]
  let material
  if (key === 'glow') material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  else {
    // 'treeSway' / 'leafSway': the instanced-forest variants — canopies breathe in the wind (only
    // instanced meshes move; merged buildings that share the base keys stay perfectly still)
    const sway = key.endsWith('Sway'), base = sway ? key.slice(0, -4) : key
    const b = BASE[base] || BASE.std
    material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: b.roughness, metalness: b.metalness, side: b.side ?? THREE.FrontSide })
    const wind = sway ? (base === 'leaf' ? 0.0042 : 0.0016) : b.wind
    const opts = wind ? { wind, instOnly: sway } : {}
    material.onBeforeCompile = surfaceHook(base, opts)
    material.customProgramCacheKey = () => surfaceKey(base, wind ? (sway ? ':sway' : ':w') : '')
    material.userData.surface = BASE[base] ? base : 'std'
  }
  material.userData.sharedKit = true
  material.name = 'kit:' + key
  return (cache[key] = material)
}
/** Every kit material created so far (Renderer refreshes them when the detail level changes). */
export function kitMaterials() { return Object.values(cache) }

/* ------------------------------ primitive geometry ------------------------------ */
/** Lathe profile with chamfered rims: [[r, y], …] for a cylinder of radius rt→rb, height h, bevel b. */
function bevelProfile(rt, rb, h, b) {
  b = Math.min(b, h / 3, rt * 0.45, rb * 0.45)
  return [[0, -h / 2], [rb - b, -h / 2], [rb, -h / 2 + b], [rt, h / 2 - b], [rt - b, h / 2], [0, h / 2]]
}
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  chamfer: (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.2, h / 2.2, d / 2.2)),
  cyl: (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  /** Cylinder with chamfered top/bottom rims (posts, pillars, drums, handles). */
  bevelCyl: (rt, rb, h, seg = 8, b = 0.03) => new THREE.LatheGeometry(bevelProfile(rt, rb, h, b).map(p => new THREE.Vector2(p[0], p[1])), seg),
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

/* ------------------------------ edge attribute ------------------------------
   For each triangle corner c, the edge opposite c is "hard" when the neighbouring
   face bends by more than EDGE_DEG. Per vertex j we store component c:
     convex  : j == c ? 8 - h : 8        concave : j == c ? 8.25 + h : 8.25
     soft    : 0
   (h = triangle altitude from c). Interpolated, |value - base| is the exact
   distance (m) to that edge; 0 means "no edge" (also what a missing attribute
   reads as). Stored /16 as normalized uint16. Component w = grain axis code. */
const EDGE_DEG = 30, EDGE_COS = Math.cos(EDGE_DEG * Math.PI / 180)
export const KIT_STATS = { edgeMs: 0, edgeTris: 0 }
let sIds = new Int32Array(1024), sHashK = new Int32Array(2048 * 3), sHashV = new Int32Array(2048), sNb = new Int32Array(1024), sN = new Float32Array(1024), sCen = new Float32Array(1024)
function grow(arr, n, Ctor) { return arr.length >= n ? arr : new Ctor(Math.max(n, arr.length * 2)) }
function pow2(n) { let p = 16; while (p < n) p <<= 1; return p }

/** Weld identical (1 mm) vertices of a non-indexed position array → ids per vertex. */
function weld(arr, count) {
  const cap = pow2(count * 2), mask = cap - 1
  sHashK = grow(sHashK, cap * 3, Int32Array); sHashV = grow(sHashV, cap, Int32Array); sIds = grow(sIds, count, Int32Array)
  sHashV.fill(-1, 0, cap)
  let next = 0
  for (let v = 0; v < count; v++) {
    const x = Math.round(arr[v * 3] * 1000) | 0, y = Math.round(arr[v * 3 + 1] * 1000) | 0, z = Math.round(arr[v * 3 + 2] * 1000) | 0
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask
    for (;;) {
      const id = sHashV[h]
      if (id < 0) { sHashV[h] = next; sHashK[h * 3] = x; sHashK[h * 3 + 1] = y; sHashK[h * 3 + 2] = z; sIds[v] = next++; break }
      if (sHashK[h * 3] === x && sHashK[h * 3 + 1] === y && sHashK[h * 3 + 2] === z) { sIds[v] = id; break }
      h = (h + 1) & mask
    }
  }
  return sIds
}
/** Pair every triangle edge with its neighbour (by welded ids) → sNb[t*3+c] = neighbour triangle or -1. */
function pairEdges(ids, tris) {
  const cap = pow2(tris * 3 * 2), mask = cap - 1
  sHashK = grow(sHashK, cap * 3, Int32Array); sHashV = grow(sHashV, cap, Int32Array); sNb = grow(sNb, tris * 3, Int32Array)
  sHashV.fill(-1, 0, cap); sNb.fill(-1, 0, tris * 3)
  for (let t = 0; t < tris; t++) for (let c = 0; c < 3; c++) {
    const a = ids[t * 3 + (c + 1) % 3], b = ids[t * 3 + (c + 2) % 3]
    if (a === b) continue
    const lo = a < b ? a : b, hi = a < b ? b : a
    let h = (Math.imul(lo, 0x9E3779B1) ^ Math.imul(hi, 0x85EBCA77)) & mask
    for (;;) {
      const o = sHashV[h]
      if (o < 0) { sHashV[h] = t * 3 + c; sHashK[h * 3] = lo; sHashK[h * 3 + 1] = hi; break }
      if (sHashK[h * 3] === lo && sHashK[h * 3 + 1] === hi) {
        const ot = (o / 3) | 0
        if (ot !== t && sNb[t * 3 + c] < 0) { sNb[t * 3 + c] = ot; if (sNb[o] < 0) sNb[o] = t }
        break
      }
      h = (h + 1) & mask
    }
  }
  return sNb
}
const _ax = new THREE.Vector3()
function octCode(v) {
  const l = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) || 1
  let u = v.x / l, w = v.y / l
  if (v.z < 0) { const ou = u; u = (1 - Math.abs(w)) * (ou >= 0 ? 1 : -1); w = (1 - Math.abs(ou)) * (w >= 0 ? 1 : -1) }
  const qu = Math.round((u * 0.5 + 0.5) * 127), qw = Math.round((w * 0.5 + 0.5) * 127)
  return 1 + qu * 128 + qw
}
/**
 * @param ids  welded vertex ids (pre-transform topology)
 * @param p    transformed (world) positions
 * @param flip true when the transform mirrors (negative determinant)
 * @param axis grain axis code (0 = none)
 */
function edgeAttribute(ids, p, tris, flip, axis) {
  const nb = pairEdges(ids, tris)
  sN = grow(sN, tris * 4, Float32Array); sCen = grow(sCen, tris * 3, Float32Array)
  for (let t = 0; t < tris; t++) {
    const o = t * 9
    const ax = p[o], ay = p[o + 1], az = p[o + 2], bx = p[o + 3], by = p[o + 4], bz = p[o + 5], cx = p[o + 6], cy = p[o + 7], cz = p[o + 8]
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len > 1e-12) { nx /= len; ny /= len; nz /= len }
    if (flip) { nx = -nx; ny = -ny; nz = -nz }
    sN[t * 4] = nx; sN[t * 4 + 1] = ny; sN[t * 4 + 2] = nz; sN[t * 4 + 3] = len   // len = 2·area
    sCen[t * 3] = (ax + bx + cx) / 3; sCen[t * 3 + 1] = (ay + by + cy) / 3; sCen[t * 3 + 2] = (az + bz + cz) / 3
  }
  const out = new Uint16Array(tris * 12), K = 65535 / 16
  for (let t = 0; t < tris; t++) {
    const o = t * 9, area2 = sN[t * 4 + 3]
    for (let c = 0; c < 3; c++) {
      const u = nb[t * 3 + c]
      if (u < 0 || area2 <= 1e-12 || sN[u * 4 + 3] <= 1e-12) continue
      const dot = sN[t * 4] * sN[u * 4] + sN[t * 4 + 1] * sN[u * 4 + 1] + sN[t * 4 + 2] * sN[u * 4 + 2]
      if (dot > EDGE_COS) continue
      const side = (sCen[u * 3] - sCen[t * 3]) * sN[t * 4] + (sCen[u * 3 + 1] - sCen[t * 3 + 1]) * sN[t * 4 + 1] + (sCen[u * 3 + 2] - sCen[t * 3 + 2]) * sN[t * 4 + 2]
      const convex = side < 0
      // altitude from corner c to the opposite edge
      const i1 = o + ((c + 1) % 3) * 3, i2 = o + ((c + 2) % 3) * 3
      const el = Math.hypot(p[i2] - p[i1], p[i2 + 1] - p[i1 + 1], p[i2 + 2] - p[i1 + 2])
      if (el < 1e-6) continue
      const h = area2 / el
      for (let j = 0; j < 3; j++) {
        const v = convex ? (j === c ? 8 - Math.min(h, 7.99) : 8) : (j === c ? 8.25 + Math.min(h, 7.74) : 8.25)
        out[(t * 3 + j) * 4 + c] = Math.round(v * K)
      }
    }
    if (axis) for (let j = 0; j < 3; j++) out[(t * 3 + j) * 4 + 3] = axis
  }
  return new THREE.BufferAttribute(out, 4, true)
}

/** Give every geometry in the list the same attribute set (zero-filled) so they can be merged. */
export function matchAttributes(list) {
  const names = new Map()
  for (const g of list) for (const [k, a] of Object.entries(g.attributes)) if (!names.has(k)) names.set(k, a)
  for (const g of list) for (const [k, a] of names) if (!g.attributes[k]) {
    const n = g.attributes.position.count
    g.setAttribute(k, new THREE.BufferAttribute(new a.array.constructor(n * a.itemSize), a.itemSize, a.normalized))
  }
  return list
}

/* ------------------------------ Builder ------------------------------ */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3()
export function tf(at = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e)
  typeof scale === 'number' ? _s.setScalar(scale) : _s.set(...scale)
  return new THREE.Matrix4().compose(_p.set(...at), _q, _s)
}

export class Builder {
  constructor(seed = 1) { this.groups = {}; this.r = rng(seed); this.stack = []; this.edges = detailLevel() > 0 }
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
    const key = o.m || 'std'
    const edges = this.edges && EDGE_KEYS.has(key) && n >= 3 && n % 3 === 0
    let ids = null, axis = 0
    if (edges) {
      const t0 = performance.now()
      ids = weld(p.array, n).slice(0, n)
      // grain axis: the primitive's longest local extent, in world space
      const ex = bb.max.x - bb.min.x, ey = bb.max.y - bb.min.y, ez = bb.max.z - bb.min.z
      _ax.set(ex >= ey && ex >= ez ? 1 : 0, ey > ex && ey >= ez ? 1 : 0, ez > ex && ez > ey ? 1 : 0).transformDirection(M)
      axis = octCode(_ax)
      KIT_STATS.edgeMs += performance.now() - t0
    }
    g.applyMatrix4(M)
    if (edges) {
      const t0 = performance.now()
      g.setAttribute('aEdge', edgeAttribute(ids, g.attributes.position.array, n / 3, M.determinant() < 0, axis))
      KIT_STATS.edgeMs += performance.now() - t0; KIT_STATS.edgeTris += n / 3
    }
    g.computeVertexNormals()
    ;(this.groups[key] ||= []).push(g)
    return this
  }
  /** Merge everything into a Group (one mesh per material). */
  build({ shadows = true, receive = true } = {}) {
    const grp = new THREE.Group()
    for (const [k, list] of Object.entries(this.groups)) {
      if (!list.length) continue
      const geo = mergeGeometries(matchAttributes(list), false)
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
  geometry(key = 'std') { const g = mergeGeometries(matchAttributes(this.groups[key] || []), false); delete this.groups[key]; return g }
}

/** Build a mesh straight from a builder callback. */
export function make(fn, seed, opts) { const b = new Builder(seed); fn(b); return b.build(opts) }
