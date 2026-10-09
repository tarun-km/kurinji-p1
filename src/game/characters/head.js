import * as THREE from 'three'
import { C, mul, mix, lerp, clamp, sstep, bump, adiff, mixW, v3, avg } from './mesh'

/* ===========================================================================
   Heads. The skull/face is a stack of horizontal rings whose radius is a
   designed function headP(θ, y) — ellipse + anatomical features (eye sockets,
   brow ridge, cheekbones, cheek hollows, muzzle, chin, jaw angle). Columns
   are denser at the front so the face carries its own planes.

   Separate small closed pieces sit on top: nose, eyes (lens, iris, lids,
   lash line), brows, lips, ears. Beards and hair are SHELLS sampled from the
   same function with an offset, so they hug the face from every side.
   All head pieces are weighted to the `head` bone (long beards blend into
   the chest towards their tips).
=========================================================================== */

const TAU = Math.PI * 2, D = Math.PI / 180
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p)

const BASE_ROWS = [
  // y, W (half width), F (front), K (back), Z (centre z)
  [-0.1, 0.016, 0.016, 0.012, 0.064],
  [-0.09, 0.031, 0.027, 0.026, 0.053],
  [-0.073, 0.05, 0.055, 0.044, 0.024],
  [-0.055, 0.059, 0.076, 0.058, 0.006],
  [-0.038, 0.063, 0.09, 0.072, -0.002],
  [-0.02, 0.067, 0.096, 0.086, -0.006],
  [0.0, 0.072, 0.097, 0.097, -0.008],
  [0.018, 0.075, 0.096, 0.104, -0.01],
  [0.034, 0.076, 0.094, 0.107, -0.01],
  [0.05, 0.076, 0.097, 0.109, -0.01],
  [0.064, 0.075, 0.096, 0.11, -0.01],
  [0.085, 0.072, 0.091, 0.107, -0.012],
  [0.108, 0.065, 0.08, 0.099, -0.014],
  [0.127, 0.053, 0.063, 0.084, -0.016],
  [0.142, 0.037, 0.043, 0.062, -0.018],
  [0.152, 0.017, 0.02, 0.03, -0.02],
]
const HALF_ANGLES = [
  [18, 36, 56, 80, 108, 142],
  [14, 28, 42, 58, 78, 102, 130, 158],
  [12, 24, 36, 50, 64, 80, 98, 120, 145],
  [10, 20, 30, 40, 51, 63, 77, 92, 110, 132, 156],
]

export class Head {
  constructor(ctx) {
    const { spec, o } = ctx
    this.ctx = ctx; this.o = o
    this.hs = spec.headS
    this.origin = spec.J.head
    const fem = spec.fem, child = spec.child, old = spec.old
    const jaw = o.heavyJaw ? 1.1 : fem ? 0.88 : child ? 0.86 : 1
    this.rows = BASE_ROWS.map(([y, W, F, K, Z]) => {
      const low = y < -0.02 ? sstep(-0.02, -0.09, y) : 0
      const wk = (child ? 1.04 : fem ? 0.95 : 1) * lerp(1, jaw, low) * (o.faceWidth ?? 1)
      return { y, W: W * wk, F: F * (child && y < 0 ? 0.96 : 1), K, Z }
    })
    const m = old ? 1.25 : 1
    this.F = [
      { th: 24 * D, tw: 0.32, at: 0.034, lo: 0.022, hi: 0.02, a: -0.0075 * (child ? 0.7 : 1) * (old ? 1.2 : 1), sym: true },  // eye sockets
      { th: 22 * D, tw: 0.55, at: 0.055, lo: 0.012, hi: 0.016, a: (fem || child ? 0.003 : 0.0065) + (o.stern ? 0.002 : 0), sym: true }, // brow ridge
      { th: 0, tw: 0.2, at: 0.04, lo: 0.015, hi: 0.015, a: -0.004 },                                                // nasion
      { th: 55 * D, tw: 0.35, at: 0.012, lo: 0.018, hi: 0.016, a: 0.007 * (child ? 0.5 : 1), sym: true },          // cheekbones
      { th: 45 * D, tw: 0.36, at: -0.026, lo: 0.02, hi: 0.018, a: child ? 0.004 : fem ? -0.002 : -0.0065 * m, sym: true }, // cheek hollows
      { th: 0, tw: 0.45, at: -0.04, lo: 0.022, hi: 0.022, a: 0.004 },                                               // muzzle
      { th: 22 * D, tw: 0.12, at: -0.022, lo: 0.018, hi: 0.012, a: -0.003 * (old ? 1.6 : child ? 0 : 1), sym: true }, // nasolabial
      { th: 0, tw: 0.4, at: -0.088, lo: 0.012, hi: 0.012, a: 0.005 + (o.heavyJaw ? 0.004 : 0) },                   // chin
      { th: 80 * D, tw: 0.3, at: -0.064, lo: 0.014, hi: 0.016, a: (fem || child ? 0.002 : 0.005) + (o.heavyJaw ? 0.006 : 0), sym: true }, // jaw angle
      { th: 75 * D, tw: 0.3, at: 0.075, lo: 0.02, hi: 0.02, a: -0.004 * m, sym: true },                             // temples
      { th: Math.PI, tw: 0.8, at: 0.04, lo: 0.04, hi: 0.04, a: 0.005 },                                             // occiput
      { th: 0, tw: 0.3, at: -0.068, lo: 0.006, hi: 0.008, a: -0.003 },                                              // mentolabial
    ]
    this.ang = (() => { const h = HALF_ANGLES[ctx.detail]; return [0, ...h.map(a => a * D), Math.PI, ...h.slice().reverse().map(a => -a * D)] })()
  }
  /** head-local point → bind space */
  abs(p) { const o = this.origin, k = this.hs; return [o[0] + p[0] * k, o[1] + p[1] * k, o[2] + p[2] * k] }
  row(y) {
    const R = this.rows
    if (y <= R[0].y) return R[0]
    if (y >= R[R.length - 1].y) return R[R.length - 1]
    for (let i = 0; i < R.length - 1; i++) if (y <= R[i + 1].y) {
      const a = R[i], b = R[i + 1], t = (y - a.y) / (b.y - a.y)
      return { y, W: lerp(a.W, b.W, t), F: lerp(a.F, b.F, t), K: lerp(a.K, b.K, t), Z: lerp(a.Z, b.Z, t) }
    }
  }
  /** local surface point (unscaled head units) */
  local(th, y, off = 0) {
    const R = this.row(y), s = Math.sin(th), c = Math.cos(th), fz = c >= 0 ? R.F : R.K
    const x = R.W * spow(s, c >= 0 ? 0.86 : 0.95), z = R.Z + fz * spow(c, c >= 0 ? 0.82 : 0.95)
    let d = off
    for (const F of this.F) {
      const dv = y - F.at, vb = bump(dv / (dv < 0 ? F.lo : F.hi)); if (!vb) continue
      let ab = bump(adiff(th, F.th) / F.tw); if (F.sym) ab = Math.max(ab, bump(adiff(th, -F.th) / F.tw))
      d += F.a * ab * vb
    }
    const nx = x / (R.W * R.W), nz = (z - R.Z) / (fz * fz), nl = Math.hypot(nx, nz) || 1
    return [x + nx / nl * d, y, z + nz / nl * d]
  }
  P(th, y, off = 0) { return this.abs(this.local(th, y, off)) }
  /** outward horizontal normal at a surface point (local) */
  N(th, y) { const a = this.local(th, y), b = this.local(th, y, 0.01); return v3.norm(v3.sub(b, a)) }
  zFront(y) { return this.local(0, y)[2] }
}

/* ------------------------------ face ------------------------------ */
export function buildHead(ctx) {
  const { S, o, spec, detail } = ctx
  const H = new Head(ctx)
  ctx.headShape = H
  const wH = S.W('head'), skin = C(o.skin), skinM = ctx.M.skin
  const lipCol = mix(mul(skin, 0.78), 0x8a3a30, 0.25)
  // ---- skull rings
  let rows = H.rows.map(r => r.y)
  if (detail === 1) rows = rows.filter(y => ![-0.09, 0.064, 0.142].includes(y))
  if (detail === 0) rows = rows.filter(y => [-0.1, -0.073, -0.038, 0.0, 0.034, 0.064, 0.108, 0.142].includes(y))
  const V = rows.map(y => H.ang.map(a => ({ p: H.P(a, y), w: wH })))
  const toneAt = (cen) => {
    const l = [(cen[0] - H.origin[0]) / H.hs, (cen[1] - H.origin[1]) / H.hs, (cen[2] - H.origin[2]) / H.hs]
    let k = 1
    const front = l[2] > 0.03, ax = Math.abs(l[0])
    if (front && l[1] < 0.02 && l[1] > -0.05 && ax > 0.03 && ax < 0.065) k *= 1.02                // cheeks warm
    if (l[1] < -0.06) k *= 0.93                                                                     // under jaw
    if (front && l[1] > 0.02 && l[1] < 0.05 && ax > 0.012 && ax < 0.055) k *= 0.88                 // eye sockets shadowed
    if (l[1] > 0.09) k *= 1.03                                                                      // crown catches light
    return mul(skin, k)
  }
  const cTone = (r, c, cen) => {
    const t = toneAt(cen)
    if (o.hair == null && !o.helmet && cen[1] > H.origin[1] + 0.09 * H.hs) t.lerp(C(o.stubble ?? 0x3a2a20), o.stubbleAmt ?? 0.06)
    return t
  }
  S.grid(skinM, V, { wrap: true, color: cTone, jit: 0.025, axis: cen => [H.origin[0], cen[1], H.origin[2] + H.row((cen[1] - H.origin[1]) / H.hs).Z * H.hs] })
  // top + chin caps
  S.fan(skinM, V[V.length - 1], { p: H.abs([0, 0.156, -0.02]), w: wH }, toneAt(H.abs([0, 0.16, 0])), { outward: [0, 1, 0] })
  S.fan(skinM, V[0], { p: H.abs([0, -0.103, 0.058]), w: wH }, mul(skin, 0.85), { outward: [0, -1, 0] })
  buildNose(ctx, H, skin)
  buildEyes(ctx, H, skin)
  buildMouth(ctx, H, skin, lipCol)
  buildEars(ctx, H, skin)
  buildBrows(ctx, H)
  if (o.bindi) S.add(skinM, new THREE.OctahedronGeometry(0.0045 * H.hs, 0), 0xb01a1a, wH, { at: H.P(0, 0.07, 0.002), scale: [1, 1, 0.4] })
  if (o.earring) for (const s of [-1, 1]) S.add(ctx.M.gold, new THREE.OctahedronGeometry(0.006 * H.hs, 0), 0xd4af37, wH, { at: v3.add(H.P(s * 93 * D, -0.02, 0.012), [0, -0.012 * H.hs, 0]) })
  return H
}

function buildNose(ctx, H, skin) {
  const { S, o } = ctx, wH = S.W('head'), m = ctx.M.skin
  const nk = (o.nose ?? 1) * (ctx.spec.child ? 0.72 : ctx.spec.fem ? 0.85 : 1), hook = o.hookNose ? 0.004 : 0
  const zf = y => H.zFront(y)
  // cross-sections (x, z-offset from the face at that height): base, side, ridge
  const secs = [
    [0.047, [0.007, -0.003], [0.0045, 0.0005], 0.002],
    [0.03, [0.0105, -0.004], [0.0072, 0.0055], 0.0105 + hook * 0.5],
    [0.012, [0.0135, -0.004], [0.0088, 0.012], 0.021 + hook],
    [-0.003, [0.0195 * nk, -0.004], [0.0118 * nk, 0.0215 * nk], 0.0335 * nk],
    [-0.0135, [0.0185 * nk, -0.004], [0.0098 * nk, 0.017 * nk], 0.024 * nk],
  ]
  const ring = ([y, base, side, ridge]) => {
    const z0 = zf(y)
    return [[-base[0], y, z0 + base[1]], [-side[0], y, z0 + side[1]], [0, y, z0 + ridge], [side[0], y, z0 + side[1]], [base[0], y, z0 + base[1]]]
      .map(p => ({ p: H.abs(p), w: wH }))
  }
  const R = secs.map(ring)
  const tone = (r, c, cen) => mul(skin, r >= 2 ? 1.03 : 0.99)
  S.grid(m, R.slice().reverse(), { color: tone, jit: 0.02, axis: cen => H.abs([0, (cen[1] - H.origin[1]) / H.hs, zf((cen[1] - H.origin[1]) / H.hs) - 0.02]) })
  // underside: nostrils + columella
  const last = R[R.length - 1]
  const col = { p: H.abs([0, -0.0175, zf(-0.0175) + 0.012 * nk]), w: wH }
  const nostril = mul(skin, 0.45)
  S.fan(m, last, col, mul(skin, 0.82), { outward: [0, -1, 0], closed: false })
  for (const s of [-1, 1]) S.add(m, new THREE.TetrahedronGeometry(0.0042 * nk * H.hs, 0), nostril, wH, { at: H.abs([s * 0.008 * nk, -0.0148, zf(-0.0148) + 0.008 * nk]), scale: [1.1, 0.35, 0.8] })
}

function buildEyes(ctx, H, skin) {
  const { S, o, spec, detail } = ctx, wH = S.W('head'), m = ctx.M.skin
  const child = spec.child, fem = spec.fem
  const ew = (child ? 0.0145 : fem ? 0.0138 : 0.0132) * (o.eyeSize ?? 1), eh = (child ? 0.0075 : fem ? 0.0062 : 0.0055) * (o.eyeOpen ?? 1)
  const white = C(o.blind ? 0xd9d6cf : 0xe6dccb), iris = C(o.blind ? 0xb4bcc0 : (o.eyeColor ?? 0x2e1a0e))
  const lidCol = mul(skin, 0.86), lash = C(o.blind ? mul(skin, 0.55) : 0x15100c)
  const heavy = o.heavyLids ?? (o.stern ? 0.42 : child ? 0.15 : fem ? 0.22 : 0.3)
  const NP = detail >= 2 ? 10 : 8
  for (const s of [-1, 1]) {
    const th = s * 25 * D, y0 = 0.035
    const sock = H.local(th, y0)
    const nrm = v3.norm([Math.sin(th) * 0.55, 0.02, Math.cos(th)])
    const right = v3.norm(v3.cross([0, 1, 0], nrm)), up = v3.cross(nrm, right)
    const centre = v3.mad(sock, nrm, 0.0028)
    // almond outline: inner corner slightly lower, outer corner tilted up (fem/child)
    const tilt = (fem || child ? 0.0015 : 0.0006) * (o.eyeTilt ?? 1)
    const outline = []
    for (let i = 0; i < NP; i++) {
      const a = i / NP * TAU, ca = Math.cos(a), sa = Math.sin(a)
      const xx = ca * ew, side = ca * s   // + toward the outer corner
      const hgt = sa > 0 ? eh * (1 - 0.18 * side) : eh * 0.82 * (1 + 0.1 * side)
      const yy = sa * hgt + tilt * side * 2 - (side < 0 ? 0.0006 : 0)
      outline.push(v3.add(centre, v3.add(v3.scale(right, xx * -s * -1), v3.scale(up, yy))))
    }
    const bulge = v3.mad(centre, nrm, 0.0026)
    const lw = { p: bulge, w: wH }
    const ring = outline.map(p => ({ p: H.abs(p), w: wH }))
    S.fan(m, ring, { p: H.abs(bulge), w: wH }, white, { outward: nrm, jit: 0.015 })
    // iris + pupil + catchlight
    const ic = v3.mad(v3.mad(centre, nrm, 0.0034), up, -heavy * eh * 0.25)
    const ir = (child ? 0.0062 : 0.0054) * (o.irisSize ?? 1)
    const irisRing = []
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; irisRing.push({ p: H.abs(v3.add(ic, v3.add(v3.scale(right, Math.cos(a) * ir), v3.scale(up, Math.sin(a) * ir * 1.05)))), w: wH }) }
    S.fan(m, irisRing, { p: H.abs(v3.mad(ic, nrm, 0.0008)), w: wH }, iris, { outward: nrm, jit: 0.02 })
    if (!o.blind) {
      const pr = ir * 0.45, pupil = []
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; pupil.push({ p: H.abs(v3.add(v3.mad(ic, nrm, 0.0009), v3.add(v3.scale(right, Math.cos(a) * pr), v3.scale(up, Math.sin(a) * pr)))), w: wH }) }
      S.fan(m, pupil, { p: H.abs(v3.mad(ic, nrm, 0.0013)), w: wH }, 0x050302, { outward: nrm, jit: 0 })
      if (detail >= 1) S.add(m, new THREE.TetrahedronGeometry(0.0011 * H.hs, 0), 0xfff4e0, wH, { at: H.abs(v3.add(v3.mad(ic, nrm, 0.0016), v3.add(v3.scale(right, ir * 0.35 * s), v3.scale(up, ir * 0.4)))) })
    } else {
      // clouded film
      S.fan(m, irisRing, { p: H.abs(v3.mad(ic, nrm, 0.0011)), w: wH }, mix(iris, 0xffffff, 0.35), { outward: nrm, jit: 0.04 })
    }
    // upper lid: a curved wedge covering the top of the eye ("heavy, calm eyes")
    const NL = NP / 2 + 1, lidTop = [], lidEdge = [], lashRow = []
    for (let i = 0; i < NL; i++) {
      const a = i / (NL - 1) * Math.PI, ca = Math.cos(a)
      const base = outline[Math.round(a / TAU * NP) % NP]
      const e = v3.mad(v3.mad(base, up, -heavy * eh * Math.sin(a) * 1.6), nrm, 0.0042 * Math.sin(a) + 0.0012)
      const t = v3.mad(v3.mad(base, up, eh * 0.9 + 0.0025 * Math.sin(a)), nrm, 0.002)
      lidEdge.push({ p: H.abs(e), w: wH }); lidTop.push({ p: H.abs(t), w: wH })
      lashRow.push({ p: H.abs(v3.mad(v3.mad(e, up, -0.0009), nrm, 0.0004)), w: wH })
    }
    S.grid(m, [lidEdge, lidTop], { color: lidCol, jit: 0.02, axis: () => H.abs(v3.mad(centre, nrm, -0.02)) })
    S.grid(m, [lashRow, lidEdge], { color: lash, jit: 0, axis: () => H.abs(v3.mad(centre, nrm, -0.02)) })
    // lower lid rim
    if (detail >= 1) {
      const lo = [], lo2 = []
      for (let i = 0; i < NL; i++) {
        const a = Math.PI + i / (NL - 1) * Math.PI
        const base = outline[Math.round(a / TAU * NP) % NP]
        lo.push({ p: H.abs(v3.mad(base, nrm, 0.0016 * Math.abs(Math.sin(a)) + 0.0006)), w: wH })
        lo2.push({ p: H.abs(v3.mad(v3.mad(base, up, -0.0022), nrm, 0.0008)), w: wH })
      }
      S.grid(m, [lo2, lo], { color: mul(skin, 0.93), jit: 0.02, axis: () => H.abs(v3.mad(centre, nrm, -0.02)) })
    }
  }
}

function buildMouth(ctx, H, skin, lipCol) {
  const { S, o, spec } = ctx, wH = S.W('head'), m = ctx.M.skin
  const fem = spec.fem, child = spec.child
  const mw = (child ? 0.019 : fem ? 0.021 : 0.023) * (o.mouthW ?? 1)
  const smile = o.smile ? 0.004 : o.stern ? -0.002 : 0
  const up = fem ? 1.35 : 1, lo = fem ? 1.3 : child ? 1.1 : 1
  const pt = (x, y, out) => { const th = Math.asin(clamp(x / 0.06, -1, 1)) * 1.05; return H.P(th, y, out) }
  const N = 5
  const row = (f) => { const r = []; for (let i = 0; i <= N; i++) { const t = i / N * 2 - 1; r.push({ p: f(t), w: wH }) } return r }
  const yLine = -0.0445
  const corner = t => Math.abs(t)
  // upper lip: from the mouth line up to the philtrum, protruding most at the centre (cupid's bow)
  const ul0 = row(t => pt(t * mw, yLine + corner(t) * smile + 0.0004, 0.0012 + 0.0022 * (1 - t * t) * up))
  const ul1 = row(t => pt(t * mw * 0.92, yLine + 0.0055 * up * (1 - 0.3 * t * t) + corner(t) * smile * 0.8 + (Math.abs(t) < 0.3 ? -0.0008 : 0), 0.0028 * (1 - t * t) * up + 0.0004))
  const ul2 = row(t => pt(t * mw * 0.95, yLine + 0.0085 * up, 0.0002))
  S.grid(m, [ul0, ul1, ul2], { color: (r) => r === 0 ? mul(lipCol, 0.95) : mul(skin, 0.95), jit: 0.02, axis: c => H.abs([0, (c[1] - H.origin[1]) / H.hs, -0.02]) })
  // lower lip
  const ll0 = row(t => pt(t * mw * 0.98, yLine + corner(t) * smile - 0.0004, 0.0012 + 0.0024 * (1 - t * t) * lo))
  const ll1 = row(t => pt(t * mw * 0.82, yLine - 0.0062 * lo * (1 - 0.25 * t * t) + corner(t) * smile * 0.6, 0.0036 * (1 - t * t) * lo + 0.0006))
  const ll2 = row(t => pt(t * mw * 0.75, yLine - 0.011 * lo, 0.0003))
  S.grid(m, [ll2, ll1, ll0], { color: (r) => r === 1 ? lipCol : mul(lipCol, 0.92), jit: 0.02, axis: c => H.abs([0, (c[1] - H.origin[1]) / H.hs, -0.02]) })
  // mouth line
  const ml0 = row(t => pt(t * mw * 1.02, yLine + corner(t) * smile + 0.0006, 0.0016 * (1 - t * t) + 0.0009))
  const ml1 = row(t => pt(t * mw * 1.02, yLine + corner(t) * smile - 0.0006, 0.0016 * (1 - t * t) + 0.0009))
  S.grid(m, [ml1, ml0], { color: mul(lipCol, 0.42), jit: 0, axis: c => H.abs([0, (c[1] - H.origin[1]) / H.hs, -0.02]) })
}

function buildEars(ctx, H, skin) {
  const { S, o, spec } = ctx, wH = S.W('head'), m = ctx.M.skin
  const ek = (o.earSize ?? 1) * (spec.old ? 1.1 : 1) * (spec.child ? 0.95 : 1)
  // outline in (back, up) ear-plane coordinates
  const OUT = [[0.002, 0.03], [0.011, 0.037], [0.022, 0.033], [0.029, 0.017], [0.028, -0.002], [0.021, -0.016], [0.014, -0.027], [0.005, -0.03], [-0.001, -0.017], [-0.002, 0.012]]
  for (const s of [-1, 1]) {
    const th = s * 92 * D, y0 = 0.016
    const anchor = H.local(th, y0)
    const outN = v3.norm([s, 0, -0.18])          // ears face slightly forward
    const back = [0, 0, -1], up = [0, 1, 0]
    const P = (h, v, out) => H.abs(v3.add(anchor, v3.add(v3.add(v3.scale(back, h * ek), v3.scale(up, v * ek)), v3.scale(outN, out))))
    const rim = OUT.map(([h, v]) => ({ p: P(h, v, 0.004 + 0.01 * clamp(h / 0.03, 0, 1) + (v > 0.025 ? 0.002 : 0)), w: wH }))
    const inner = OUT.map(([h, v]) => ({ p: P(0.012 + (h - 0.012) * 0.55, 0.003 + (v - 0.003) * 0.55, 0.004 + 0.004 * clamp(h / 0.03, 0, 1)), w: wH }))
    const root = OUT.map(([h, v]) => ({ p: P(h * 0.6, v * 0.8, -0.003), w: wH }))
    S.grid(m, [inner, rim], { wrap: true, color: mul(skin, 0.97), jit: 0.03, axis: () => H.abs(v3.add(anchor, v3.scale(outN, -0.03))) })
    S.fan(m, inner, { p: P(0.011, 0.002, 0.0015), w: wH }, mix(mul(skin, 0.7), 0x7a3a2a, 0.15), { outward: outN, jit: 0.02 })
    S.grid(m, [root, rim], { wrap: true, color: mul(skin, 0.86), jit: 0.03, axis: () => H.abs(v3.add(anchor, v3.add(v3.scale(outN, -0.03), [0, 0, 0.03]))) })
  }
}

function buildBrows(ctx, H) {
  const { S, o, spec, detail } = ctx, wH = S.W('head'), m = ctx.M.hair
  const col = C(o.brow ?? o.beard ?? o.hair ?? 0x2a1a10)
  const bushy = o.bushyBrows ?? (spec.old ? 1.6 : 1), fem = spec.fem
  const stern = o.stern ? 1 : 0, sad = o.sadBrows ? 1 : 0
  const N = detail >= 2 ? 5 : 3
  for (const s of [-1, 1]) {
    const path = []
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const th = s * lerp(8, fem ? 46 : 47 + (spec.old ? 6 : 0), t) * D
      const arch = Math.sin(t * Math.PI) * (fem ? 0.0045 : 0.0025)
      const y = 0.0565 + arch - stern * 0.004 * (1 - t) + sad * 0.004 * (1 - t) - (spec.old ? 0.003 * t * t : 0) + (fem ? 0.002 : 0)
      const h = (fem ? 0.0034 : 0.0048) * bushy * (1 - 0.45 * t)
      path.push({ p: H.P(th, y, 0.0022 + h * 0.4), w: wH, r: h * 1.15, t: h * 0.55 })
    }
    S.prism(m, path, col, { sides: 4, side: [0, 1, 0], jit: 0.08 })
    if (spec.old && bushy > 1.2 && detail >= 1) for (let i = 0; i < 3; i++) {
      const t = 0.45 + i * 0.22, th = s * lerp(8, 53, t) * D
      const a = H.P(th, 0.058 - 0.002 * i, 0.004)
      S.prism(m, [{ p: a, w: wH, r: 0.0035, t: 0.0018 }, { p: v3.add(a, [s * 0.006 * H.hs, -0.006 * H.hs, 0.003 * H.hs]), w: wH, r: 0.0005, t: 0.0004 }], mix(col, 0xffffff, 0.1), { sides: 3, side: [0, 0, 1] })
    }
  }
}

/* ------------------------------ beards ------------------------------ */
/**
 * Beard shell. b = { color, len (below the chin), thick, cheek (beard line y),
 *   side (sideburn top y), mouth (gap half-angle), jag, moustache, stubble }
 */
export function buildBeard(ctx, H, b) {
  const { S, spec, body, detail } = ctx
  const m = ctx.M.hair, wH = S.W('head')
  const base = C(b.color)
  const thMax = (b.wide ?? 104) * D
  const NC = [10, 14, 18, 22][detail]
  const cols = []
  for (let i = 0; i <= NC; i++) { const t = i / NC * 2 - 1; cols.push(spow(t, 1.15) * thMax) }
  const thick = b.thick ?? 0.014, len = b.len ?? 0.04, jag = b.jag ?? 0.25
  const cheek = b.cheek ?? -0.004, side = b.side ?? 0.03, mouth = (b.mouth ?? 18) * D
  const lowLip = -0.06
  const yTop = th => {
    const a = Math.abs(th)
    if (a > 1.35) return lerp(cheek + 0.012, side, sstep(1.35, 1.6, a))
    if (a > mouth + 0.32) return lerp(cheek - 0.02, cheek + 0.012, sstep(mouth + 0.32, 1.35, a))
    return lerp(lowLip, cheek - 0.02, sstep(mouth, mouth + 0.32, a))
  }
  const yJaw = th => lerp(-0.098, -0.064, sstep(0, 1.4, Math.abs(th))) + sstep(1.4, 1.8, Math.abs(th)) * 0.03
  const nF = detail >= 2 ? 5 : 4, nH = b.len > 0.08 ? (detail >= 2 ? 5 : 3) : 2
  const chestW = S.has('chest') ? S.W('chest') : wH
  const rowsOut = []        // per column: list of {p, w}
  cols.forEach((th, ci) => {
    const a = Math.abs(th), front = Math.pow(Math.max(0, Math.cos(th)), 1.2)
    const y0 = yTop(th), y1 = yJaw(th)
    const colPts = []
    for (let k = 0; k < nF; k++) {
      const t = k / (nF - 1), y = lerp(y0, y1, t)
      const off = lerp(b.edge ?? 0.004, thick * (0.75 + 0.35 * front), Math.pow(t, 0.6)) * (a > 1.55 ? lerp(1, 0.35, sstep(1.55, thMax, a)) : 1)
      colPts.push({ p: H.P(th, y, off), w: wH })
    }
    // hanging part: falls down (and forward over the chest for long beards)
    const tip = len * (0.25 + 0.75 * front) * (1 + jag * ((ci % 2 ? -0.35 : 0.15) + (ci % 3 === 0 ? 0.12 : 0))) + 0.004
    const J0 = colPts[colPts.length - 1].p
    const n0 = v3.norm([Math.sin(th), 0, Math.cos(th)])
    for (let k = 1; k <= nH; k++) {
      const t = k / nH
      let p = v3.add(J0, [0, -tip * t, 0])
      p = v3.mad(p, n0, thick * 0.3 * Math.sin(t * Math.PI) * front + (b.flare ?? 0) * t)
      if (len > 0.08) {
        // keep in front of the chest
        const c = body.torsoP(th * 0.6, p[1], thick + 0.012)
        const need = v3.dot(c, n0) - v3.dot(p, n0)
        if (need > 0) p = v3.mad(p, n0, need)
        p[0] *= 1 - 0.25 * t * (1 - front)   // taper toward the tip
      }
      const w = len > 0.08 ? mixW(wH, chestW, 0.55 * t * t) : wH
      colPts.push({ p, w })
    }
    // underside back to the throat
    const last = colPts[colPts.length - 1].p
    const yU = lerp(last[1], J0[1], 0.55)
    const neck = body.torsoP(th * 0.85, yU, -0.004)
    let under = [lerp(neck[0], last[0], 0.15), yU, lerp(neck[2], last[2], 0.15)]
    if (len > 0.08) under = v3.lerp(last, neck, 0.7)
    colPts.push({ p: under, w: len > 0.08 ? mixW(wH, chestW, 0.4) : wH })
    colPts.push({ p: body.torsoP(th * 0.85, J0[1] - 0.01, -0.006), w: wH })
    rowsOut.push(colPts)
  })
  // grid[row][col]
  const R = rowsOut[0].length
  const G = []
  for (let r = 0; r < R; r++) G.push(rowsOut.map(c => c[r]))
  const tone = (r, c, cen) => {
    const strand = (c % 2 ? 0.92 : 1.04) * (c % 3 === 0 ? 0.96 : 1)
    const lowness = r / (R - 1)
    return mix(mul(base, strand), b.tip ?? base, b.tip != null ? lowness * 0.5 : 0)
  }
  const ax = cen => [H.origin[0], cen[1], H.origin[2] - 0.01]
  S.grid(m, G.slice().reverse(), { color: tone, jit: 0.07, axis: ax })
  // top edge (beard line) — short wall into the skin
  const edgeIn = cols.map((th, ci) => ({ p: H.P(th, yTop(th) - 0.001, -0.003), w: wH }))
  S.grid(m, [edgeIn, G[0]], { color: mul(base, 0.85), jit: 0.05, axis: c => v3.add(ax(c), [0, 0.05, 0]) })
  // side ends
  for (const ci of [0, cols.length - 1]) {
    const col = rowsOut[ci], th = cols[ci]
    const inner = col.map(v => ({ p: v3.mad(v.p, v3.norm([Math.sin(th), 0, Math.cos(th)]), -0.012), w: v.w }))
    S.grid(m, [inner, col].map(x => x), { color: mul(base, 0.8), jit: 0.04, axis: c => [H.origin[0] + (ci ? -0.3 : 0.3), c[1], c[2]] })
  }
  // moustache
  if (b.moustache !== false) {
    const mk = b.moustacheSize ?? 1
    for (const s of [-1, 1]) {
      const pts = [[0.03, -0.0205, 0.009], [0.2, -0.027, 0.0105], [0.36, -0.04, 0.0095], [0.45, -0.056, 0.008], [0.47, -0.072, 0.006]]
      const path = pts.map(([t, y, off], i) => ({ p: H.P(s * t, y, off), w: wH, r: (0.0055 - i * 0.0006) * mk, t: (0.0036 - i * 0.0004) * mk }))
      S.prism(m, path, mul(base, 1.02), { sides: 3, side: [0, 1, 0], jit: 0.06 })
    }
  }
  // long beards: a few loose locks on top for layered depth
  if (len > 0.08 && detail >= 1) {
    const n = detail >= 2 ? 7 : 4
    for (let i = 0; i < n; i++) {
      const th = (i / (n - 1) * 2 - 1) * 0.9, front = Math.cos(th)
      const col = rowsOut[Math.round((th / thMax + 1) / 2 * NC)]
      const a = col[nF - 2].p, z = col[col.length - 3].p
      const dir = v3.norm(v3.sub(z, a)), n0 = v3.norm([Math.sin(th), 0, Math.cos(th)])
      const L = v3.len(v3.sub(z, a)) * (0.85 + 0.25 * ((i * 7) % 3) / 2)
      const path = [0, 0.5, 1].map(t => ({ p: v3.mad(v3.mad(a, dir, L * t), n0, 0.004 + 0.003 * Math.sin(t * Math.PI)), w: mixW(wH, chestW, 0.5 * t * t), r: 0.011 * (1 - 0.8 * t) + 0.002, t: 0.004 * (1 - 0.6 * t) + 0.001 }))
      S.prism(m, path, mix(mul(base, 1.05), 0xffffff, 0.04), { sides: 3, side: [Math.cos(th), 0, -Math.sin(th)], jit: 0.05 })
    }
  }
}

/* ------------------------------ hair ------------------------------ */
/**
 * Scalp shell with a lock-tipped hem, plus style-specific locks.
 * h = { color, style: 'short'|'spiky'|'long'|'ponytail'|'braid'|'bun'|'grey'|'messy',
 *       vol (thickness), hairline (front y), nape (y), len (long hair), part }
 */
export function buildHair(ctx, H, h) {
  const { S, detail, spec } = ctx
  const m = ctx.M.hair, wH = S.W('head'), base = C(h.color)
  const style = h.style || 'short'
  const vol = h.vol ?? (style === 'spiky' || style === 'messy' ? 0.016 : style === 'grey' ? 0.006 : 0.011)
  const hairline = h.hairline ?? (style === 'grey' ? 0.112 : spec.fem ? 0.096 : 0.1)
  const nape = h.nape ?? (style === 'long' || style === 'braid' ? -0.07 : -0.045)
  const overEar = style === 'long' || style === 'braid'
  const yLow = th => {
    const a = Math.abs(th)
    const temple = hairline - 0.012, ear = overEar ? -0.03 : 0.045
    if (a < 0.55) return lerp(hairline, temple, sstep(0, 0.55, a))
    if (a < 1.3) return lerp(temple, overEar ? 0.02 : 0.035, sstep(0.55, 1.3, a))      // down to the sideburn
    if (a < 1.9) return lerp(overEar ? 0.02 : 0.035, ear, sstep(1.3, 1.75, a))          // over / around the ear
    return lerp(ear, nape, sstep(1.9, 2.7, a))
  }
  const cols = H.ang
  const NR = [4, 5, 6, 7][detail]
  const tip = (ci, th) => (h.jag ?? (style === 'spiky' || style === 'messy' ? 0.016 : 0.008)) * ((ci % 2) ? 1 : -0.2)
  const G = []
  for (let r = 0; r <= NR; r++) {
    const row = cols.map((th, ci) => {
      const y0 = yLow(th) - (r === 0 ? tip(ci, th) : 0)
      const t = r / NR, y = lerp(y0, 0.155, Math.pow(t, 0.8))
      const lift = vol * (0.55 + 0.45 * sstep(0, 0.5, t)) * (r === 0 ? 0.7 : 1) + (style === 'grey' && t > 0.6 ? -0.004 : 0)
      return { p: H.P(th, Math.min(y, 0.151), lift + (y > 0.15 ? -0.002 : 0)), w: wH }
    })
    G.push(row)
  }
  const tone = (r, c) => mul(base, (c % 2 ? 0.94 : 1.04) * (r === 0 ? 0.92 : 1) * (1 + 0.04 * r / NR))
  const ax = cen => [H.origin[0], cen[1], H.origin[2] - 0.01]
  S.grid(m, G, { wrap: true, color: tone, jit: 0.08, axis: ax })
  S.fan(m, G[G.length - 1], { p: H.abs([0, 0.158 + vol * 0.8, -0.015]), w: wH }, mul(base, 1.06), { outward: [0, 1, 0] })
  // hem wall into the scalp
  const inner = cols.map((th, ci) => ({ p: H.P(th, yLow(th) + 0.004, -0.003), w: wH }))
  S.grid(m, [inner, G[0]], { wrap: true, color: mul(base, 0.8), jit: 0.05, axis: c => v3.add(ax(c), [0, 0.04, 0]) })
  const lockN = [6, 10, 14, 18][detail]
  const neckW = S.has('neck') ? S.W('neck') : wH, chestW = S.has('chest') ? S.W('chest') : wH
  const lock = (th, y, dir, L, r, opts = {}) => {
    const a = H.P(th, y, vol * 0.6)
    const n = v3.norm(dir)
    const pts = [0, 0.5, 1].map(t => {
      let p = v3.mad(a, n, L * t)
      if (opts.droop) p = v3.add(p, [0, -opts.droop * t * t, 0])
      if (opts.out) p = v3.mad(p, v3.norm([Math.sin(th), 0, Math.cos(th)]), opts.out * Math.sin(t * Math.PI))
      const w = opts.wTo ? mixW(wH, opts.wTo, sstep(0.2, 1, t) * (opts.wAmt ?? 0.6)) : wH
      return { p, w, r: r * (1 - 0.82 * t) + 0.0012, t: r * 0.45 * (1 - 0.7 * t) + 0.0008 }
    })
    S.prism(m, pts, mul(base, 0.95 + 0.1 * ((Math.abs(th * 7) | 0) % 2)), { sides: 3, side: [Math.cos(th), 0, -Math.sin(th)], jit: 0.08, ...opts.prism })
  }
  if (style === 'spiky' || style === 'messy') {
    for (let i = 0; i < lockN; i++) {
      const th = (i / lockN) * TAU + 0.2, y = 0.1 + ((i * 5) % 3) * 0.015
      const n = H.N(th, y)
      lock(th, y, [n[0] * 0.8, 0.55 + ((i * 3) % 2) * 0.2, n[2] * 0.8], 0.05 + ((i * 7) % 3) * 0.012, 0.012)
    }
    for (let i = 0; i < 5; i++) { const th = (i - 2) * 0.22; lock(th, 0.11, [Math.sin(th) * 0.3, -0.25, 0.9], 0.045, 0.011) }
  }
  if (style === 'long') {
    // a curtain of locks down the back and over the shoulders
    const L = h.len ?? 0.3
    const n = lockN + 4
    for (let i = 0; i < n; i++) {
      const th = Math.PI + (i / (n - 1) * 2 - 1) * 1.75
      const y = 0.02 + Math.abs(Math.sin(th)) * 0.02
      const nrm = H.N(th, y)
      lock(th, y, [nrm[0] * 0.25, -1, nrm[2] * 0.45], L * (0.85 + 0.25 * ((i * 5) % 3) / 2), 0.022, { wTo: chestW, wAmt: 0.75, droop: 0, out: 0.012 })
    }
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) lock(s * (62 + i * 14) * D, 0.07 - i * 0.01, [s * 0.35, -1, 0.15], L * (0.5 + i * 0.15), 0.016, { wTo: chestW, wAmt: 0.5, out: 0.008 })
  }
  if (style === 'ponytail') {
    const tie = H.P(Math.PI, 0.06, vol + 0.004)
    S.add(m, new THREE.CylinderGeometry(0.015 * H.hs, 0.016 * H.hs, 0.02 * H.hs, 7), h.tie ?? 0x6a4a2a, wH, { at: tie, rot: [1.25, 0, 0] })
    const L = h.len ?? 0.42
    const path = [0, 0.15, 0.4, 0.7, 1].map((t, i) => ({
      p: v3.add(tie, [0, -L * t + 0.01 * (1 - t), -0.035 * Math.sin(t * 2.2) - 0.008]),
      w: mixW(wH, chestW, sstep(0.1, 0.6, t) * 0.8), r: [0.022, 0.03, 0.028, 0.02, 0.004][i], t: [0.02, 0.026, 0.024, 0.017, 0.004][i],
    }))
    S.prism(m, path, base, { sides: detail >= 2 ? 6 : 5, side: [1, 0, 0], jit: 0.09 })
  }
  if (style === 'bun') {
    const c = H.P(Math.PI, 0.09, vol + 0.02)
    S.add(m, new THREE.IcosahedronGeometry(0.038 * H.hs, detail >= 2 ? 1 : 0), base, wH, { at: c, scale: [1, 0.85, 0.8], jit: 0.09 })
  }
  if (style === 'braid') {
    // centre parting + one thick plait to the waist
    const L = h.len ?? 0.62, links = Math.round(L / 0.05)
    const start = H.P(Math.PI, -0.03, vol + 0.006)
    let prev = start
    for (let i = 0; i < links; i++) {
      const t = i / links, y = -i * 0.05, rr = (0.024 - t * 0.008) * (spec.child ? 0.85 : 1)
      const p = v3.add(start, [0, y, -0.012 - Math.sin(t * 2.4) * 0.03])
      const w = mixW(neckW, chestW, sstep(0.0, 0.25, t))
      for (const s of [-1, 1]) S.add(m, new THREE.OctahedronGeometry(rr * H.hs, 0), mul(base, s > 0 ? 1.02 : 0.94), w, { at: v3.add(p, [s * 0.009, s > 0 ? -0.025 : 0, 0]), rot: [0, 0, s * 0.6], scale: [0.95, 1.45, 0.78] })
      prev = p
    }
    const end = v3.add(prev, [0, -0.04, 0])
    S.add(ctx.M.gold, new THREE.CylinderGeometry(0.012, 0.013, 0.016, 7), h.tie ?? 0xd4af37, chestW, { at: end })
    S.add(m, new THREE.ConeGeometry(0.016, 0.06, 6), base, chestW, { at: v3.add(end, [0, -0.035, 0]), rot: [Math.PI, 0, 0] })
  }
}

/* ------------------------------ helmets ------------------------------ */
/** Open-faced pointed helmet with brim, cheek guards, nasal bar and an optional crest. */
export function buildHelmet(ctx, H, { color, trim = null, crest = null, point = 0.05, cheek = true, nasal = true }) {
  const { S, detail } = ctx
  const mM = ctx.M.metal, wH = S.W('head'), base = C(color)
  const cols = H.ang, NR = [3, 4, 5, 6][detail]
  const yLow = th => lerp(0.068, -0.005, sstep(0.5, 1.6, Math.abs(th)))
  const off = 0.02
  const G = []
  for (let r = 0; r <= NR; r++) {
    const t = r / NR
    G.push(cols.map(th => {
      const y = lerp(yLow(th), 0.15, Math.pow(t, 0.9))
      const p = H.P(th, Math.min(y, 0.15), off + (r === 0 ? 0.004 : 0))
      return { p: v3.add(p, [0, point * Math.pow(t, 3) * H.hs, 0]), w: wH }
    }))
  }
  const ax = cen => [H.origin[0], cen[1], H.origin[2] - 0.01]
  S.grid(mM, G, { wrap: true, color: (r, c) => mul(base, 0.95 + 0.1 * (c % 2) + 0.05 * r / NR), jit: 0.04, axis: ax })
  S.fan(mM, G[G.length - 1], { p: H.abs([0, 0.16 + point + off, -0.012]), w: wH }, mul(base, 1.1), { outward: [0, 1, 0] })
  // brim band (bevelled)
  const band = (y0, o0, o1) => cols.map(th => ({ p: H.P(th, yLow(th) + y0, o0), w: wH }))
  const b0 = band(-0.004, off + 0.006), b1 = band(0.014, off + 0.007), bIn = band(-0.004, -0.002)
  S.grid(trim ? ctx.M.gold : mM, [b0, b1], { wrap: true, color: trim ?? mul(base, 1.15), jit: 0.03, axis: ax })
  S.grid(mM, [bIn, b0], { wrap: true, color: mul(base, 0.6), jit: 0.02, axis: c => v3.add(ax(c), [0, 0.05, 0]) })
  if (cheek) for (const s of [-1, 1]) {
    // hinged cheek plate from the brim down to the jaw
    const ths = [62, 78, 96, 110].map(a => s * a * D)
    const top = ths.map(th => ({ p: H.P(th, yLow(th) - 0.002, off + 0.004), w: wH }))
    const mid = ths.map((th, i) => ({ p: H.P(th, -0.035, off - 0.002 + i * 0.001), w: wH }))
    const bot = ths.map((th, i) => ({ p: H.P(th, -0.072 + i * 0.008, off - 0.006 + i * 0.002), w: wH }))
    const grid = [bot, mid, top]
    S.slab(mM, grid, (r, c) => mul(base, 0.9 + 0.08 * r), { thick: 0.006, normal: p => v3.norm([p[0] - H.origin[0], 0, (p[2] - H.origin[2]) * 0.6]), jit: 0.04 })
  }
  if (nasal) {
    const path = [0.07, 0.035, -0.002].map((y, i) => ({ p: H.P(0, y, 0.024 + 0.003 * (2 - i)), w: wH, r: 0.0065 - i * 0.0008, t: 0.004 }))
    S.prism(mM, path, mul(base, 1.08), { sides: 4, side: [1, 0, 0] })
  }
  if (crest) {
    // horsehair crest sweeping from the brow over the crown and down the back
    const n = [6, 9, 12, 15][detail]
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const th = t < 0.5 ? 0 : Math.PI
      const y = t < 0.5 ? lerp(0.1, 0.17, t * 2) : lerp(0.17, 0.08, (t - 0.5) * 2)
      const along = t < 0.5 ? lerp(0.07, 0.0, t * 2) : -lerp(0.0, 0.09, (t - 0.5) * 2)
      const root = H.abs([0, Math.min(y, 0.16) + point * 0.6 + off, along])
      const hgt = (0.075 + 0.06 * Math.sin(t * Math.PI)) * (crest.size ?? 1)
      const dir = v3.norm([0, 0.8 - t * 0.9, -0.35 - t * 0.8])
      const path = [0, 0.55, 1].map(k => ({ p: v3.add(root, v3.scale(dir, hgt * k * H.hs)), w: wH, r: 0.016 * (1 - 0.7 * k) + 0.002, t: 0.007 * (1 - 0.5 * k) + 0.001 }))
      S.prism(ctx.M.cloth, path, mul(C(crest.color), 0.9 + 0.15 * (i % 2)), { sides: 3, side: [1, 0, 0], jit: 0.08, tipColor: mul(C(crest.color), 1.15) })
    }
    // crest holder
    S.prism(mM, [0.05, 0.14, 0.18].map((y, i) => ({ p: H.abs([0, y + point * 0.6 + off, [0.08, 0.04, -0.02][i]]), w: wH, r: 0.008, t: 0.012 })), trim ?? mul(base, 1.2), { sides: 4, side: [1, 0, 0] })
  }
}
