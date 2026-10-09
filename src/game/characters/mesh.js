import * as THREE from 'three'
import * as KIT from '../gfx/kit'

/* ===========================================================================
   SkinBuilder — the low-level half of the character system.

   Every character is ONE skeleton and a handful of skinned meshes (one per
   material: skin, std, cloth, metal, gold, …). Bodies, garments, hair and
   rigid accessories are all emitted as flat-shaded triangles with a per-face
   colour and up to four bone weights, then merged per material. Rigid parts
   simply carry a single weight, so a hand, a sandal or a pauldron costs no
   extra draw call.

   Coordinates are BIND SPACE: metres, character standing at the origin
   facing +z, bones unrotated, so a bone's local frame is a pure translation.
=========================================================================== */

export const lerp = THREE.MathUtils.lerp
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
/** smooth bump: 1 at 0, 0 at |t| ≥ 1 */
export const bump = t => { t = Math.abs(t); return t >= 1 ? 0 : (1 - t * t) * (1 - t * t) }
/** wrapped angle difference in (-π, π] */
export const adiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d }
export const rng = KIT.rng || (seed => { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } })

const _col = new THREE.Color()
export const C = h => (h && h.isColor) ? h.clone() : new THREE.Color(h ?? 0xff00ff)
/** colour helpers (linear working space) */
export const mul = (h, k) => C(h).multiplyScalar(k)
export const mix = (a, b, t) => C(a).lerp(C(b), t)

/* ------------------------------ vectors (plain arrays) ------------------------------ */
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  mad: (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] },
}

/* ------------------------------ weights ------------------------------ */
/** Weight = array of [boneIndex, weight]; mixW blends two weight sets. */
export function mixW(a, b, t) {
  if (t <= 0) return a
  if (t >= 1) return b
  const m = new Map()
  for (const [i, w] of a) m.set(i, (m.get(i) || 0) + w * (1 - t))
  for (const [i, w] of b) m.set(i, (m.get(i) || 0) + w * t)
  return normW([...m.entries()])
}
export function normW(list) {
  list = list.filter(e => e[1] > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4)
  const s = list.reduce((acc, e) => acc + e[1], 0) || 1
  return list.map(([i, w]) => [i, w / s])
}

/* ------------------------------ builder ------------------------------ */
export class SkinBuilder {
  /** @param bones ordered THREE.Bone list (skeleton order) */
  constructor(bones, seed = 7) {
    this.bones = bones
    this.index = new Map(bones.map((b, i) => [b.name, i]))
    this.groups = {}
    this.r = rng(seed)
    this.tris = 0
  }
  /** weight from bone name(s): W('head') or W(['spine', .5], ['chest', .5]) */
  W(...args) {
    if (typeof args[0] === 'string' && args.length === 1) return [[this.bi(args[0]), 1]]
    return normW(args.map(([n, w]) => [this.bi(n), w]))
  }
  bi(name) { const i = this.index.get(name); if (i === undefined) throw Error('no bone ' + name); return i }
  has(name) { return this.index.has(name) }
  group(m) { return this.groups[m] ||= { p: [], c: [], si: [], sw: [] } }
  /** jittered face colour */
  shade(color, jit = 0.04) {
    const k = 1 + (this.r() - 0.5) * 2 * jit, t = 1 + (this.r() - 0.5) * jit * 0.5
    return _col.copy(color).multiplyScalar(k).setRGB(_col.r, _col.g * t, _col.b)
  }
  tri(m, a, b, c, color, wa, wb = wa, wc = wa) {
    const G = this.group(m)
    G.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    G.c.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b)
    for (const w of [wa, wb, wc]) for (let k = 0; k < 4; k++) { const e = w[k]; G.si.push(e ? e[0] : 0); G.sw.push(e ? e[1] : 0) }
    this.tris++
  }
  /** quad a-b-c-d counter-clockwise seen from the front; split on the shorter diagonal */
  quad(m, a, b, c, d, color, wa, wb = wa, wc = wa, wd = wa, color2 = color) {
    const ac = v3.len(v3.sub(a, c)), bd = v3.len(v3.sub(b, d))
    if (ac <= bd) { this.tri(m, a, b, c, color, wa, wb, wc); this.tri(m, a, c, d, color2, wa, wc, wd) }
    else { this.tri(m, a, b, d, color, wa, wb, wd); this.tri(m, b, c, d, color2, wb, wc, wd) }
  }
  /**
   * Triangulate a vertex grid V[row][col] = { p:[x,y,z], w } (rows/cols ≥ 2).
   *   wrap       close the columns into a tube
   *   color      hex/Color or (row, col, centroid) → hex/Color
   *   axis       (centroid) → point the faces must face AWAY from (auto-orients every face)
   *   inward     faces point TOWARD the axis instead
   *   jit        per-face brightness jitter
   *   skip       (row, col) → true to leave a quad out
   *   twoTone    second triangle of each quad slightly darker (folded-plane look)
   */
  grid(m, V, { wrap = false, color = 0xffffff, axis = null, inward = false, jit = 0.04, skip = null, twoTone = 0 } = {}) {
    const rows = V.length, cols = V[0].length
    const fixed = typeof color === 'function' ? null : C(color)
    const cc = new THREE.Color(), c2 = new THREE.Color()
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < (wrap ? cols : cols - 1); c++) {
      if (skip && skip(r, c)) continue
      const c1 = (c + 1) % cols
      const A = V[r][c], B = V[r][c1], D = V[r + 1][c], E = V[r + 1][c1]
      const cen = [(A.p[0] + B.p[0] + D.p[0] + E.p[0]) / 4, (A.p[1] + B.p[1] + D.p[1] + E.p[1]) / 4, (A.p[2] + B.p[2] + D.p[2] + E.p[2]) / 4]
      cc.copy(fixed || C(color(r, c, cen)))
      const s1 = this.shade(cc, jit).clone()
      c2.copy(s1).multiplyScalar(1 - twoTone)
      // natural order A B E D (counter-clockwise when rows go up and cols go +θ)
      let q = [A, B, E, D]
      if (axis) {
        const ap = axis(cen), n = v3.cross(v3.sub(B.p, A.p), v3.sub(D.p, A.p))
        const n2 = v3.cross(v3.sub(E.p, B.p), v3.sub(D.p, B.p))
        const out = v3.sub(cen, ap), s = v3.dot(v3.add(n, n2), out)
        if ((s < 0) !== inward) q = [A, D, E, B]
      }
      this.quad(m, q[0].p, q[1].p, q[2].p, q[3].p, s1, q[0].w, q[1].w, q[2].w, q[3].w, c2)
    }
  }
  /** fan-close a ring of vertices {p,w} to an apex {p,w} (orientation from axis) */
  fan(m, ring, apex, color, { jit = 0.04, outward = null, closed = true } = {}) {
    const n = ring.length, base = C(color)
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = ring[i], b = ring[(i + 1) % n]
      let A = a, B = b
      if (outward) { const nn = v3.cross(v3.sub(b.p, a.p), v3.sub(apex.p, a.p)); if (v3.dot(nn, outward) < 0) { A = b; B = a } }
      this.tri(m, A.p, B.p, apex.p, this.shade(base, jit), A.w, B.w, apex.w)
    }
  }
  /**
   * Rigid THREE geometry (consumed) bound to one weight set.
   *   matrix | at, rot, scale   placement in bind space
   *   color  hex/Color or (faceIndex, centroidY01, centroid) → hex/Color
   *   grad   bottom darkening (0..1)   jit  face jitter
   */
  add(m, geo, color, w, { at = [0, 0, 0], rot = [0, 0, 0], scale = 1, matrix = null, jit = 0.04, grad = 0 } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo
    const M = matrix || mat4(at, rot, scale)
    g.applyMatrix4(M)
    const p = g.attributes.position
    g.computeBoundingBox()
    const y0 = g.boundingBox.min.y, h = Math.max(1e-5, g.boundingBox.max.y - y0)
    const fixed = typeof color === 'function' ? null : C(color)
    const cc = new THREE.Color()
    for (let f = 0; f < p.count; f += 3) {
      const a = [p.getX(f), p.getY(f), p.getZ(f)], b = [p.getX(f + 1), p.getY(f + 1), p.getZ(f + 1)], c = [p.getX(f + 2), p.getY(f + 2), p.getZ(f + 2)]
      const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
      const cy = (cen[1] - y0) / h
      cc.copy(fixed || C(color(f / 3, cy, cen)))
      if (grad) cc.multiplyScalar(1 - grad + grad * Math.min(1, cy * 1.3))
      const s = this.shade(cc, jit)
      const wa = typeof w === 'function' ? w(a) : w, wb = typeof w === 'function' ? w(b) : w, wc = typeof w === 'function' ? w(c) : w
      this.tri(m, a, b, c, s, wa, wb, wc)
    }
    geo.dispose?.(); if (g !== geo) g.dispose()
  }
  /**
   * Tapered prism along a path (hair locks, straps, fringe, beads strings).
   * path: [{ p, w, r (half width), t (half thickness, default r), up? }]
   * sides: 3 (triangular lock), 4, 5, 6 …   cap: close the ends
   */
  prism(m, path, color, { sides = 3, cap = true, jit = 0.06, twist = 0, side = null, tipColor = null } = {}) {
    const n = path.length
    if (n < 2) return
    const rings = []
    let prevSide = side || [1, 0, 0]
    for (let i = 0; i < n; i++) {
      const P = path[i], prev = path[Math.max(0, i - 1)].p, next = path[Math.min(n - 1, i + 1)].p
      const T = v3.norm(v3.sub(next, prev))
      let S = P.side || prevSide
      S = v3.norm(v3.sub(S, v3.scale(T, v3.dot(S, T))))
      if (!Number.isFinite(S[0]) || v3.len(S) < 0.5) S = v3.norm(v3.cross(T, Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
      prevSide = S
      const U = v3.cross(T, S)
      const ring = []
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2 + twist * i + (sides === 4 ? Math.PI / 4 : 0)
        const r = P.r, t = P.t ?? P.r
        ring.push({ p: v3.add(P.p, v3.add(v3.scale(S, Math.cos(a) * r), v3.scale(U, Math.sin(a) * t))), w: P.w })
      }
      rings.push(ring)
    }
    const base = C(color), tip = tipColor != null ? C(tipColor) : null
    for (let i = 0; i < n - 1; i++) {
      const cc = tip ? mix(base, tip, i / (n - 1)) : base
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides
        const A = rings[i][k], B = rings[i][k1], D = rings[i + 1][k], E = rings[i + 1][k1]
        this.quad(m, A.p, B.p, E.p, D.p, this.shade(cc, jit), A.w, B.w, E.w, D.w)
      }
    }
    if (cap) {
      const first = rings[0], last = rings[n - 1]
      const c0 = { p: avg(first.map(v => v.p)), w: path[0].w }, c1 = { p: avg(last.map(v => v.p)), w: path[n - 1].w }
      // start cap faces backwards along the path, end cap forwards
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides
        if (path[0].r > 1e-4) this.tri(m, first[k1].p, first[k].p, c0.p, this.shade(base, jit), first[k1].w, first[k].w, c0.w)
        if (path[n - 1].r > 1e-4) this.tri(m, last[k].p, last[k1].p, c1.p, this.shade(tip || base, jit), last[k].w, last[k1].w, c1.w)
      }
    }
  }
  /**
   * Thick panel (both sides + rim) from a grid of mid-surface points.
   * V[row][col] = { p, w, n? } ; thickness along per-vertex normal n (or the given normal fn).
   * Front faces get `color`, back faces `back` (default darker).
   */
  slab(m, V, color, { thick = 0.008, normal = null, back = null, jit = 0.05, wrap = false, axis = null, edge = true, twoTone = 0 } = {}) {
    const rows = V.length, cols = V[0].length
    const off = (v, s) => {
      const n = v.n || normal(v.p)
      return { p: v3.mad(v.p, n, s * thick * 0.5), w: v.w }
    }
    const F = V.map(row => row.map(v => off(v, 1))), Bk = V.map(row => row.map(v => off(v, -1)))
    this.grid(m, F, { color, wrap, jit, axis, twoTone })
    this.grid(m, Bk, { color: back ?? (typeof color === 'function' ? (r, c, p) => mul(color(r, c, p), 0.62) : mul(color, 0.62)), wrap, jit, axis, inward: true })
    if (!edge) return
    const rim = (a, b, a2, b2, cc) => this.quad(m, a.p, b.p, b2.p, a2.p, this.shade(cc, jit), a.w, b.w, b2.w, a2.w)
    const ec = typeof color === 'function' ? C(color(0, 0, V[0][0].p)) : C(color)
    const ec2 = mul(ec, 0.8)
    // rows 0 and last, cols 0 and last (open edges); orientation handled by both-direction pairs
    const edgeLoop = []
    for (let c = 0; c < cols - (wrap ? 0 : 1); c++) edgeLoop.push([[0, c], [0, (c + 1) % cols]])
    for (let c = 0; c < cols - (wrap ? 0 : 1); c++) edgeLoop.push([[rows - 1, (c + 1) % cols], [rows - 1, c]])
    if (!wrap) {
      for (let r = 0; r < rows - 1; r++) edgeLoop.push([[r + 1, 0], [r, 0]])
      for (let r = 0; r < rows - 1; r++) edgeLoop.push([[r, cols - 1], [r + 1, cols - 1]])
    }
    for (const [[r0, c0], [r1, c1]] of edgeLoop) {
      const a = F[r0][c0], b = F[r1][c1], a2 = Bk[r0][c0], b2 = Bk[r1][c1]
      // orient the rim outward: compare with the panel centre direction
      const mid = v3.lerp(V[r0][c0].p, V[r1][c1].p, 0.5)
      const inner = V[clamp(r0 === 0 ? 1 : r0 === rows - 1 ? rows - 2 : r0, 0, rows - 1)][clamp(c0 === 0 && !wrap ? 1 : c0 === cols - 1 && !wrap ? cols - 2 : c0, 0, cols - 1)].p
      const n = v3.cross(v3.sub(b.p, a.p), v3.sub(a2.p, a.p))
      if (v3.dot(n, v3.sub(mid, inner)) >= 0) rim(a, b, a2, b2, ec2)
      else rim(b, a, b2, a2, ec2)
    }
  }
  /** Merge into skinned meshes (one per material) under root, bound to skeleton. */
  build(root, skeleton, materialFor) {
    const meshes = []
    for (const [m, G] of Object.entries(this.groups)) {
      if (!G.p.length) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(G.p, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(G.c, 3))
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(G.si, 4))
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(G.sw, 4))
      geo.computeVertexNormals()
      geo.computeBoundingSphere()
      const mesh = new THREE.SkinnedMesh(geo, materialFor(m))
      mesh.name = m
      mesh.castShadow = m !== 'glow'
      mesh.receiveShadow = m !== 'glow'
      root.add(mesh)
      mesh.bind(skeleton, new THREE.Matrix4())
      meshes.push(mesh)
    }
    this.groups = {}
    return meshes
  }
}
function avg(list) { const s = [0, 0, 0]; for (const p of list) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2] } return [s[0] / list.length, s[1] / list.length, s[2] / list.length] }
export { avg }

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3()
export function mat4(at = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e)
  typeof scale === 'number' ? _s.setScalar(scale) : _s.set(...scale)
  return new THREE.Matrix4().compose(_p.set(...at), _q, _s)
}
