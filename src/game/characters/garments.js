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
    cape: o.cape != null ? { cols: 3, segs: 3, top: 1.53, z: -0.13, width: 0.3 * (o.bulk ?? 1) ** 0.7, len: capeLen } : null,
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
  const top = o.top, hemY = o.hem
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
