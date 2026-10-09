import * as THREE from 'three'
import { C, mul, mix, lerp, clamp, sstep, bump, adiff, mixW, normW, v3, avg } from './mesh'
import { Body, SIDES, footProfile } from './body'

/* ===========================================================================
   Garments. Everything here is built from three shell primitives that sample
   the body surface with an offset (so cloth and armour fit every muscle):

     torsoShell(ctx, opts)          shirts, robe tops, wraps, cuirasses, sashes
     limbShell(ctx, limb, s, opts)  sleeves, trousers, bracers, greaves, straps
     skirtShell(ctx, opts)          robes/skirts/tabards hanging on the skirt rig

   Shells are CLOSED (outer surface + walls into the body, or an inner layer
   for free-hanging cloth), so they render single-sided without holes and cast
   clean shadows. Free cloth (skirts, sash tails, capes) is weighted to the
   procedural cloth bones (skirt{k}a/b, cape{c}_{s}) that Humanoid drives.
=========================================================================== */

const TAU = Math.PI * 2

/* ------------------------------ rig planning ------------------------------ */
export const SKIRT_CHAINS = 8
export function rigPlan(o) {
  const skirt = !!(o.robe || o.skirt || o.dress || o.dhoti || o.apron || o.armor != null || o.tabard || o.tunic || o.kilt)
  const capeLen = o.cape != null ? (o.shortCape ? 0.62 : o.capeLen ?? 1.18) : 0
  return {
    skirt: skirt ? { chains: SKIRT_CHAINS, pivot: 1.05, upper: 0.36, radius: a => 0.17 + 0.012 * Math.abs(Math.sin(a)) } : null,
    cape: o.cape != null ? { cols: 3, segs: 3, top: 1.53, z: -0.16, width: 0.58 * (o.bulk ?? 1) ** 0.7, len: capeLen } : null,
  }
}

/* ------------------------------ walls ------------------------------ */
/** Quad strip between an outer polyline A and inner polyline B; faces point away from ref(k). */
export function wall(S, m, A, B, color, ref, { jit = 0.03, closed = false } = {}) {
  const n = A.length
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const k1 = (k + 1) % n
    const a = A[k], b = A[k1], c = B[k1], d = B[k]
    const nrm = v3.cross(v3.sub(b.p, a.p), v3.sub(d.p, a.p))
    const mid = avg([a.p, b.p, c.p, d.p])
    const r = ref(k, mid)
    const col = S.shade(typeof color === 'function' ? C(color(k)) : C(color), jit).clone()
    if (v3.dot(nrm, v3.sub(mid, r)) >= 0) S.quad(m, a.p, b.p, c.p, d.p, col, a.w, b.w, c.w, d.w)
    else S.quad(m, a.p, d.p, c.p, b.p, col, a.w, d.w, c.w, b.w)
  }
}

/* ------------------------------ torso shell ------------------------------ */
/**
 * opts: m, color (hex | (θ,y,j,i) → hex), ys (ascending), range(y) → [a0, a1] (a1 > a0; omit = closed),
 *       off (number | (θ,y,j,i) → metres), cols, bevel (top/bottom chamfer), walls {top,bottom,sides},
 *       wallColor, jit, wFn (custom weights), twoTone
 * returns the vertex grid
 */
export function torsoShell(ctx, o) {
  const { S, body } = ctx
  const closed = !o.range
  const cols = o.cols ?? 18
  const ys = o.ys
  const offF = typeof o.off === 'function' ? o.off : () => o.off ?? 0.012
  const bevel = o.bevel ?? 0
  const G = ys.map((y, i) => {
    const [a0, a1] = closed ? [0, TAU] : o.range(y, i)
    const row = []
    const n = closed ? cols : cols + 1
    for (let j = 0; j < n; j++) {
      const th = a0 + (a1 - a0) * j / cols
      let off = offF(th, y, j, i)
      if (bevel && (i === 0 || i === ys.length - 1)) off -= bevel
      const p = body.torsoP(th, y, off)
      const w = o.wFn ? o.wFn(th, y, p) : body.torsoW(body.torsoP(th, y, 0))
      row.push({ p, w, th, y })
    }
    return row
  })
  const colorF = typeof o.color === 'function' ? (r, c) => { const v = G[r][c], v2 = G[r + 1][(c + 1) % G[r + 1].length]; return o.color((v.th + v2.th) / 2, (v.y + v2.y) / 2, c, r) } : o.color
  S.grid(o.m, G, { wrap: closed, color: colorF, jit: o.jit ?? 0.04, twoTone: o.twoTone ?? 0, axis: cen => [0, cen[1], body.torsoZ(cen[1])] })
  const W = o.walls ?? { top: true, bottom: true, sides: !closed }
  const wc = o.wallColor ?? (typeof o.color === 'function' ? mul(o.color(0, ys[0], 0, 0), 0.7) : mul(o.color, 0.7))
  const inner = (row, d = -0.004) => row.map(v => ({ p: body.torsoP(v.th, v.y, d), w: v.w }))
  if (W.bottom) wall(S, o.m, G[0], inner(G[0]), wc, (k, mid) => [0, mid[1] + 0.1, body.torsoZ(mid[1])], { closed })
  if (W.top) wall(S, o.m, G[G.length - 1], inner(G[G.length - 1]), wc, (k, mid) => [0, mid[1] - 0.1, body.torsoZ(mid[1])], { closed })
  if (W.sides && !closed) {
    const first = G.map(r => r[0]), last = G.map(r => r[r.length - 1])
    const second = G.map(r => r[1]), prev = G.map(r => r[r.length - 2])
    wall(S, o.m, first, inner(first), wc, k => second[k].p)
    wall(S, o.m, last, inner(last), wc, k => prev[k].p)
  }
  return G
}

/* ------------------------------ limb shell ------------------------------ */
/** Same as torsoShell along an arm/leg: us ascending (downwards), range(u) optional. */
export function limbShell(ctx, limb, s, o) {
  const { S, body } = ctx
  const closed = !o.range
  const cols = o.cols ?? 12
  const offF = typeof o.off === 'function' ? o.off : () => o.off ?? 0.01
  const bevel = o.bevel ?? 0
  const G = o.us.map((u, i) => {
    const [a0, a1] = closed ? [0, TAU] : o.range(u, i)
    const row = [], n = closed ? cols : cols + 1
    for (let j = 0; j < n; j++) {
      const th = a0 + (a1 - a0) * j / cols
      let off = offF(th, u, j, i)
      if (bevel && (i === 0 || i === o.us.length - 1)) off -= bevel
      row.push({ p: body.limbP(limb, s, th, u, off), w: o.wFn ? o.wFn(th, u) : body.limbW(limb, s, u), th, u })
    }
    return row
  })
  const r0 = body.limbRoot(limb, s)
  const axis = cen => [r0[0] + s * body.limbR(limb, r0[1] - cen[1]).ox, cen[1], 0]
  const colorF = typeof o.color === 'function' ? (r, c) => { const v = G[r][c]; return o.color(v.th, v.u, c, r) } : o.color
  S.grid(o.m, G, { wrap: closed, color: colorF, jit: o.jit ?? 0.04, axis })
  const W = o.walls ?? { top: true, bottom: true, sides: !closed }
  const wc = o.wallColor ?? (typeof o.color === 'function' ? mul(o.color(0, o.us[0], 0, 0), 0.7) : mul(o.color, 0.7))
  const inner = row => row.map(v => ({ p: body.limbP(limb, s, v.th, v.u, -0.004), w: v.w }))
  if (W.top) wall(S, o.m, G[0], inner(G[0]), wc, (k, mid) => [axis(mid)[0], mid[1] - 0.1, 0], { closed })
  if (W.bottom) wall(S, o.m, G[G.length - 1], inner(G[G.length - 1]), wc, (k, mid) => [axis(mid)[0], mid[1] + 0.1, 0], { closed })
  if (W.sides && !closed) {
    const first = G.map(r => r[0]), last = G.map(r => r[r.length - 1])
    wall(S, o.m, first, inner(first), wc, k => G[k][1].p)
    wall(S, o.m, last, inner(last), wc, k => G[k][G[k].length - 2].p)
  }
  return G
}

/* ------------------------------ skirt rig weights ------------------------------ */
export function skirtW(ctx, th, y) {
  const { S, rig } = ctx
  const R = rig.skirt, K = R.chains
  let a = th % TAU; if (a < 0) a += TAU
  const f = a / TAU * K, k0 = Math.floor(f) % K, k1 = (k0 + 1) % K, t = f - Math.floor(f)
  const up = normW([[S.bi('skirt' + k0 + 'a'), 1 - t], [S.bi('skirt' + k1 + 'a'), t]])
  const lo = normW([[S.bi('skirt' + k0 + 'b'), 1 - t], [S.bi('skirt' + k1 + 'b'), t]])
  const s = R.pivot - y
  let w = mixW(S.W('hips'), up, sstep(-0.04, 0.05, s))
  w = mixW(w, lo, sstep(R.upper - 0.08, R.upper + 0.06, s))
  return w
}
/** cape weights by lateral position and drop below the cape top */
export function capeW(ctx, x, y) {
  const { S, rig } = ctx
  const R = rig.cape
  const f = clamp((x / R.width + 0.5) * (R.cols - 1), 0, R.cols - 1 - 1e-6), i0 = Math.floor(f), t = f - i0
  const seg = clamp((R.top - y) / (R.len / R.segs), 0, R.segs - 1e-6)
  const j0 = Math.floor(seg), tj = seg - j0
  const col = (i, j) => S.bi('cape' + i + '_' + Math.min(R.segs - 1, j))
  const list = [[col(i0, j0), (1 - t) * (1 - tj)], [col(i0 + 1, j0), t * (1 - tj)], [col(i0, j0 + 1), (1 - t) * tj], [col(i0 + 1, j0 + 1), t * tj]]
  const w = normW(list)
  // top edge stays on the chest
  return mixW(w, S.W('chest'), 1 - sstep(R.top - 0.06, R.top - 0.16, y))
}

/* ------------------------------ skirts ------------------------------ */
/**
 * Free-hanging garment around the hips on the skirt rig.
 *  top / hem (y), color, inner (colour of the lining), folds (count), foldAmp, flare (radius gain at the hem),
 *  hemJag(θ, j) → dy, range [a0,a1] (open wrap / apron panel), off (clearance over the body at the top),
 *  stripe(θ, y) → colour override (borders), m
 */
export function skirtShell(ctx, o) {
  const { S, body, detail } = ctx
  const m = o.m ?? ctx.M.cloth
  const rows = o.rows ?? [3, 4, 5, 6][detail]
  const cols = o.cols ?? [20, 26, 32, 38][detail]
  const closed = !o.range
  const [a0, a1] = o.range ?? [0, TAU]
  const top = o.top ?? 1.035, hemY = o.hem ?? 0.38
  const folds = o.folds ?? 12, amp = o.foldAmp ?? 0.018
  const r = ctx.S.r
  const foldPhase = []
  for (let j = 0; j <= cols; j++) foldPhase.push(0.6 + 0.4 * r())
  const flare = o.flare ?? 0.1
  // body clearance radius at height y in direction θ
  const surf = (th, y, extra) => {
    const yy = Math.max(y, 0.88)
    const p = body.torsoP(th, yy, (o.off ?? 0.02) + extra)
    return p
  }
  const G = []
  for (let i = 0; i <= rows; i++) {
    const t = i / rows
    const row = []
    const n = closed ? cols : cols + 1
    for (let j = 0; j < n; j++) {
      const th = a0 + (a1 - a0) * j / cols
      const hem = hemY + (o.hemJag ? o.hemJag(th, j) : 0)
      const y = lerp(top, hem, Math.pow(t, o.curve ?? 1))
      // radius: hug the hips, then flare out (sides flare a little more)
      const below = sstep(0.95, hem, y)
      const fl = flare * Math.pow(below, 0.85) * (1 + 0.25 * Math.abs(Math.sin(th)))
      const fold = amp * Math.pow(t, 0.7) * (j % 2 ? 1 : -0.6) * foldPhase[j] * (o.foldMask ? o.foldMask(th) : 1)
      const p0 = surf(th, y, 0)
      const ctr = [0, y, body.torsoZ(Math.max(y, 0.88))]
      const dir = v3.norm([p0[0] - ctr[0], 0, p0[2] - ctr[2]])
      let p = v3.mad(p0, dir, fl + fold)
      p[1] = y // torso samples clamp their radius below the hips, not their height
      if (o.lean) p = v3.add(p, [0, 0, o.lean * below])
      row.push({ p, w: o.wFn ? o.wFn(th, y) : skirtW(ctx, th, y), th, y, t })
    }
    G.push(row)
  }
  const color = o.color
  const colorF = (r, c) => {
    const v = G[r][c], y = v.y
    let col = typeof color === 'function' ? C(color(v.th, y, c, r)) : C(color)
    if (o.stripe) { const s2 = o.stripe(v.th, y, r, c, rows); if (s2 != null) col = C(s2) }
    return mul(col, (c % 2 ? 0.93 : 1.03) * (1 - 0.1 * G[r][c].t * (o.shadeDown ?? 1)))
  }
  // outer surface (rows go DOWN, so let the axis orient the faces)
  S.grid(m, G, { wrap: closed, color: colorF, jit: o.jit ?? 0.05, axis: cen => [0, cen[1], body.torsoZ(Math.max(cen[1], 0.88))] })
  // lining (slightly inside), rim along the hem and open edges
  const thick = o.thick ?? 0.008
  const lining = G.map(row => row.map(v => {
    const ctr = [0, v.y, body.torsoZ(Math.max(v.y, 0.88))]
    const d = v3.norm([v.p[0] - ctr[0], 0, v.p[2] - ctr[2]])
    return { p: v3.mad(v.p, d, -thick), w: v.w, th: v.th, y: v.y }
  }))
  const linCol = o.inner ?? mul(typeof color === 'function' ? color(0, top, 0, 0) : color, 0.55)
  S.grid(m, lining, { wrap: closed, color: linCol, jit: 0.04, inward: true, axis: cen => [0, cen[1], body.torsoZ(Math.max(cen[1], 0.88))] })
  const hemRow = G[G.length - 1], hemIn = lining[lining.length - 1]
  wall(S, m, hemRow, hemIn, o.hemColor ?? mul(linCol, 1.2), (k, mid) => [mid[0], mid[1] + 0.2, mid[2]], { closed })
  wall(S, m, G[0], lining[0], mul(linCol, 0.8), (k, mid) => [mid[0], mid[1] - 0.2, mid[2]], { closed })
  if (!closed) {
    const e0 = G.map(r => r[0]), l0 = lining.map(r => r[0]), e1 = G.map(r => r[r.length - 1]), l1 = lining.map(r => r[r.length - 1])
    wall(S, m, e0, l0, o.edgeColor ?? mul(linCol, 1.1), k => G[k][1].p)
    wall(S, m, e1, l1, o.edgeColor ?? mul(linCol, 1.1), k => G[k][G[k].length - 2].p)
  }
  return G
}

/* ------------------------------ hanging strips ------------------------------ */
/**
 * Flat hanging cloth strip (sash tail, tabard, apron panel, stole end) from a start point on the body.
 * path: list of [θ, y, off, width] samples (θ around the torso; y descending). Weighted to the skirt rig
 * below the pivot (or `wFn`). Thick slab with a pointed / frayed end.
 */
export function strip(ctx, { m, color, back = null, path, thick = 0.007, point = 0.0, fringe = null, wFn = null, stripes = null }) {
  const { S, body } = ctx
  const rows = path.map(([th, y, off, wd], i) => {
    const c = body.torsoP(th, Math.max(y, 0.88), 0)
    const ctr = [0, y, body.torsoZ(Math.max(y, 0.88))]
    const n = v3.norm([c[0] - ctr[0], 0, c[2] - ctr[2]])
    const tangent = v3.norm([n[2], 0, -n[0]])
    const base = v3.add(v3.mad([c[0], y, c[2]], n, off), [0, 0, 0])
    const w = wFn ? wFn(th, y) : (ctx.rig.skirt && y < ctx.rig.skirt.pivot + 0.02 ? skirtW(ctx, th, y) : body.torsoW([c[0], y, c[2]]))
    const half = wd / 2
    const last = i === path.length - 1
    const l = v3.mad(base, tangent, -half), r = v3.mad(base, tangent, half)
    if (last && point) { const mid = v3.add(base, [0, -point, 0]); return [{ p: l, w, n }, { p: mid, w, n }, { p: r, w, n }] }
    return [{ p: l, w, n }, { p: base, w, n }, { p: r, w, n }]
  })
  const colF = stripes ? (r, c) => stripes(r, c) : (r, c) => mul(color, c % 2 ? 0.94 : 1.04)
  S.slab(m, rows, colF, { thick, normal: null, back, jit: 0.05, ...{} , normalFn: null })
  if (fringe) {
    const end = rows[rows.length - 1]
    const n = 5
    for (let i = 0; i < n; i++) {
      const p = v3.lerp(end[0].p, end[2].p, (i + 0.5) / n)
      S.prism(m, [{ p, w: end[1].w, r: 0.004, t: 0.002 }, { p: v3.add(p, [0, -fringe, 0]), w: end[1].w, r: 0.0012, t: 0.001 }], mul(color, 1.05), { sides: 3, side: end[1].n })
    }
  }
  return rows
}

/* ------------------------------ footwear ------------------------------ */
/** foot surface point for footwear: a (0 top, π sole, +π/2 lateral), z along the foot */
export function footP(ctx, s, a, z, off = 0, sole = 0) {
  const F = footProfile(ctx.spec, s, sole)
  const R = F.rings
  let r = R[0]
  if (z >= R[R.length - 1].z) r = R[R.length - 1]
  else for (let i = 0; i < R.length - 1; i++) if (z <= R[i + 1].z && z >= R[i].z) { const t = (z - R[i].z) / (R[i + 1].z - R[i].z); r = {}; for (const k in R[i]) r[k] = lerp(R[i][k], R[i + 1][k], t); break }
  const ca = Math.cos(a), sa = Math.sin(a)
  const mid = (r.top + r.bot) / 2
  const yy = ca >= 0 ? lerp(mid, r.top + off, Math.pow(Math.abs(ca), 0.8)) : lerp(mid, r.bot - off, Math.pow(Math.abs(ca), 0.35))
  const hw = r.hw + off
  return F.P(r.cx + Math.sign(sa) * Math.pow(Math.abs(sa), 0.8) * hw, yy, z)
}
export function sandals(ctx, { color = 0x5a3a22, sole = 0.014, dark = 0x2e1e14 } = {}) {
  const { S, spec, body, detail } = ctx
  const m = ctx.M.leather
  for (const [Sd, s] of SIDES) {
    const wF = S.W('foot' + Sd)
    const F = footProfile(spec, s, sole)
    // sole outline (perimeter) slightly larger than the foot
    const outline = []
    const zs = [-0.072, -0.05, -0.015, 0.03, 0.08, 0.125, 0.165, 0.2, 0.218]
    const hw = z => z < -0.06 ? 0.026 : z > 0.2 ? 0.03 : z > 0.16 ? 0.05 : footP(ctx, s, Math.PI / 2, Math.min(z, 0.15), 0, sole)[0]
    for (const z of zs) { const x = Math.abs(footP(ctx, s, Math.PI / 2, Math.min(z, 0.15), 0, sole)[0] - F.ax) / F.fk; const w = z > 0.17 ? lerp(0.05, 0.022, (z - 0.17) / 0.05) : z < -0.06 ? 0.024 : x; outline.push([w + 0.005, z]) }
    const ring = []
    for (const [w, z] of outline) ring.push([w + (z > 0.1 ? 0.003 : 0), z])
    const L = [...ring.map(([w, z]) => [-(w - 0.004), z]).reverse(), ...ring.map(([w, z]) => [w, z])]   // medial (−x) to lateral
    const yTop = F.bot, yBot = F.bot - sole
    const pts = (y) => L.map(([x, z]) => ({ p: F.P(x + 0.004, y - F.ay + F.ay, z), w: wF }))
    const top = L.map(([x, z]) => ({ p: [F.ax + s * (x + 0.004) * F.fk, F.ay + yTop, z * F.fk], w: wF }))
    const bot = L.map(([x, z]) => ({ p: [F.ax + s * (x + 0.004) * F.fk, F.ay + yBot, z * F.fk], w: wF }))
    const c = { p: [F.ax + s * 0.006 * F.fk, F.ay + yTop, 0.07 * F.fk], w: wF }, cb = { p: [F.ax + s * 0.006 * F.fk, F.ay + yBot, 0.07 * F.fk], w: wF }
    S.fan(m, top, c, C(color), { outward: [0, 1, 0] })
    S.fan(m, bot, cb, C(dark), { outward: [0, -1, 0] })
    wall(S, m, top, bot, mul(dark, 1.2), (k, mid) => [F.ax + s * 0.006 * F.fk, mid[1], 0.07 * F.fk], { closed: true })
    // straps: toe band, crossed instep straps, heel + ankle strap
    const band = (z0, z1, off = 0.0035, aMax = 1.75) => {
      const N = 7
      const rowF = z => { const r = []; for (let i = 0; i <= N; i++) { const a = -aMax + 2 * aMax * i / N; r.push({ p: footP(ctx, s, a * s, z, off, sole), w: wF }) } return r }
      const A = rowF(z0), B = rowF(z1)
      S.grid(m, [A, B], { color: C(color), jit: 0.05, axis: cen => [F.ax, F.ay - 0.04, cen[2]] })
      wall(S, m, A, A.map(v => ({ p: v3.add(v.p, [0, 0, (z1 > z0 ? 0 : 0)]), w: v.w })).map((v, i) => ({ p: footP(ctx, s, (-aMax + 2 * aMax * i / N) * s, z0, -0.002, sole), w: wF })), mul(color, 0.7), (k, mid) => [mid[0], mid[1], mid[2] + (z1 - z0)])
      wall(S, m, B, B.map((v, i) => ({ p: footP(ctx, s, (-aMax + 2 * aMax * i / N) * s, z1, -0.002, sole), w: wF })), mul(color, 0.7), (k, mid) => [mid[0], mid[1], mid[2] - (z1 - z0)])
    }
    band(0.108, 0.13, 0.004)
    if (detail >= 1) {
      // X over the instep
      for (const dir of [-1, 1]) {
        const path = []
        const N = 5
        for (let i = 0; i <= N; i++) { const t = i / N, a = lerp(-1.6, 1.6, t) * dir, z = lerp(0.005, 0.07, t); path.push({ p: footP(ctx, s, a * s, z, 0.004 + (dir > 0 ? 0.0015 : 0), sole), w: wF, r: 0.0075, t: 0.0022 }) }
        S.prism(m, path, mul(color, dir > 0 ? 1 : 0.92), { sides: 4, side: [0, 0, 1], cap: true })
      }
    }
    // heel strap rising to an ankle strap
    const heel = [{ p: footP(ctx, s, Math.PI, -0.066, 0.004, sole), w: wF, r: 0.009, t: 0.0025 }, { p: footP(ctx, s, Math.PI * 0.85, -0.06, 0.004, sole), w: wF, r: 0.009, t: 0.0025 }, { p: v3.add(footP(ctx, s, 0, -0.045, 0.004, sole), [0, 0.03, -0.012]), w: wF, r: 0.009, t: 0.0025 }]
    S.prism(m, heel, mul(color, 0.95), { sides: 4, side: [1, 0, 0] })
    limbShell(ctx, 'leg', s, { m, us: [0.8, 0.825], off: 0.004, cols: detail >= 2 ? 10 : 8, color: C(color), wallColor: mul(color, 0.7) })
  }
}
/** Boots: a leg shell from `top` (u) to the ankle + a shoe shell over the foot. */
export function boots(ctx, { color = 0x3a2418, top = 0.62, sole = 0.022, cuff = null, m = null, soleColor = 0x1e1612, metal = false } = {}) {
  const { S, spec, detail } = ctx
  const mm = m || ctx.M.leather
  for (const [Sd, s] of SIDES) {
    const wF = S.W('foot' + Sd)
    limbShell(ctx, 'leg', s, { m: mm, us: [top, (top + 0.84) / 2, 0.8, 0.86], off: (th, u) => 0.008 + (u < top + 0.02 ? 0.003 : 0), cols: detail >= 2 ? 12 : 9, color: (th, u, j) => mul(color, j % 2 ? 0.95 : 1.03), walls: { top: true, bottom: false } })
    if (cuff) limbShell(ctx, 'leg', s, { m: mm, us: [top - 0.012, top + 0.03], off: 0.014, cols: detail >= 2 ? 12 : 9, color: cuff, bevel: 0.003 })
    // shoe: foot-shaped shell
    const zs = [-0.07, -0.05, -0.015, 0.03, 0.08, 0.125, 0.15]
    const NA = detail >= 2 ? 10 : 8
    const G = zs.map(z => { const row = []; for (let i = 0; i < NA; i++) { const a = i / NA * TAU; row.push({ p: footP(ctx, s, a, z, 0.006, sole - 0.006), w: wF }) } return row })
    // toe cap
    const F = footProfile(spec, s, sole)
    const toe = []
    for (let i = 0; i < NA; i++) { const a = i / NA * TAU, ca = Math.cos(a), sa = Math.sin(a); toe.push({ p: F.P(0.006 + sa * 0.04, F.bot + 0.024 + ca * 0.022 * (ca > 0 ? 1 : 0.9), 0.2), w: wF }) }
    G.push(toe)
    S.grid(mm, G, { wrap: true, color: (r, c) => mul(color, (c % 2 ? 0.94 : 1.04) * (r > 5 ? 1.05 : 1)), jit: 0.04, axis: cen => [F.ax, F.ay + F.bot + 0.04, cen[2]] })
    S.fan(mm, toe, { p: F.P(0.006, F.bot + 0.02, 0.222), w: wF }, mul(color, 1.05), { outward: [0, 0, 1] })
    S.fan(mm, G[0], { p: F.P(0, F.bot + 0.03, -0.082), w: wF }, mul(color, 0.9), { outward: [0, 0, -1] })
    // sole + heel
    const sl = [-0.08, -0.05, 0.03, 0.12, 0.2, 0.225]
    const half = [0.032, 0.04, 0.046, 0.056, 0.048, 0.02]
    const top0 = [], bot0 = []
    const ring = []
    for (let i = 0; i < sl.length; i++) ring.push([half[i], sl[i]])
    const Lp = [...ring.map(([w, z]) => [-w, z]).reverse(), ...ring]
    for (const [x, z] of Lp) { top0.push({ p: F.P(0.006 + x, F.bot - sole + 0.012, z), w: wF }); bot0.push({ p: F.P(0.006 + x, F.bot - sole, z), w: wF }) }
    const cT = { p: F.P(0.006, F.bot - sole + 0.012, 0.07), w: wF }, cB = { p: F.P(0.006, F.bot - sole, 0.07), w: wF }
    S.fan(mm, bot0, cB, C(soleColor), { outward: [0, -1, 0] })
    S.fan(mm, top0, cT, C(soleColor), { outward: [0, 1, 0] })
    wall(S, mm, top0, bot0, mul(soleColor, 1.3), (k, mid) => [cT.p[0], mid[1], cT.p[2]], { closed: true })
  }
}

/* ------------------------------ beads & jewellery ------------------------------ */
export function wristBeads(ctx, { color = 0x5a3620, rows = 2, size = 0.0085, sides = 'both' } = {}) {
  const { S, body, detail } = ctx
  const n = [7, 9, 11, 12][detail]
  const list = sides === 'both' ? SIDES : SIDES.filter(([Sd]) => Sd === sides)
  for (const [, s] of list) for (let r = 0; r < (detail === 0 ? 1 : rows); r++) {
    const u = 0.522 + r * 0.021
    for (let i = 0; i < n; i++) {
      const th = (i + r * 0.5) / n * TAU
      const p = body.limbP('arm', s, th, u, size * 0.75)
      const tone = mul(color, 0.85 + 0.3 * ((i * 7 + r) % 3) / 2)
      S.add(ctx.M.wood, new THREE.IcosahedronGeometry(size, 0), tone, body.limbW('arm', s, u), { at: p, rot: [i, r, i * 0.5], jit: 0.08 })
    }
  }
}
/** Long prayer-bead mala around the neck, hanging on the chest, with a tassel. */
export function mala(ctx, { color = 0x5a3620, n = 34, drop = 1.16, size = 0.011, tassel = 0x8a3a1a } = {}) {
  const { S, body, detail } = ctx
  const count = Math.round(n * [0.55, 0.75, 1, 1.15][detail])
  const pts = []
  for (let i = 0; i <= count; i++) {
    const t = i / count               // 0..1 around the loop, 0.5 = bottom of the V
    const k = Math.abs(t - 0.5) * 2   // 1 at the back of the neck, 0 at the bottom
    const side = t < 0.5 ? 1 : -1
    let th, y
    if (k > 0.72) { const q = (k - 0.72) / 0.28; th = side * lerp(0.75, Math.PI - 0.15, q); y = lerp(1.585, 1.6, q) }
    else { const q = k / 0.72; th = side * lerp(0.05, 0.75, Math.pow(q, 1.4)); y = lerp(drop, 1.585, Math.pow(q, 0.8)) }
    pts.push([th, y])
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [th, y] = pts[i]
    const p = body.torsoP(th, y, size * 0.9 + (y > 1.5 ? 0.008 : 0.016))
    S.add(ctx.M.wood, new THREE.IcosahedronGeometry(size * (i % 9 === 0 ? 1.3 : 1), 0), mul(color, 0.85 + 0.3 * ((i * 5) % 3) / 2), body.torsoW(p), { at: p, rot: [i, i * 2, 0], jit: 0.08 })
  }
  // guru bead + tassel
  const b = body.torsoP(0, drop - 0.025, 0.02)
  const wB = body.torsoW(b)
  S.add(ctx.M.wood, new THREE.IcosahedronGeometry(size * 1.5, 0), mul(color, 1.1), wB, { at: b })
  S.add(ctx.M.cloth, new THREE.ConeGeometry(size * 1.4, 0.07, 6), C(tassel), wB, { at: v3.add(b, [0, -0.045, 0.002]) })
}

/* ------------------------------ armour helpers ------------------------------ */
/** trim strip along a row of shell vertices (gold edging) */
export function trimRow(ctx, row, { m, color, r = 0.004, t = 0.003, lift = 0.003, closed = false }) {
  const { S } = ctx
  const pts = row.map(v => ({ p: v.p, w: v.w }))
  if (closed) pts.push(pts[0])
  const path = pts.map((v, i) => ({ p: v.p, w: v.w, r, t }))
  S.prism(m, path, color, { sides: 4, cap: !closed, jit: 0.04 })
}

/* ------------------------------ finished cast garments ------------------------------ */
/** Reference garments share body samples/weights, including sleeves and armor. */
export function dressCharacter(ctx) {
  const { S, body, o, spec, detail, M } = ctx
  const cloth = o.cloth ?? 0x6b3a1e, leather = 0x4a3020
  const NT = [12, 16, 20, 24][detail], NL = [8, 10, 12, 14][detail]
  const trim = o.crown ? 0xc9a24a : 0xb6975b
  const torso = (color, ys, extra = {}) => torsoShell(ctx, { m: M.cloth, color, ys, cols: NT, off: 0.013, bevel: 0.002, ...extra })
  const sleeve = (s, color, end, extra = {}) => limbShell(ctx, 'arm', s, { m: M.cloth, color, us: [-0.045, 0.015, end * 0.62, end], cols: NL, off: 0.015, ...extra })
  const belt = (color, y = 1.035, height = 0.055) => torso(color, [y - height / 2, y, y + height / 2], { m: M.leather, off: 0.025, cols: NT, twoTone: 0.07 })
  const buckle = (y = 1.035, width = 0.04) => {
    const p = body.torsoP(0, y, 0.032)
    S.add(M.gold, new THREE.BoxGeometry(width, width * 0.9, 0.014), trim, body.torsoW(p), { at: p, grad: 0.08 })
    S.add(M.leather, new THREE.BoxGeometry(width * 0.56, width * 0.48, 0.016), leather, body.torsoW(p), { at: v3.add(p, [0, 0, 0.006]) })
  }
  const skirt = (color, hem, extra = {}) => skirtShell(ctx, { color, top: 1.035, hem, flare: 0.1, folds: 12, ...extra })
  const trousers = (color, shorts = false) => {
    torso(color, [0.88, 0.925, 1.015], { m: M.cloth, off: 0.016, walls: { top: true, bottom: false } })
    for (const [, s] of SIDES) limbShell(ctx, 'leg', s, {
      m: M.cloth, color: (th, u, j) => mul(color, j % 2 ? 0.94 : 1.03),
      us: shorts ? [-0.04, 0.06, 0.17, 0.285] : [-0.04, 0.05, 0.19, 0.34, 0.49, 0.63, 0.79, 0.86],
      off: (th, u) => o.baggy ? 0.015 + 0.025 * bump((u - 0.45) / 0.4) : 0.012,
      cols: NL, bevel: 0.003, walls: { top: false, bottom: true },
    })
  }
  const shirt = (color, long = false) => {
    torso(color, [1.015, 1.07, 1.17, 1.29, 1.4, 1.5, 1.565], { off: (th, y) => 0.012 + (y < 1.12 ? 0.005 : 0) })
    for (const [, s] of SIDES) sleeve(s, color, long ? 0.38 : 0.18)
    // Folded collar and front placket follow the upper chest.
    for (const side of [-1, 1]) {
      const th = side * 0.24
      const points = [body.torsoP(th, 1.56, 0.022), body.torsoP(side * 0.45, 1.49, 0.023), body.torsoP(side * 0.05, 1.46, 0.023)]
      S.tri(M.cloth, ...points, mul(color, 0.88), S.W('chest'))
    }
    strip(ctx, { m: M.cloth, color: mul(color, 0.91), thick: 0.006, path: [[0, 1.48, 0.028, 0.019], [0, 1.32, 0.028, 0.02], [0, 1.15, 0.028, 0.02]] })
    if (detail > 0) for (const y of [1.35, 1.23]) S.add(M.wood, new THREE.IcosahedronGeometry(0.004, 0), 0xc0a46b, S.W('chest'), { at: body.torsoP(0, y, 0.034) })
  }

  if (o.armor != null) {
    // Dark cloth in joint gaps; segmented steel conforms to the anatomy.
    shirt(cloth, true); trousers(o.pants)
    const armor = o.armor
    const chest = torso(armor, [1.02, 1.1, 1.22, 1.34, 1.45, 1.54], { m: M.metal, off: (th, y) => 0.024 + (y > 1.3 ? 0.005 : 0), bevel: 0.005, twoTone: 0.08 })
    trimRow(ctx, chest[0], { m: M.gold, color: trim, r: 0.003, closed: true })
    if (detail > 0) trimRow(ctx, chest[chest.length - 1], { m: M.gold, color: trim, r: 0.003, closed: true })
    for (let i = 0; i < 3; i++) torso(mul(armor, 0.82 + i * 0.06), [1.055 + i * 0.057, 1.095 + i * 0.057], { m: M.metal, off: 0.039, bevel: 0.005 })
    for (const [, s] of SIDES) {
      const shoulder = sleeve(s, armor, 0.22, { m: M.metal, off: (th, u) => 0.027 + 0.025 * bump((u - 0.035) / 0.1) * Math.max(0.1, Math.sin(th)), bevel: 0.007 })
      if (detail > 0) trimRow(ctx, shoulder[shoulder.length - 1], { m: M.gold, color: trim, r: 0.0032, closed: true })
      for (let i = 0; i < 2; i++) limbShell(ctx, 'arm', s, { m: M.metal, color: mul(armor, 0.95 + i * 0.07), us: [0.025 + i * 0.06, 0.094 + i * 0.06], off: 0.051 - i * 0.005, cols: NL, bevel: 0.005 })
      limbShell(ctx, 'arm', s, { m: M.metal, color: armor, us: [0.28, 0.32, 0.38, 0.47, 0.535], off: 0.015, cols: NL, bevel: 0.006 })
      for (const u of [0.36, 0.49]) limbShell(ctx, 'arm', s, { m: M.leather, color: leather, us: [u - 0.008, u + 0.008], off: 0.02, cols: NL })
      limbShell(ctx, 'leg', s, { m: M.metal, color: armor, us: [0.16, 0.27, 0.36, 0.42], off: 0.019, range: () => [-1.15, 1.55], cols: NL, bevel: 0.006 })
      const kneePlate = limbShell(ctx, 'leg', s, { m: M.metal, color: mul(armor, 1.12), us: [0.395, 0.443, 0.495], off: 0.027, range: () => [-1.45, 1.45], cols: NL, bevel: 0.009 })
      if (detail > 0) trimRow(ctx, kneePlate[0], { m: M.gold, color: trim, r: 0.0028 })
      limbShell(ctx, 'leg', s, { m: M.metal, color: armor, us: [0.49, 0.58, 0.71, 0.81], off: 0.015, range: () => [-1.45, 1.45], cols: NL, bevel: 0.005 })
    }
    // Small anvil badge and two slanting chest borders unify Dunkan's army.
    for (const [w, h, y] of [[0.095, 0.019, 1.43], [0.037, 0.057, 1.399], [0.069, 0.018, 1.365]]) S.add(M.gold, new THREE.BoxGeometry(w, h, 0.01), trim, S.W('chest'), { at: body.torsoP(0, y, 0.04) })
    belt(leather, 1.025); buckle(1.025, o.crown ? 0.075 : 0.051)
    skirt(o.tabard ?? cloth, 0.51, { flare: 0.055, folds: 10, shadeDown: 0.6 })
    for (const s of [-1, 1]) skirt(armor, 0.71, { m: M.metal, range: [s > 0 ? 0.4 : -1.4, s > 0 ? 1.4 : -0.4], flare: 0.035, thick: 0.014, off: 0.044, cols: 8, rows: 3, foldAmp: 0.004 })
    boots(ctx, { color: 0x242020, top: 0.75 })
  } else if (o.robe) {
    if (o.fullRobe) {
      torso(o.robe, [1.01, 1.12, 1.27, 1.4, 1.53, 1.585], { twoTone: 0.065 })
      for (const [, s] of SIDES) sleeve(s, o.robe, 0.36)
      skirt(o.robe, 0.14, { flare: 0.09, folds: 16, hemJag: th => 0.028 * Math.cos(th * 3) })
      // A diagonally wrapped outer layer and a woven stole over one shoulder.
      skirt(mul(o.robe, 1.04), 0.2, { range: [-0.95, 1.65], off: 0.034, flare: 0.10, foldAmp: 0.022, cols: 16, hemJag: th => 0.09 * Math.sin(th + 1) })
      if (o.guruSash) strip(ctx, { m: M.cloth, color: o.guruSash, fringe: 0.035, path: [[0.95, 1.57, 0.029, 0.08], [0.43, 1.36, 0.029, 0.085], [-0.7, 1.06, 0.034, 0.085], [-0.9, 0.83, 0.037, 0.09], [-0.9, 0.44, 0.065, 0.095]] })
    } else {
      // Left shoulder wrapped in saffron; right shoulder and both arms remain bare.
      torso(o.robe, [1.015, 1.1, 1.21, 1.34, 1.46, 1.555], { range: y => { const t = clamp((y - 1.015) / 0.54, 0, 1); return [lerp(-1.1, 0.48, t), lerp(4.13, 2.66, t)] }, twoTone: 0.065, off: 0.021 })
      sleeve(1, o.robe, 0.085, { range: () => [-0.95, 3.95], off: 0.023 })
      strip(ctx, { m: M.cloth, color: o.sash ?? 0xb8661d, thick: 0.013, path: [[0.63, 1.56, 0.033, 0.07], [0.30, 1.40, 0.035, 0.095], [-0.13, 1.23, 0.037, 0.10], [-0.85, 1.05, 0.040, 0.11]] })
      skirt(o.robe, 0.385, { flare: o.longBeard ? 0.15 : 0.135, foldAmp: o.longBeard ? 0.024 : 0.018, folds: 16, hemJag: th => 0.024 * Math.sin(th * 4) })
      skirt(mul(o.robe, 1.04), 0.41, { range: [-0.7, 0.9], off: 0.04, flare: 0.15, folds: 6, cols: 12, hemJag: th => 0.085 * Math.sin(th + 0.7), thick: 0.01 })
    }
    belt(o.sash ?? o.pants, 1.045, 0.08)
    strip(ctx, { m: M.cloth, color: o.sash ?? o.pants, point: 0.045, path: [[-0.84, 1.07, 0.038, 0.085], [-0.85, 0.86, 0.054, 0.08], [-0.86, 0.57, 0.075, 0.085]] })
    sandals(ctx)
  } else if (o.dress) {
    torso(cloth, [0.985, 1.1, 1.23, 1.37, 1.50, 1.555], { twoTone: 0.06 })
    for (const [, s] of SIDES) sleeve(s, cloth, 0.13)
    skirt(cloth, 0.365, { top: 1.015, flare: 0.11, folds: 14, hemJag: th => 0.016 * Math.cos(th * 3) })
    belt(mul(cloth, 0.84), 1.035, 0.033)
  } else {
    if (o.vest) torso(cloth, [1.02, 1.14, 1.29, 1.4, 1.49], { off: 0.015 })
    else shirt(cloth)
    if (o.skirt) {
      if (o.underskirt) skirt(o.underskirt, 0.12, { flare: 0.10, folds: 16 })
      skirt(o.skirt, 0.19, { flare: 0.13, folds: 14, stripe: (th, y) => y < 0.245 ? o.trimCol ?? 0xa8622a : null })
      skirt(mul(o.skirt, 1.07), 0.36, { range: [-1.5, 1.8], flare: 0.145, off: 0.04, folds: 10, hemJag: th => 0.12 * Math.sin(th + 0.4), stripe: (th, y, r, c, rows) => r >= rows - 1 ? o.trimCol ?? 0xa8622a : null })
    } else if (o.dhoti) skirt(o.dhoti, 0.16, { flare: 0.065, folds: 14, stripe: (th, y) => y < 0.20 ? o.border ?? 0x8a714d : null })
    else trousers(o.pants, !!o.shorts)
    belt(o.skirt ? 0x794339 : leather, 1.035, o.skirt ? 0.06 : 0.045)
    if (!o.child) { if (o.boots) boots(ctx, { color: leather, top: 0.70 }); else if (!o.barefoot) sandals(ctx) }
    if (o.cuff) for (const [, s] of SIDES) limbShell(ctx, 'arm', s, { m: M.cloth, color: o.cuff, us: [0.155, 0.177, 0.198], cols: NL, off: 0.024, bevel: 0.003 })
  }

  if (o.apron) {
    torso(leather, [1.05, 1.20, 1.32, 1.43], { m: M.leather, range: () => [-0.82, 0.82], off: 0.031, bevel: 0.005 })
    skirt(leather, 0.37, { m: M.leather, range: [-1.0, 1.0], thick: 0.013, flare: 0.06, off: 0.04, foldAmp: 0.009, folds: 6, cols: 14, hemJag: th => Math.abs(th) * 0.025 })
    for (const sign of [-1, 1]) strip(ctx, { m: M.leather, color: 0x382317, path: [[sign * 0.76, 1.55, 0.026, 0.025], [sign * 0.59, 1.43, 0.038, 0.027], [sign * 0.64, 1.24, 0.045, 0.028]] })
    belt(0x35251b, 1.06, 0.06); buckle(1.06, 0.049)
    for (const y of [0.86, 0.79]) strip(ctx, { m: M.leather, color: 0x38251b, path: [[0.30, y + 0.03, 0.052, 0.10], [0.30, y - 0.015, 0.055, 0.10]] })
    for (const [, s] of SIDES) limbShell(ctx, 'arm', s, { m: M.leather, color: 0x38251b, us: [0.48, 0.515, 0.55], cols: NL, off: 0.009 })
  }
  if (o.burns) for (const [, s] of SIDES) for (let i = 0; i < (detail ? 3 : 1); i++) {
    const u = 0.36 + i * 0.034, th = 0.8 + i * 0.14
    S.prism(M.skin, [{ p: body.limbP('arm', s, th, u, 0.002), w: body.limbW('arm', s, u), r: 0.004, t: 0.001 }, { p: body.limbP('arm', s, th + 0.35, u + 0.035, 0.002), w: body.limbW('arm', s, u + 0.035), r: 0.002, t: 0.001 }], 0xaa7657, { sides: 3 })
  }
  if (o.beads) { wristBeads(ctx); if (o.fullRobe) mala(ctx) }
  if (o.herbs) {
    for (const sign of [-1, 1]) {
      const p = body.torsoP(sign * 1.04, 0.99, 0.045), w = S.W('hips')
      S.add(M.leather, new THREE.BoxGeometry(0.077, 0.115, 0.055), 0x795338, w, { at: v3.add(p, [0, -0.065, 0]) })
      S.add(M.leather, new THREE.BoxGeometry(0.082, 0.028, 0.058), 0x60442d, w, { at: v3.add(p, [0, -0.026, 0.009]), rot: [0.15, 0, 0] })
      S.add(M.gold, new THREE.BoxGeometry(0.012, 0.018, 0.005), 0xb18c4b, w, { at: v3.add(p, [0, -0.057, 0.031]) })
      for (let i = 0; i < (detail ? 4 : 2); i++) {
        const q = v3.add(p, [(i - 1.5) * 0.014, 0.018 + (i % 2) * 0.014, 0])
        S.add(M.std, new THREE.ConeGeometry(0.016, 0.065, 4), 0x587443, w, { at: q, rot: [0, i, (i - 1.5) * 0.12] })
      }
    }
  }
  if (o.shawl) {
    for (const side of [-1, 1]) strip(ctx, { m: M.cloth, color: o.shawl, fringe: detail ? 0.024 : null, path: [[side * 0.75, 1.58, 0.038, 0.11], [side * 0.66, 1.43, 0.039, 0.10], [side * 0.47, 1.21, 0.042, 0.11], [side * 0.36, 0.91, 0.047, 0.11], [side * 0.40, 0.73, 0.07, 0.115]] })
    torso(o.shawl, [1.4, 1.51, 1.56], { range: () => [1.04, 5.24], off: 0.028 })
  }
  if (o.herbs && o.skirt && o.shawl) {
    // The epilogue frame wraps the healer's cream stole diagonally across green.
    strip(ctx, { m: M.cloth, color: o.shawl, thick: 0.012, fringe: detail ? 0.028 : null, path: [[0.87, 1.58, 0.049, 0.14], [0.42, 1.38, 0.053, 0.15], [-0.22, 1.19, 0.053, 0.155], [-0.91, 1.035, 0.057, 0.15], [-1.06, 0.84, 0.061, 0.15]] })
  }
  if (o.necklace) {
    const pts = [0, 0.3, 0.7, 1].map(t => ({ p: body.torsoP(lerp(-0.58, 0.58, t), 1.46 - Math.sin(t * Math.PI) * 0.19, 0.03), w: S.W('chest'), r: 0.0025, t: 0.0025 }))
    S.prism(M.gold, pts, 0xb89852, { sides: 4 })
    S.add(M.gold, new THREE.OctahedronGeometry(0.017), 0x5a9e79, S.W('chest'), { at: body.torsoP(0, 1.265, 0.033), scale: [0.7, 1, 0.35] })
  }
  if (ctx.rig.cape) buildCape(ctx)
}

/** Thick cape with sewn hem and weighted fold chains; no vertex edits per frame. */
export function buildCape(ctx) {
  const { S, rig, o, detail, M } = ctx, R = rig.cape
  const rows = [4, 5, 6, 7][detail], cols = [6, 8, 10, 12][detail]
  const grid = []
  for (let r = 0; r <= rows; r++) {
    const t = r / rows, y = R.top - t * R.len
    const row = []
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols - 0.5) * R.width * (0.66 + t * 0.47)
      const p = [x, y + (r === rows ? (c % 2 ? 0.018 : -0.014) : 0), R.z - 0.028 - t * 0.095 + Math.cos(c * Math.PI) * (0.012 + t * 0.014)]
      row.push({ p, w: capeW(ctx, x, y), n: [0, 0, -1] })
    }
    grid.push(row)
  }
  S.slab(M.cloth, grid, (r, c) => mul(o.cape, c % 2 ? 0.88 : 1.04), { thick: 0.009, axis: cen => [0, cen[1], 0], back: mul(o.cape, 0.65), jit: 0.04 })
  if (o.crown && detail > 0) trimRow(ctx, grid[grid.length - 1], { m: M.gold, color: 0xb9954b, r: 0.0032 })
  if (o.capeCollar) {
    torsoShell(ctx, { m: M.cloth, color: (th, y) => mul(o.cape, y > 1.52 ? 1.09 : 0.88), ys: [1.455, 1.49, 1.535, 1.575], cols: 18, off: 0.047, range: () => [-1.04, 1.20], bevel: 0.003, twoTone: 0.06 })
    strip(ctx, { m: M.cloth, color: mul(o.cape, 1.08), thick: 0.013, point: 0.04, path: [[0.94, 1.57, 0.058, 0.10], [0.34, 1.50, 0.061, 0.115], [-0.59, 1.43, 0.063, 0.12], [-1.01, 1.29, 0.052, 0.11]] })
  }
  for (const sign of [-1, 1]) {
    const p = ctx.body.torsoP(sign * 0.9, 1.505, 0.053)
    S.add(M.gold, new THREE.OctahedronGeometry(0.026, 0), 0xb9954b, S.W('chest'), { at: p, scale: [1, 1, 0.45] })
    if (detail > 0) S.add(M.gold, new THREE.TorusGeometry(0.023, 0.0025, 4, 8), 0xc5a46a, S.W('chest'), { at: v3.add(p, [0, 0, 0.01]) })
  }
}
