import * as THREE from 'three'
import { C, mul, mix, lerp, clamp, sstep, bump, adiff, mixW, v3 } from './mesh'

/* ===========================================================================
   Anatomy. A body is a SPEC (joint positions + elliptical cross-section tables
   + anatomical "features" that push the surface in or out) that every other
   module samples: skin, garments (shells offset from the skin), armour, hair.

     torsoP(θ, y, off)          torso/neck surface, θ: 0 front, +π/2 = left (+x)
     limbP(limb, s, θ, u, off)  arm/leg surface; s = +1 left / -1 right,
                                u = distance down the limb from its root joint,
                                θ: 0 front, +π/2 lateral, -π/2 medial, π back
     torsoW(p) / limbW(limb, s, u)   matching bone weights

   Garments call the same functions with an offset, so cloth follows the
   muscles exactly and deforms with identical weights (no poke-through).
=========================================================================== */

const TAU = Math.PI * 2
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p)

/** interpolate a ring table on key `k` (sorted ascending) */
function interp(table, k, v) {
  if (v <= table[0][k]) return table[0]
  const last = table[table.length - 1]
  if (v >= last[k]) return last
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i], b = table[i + 1]
    if (v <= b[k]) {
      const t = (v - a[k]) / (b[k] - a[k]), o = {}
      for (const key in a) o[key] = lerp(a[key], b[key] ?? a[key], t)
      return o
    }
  }
  return last
}
/** feature sum: { th, tw, at (y or u), lo, hi, a, sym } */
function features(list, th, at) {
  let d = 0
  for (const F of list) {
    const dv = at - F.at, vb = bump(dv / (dv < 0 ? F.lo : F.hi))
    if (!vb) continue
    let ab = bump(adiff(th, F.th) / F.tw)
    if (F.sym) ab = Math.max(ab, bump(adiff(th, -F.th) / F.tw))
    d += F.a * ab * vb
  }
  return d
}

/* ------------------------------ spec ------------------------------ */
export function makeSpec(o) {
  const fem = !!o.fem, child = !!o.child, old = !!o.old
  const bulk = o.bulk ?? 1
  const muscle = o.muscle ?? (child ? 0.15 : fem ? 0.25 : old ? 0.45 : 0.85)
  const m = muscle
  const tw = bulk * (fem ? 0.9 : 1) * (child ? 0.94 : 1)          // torso width
  const sh = (fem ? 0.87 : 1) * (child ? 0.92 : 1)                 // shoulder breadth
  const hp = (fem ? 1.06 : 1)                                      // hip breadth
  const lk = Math.pow(bulk, 0.8) * (fem ? 0.84 : 1) * (child ? 0.9 : 1) * (o.limbs ?? 1)  // limb thickness
  const dz = Math.pow(bulk, 0.75) * (fem ? 0.95 : 1)              // torso depth
  const headS = (child ? 1.3 : fem ? 0.95 : 1) * (o.headScale ?? 1)
  const shX = 0.19 * sh * Math.pow(bulk, 0.75), hipX = 0.095 * hp * Math.pow(bulk, 0.55)
  const J = {
    body: [0, 0, 0], hips: [0, 0.97, 0], spine: [0, 0.99, 0], chest: [0, 1.25, 0],
    neck: [0, child ? 1.585 : 1.60, -0.012], head: [0, child ? 1.675 : 1.74, 0],
    clav: [0.035, 1.505, 0], shoulder: [shX, 1.525, 0], elbow: [shX, 1.225, 0], hand: [shX, 0.955, 0],
    leg: [hipX, 0.92, 0], knee: [hipX, 0.48, 0], foot: [hipX, 0.08, 0],
  }
  // ---- torso cross-sections (y absolute, bind pose) ----
  const T = [
    { y: 0.855, w: 0.06, f: 0.05, b: 0.05, z: -0.005 },
    { y: 0.885, w: 0.14 * hp, f: 0.092, b: 0.11, z: -0.008 },
    { y: 0.925, w: 0.165 * hp, f: 0.104, b: 0.125 + (fem ? 0.008 : 0), z: -0.008 },
    { y: 0.975, w: 0.168 * hp, f: 0.108, b: 0.124 + (fem ? 0.006 : 0), z: -0.008 },
    { y: 1.03, w: 0.157 * (fem ? 0.98 : 1), f: 0.106, b: 0.112, z: -0.006 },
    { y: 1.09, w: 0.146 * (fem ? 0.84 : 1), f: 0.104 * (fem ? 0.9 : 1), b: 0.1, z: -0.002 },
    { y: 1.15, w: 0.148 * (fem ? 0.84 : 1), f: 0.106 * (fem ? 0.9 : 1), b: 0.1, z: 0 },
    { y: 1.22, w: 0.158 * (fem ? 0.88 : 1), f: 0.112, b: 0.104, z: 0 },
    { y: 1.29, w: 0.17 * (fem ? 0.9 : 1), f: 0.118, b: 0.11, z: 0 },
    { y: 1.36, w: 0.182 * (fem ? 0.9 : 1), f: 0.122, b: 0.116, z: 0 },
    { y: 1.43, w: 0.192 * sh, f: 0.12, b: 0.12, z: -0.002 },
    { y: 1.49, w: 0.196 * sh, f: 0.108, b: 0.114, z: -0.006 },
    { y: 1.535, w: 0.172 * sh, f: 0.088, b: 0.098, z: -0.01 },
    { y: 1.57, w: 0.122 * sh, f: 0.07, b: 0.084, z: -0.012 },
    { y: 1.605, w: 0.074, f: 0.058, b: 0.066, z: -0.012 },
    { y: 1.65, w: 0.06, f: 0.056, b: 0.06, z: -0.01 },
    { y: 1.70, w: 0.057, f: 0.054, b: 0.058, z: -0.006 },
    { y: 1.765, w: 0.052, f: 0.05, b: 0.054, z: -0.004 },
  ]
  const nk = fem ? 0.86 : child ? 0.9 : 1
  for (const r of T) {
    const isNeck = r.y > 1.59
    const k = isNeck ? nk * Math.pow(bulk, 0.7) : tw
    r.w *= k; r.f *= isNeck ? k : dz; r.b *= isNeck ? k : dz
    if (child && isNeck) r.y -= (r.y - 1.59) * 0.35
    if (o.belly) { const e = bump((r.y - 1.12) / 0.18) * o.belly; r.f += e * 0.05; r.w += e * 0.02 }
  }
  const TF = [
    { th: 0.42, tw: 0.62, at: 1.415, lo: 0.06, hi: 0.09, a: (fem ? 0 : 0.018) * m, sym: true },        // pecs
    { th: 0.45, tw: 0.55, at: 1.335, lo: 0.02, hi: 0.025, a: (fem ? 0 : -0.006) * m, sym: true },      // under-pec crease
    { th: 0, tw: 0.18, at: 1.4, lo: 0.12, hi: 0.08, a: -0.009 * m },                                   // sternum
    { th: 0, tw: 0.14, at: 1.18, lo: 0.1, hi: 0.1, a: -0.005 * m },                                    // linea alba
    { th: 0.28, tw: 0.3, at: 1.2, lo: 0.1, hi: 0.08, a: 0.006 * m, sym: true },                        // abs
    { th: 1.2, tw: 0.35, at: 1.06, lo: 0.05, hi: 0.06, a: 0.008 * m, sym: true },                      // obliques
    { th: 1.05, tw: 0.25, at: 1.33, lo: 0.04, hi: 0.04, a: 0.005 * m, sym: true },                     // serratus
    { th: 1.95, tw: 0.5, at: 1.37, lo: 0.12, hi: 0.08, a: 0.016 * m, sym: true },                      // lats
    { th: 2.55, tw: 0.38, at: 1.43, lo: 0.07, hi: 0.06, a: 0.012 * m, sym: true },                     // scapulae
    { th: Math.PI, tw: 0.2, at: 1.25, lo: 0.25, hi: 0.22, a: -0.01 * m },                             // spine groove
    { th: 2.6, tw: 0.6, at: 0.93, lo: 0.06, hi: 0.06, a: 0.018 + (fem ? 0.01 : 0), sym: true },      // glutes
    { th: 1.9, tw: 0.8, at: 1.56, lo: 0.04, hi: 0.04, a: 0.012 * m * Math.pow(bulk, 0.5), sym: true }, // trapezius
    { th: 0.9, tw: 0.45, at: 1.53, lo: 0.015, hi: 0.015, a: 0.006 * m, sym: true },                    // clavicle ridge
    { th: 0, tw: 0.25, at: 1.665, lo: 0.015, hi: 0.015, a: fem || child ? 0 : 0.006 },                 // Adam's apple
    { th: 0.6, tw: 0.3, at: 1.66, lo: 0.04, hi: 0.04, a: 0.004 * m, sym: true },                       // sternocleidomastoid
  ]
  if (fem && !child) TF.push({ th: 0.5, tw: 0.62, at: 1.37, lo: 0.06, hi: 0.08, a: 0.03 * (o.bust ?? 1), sym: true })
  if (old) TF.push({ th: 0.45, tw: 0.6, at: 1.36, lo: 0.03, hi: 0.06, a: -0.008, sym: true }, { th: 1.1, tw: 0.4, at: 1.27, lo: 0.06, hi: 0.06, a: -0.006, sym: true })

  // ---- arm (u below the shoulder joint) ----
  const A = [
    { u: -0.075, w: 0.05, f: 0.055, b: 0.055, ox: -0.035 },
    { u: -0.035, w: 0.07, f: 0.07, b: 0.068, ox: -0.012 },
    { u: 0.015, w: 0.078, f: 0.073, b: 0.07, ox: 0 },
    { u: 0.075, w: 0.072, f: 0.067, b: 0.064, ox: 0.004 },
    { u: 0.135, w: 0.061, f: 0.061, b: 0.062, ox: 0.002 },
    { u: 0.19, w: 0.056, f: 0.061, b: 0.06, ox: 0 },
    { u: 0.245, w: 0.052, f: 0.054, b: 0.056, ox: 0 },
    { u: 0.295, w: 0.046, f: 0.046, b: 0.052, ox: 0 },
    { u: 0.335, w: 0.049, f: 0.047, b: 0.05, ox: 0 },
    { u: 0.38, w: 0.053, f: 0.05, b: 0.046, ox: 0.002 },
    { u: 0.445, w: 0.045, f: 0.042, b: 0.04, ox: 0 },
    { u: 0.51, w: 0.036, f: 0.035, b: 0.033, ox: 0 },
    { u: 0.56, w: 0.025, f: 0.033, b: 0.031, ox: 0 },
    { u: 0.585, w: 0.023, f: 0.031, b: 0.029, ox: 0 },
  ]
  for (const r of A) { const k = r.u < 0.05 ? lk * (fem ? 0.95 : 1) : lk * (r.u > 0.3 ? 1 : (0.75 + 0.25 * m)) ; r.w *= k; r.f *= k; r.b *= k; if (r.u < 0.1) { r.w *= (0.85 + 0.15 * m); r.f *= (0.88 + 0.12 * m); r.b *= (0.88 + 0.12 * m) } }
  const AF = [
    { th: 0, tw: 0.9, at: 0.17, lo: 0.07, hi: 0.07, a: 0.008 * m },          // biceps
    { th: Math.PI, tw: 0.9, at: 0.14, lo: 0.07, hi: 0.07, a: 0.008 * m },    // triceps
    { th: 0.75, tw: 0.6, at: 0.385, lo: 0.06, hi: 0.04, a: 0.007 * m },      // brachioradialis
    { th: Math.PI, tw: 0.4, at: 0.3, lo: 0.02, hi: 0.02, a: 0.007 },         // olecranon
    { th: 0.9, tw: 0.5, at: 0.03, lo: 0.04, hi: 0.04, a: 0.006 * m, sym: true }, // deltoid heads
    { th: Math.PI / 2, tw: 0.5, at: 0.565, lo: 0.012, hi: 0.012, a: 0.003 }, // wrist bone
  ]
  // ---- leg (u below the hip joint) ----
  const L = [
    { u: -0.09, w: 0.085, f: 0.09, b: 0.1, ox: -0.022 },
    { u: -0.03, w: 0.098, f: 0.098, b: 0.108, ox: -0.006 },
    { u: 0.04, w: 0.098, f: 0.1, b: 0.1, ox: 0.002 },
    { u: 0.13, w: 0.092, f: 0.096, b: 0.088, ox: 0 },
    { u: 0.23, w: 0.084, f: 0.088, b: 0.08, ox: -0.002 },
    { u: 0.32, w: 0.074, f: 0.078, b: 0.07, ox: -0.005 },
    { u: 0.39, w: 0.064, f: 0.066, b: 0.06, ox: -0.007 },
    { u: 0.44, w: 0.057, f: 0.062, b: 0.054, ox: -0.007 },
    { u: 0.49, w: 0.054, f: 0.054, b: 0.058, ox: -0.007 },
    { u: 0.56, w: 0.056, f: 0.05, b: 0.07, ox: -0.007 },
    { u: 0.63, w: 0.052, f: 0.046, b: 0.066, ox: -0.008 },
    { u: 0.71, w: 0.042, f: 0.04, b: 0.05, ox: -0.009 },
    { u: 0.79, w: 0.034, f: 0.035, b: 0.038, ox: -0.01 },
    { u: 0.84, w: 0.035, f: 0.036, b: 0.034, ox: -0.01 },
    { u: 0.885, w: 0.03, f: 0.034, b: 0.032, ox: -0.01 },
  ]
  const legK = Math.pow(bulk, 0.8) * (child ? 0.86 : 1) * (o.limbs ?? 1)
  for (const r of L) { const k = legK * (fem && r.u < 0.3 ? 1.04 : fem ? 0.9 : 1); r.w *= k; r.f *= k; r.b *= k }
  const LF = [
    { th: 0, tw: 0.8, at: 0.2, lo: 0.1, hi: 0.1, a: 0.008 * m },                      // quads
    { th: -0.7, tw: 0.4, at: 0.37, lo: 0.04, hi: 0.04, a: 0.008 * m },                // vastus medialis
    { th: 0, tw: 0.45, at: 0.445, lo: 0.025, hi: 0.025, a: 0.011 },                    // kneecap
    { th: Math.PI - 0.45, tw: 0.4, at: 0.57, lo: 0.06, hi: 0.05, a: 0.008 * (0.4 + m) }, // calf heads
    { th: Math.PI + 0.45, tw: 0.4, at: 0.57, lo: 0.06, hi: 0.05, a: 0.008 * (0.4 + m) },
    { th: -0.25, tw: 0.2, at: 0.65, lo: 0.12, hi: 0.12, a: 0.003 },                    // tibia ridge
    { th: Math.PI / 2, tw: 0.35, at: 0.835, lo: 0.012, hi: 0.012, a: 0.006, sym: true }, // malleoli
    { th: Math.PI, tw: 0.2, at: 0.2, lo: 0.1, hi: 0.1, a: -0.004 * m },                // hamstring groove
  ]
  return {
    o, fem, child, old, bulk, muscle, headS, J, T, TF, A, AF, L, LF,
    hand: { k: (fem ? 0.86 : child ? 0.9 : 1) * Math.pow(bulk, 0.5) },
    foot: { k: (fem ? 0.9 : 1) * Math.pow(bulk, 0.45) },
  }
}

/* ------------------------------ skeleton ------------------------------ */
export const SIDES = [['L', 1], ['R', -1]]
/**
 * Bones (all unrotated in bind pose):
 * body › hips › spine › chest › neck › head
 *                       chest › clavL › shoulderL › elbowL › handL › fing1L › fing2L, handL › thumbL
 *        hips › legL › kneeL › footL ;  hips › skirt › skirt{k}a › skirt{k}b ;  chest › cape › cape{c}{s}
 */
export function makeSkeleton(spec, rig) {
  const J = spec.J
  const root = new THREE.Group()
  const bones = [], B = {}, abs = {}
  const mk = (name, parent, at) => {
    const b = new THREE.Bone(); b.name = name
    const pp = parent ? abs[parent] : [0, 0, 0]
    b.position.set(at[0] - pp[0], at[1] - pp[1], at[2] - pp[2])
    ;(parent ? B[parent] : root).add(b)
    bones.push(b); B[name] = b; abs[name] = at
    return b
  }
  mk('body', null, J.body); mk('hips', 'body', J.hips); mk('spine', 'hips', J.spine); mk('chest', 'spine', J.chest)
  mk('neck', 'chest', J.neck); mk('head', 'neck', J.head)
  const hk = spec.hand.k
  for (const [S, s] of SIDES) {
    mk('clav' + S, 'chest', [s * J.clav[0], J.clav[1], J.clav[2]])
    mk('shoulder' + S, 'clav' + S, [s * J.shoulder[0], J.shoulder[1], 0])
    mk('elbow' + S, 'shoulder' + S, [s * J.elbow[0], J.elbow[1], 0])
    mk('hand' + S, 'elbow' + S, [s * J.hand[0], J.hand[1], 0])
    mk('fing1' + S, 'hand' + S, [s * (J.hand[0] - 0.003 * hk), J.hand[1] - 0.095 * hk, 0])
    mk('fing2' + S, 'fing1' + S, [s * (J.hand[0] - 0.003 * hk), J.hand[1] - 0.143 * hk, 0])
    mk('thumb' + S, 'hand' + S, [s * (J.hand[0] - 0.006 * hk), J.hand[1] - 0.02 * hk, 0.03 * hk])
  }
  for (const [S, s] of SIDES) {
    mk('leg' + S, 'hips', [s * J.leg[0], J.leg[1], 0])
    mk('knee' + S, 'leg' + S, [s * J.knee[0], J.knee[1], 0])
    mk('foot' + S, 'knee' + S, [s * J.foot[0], J.foot[1], 0])
  }
  if (rig.skirt) {
    mk('skirt', 'hips', J.hips)
    const K = rig.skirt.chains, py = rig.skirt.pivot
    for (let k = 0; k < K; k++) {
      const a = k / K * TAU, r = rig.skirt.radius(a)
      mk('skirt' + k + 'a', 'skirt', [Math.sin(a) * r, py, Math.cos(a) * r])
      mk('skirt' + k + 'b', 'skirt' + k + 'a', [Math.sin(a) * r, py - rig.skirt.upper, Math.cos(a) * r])
    }
  }
  if (rig.cape) {
    const c = rig.cape
    mk('cape', 'chest', [0, c.top, c.z])
    for (let i = 0; i < c.cols; i++) {
      const x = (i / (c.cols - 1) - 0.5) * c.width
      let parent = 'cape'
      for (let j = 0; j < c.segs; j++) {
        const name = 'cape' + i + '_' + j
        mk(name, parent, [x * (1 + j * 0.12), c.top - j * c.len / c.segs, c.z - j * 0.02])
        parent = name
      }
    }
  }
  return { root, bones, B, abs }
}

/* ------------------------------ surfaces ------------------------------ */
export class Body {
  constructor(spec, S) {
    this.spec = spec; this.S = S; this.J = spec.J
    this._w = new Map()
  }
  /** torso/neck surface point (bind space) */
  torsoP(th, y, off = 0) {
    const R = interp(this.spec.T, 'y', y)
    const s = Math.sin(th), c = Math.cos(th), fz = c >= 0 ? R.f : R.b
    const x = R.w * spow(s, 0.92), z = R.z + fz * spow(c, 0.92)
    const d = features(this.spec.TF, th, y) + off
    const nx = x / (R.w * R.w), nz = (z - R.z) / (fz * fz), nl = Math.hypot(nx, nz) || 1
    return [x + nx / nl * d, y, z + nz / nl * d]
  }
  torsoZ(y) { return interp(this.spec.T, 'y', y).z }
  torsoR(y) { return interp(this.spec.T, 'y', y) }
  torsoW(p) {
    const y = p[1], ax = Math.abs(p[0]), S = p[0] >= 0 ? 'L' : 'R', W = this.S.W.bind(this.S)
    let w = W('hips')
    w = mixW(w, W('spine'), sstep(1.0, 1.09, y))
    w = mixW(w, W('chest'), sstep(1.19, 1.31, y))
    w = mixW(w, W('neck'), sstep(1.585, 1.645, y))
    w = mixW(w, W('head'), sstep(1.72, 1.775, y))
    const sh = sstep(0.1, 0.19, ax) * sstep(1.39, 1.52, y) * (1 - sstep(1.575, 1.62, y))
    if (sh > 0) w = mixW(w, W(['clav' + S, 0.55], ['shoulder' + S, 0.45]), sh * 0.85)
    return w
  }
  /** limb rings & features */
  limb(limb) { return limb === 'arm' ? [this.spec.A, this.spec.AF] : [this.spec.L, this.spec.LF] }
  limbRoot(limb, s) { const j = limb === 'arm' ? this.J.shoulder : this.J.leg; return [s * j[0], j[1], j[2] || 0] }
  limbP(limb, s, th, u, off = 0) {
    const [rings, feats] = this.limb(limb)
    const R = interp(rings, 'u', u)
    const sn = Math.sin(th), c = Math.cos(th), fz = c >= 0 ? R.f : R.b
    let l = R.ox + R.w * spow(sn, 0.95), z = (R.oz || 0) + fz * spow(c, 0.95)
    const d = features(feats, th, u) + off
    const nx = (l - R.ox) / (R.w * R.w), nz = (z - (R.oz || 0)) / (fz * fz), nl = Math.hypot(nx, nz) || 1
    l += nx / nl * d; z += nz / nl * d
    const r0 = this.limbRoot(limb, s)
    return [r0[0] + s * l, r0[1] - u, r0[2] + z]
  }
  limbR(limb, u) { return interp(this.limb(limb)[0], 'u', u) }
  limbW(limb, s, u) {
    const S = s > 0 ? 'L' : 'R', W = this.S.W.bind(this.S)
    if (limb === 'arm') {
      let w = mixW(W(['clav' + S, 0.6], ['shoulder' + S, 0.4]), W('shoulder' + S), sstep(-0.075, 0.03, u))
      w = mixW(w, W('elbow' + S), sstep(0.25, 0.35, u))
      w = mixW(w, W('hand' + S), sstep(0.53, 0.58, u))
      return w
    }
    let w = mixW(W(['hips', 0.75], ['leg' + S, 0.25]), W('leg' + S), sstep(-0.09, 0.05, u))
    w = mixW(w, W('knee' + S), sstep(0.38, 0.5, u))
    w = mixW(w, W('foot' + S), sstep(0.8, 0.87, u))
    return w
  }
  /** column angles for N segments (vertex at θ = 0) */
  static angles(N) { const out = []; for (let i = 0; i < N; i++) out.push(i / N * TAU); return out }
}

/* ------------------------------ skin ------------------------------ */
export function skinTone(o, part, p) {
  const base = C(o.skin)
  if (part === 'torso') return base.multiplyScalar(0.95 + 0.06 * sstep(0.95, 1.5, p[1]) - 0.06 * (1 - sstep(0.86, 0.95, p[1])))
  if (part === 'arm') return base
  return base
}

/** Skin of torso + neck + arms + legs. `hide(part, s, th, at)` may drop fully covered faces. */
export function buildSkin(ctx) {
  const { S, body, spec, o, detail } = ctx
  const NT = [14, 16, 20, 22][detail], NL = [8, 10, 12, 12][detail]
  const skinM = ctx.M.skin
  const tone = C(o.skin)
  // torso
  const ys = spec.T.map(r => r.y)
  const th = Body.angles(NT)
  const V = ys.map(y => th.map(a => { const p = body.torsoP(a, y); return { p, w: body.torsoW(p) } }))
  const hideT = ctx.hide?.torso
  S.grid(skinM, V, {
    wrap: true, jit: 0.03,
    color: (r, c, cen) => mul(tone, (0.95 + 0.07 * sstep(0.95, 1.5, cen[1])) * (cen[1] < 0.93 ? 0.9 : 1) * (Math.abs(cen[0]) > 0.16 && cen[1] > 1.3 && cen[1] < 1.45 ? 0.93 : 1)),
    axis: cen => [0, cen[1], body.torsoZ(cen[1])],
    skip: hideT ? (r, c) => hideT(th[c], ys[r], ys[r + 1]) : null,
  })
  // crotch cap
  const bottom = V[0], ap = { p: [0, 0.835, -0.005], w: S.W('hips') }
  S.fan(skinM, bottom, ap, mul(tone, 0.8), { outward: [0, -1, 0] })
  // limbs
  for (const limb of ['arm', 'leg']) {
    const rings = body.limb(limb)[0]
    for (const [, s] of SIDES) {
      const us = rings.map(r => r.u)
      const ang = Body.angles(NL)
      const LV = us.map(u => ang.map(a => ({ p: body.limbP(limb, s, a, u), w: body.limbW(limb, s, u) })))
      const r0 = body.limbRoot(limb, s)
      const hideL = ctx.hide?.[limb]
      S.grid(skinM, LV, {
        wrap: true, jit: 0.03,
        color: (r, c, cen) => {
          const u = r0[1] - cen[1]
          let k = 1
          if (limb === 'arm') k = 0.97 + 0.04 * sstep(0.1, 0.0, u) - (Math.abs(u - 0.3) < 0.03 ? 0.03 : 0)
          else k = 0.96 - (Math.abs(u - 0.445) < 0.03 ? 0.02 : 0) + 0.02 * sstep(0.5, 0.6, u)
          return mul(tone, k)
        },
        axis: cen => [r0[0] + s * interp(rings, 'u', r0[1] - cen[1]).ox, cen[1], 0],
        skip: hideL ? (r, c) => hideL(s, ang[c], us[r], us[r + 1]) : null,
      })
    }
  }
}

/* ------------------------------ hands ------------------------------ */
/**
 * Hands with a palm, four grouped two-segment fingers (bones fing1/fing2 curl
 * them together) and a two-segment thumb (bone thumb). `glove` recolours.
 */
export function buildHands(ctx, { color = null, m = null, glove = false, cuff = null } = {}) {
  const { S, spec, o, detail } = ctx
  const hk = spec.hand.k, J = spec.J
  const mat = m || ctx.M.skin
  const base = C(color ?? o.skin)
  for (const [Sd, s] of SIDES) {
    const wx = s * J.hand[0], wy = J.hand[1]
    const P = (x, y, z) => [wx + s * x * hk, wy + y * hk, z * hk]
    const wH = S.W('hand' + Sd), w1 = S.W('fing1' + Sd), w2 = S.W('fing2' + Sd), wT = S.W('thumb' + Sd)
    // palm: lofted rounded slab (x = lateral thickness: + back of hand, - palm)
    const prof = [
      { y: 0.012, tx: 0.019, tz: 0.027, cx: 0, cz: 0 },
      { y: -0.025, tx: 0.0195, tz: 0.037, cx: 0, cz: 0.003 },
      { y: -0.06, tx: 0.0165, tz: 0.043, cx: -0.001, cz: 0.001 },
      { y: -0.09, tx: 0.0145, tz: 0.042, cx: -0.002, cz: -0.001 },
      { y: -0.102, tx: 0.011, tz: 0.039, cx: -0.003, cz: -0.001 },
    ]
    const NA = detail >= 2 ? 10 : 8
    const pv = prof.map(r => {
      const row = []
      for (let i = 0; i < NA; i++) {
        const a = i / NA * TAU, ca = Math.cos(a), sa = Math.sin(a)
        // back of hand domed, palm flatter; thenar pad toward the thumb (front)
        const tx = r.tx * (ca > 0 ? 1 : 0.9) + (ca < 0 && sa > 0.3 && r.y < -0.01 && r.y > -0.07 ? 0.004 : 0)
        row.push({ p: P(r.cx + spow(ca, 0.7) * tx, r.y, r.cz + spow(sa, 0.55) * r.tz), w: wH })
      }
      return row
    })
    const handCol = (r, c, cen) => mul(base, 0.97)
    S.grid(mat, pv, { wrap: true, color: handCol, jit: 0.035, axis: cen => [wx + s * -0.002 * hk, cen[1], 0] })
    S.fan(mat, pv[0], { p: P(0, 0.02, 0), w: wH }, base, { outward: [0, 1, 0] })
    // fingers
    const fingers = detail === 0
      ? [{ z: 0.0, r: 0.038, len: 0.085 }]
      : [{ z: 0.028, r: 0.0098, len: 0.088 }, { z: 0.0085, r: 0.0102, len: 0.096 }, { z: -0.0105, r: 0.0097, len: 0.09 }, { z: -0.0285, r: 0.0082, len: 0.07 }]
    const sides = detail >= 2 ? 5 : 4
    for (const F of fingers) {
      const x0 = -0.003, y0 = -0.095, yMid = -0.143, spread = F.z * 0.12
      const tipY = y0 - F.len, t1 = detail === 0 ? 0.012 : 0.0088
      const seg1 = [
        { p: P(x0, y0 + 0.006, F.z), w: w1, r: F.r, t: t1 },
        { p: P(x0 - 0.0005, yMid + 0.002, F.z + spread * 0.4), w: w1, r: F.r * 0.93, t: t1 * 0.94 },
      ]
      const seg2 = [
        { p: P(x0 - 0.0005, yMid + 0.004, F.z + spread * 0.4), w: w2, r: F.r * 0.9, t: t1 * 0.9 },
        { p: P(x0 - 0.001, tipY + 0.012, F.z + spread), w: w2, r: F.r * 0.78, t: t1 * 0.8 },
        { p: P(x0 - 0.002, tipY, F.z + spread), w: w2, r: F.r * 0.45, t: t1 * 0.5 },
      ]
      const side = [0, 0, 1]
      S.prism(mat, seg1, mul(base, 0.98), { sides, side })
      S.prism(mat, seg2, mul(base, 1.0), { sides, side })
      if (detail >= 3 && !glove) S.add(mat, new THREE.BoxGeometry(0.003, 0.012, F.r * 1.3), mix(base, 0xf0d8c8, 0.35), w2, { at: P(0.0075, tipY + 0.009, F.z + spread) })
    }
    // thumb (front side, rests along the index finger)
    const tb = P(-0.006, -0.02, 0.03)
    const tpath = [
      { p: tb, w: wT, r: 0.0125, t: 0.011 },
      { p: P(-0.009, -0.045, 0.047), w: wT, r: 0.0115, t: 0.0102 },
      { p: P(-0.011, -0.072, 0.053), w: wT, r: 0.0098, t: 0.009 },
      { p: P(-0.012, -0.088, 0.054), w: wT, r: 0.005, t: 0.0045 },
    ]
    S.prism(mat, tpath, base, { sides, side: [1, 0, 0] })
    if (o.scar && Sd === 'L' && !glove) {
      // healed diagonal blade scar on the back of the left hand
      const a = P(0.0205, -0.03, 0.03), b = P(0.0185, -0.075, -0.02)
      S.prism(mat, [{ p: a, w: wH, r: 0.0025, t: 0.0012 }, { p: v3.lerp(a, b, 0.5), w: wH, r: 0.003, t: 0.0014 }, { p: b, w: wH, r: 0.0015, t: 0.001 }], 0xc98a7a, { sides: 3, side: [0, 0, 1] })
    }
    if (cuff) S.prism(mat, [{ p: P(0, 0.035, 0), w: S.W('hand' + Sd), r: 0.034, t: 0.031 }, { p: P(0, -0.005, 0), w: wH, r: 0.038, t: 0.034 }], cuff, { sides: 8 })
  }
}

/* ------------------------------ feet ------------------------------ */
/** Bare feet with toes (sole at `sole` metres above ground). Returns the foot profile for footwear. */
export function footProfile(spec, s, sole = 0) {
  const fk = spec.foot.k, J = spec.J, ax = s * J.foot[0], ay = J.foot[1]
  const bot = -0.08 + sole
  const rings = [
    { z: -0.068, hw: 0.022, top: -0.04, bot: bot + 0.008, cx: 0 },
    { z: -0.052, hw: 0.033, top: -0.008, bot, cx: 0 },
    { z: -0.018, hw: 0.038, top: 0.012, bot, cx: 0 },
    { z: 0.03, hw: 0.042, top: -0.008, bot, cx: 0.002 },
    { z: 0.08, hw: 0.047, top: -0.032, bot, cx: 0.004 },
    { z: 0.125, hw: 0.051, top: -0.047, bot, cx: 0.005 },
    { z: 0.15, hw: 0.05, top: -0.054, bot, cx: 0.005 },
  ]
  return { fk, ax, ay, bot, rings, P: (x, y, z) => [ax + s * x * fk, ay + (y - (y < 0 ? 0 : 0)) * 1, z * fk] }
}
export function buildFeet(ctx, { sole = 0, color = null, m = null, toes = true } = {}) {
  const { S, spec, o, detail } = ctx
  const mat = m || ctx.M.skin
  const base = C(color ?? o.skin)
  for (const [Sd, s] of SIDES) {
    const F = footProfile(spec, s, sole), wF = S.W('foot' + Sd)
    const NA = detail >= 2 ? 10 : 8
    const V = F.rings.map(r => {
      const row = []
      for (let i = 0; i < NA; i++) {
        const a = i / NA * TAU, ca = Math.cos(a), sa = Math.sin(a)
        // a: 0 = top, π = sole; flat sole, arched top
        const yy = ca >= 0 ? lerp((r.top + r.bot) / 2, r.top, spow(ca, 0.8)) : lerp((r.top + r.bot) / 2, r.bot, spow(-ca, 0.35))
        const hw = r.hw * (ca < -0.2 ? 0.94 : 1) * (sa < 0 ? 1.04 : 1)   // medial side (−x) a bit fuller
        row.push({ p: F.P(r.cx + spow(sa, 0.8) * hw * (s > 0 ? 1 : 1), yy, r.z), w: wF })
      }
      return row
    })
    // sa>0 is +x local (lateral for left foot after mirroring by s) — keep medial on -x local
    S.grid(mat, V, { wrap: true, color: (r, c, cen) => mul(base, 0.96), jit: 0.03, axis: cen => [F.ax, F.ay + (F.rings[0].top + F.bot) / 2, cen[2]] })
    S.fan(mat, V[0], { p: F.P(0, (F.rings[0].top + F.rings[0].bot) / 2, -0.074), w: wF }, base, { outward: [0, 0, -1] })
    if (!toes) { S.fan(mat, V[V.length - 1], { p: F.P(0.005, F.bot + 0.018, 0.2), w: wF }, base, { outward: [0, 0, 1] }); continue }
    // toes: big toe (medial) + four small toes
    const b = F.bot
    const big = [
      { p: F.P(-0.026, b + 0.022, 0.135), w: wF, r: 0.014, t: 0.013 },
      { p: F.P(-0.028, b + 0.017, 0.185), w: wF, r: 0.0125, t: 0.0115 },
      { p: F.P(-0.028, b + 0.012, 0.207), w: wF, r: 0.007, t: 0.006 },
    ]
    S.prism(mat, big, base, { sides: detail >= 2 ? 5 : 4, side: [1, 0, 0] })
    const small = detail === 0 ? [{ x: 0.016, r: 0.026, l: 0.045 }] : [{ x: -0.002, r: 0.0085, l: 0.05 }, { x: 0.015, r: 0.0082, l: 0.045 }, { x: 0.03, r: 0.0078, l: 0.038 }, { x: 0.043, r: 0.0072, l: 0.03 }]
    for (const T of small) {
      S.prism(mat, [
        { p: F.P(T.x, b + 0.016, 0.135), w: wF, r: T.r, t: 0.01 },
        { p: F.P(T.x + 0.002, b + 0.012, 0.135 + T.l * 0.75), w: wF, r: T.r * 0.9, t: 0.0085 },
        { p: F.P(T.x + 0.002, b + 0.008, 0.135 + T.l), w: wF, r: T.r * 0.5, t: 0.005 },
      ], mul(base, 0.97), { sides: 4, side: [1, 0, 0] })
    }
    // close the front of the forefoot under the toes
    S.fan(mat, V[V.length - 1], { p: F.P(0.008, b + 0.02, 0.158), w: wF }, mul(base, 0.92), { outward: [0, 0, 1] })
  }
}
