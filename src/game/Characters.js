import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Builder, G, mat, rng } from './gfx/kit'

/* ===========================================================================
   Faceted character rig, built from the turnaround boards (docs/art-reference).
   Bodies are LOFTED from elliptical cross-sections (pelvis → waist → ribs →
   chest → shoulders), so silhouettes read like sculpted low-poly figures:
   V-shaped torsos, deltoids, biceps, calves, jaws and noses. Every bone's parts
   are merged per material (one draw call per bone/material).
   Rig: body › hips › spine › neck › head, shoulder › elbow › hand (L/R),
        leg › knee › foot (L/R), skirt, cape, crown, weapon.
=========================================================================== */

const lerp = THREE.MathUtils.lerp
const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t)
const swing = (a, b, c, wind, strike, back) => lerp(lerp(a, b, wind), c, strike) * (1 - back)
const blend = (object, key, value, factor) => { object[key] = lerp(object[key], value, factor) }

/* ------------------------------ geometry helpers ------------------------------ */
/**
 * Loft through elliptical rings. ring = [y, rx, zFront, zBack, ox = 0, oz = 0]
 * Front (+z) and back can bulge differently (chest vs. shoulder blades).
 */
function loft(rings, seg = 8, { top = true, bottom = true, twist = 0.5 } = {}) {
  const P = rings.map(([y, rx, zf, zb, ox = 0, oz = 0]) => {
    const ring = []
    for (let i = 0; i < seg; i++) {
      const a = (i + twist) / seg * Math.PI * 2, c = Math.cos(a)
      ring.push([ox + Math.sin(a) * rx, y, oz + c * (c > 0 ? zf : zb)])
    }
    return ring
  })
  const pos = []
  for (let r = 0; r < P.length - 1; r++) for (let i = 0; i < seg; i++) {
    const A = P[r][i], B = P[r][(i + 1) % seg], C = P[r + 1][i], D = P[r + 1][(i + 1) % seg]
    pos.push(...A, ...B, ...C, ...B, ...D, ...C)
  }
  const cap = (ring, up) => {
    const c = ring.reduce((s, p) => [s[0] + p[0] / seg, s[1] + p[1] / seg, s[2] + p[2] / seg], [0, 0, 0])
    for (let i = 0; i < seg; i++) { const a = ring[i], b = ring[(i + 1) % seg]; up ? pos.push(...c, ...b, ...a) : pos.push(...c, ...a, ...b) }
  }
  if (bottom) cap(P[0], false)
  if (top) cap(P[P.length - 1], true)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}
/** Hanging skirt/robe with angular folds and an uneven hem. */
function drape(top, bottom, height, panels = 14, depth = 0.8, hemJag = 0.05, front = 1) {
  const rings = []
  for (let k = 0; k <= 3; k++) {
    const t = k / 3, r = lerp(top, bottom, Math.pow(t, 0.8))
    const ring = []
    for (let i = 0; i < panels; i++) {
      const a = i / panels * Math.PI * 2, fold = i % 2 ? 1 - 0.13 * t : 1
      const c = Math.cos(a), y = -height * t + (k === 3 ? ((i * 7) % 3) * hemJag * 0.5 - (c > 0.3 ? 0 : 0) : 0)
      ring.push([Math.sin(a) * r * fold, y, c * r * fold * depth * (c > 0 ? front : 1)])
    }
    rings.push(ring)
  }
  const pos = []
  for (let k = 0; k < 3; k++) for (let i = 0; i < panels; i++) {
    const A = rings[k][i], B = rings[k][(i + 1) % panels], C = rings[k + 1][i], D = rings[k + 1][(i + 1) % panels]
    pos.push(...A, ...B, ...C, ...B, ...D, ...C)
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g
}
function polygon(points) {
  const position = []
  for (let i = 1; i < points.length - 1; i++) position.push(...points[0], ...points[i], ...points[i + 1])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  return geometry
}
/** Long cape panel with angular folds; vertices animated in update(). */
function capeGeometry(width, length) {
  const rows = 6, cols = 7, position = []
  const point = (i, j) => {
    const t = j / rows, x = (i / cols - 0.5) * width * (0.85 + t * 0.4)
    return [x, -t * length + (j === rows && i % 2 ? 0.06 : 0), -0.04 - t * 0.1 + (i % 2 ? 0.035 : -0.035) * (0.4 + t)]
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const A = point(i, j), B = point(i + 1, j), C = point(i, j + 1), D = point(i + 1, j + 1)
    position.push(...A, ...C, ...B, ...B, ...C, ...D)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  return geometry
}

const templates = new Map()
const weaponTemplates = new Map()
const TEMPLATE_LIMIT = 72
let templateClock = 0
function retainTemplate(cache, key, build) {
  let record = cache.get(key)
  if (!record) {
    if (cache.size >= TEMPLATE_LIMIT) {
      let oldest
      for (const entry of cache.values()) if (!entry.refs && (!oldest || entry.used < oldest.used)) oldest = entry
      if (oldest) { oldest.root.traverse(node => { if (node.isMesh) node.geometry.dispose() }); cache.delete(oldest.key) }
    }
    record = { key, root: build(), refs: 0, used: 0 }
    cache.set(key, record)
  }
  record.refs++
  record.used = ++templateClock
  return record
}
function releaseTemplate(record) { if (record) { record.refs = Math.max(0, record.refs - 1); record.used = ++templateClock } }

function part(parent, name, at = [0, 0, 0]) {
  const group = new THREE.Group(); group.name = name; group.position.set(...at); parent.add(group); return group
}
/** Skeleton joint (a THREE.Bone, so the continuous skin can bend smoothly across it). */
function joint(parent, name, at = [0, 0, 0]) {
  const bone = new THREE.Bone(); bone.name = name; bone.position.set(...at); parent.add(bone); return bone
}
/**
 * One continuous, skinned, flat-shaded body built from lofted tubes. Each tube
 * belongs to a joint; its first/last rings blend with the neighbouring joint
 * so shoulders, elbows, hips and knees bend without seams.
 * tube = { bone, rings:[[y, rx, zf, zb, ox, oz]], seg, color(x,y,z) → hex, start:[bone,w], end:[bone,w], capEnd }
 */
function buildSkin(root, tubes, seed = 7) {
  root.updateMatrixWorld(true)
  const bones = []; root.traverse(n => { if (n.isBone) bones.push(n) })
  const bi = new Map(bones.map((b, i) => [b, i]))
  const pos = [], col = [], si = [], sw = [], r = rng(seed), v = new THREE.Vector3(), c = new THREE.Color()
  for (const t of tubes) {
    const M = t.bone.matrixWorld, seg = t.seg || 10, rings = t.rings, own = bi.get(t.bone)
    const P = rings.map(([y, rx, zf, zb, ox = 0, oz = 0]) => {
      const ring = []
      for (let i = 0; i < seg; i++) { const a = (i + 0.5) / seg * Math.PI * 2, cz = Math.cos(a); ring.push([ox + Math.sin(a) * rx, y, oz + cz * (cz > 0 ? zf : zb)]) }
      return ring
    })
    const W = rings.map((_, k) => {
      if (k === 0 && t.start) return [[own, 1 - t.start[1]], [bi.get(t.start[0]), t.start[1]]]
      if (k === rings.length - 1 && t.end) return [[own, 1 - t.end[1]], [bi.get(t.end[0]), t.end[1]]]
      return [[own, 1]]
    })
    const yMin = rings[0][0], yMax = rings[rings.length - 1][0], span = Math.abs(yMax - yMin) || 1
    const tri = (A, B, Cc, wa, wb, wc) => {
      const cx = (A[0] + B[0] + Cc[0]) / 3, cy = (A[1] + B[1] + Cc[1]) / 3, cz = (A[2] + B[2] + Cc[2]) / 3
      c.set(t.color(cx, cy, cz))
      const shade = (1 + (r() - 0.5) * 0.12) * (0.86 + 0.14 * Math.min(1, Math.abs(cy - yMin) / span + (t.flipShade ? 0 : 0)))
      for (const [p3, w] of [[A, wa], [B, wb], [Cc, wc]]) {
        v.set(...p3).applyMatrix4(M); pos.push(v.x, v.y, v.z)
        col.push(c.r * shade, c.g * shade, c.b * shade)
        const idx = [0, 0, 0, 0], wt = [0, 0, 0, 0]; w.forEach(([b, ww], j) => { idx[j] = b; wt[j] = ww })
        si.push(...idx); sw.push(...wt)
      }
    }
    for (let k = 0; k < P.length - 1; k++) for (let i = 0; i < seg; i++) {
      const A = P[k][i], B = P[k][(i + 1) % seg], Cc = P[k + 1][i], D = P[k + 1][(i + 1) % seg]
      tri(A, B, Cc, W[k], W[k], W[k + 1]); tri(B, D, Cc, W[k], W[k + 1], W[k + 1])
    }
    if (t.capEnd) {
      const L = P[P.length - 1], ctr = L.reduce((s3, q) => [s3[0] + q[0] / seg, s3[1] + q[1] / seg, s3[2] + q[2] / seg], [0, 0, 0])
      const w = W[W.length - 1]
      for (let i = 0; i < seg; i++) tri(ctr, L[(i + 1) % seg], L[i], w, w, w)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  g.computeVertexNormals()
  const mesh = new THREE.SkinnedMesh(g, mat('std'))
  mesh.name = 'skin'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false
  root.add(mesh)
  mesh.bind(new THREE.Skeleton(bones))
  return mesh
}
function meshPart(parent, name, draw, seed = 1) {
  const builder = new Builder(seed)
  draw(builder)
  const group = builder.build()
  group.name = name
  parent.add(group)
  return group
}
const C = h => new THREE.Color(h)
/** Rim-light colour shared by every character (World sets it per time of day). */
export const RIM = { value: new THREE.Color(0.18, 0.15, 0.12) }

/* ------------------------------ body construction ------------------------------ */
function buildCharacter(o) {
  const root = new THREE.Group(), b = o.bulk, metal = o.armor != null, fem = !!o.fem
  const trim = o.crown ? 0xc9a24a : 0x9a825a, leather = 0x4a3020, leatherDark = 0x3a2418
  const body = joint(root, 'body'), hips = joint(body, 'hips', [0, 0.97, 0]), spine = joint(hips, 'spine')
  const tubes = []
  const sx = b * (fem ? 0.88 : 1), chestZ = fem ? 0.92 : 1
  // ---------- torso: lofted, colour-zoned (monk's one-shoulder robe, shirts, armour) ----------
  const robeZone = (x, y) => x > -0.2 + (y - 0.04) / 0.56 * 0.2   // robe over the LEFT (+x) shoulder, diagonal to right hip
  const sashBand = (x, y) => Math.abs(x - (-0.2 + (y - 0.04) / 0.56 * 0.2)) < 0.045
  meshPart(spine, 'torso', B => {
    const rings = [
      [-0.06, 0.165 * sx, 0.12, 0.14], [0.06, 0.145 * sx, 0.11, 0.115], [0.2, 0.158 * sx, 0.125, 0.12],
      [0.33, 0.2 * sx, 0.155 * chestZ, 0.135], [0.45, 0.235 * sx, 0.15 * chestZ, 0.135], [0.55, 0.235 * sx, 0.12, 0.125],
      [0.61, 0.18 * sx, 0.085, 0.095], [0.67, 0.08, 0.065, 0.065],
    ]
    const centre = (pos, i) => pos.count ? [(pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3] : [pos.getX(), pos.getY()]
    let colorFn
    if (metal) colorFn = (f, cy, pos, i) => { const [x, y] = centre(pos, i); return C(y > 0.62 ? o.skin : o.armor) }
    else if (o.robe && !o.fullRobe) colorFn = (f, cy, pos, i) => { const [x, y] = centre(pos, i); return C(y > 0.63 ? o.skin : sashBand(x, y) ? (o.sash ?? o.robe) : robeZone(x, y) ? o.robe : o.skin) }
    else if (o.vest) colorFn = (f, cy, pos, i) => { const [x, y] = centre(pos, i); return C(y > 0.6 || (y > 0.42 && Math.abs(x) > 0.13 * sx) ? o.skin : o.cloth) }
    else colorFn = (f, cy, pos, i) => { const [, y] = centre(pos, i); return C(y > 0.63 ? o.skin : (o.fullRobe ? o.robe : o.cloth)) }
    if (metal) B.add(loft(rings, 12), colorFn, { m: 'metal', grad: 0.14, jit: 0.06 })
    else tubes.push({ bone: spine, rings: rings.slice(0, 7), seg: 12, color: (x, y, z) => colorFn(0, 0, { getX: () => x, getY: () => y }, 0), start: [hips, 0.5] })
    tubes.torsoColor = colorFn
    if (metal) {
      // segmented plates, rim trims and the iron-anvil sigil
      for (let i = 0; i < 3; i++) B.add(loft([[0, 0.17 * sx, 0.135, 0.125], [0.07, 0.172 * sx, 0.14, 0.127]], 10), C(o.armor).multiplyScalar(0.85 + i * 0.07), { m: 'metal', at: [0, 0.08 + i * 0.075, 0.005] })
      B.add(G.box(0.12, 0.028, 0.02), trim, { m: 'gold', at: [0, 0.43, 0.15] })
      B.add(G.box(0.05, 0.075, 0.018), trim, { m: 'gold', at: [0, 0.39, 0.152] })
      B.add(G.box(0.09, 0.02, 0.018), trim, { m: 'gold', at: [0, 0.35, 0.148] })
      for (const s of [-1, 1]) B.add(G.box(0.02, 0.34, 0.016), trim, { m: 'gold', at: [s * 0.13 * sx, 0.38, 0.135], rot: [0, 0, s * -0.32] })
      B.add(loft([[0.6, 0.12, 0.085, 0.09], [0.68, 0.085, 0.07, 0.075]], 8), C(o.cloth).multiplyScalar(0.8), { at: [0, 0, 0] }) // gorget cloth
    }
    if (o.robe && !o.fullRobe) {
      // robe drape over the left shoulder + back panel
      B.add(polygon([[0.04, 0.66, 0.08], [0.25 * sx, 0.6, 0.08], [0.26 * sx, 0.48, 0.15], [0.1, 0.4, 0.17]]), o.robe, { m: 'cloth' })
      B.add(polygon([[0.04, 0.66, -0.09], [0.1, 0.4, -0.15], [0.26 * sx, 0.48, -0.14], [0.25 * sx, 0.6, -0.09]]), C(o.robe).multiplyScalar(0.9), { m: 'cloth' })
      B.add(G.ico(0.1, 0), o.robe, { at: [0.2 * sx, 0.6, 0], scale: [1.15, 0.7, 1.25] })
    }
    if (o.apron) {
      B.add(polygon([[-0.15 * sx, 0.5, 0.16], [0.15 * sx, 0.5, 0.16], [0.17 * sx, 0.06, 0.135], [-0.17 * sx, 0.06, 0.135]]), leather, { m: 'cloth', grad: 0.3 })
      for (const s of [-1, 1]) B.add(G.box(0.025, 0.24, 0.02), leatherDark, { at: [s * 0.1 * sx, 0.6, 0.11], rot: [0.35, 0, s * -0.2] })
    }
    if (o.shawl) {
      B.add(polygon([[-0.2 * sx, 0.62, 0.05], [0.2 * sx, 0.62, 0.05], [0.24 * sx, 0.5, 0.16], [0.08, 0.3, 0.19], [-0.1, 0.3, 0.19], [-0.24 * sx, 0.5, 0.16]]), o.shawl, { m: 'cloth', jit: 0.05 })
      B.add(polygon([[-0.2 * sx, 0.62, -0.06], [-0.24 * sx, 0.4, -0.16], [0.24 * sx, 0.4, -0.16], [0.2 * sx, 0.62, -0.06]]), C(o.shawl).multiplyScalar(0.9), { m: 'cloth' })
    }
    if (o.guruSash) B.add(polygon([[0.1, 0.64, 0.1], [0.18 * sx, 0.6, 0.14], [-0.12, 0.05, 0.16], [-0.2 * sx, 0.1, 0.13]]), o.guruSash, { m: 'cloth', jit: 0.08 })
    if (o.beads) for (let i = 0; i < 15; i++) {
      const t = i / 14, ang = (t - 0.5) * 2.4
      B.add(G.ico(0.017, 0), 0x5a3a22, { at: [Math.sin(ang) * 0.13, 0.6 - Math.cos(ang * 0.5) * 0.12 - Math.sin(t * Math.PI) * 0.12, 0.12 + Math.cos(ang) * 0.06] })
    }
    if (o.cape) for (const sign of [-1, 1]) B.add(G.ico(0.036, 0), trim, { m: 'gold', at: [sign * 0.16 * sx, 0.56, 0.13], scale: [1, 1, 0.35] })
    if (o.necklace) B.add(G.torus(0.09, 0.008, 3, 12), 0xd4af37, { m: 'gold', at: [0, 0.61, 0.04], rot: [1.25, 0, 0] })
  }, 17)
  // ---------- pelvis / belt ----------
  meshPart(hips, 'waist', B => {
    tubes.push({ bone: hips, rings: [[-0.16, 0.15 * sx, 0.11, 0.12], [-0.08, 0.17 * sx, 0.13, 0.14], [-0.01, 0.172 * sx, 0.125, 0.14], [0.06, 0.15 * sx, 0.11, 0.12]], seg: 12, color: () => o.robe ?? o.pants })
    const sash = o.sash ?? (o.robe ? o.pants : leather)
    if (o.robe && !o.fullRobe) {
      // broad wrapped sash with hanging tails (monk board)
      for (let i = 0; i < 3; i++) B.add(loft([[0, 0.178 * sx, 0.135, 0.15], [0.05, 0.176 * sx, 0.132, 0.148]], 12), C(sash).multiplyScalar(1 - i * 0.06), { at: [0, -0.04 + i * 0.045, 0] })
      B.add(polygon([[0.04, 0.0, 0.15], [0.12, 0.0, 0.14], [0.13, -0.42, 0.17], [0.05, -0.46, 0.18]]), C(sash).multiplyScalar(0.92), { m: 'cloth' })
      B.add(polygon([[-0.02, 0.0, 0.15], [0.05, 0.0, 0.15], [0.03, -0.32, 0.19], [-0.04, -0.3, 0.18]]), sash, { m: 'cloth' })
    } else {
      B.add(loft([[0, 0.176 * sx, 0.132, 0.145], [0.045, 0.174 * sx, 0.13, 0.143]], 10), metal ? leatherDark : sash, { at: [0, -0.02, 0] })
      B.add(G.box(0.07, 0.055, 0.02), trim, { m: metal ? 'gold' : 'std', at: [0, 0.003, 0.14] })
    }
    if (o.herbs) for (const s of [-1, 1]) {
      B.add(G.chamfer(0.09, 0.11, 0.05, 0.015), 0x6a4a2a, { at: [s * 0.18 * sx, -0.08, 0.1], rot: [0, s * 0.5, 0] })
      B.add(G.cone(0.03, 0.18, 4), 0x547744, { at: [s * 0.2 * sx, 0.0, 0.13], rot: [0, 0, s * 0.3] })
      B.add(G.ico(0.02, 0), 0x8a7cf0, { at: [s * 0.2 * sx, 0.09, 0.13] })
    }
  }, 18)
  // ---------- skirts / robes / tassets ----------
  if (o.robe || o.skirt || o.dress || o.apron || metal || o.dhoti) {
    const skirt = part(hips, 'skirt')
    meshPart(skirt, 'skirtGeometry', B => {
      if (o.robe) B.add(drape(0.19 * sx, 0.33 * sx, o.fullRobe ? 0.85 : 0.72, 16, 0.82, 0.07), o.robe, { m: 'cloth', at: [0, -0.06, 0], grad: 0.16, jit: 0.07 })
      if (o.robe && !o.fullRobe) B.add(polygon([[0.0, -0.07, 0.17], [0.18 * sx, -0.07, 0.15], [0.26 * sx, -0.72, 0.22], [0.02, -0.66, 0.27]]), C(o.robe).multiplyScalar(0.9), { m: 'cloth' })
      if (o.skirt) {
        // half-sari: plum wrap over a cream underskirt (Thamarai board)
        if (o.underskirt) B.add(drape(0.17 * sx, 0.27 * sx, 0.84, 14, 0.85, 0.03), o.underskirt, { m: 'cloth', at: [0, -0.06, 0] })
        B.add(drape(0.18 * sx, 0.3 * sx, o.underskirt ? 0.68 : 0.82, 14, 0.85, 0.08), o.skirt, { m: 'cloth', at: [0, -0.05, 0], grad: 0.15 })
        B.add(polygon([[-0.18 * sx, -0.07, 0.15], [0.15 * sx, -0.07, 0.16], [0.24 * sx, -0.52, 0.22], [-0.2 * sx, -0.7, 0.2]]), C(o.skirt).multiplyScalar(1.12), { m: 'cloth' })
        if (o.trimCol) B.add(polygon([[0.15 * sx, -0.08, 0.165], [0.2 * sx, -0.08, 0.16], [0.28 * sx, -0.55, 0.22], [0.24 * sx, -0.52, 0.225]]), o.trimCol, { m: 'cloth' })
      }
      if (o.dress) B.add(drape(0.17 * sx, 0.27 * sx, o.child ? 0.62 : 0.8, 12, 0.85, 0.05), o.cloth, { m: 'cloth', at: [0, -0.05, 0], grad: 0.12 })
      if (o.dhoti) {
        B.add(drape(0.18 * sx, 0.24 * sx, 0.88, 12, 0.8, 0.02), o.dhoti, { m: 'cloth', at: [0, -0.06, 0] })
        B.add(loft([[-0.95, 0.24 * sx, 0.19, 0.19], [-0.88, 0.235 * sx, 0.188, 0.188]], 12, { top: false, bottom: false }), o.border ?? 0x6a4a30, { at: [0, 0, 0] })
      }
      if (o.apron) B.add(polygon([[-0.17 * sx, -0.06, 0.15], [0.17 * sx, -0.06, 0.15], [0.2 * sx, -0.62, 0.17], [-0.2 * sx, -0.62, 0.17]]), leather, { m: 'cloth', grad: 0.3 })
      if (metal) {
        for (const s of [-1, 1]) B.add(G.chamfer(0.13 * sx, 0.24, 0.035, 0.01), o.armor, { m: 'metal', at: [s * 0.13 * sx, -0.17, 0.12], rot: [0.08, 0, s * -0.16] })
        B.add(polygon([[-0.1, -0.05, 0.15], [0.1, -0.05, 0.15], [0.09, -0.52, 0.16], [0, -0.58, 0.165], [-0.09, -0.52, 0.16]]), o.tabard ?? C(o.cloth).multiplyScalar(1.4), { m: 'cloth' })
        B.add(drape(0.16 * sx, 0.2 * sx, 0.42, 10, 0.8, 0.04), C(o.cloth).multiplyScalar(0.8), { m: 'cloth', at: [0, -0.04, 0] })
      }
    }, 19)
  }
  // ---------- neck & head ----------
  const neck = joint(spine, 'neck', [0, 0.63, 0])
  tubes.push({ bone: neck, rings: [[-0.04, 0.09 * sx, 0.08, 0.085], [0.04, 0.072 * b, 0.066, 0.074], [0.13, 0.062, 0.058, 0.064]], seg: 9, color: () => o.skin, start: [spine, 0.5] })
  const head = joint(neck, 'head', [0, 0.14, 0])
  head.scale.setScalar(o.child ? 1 : 0.9)
  meshPart(head, 'face', B => {
    const child = o.child, w = child ? 1.08 : o.crown ? 1.06 : fem ? 0.92 : 1
    // skull + jaw lofted: wide brow, strong cheekbones, tapered chin (12 facets per ring)
    const jaw = child ? 0.85 : fem ? 0.82 : o.heavyJaw ? 1.12 : 1
    const SKULL = [[-0.13, 0.04 * jaw], [-0.1, 0.075 * jaw], [-0.04, 0.108], [0.0, 0.116], [0.05, 0.119], [0.1, 0.113], [0.145, 0.094], [0.175, 0.06], [0.195, 0.02]]
    const skullR = y => { // radius of the skull at height y (for hair that hugs it)
      for (let i = 0; i < SKULL.length - 1; i++) { const [y0, r0] = SKULL[i], [y1, r1] = SKULL[i + 1]; if (y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0)) * w }
      return 0.02 * w
    }
    B.add(loft([
      [-0.13, 0.04 * w * jaw, 0.05, 0.03, 0, 0.055], [-0.1, 0.075 * w * jaw, 0.08, 0.06, 0, 0.04], [-0.04, 0.108 * w, 0.11, 0.1, 0, 0.012],
      [0.0, 0.116 * w, 0.115, 0.11], [0.05, 0.119 * w, 0.114, 0.118], [0.1, 0.113 * w, 0.105, 0.12], [0.145, 0.094 * w, 0.085, 0.104], [0.175, 0.06 * w, 0.055, 0.07], [0.195, 0.02 * w, 0.018, 0.025],
    ], 12), o.skin, { grad: 0.08, jit: 0.04 })
    // brow ridge, cheekbones, nose, ears, mouth
    B.add(G.box(0.15 * w, 0.02, 0.025), o.skin, { at: [0, 0.052, 0.103], rot: [0.2, 0, 0], grad: 0 })
    for (const s of [-1, 1]) {
      B.add(G.ico(0.03, 0), o.skin, { at: [s * 0.066 * w, -0.012, 0.088], scale: [0.9, 0.55, 0.45] })
      B.add(G.ico(0.032, 0), o.skin, { at: [s * 0.118 * w, 0.005, -0.005], scale: [0.45, 1.05, 0.75] })
      // eyes: almond whites + iris; blind guru = clouded pale
      B.add(G.oct(child ? 0.024 : 0.02), o.blind ? 0xd8d4cc : 0xece2d0, { at: [s * 0.045, 0.028, 0.108], scale: [1.1, 0.55, 0.45], grad: 0, jit: 0 })
      if (!o.blind) B.add(G.ico(child ? 0.012 : 0.0095, 0), 0x1a110a, { at: [s * 0.045, 0.028, 0.116], grad: 0, jit: 0 })
      B.add(G.box(0.012, 0.004, 0.006), o.fem ? 0x1a0e08 : C(o.skin).multiplyScalar(0.6), { at: [s * 0.06, 0.035, 0.112], grad: 0 }) // lash / lid line
      B.add(G.box(o.fem ? 0.034 : 0.038, o.fem ? 0.007 : 0.011, 0.014), o.brow ?? o.beard ?? o.hair ?? 0x2a1a10, { at: [s * 0.05, 0.058, 0.117], rot: [0, 0, s * (o.stern ? -0.24 : o.child ? 0.15 : o.fem ? 0.08 : -0.08)], grad: 0 })
      if (o.earring) B.add(G.ico(0.008, 0), 0xd4af37, { m: 'gold', at: [s * 0.122 * w, -0.03, 0.0] })
    }
    B.add(polygon([[0, 0.045, 0.118], [0.018, -0.02, 0.135], [0, -0.032, 0.15], [-0.018, -0.02, 0.135]]), o.skin, { grad: 0 })
    B.add(polygon([[0.018, -0.02, 0.135], [0.02, -0.03, 0.118], [0, -0.032, 0.15]]), C(o.skin).multiplyScalar(0.86), { grad: 0 })
    B.add(polygon([[-0.018, -0.02, 0.135], [0, -0.032, 0.15], [-0.02, -0.03, 0.118]]), C(o.skin).multiplyScalar(0.86), { grad: 0 })
    B.add(G.box(child ? 0.05 : 0.044, 0.009, 0.012), o.fem ? 0x7a3a30 : o.smile ? 0x6a2a20 : 0x5a3024, { at: [0, -0.068, 0.103], grad: 0 })
    if (o.smile) for (const s of [-1, 1]) B.add(G.box(0.012, 0.008, 0.01), 0x5a3024, { at: [s * 0.026, -0.062, 0.1], rot: [0, 0, s * 0.5], grad: 0 })
    if (o.bindi) B.add(G.ico(0.006, 0), 0xb01a1a, { at: [0, 0.075, 0.118], grad: 0 })
    // ---- hair: a faceted shell that hugs the skull and leaves the face open
    const H = o.hair
    const hairShell = ({ hairline = 0.085, nape = -0.06, side = 0.0, lift = 1.09, cols = 16, rows = 6, ears = false } = {}) => {
      const pos = [], P = []
      for (let i = 0; i <= cols; i++) {
        const a = i / cols * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a)
        // lowest point of the hair at this angle: forehead hairline in front, over the ears at the sides, nape at the back
        const front = Math.max(0, c), back = Math.max(0, -c)
        const low = front * hairline + (1 - front - back) * (ears ? -0.07 : side) + back * nape
        const col = []
        for (let j = 0; j <= rows; j++) {
          const t = j / rows, y = lerp(low, 0.205, Math.pow(t, 0.85))
          const r = (skullR(Math.min(y, 0.19)) + 0.012) * lift * (j === rows ? 0.3 : 1) + (j === 0 ? 0.008 : 0)
          col.push([sn * r * (1 + ((i * 7 + j * 3) % 5) * 0.01), y + (j === 0 ? -((i % 3) * 0.006) : 0), c * r * 0.98 - 0.008])
        }
        P.push(col)
      }
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const A = P[i][j], Bq = P[i + 1][j], Cq = P[i][j + 1], D = P[i + 1][j + 1]
        pos.push(...A, ...Cq, ...Bq, ...Bq, ...Cq, ...D)
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      B.add(g, H, { jit: 0.09, grad: 0.25, m: 'cloth' })
    }
    if (H != null && !o.helmet) {
      const style = o.hairStyle ?? (o.braid ? 'braid' : o.ponytail ? 'ponytail' : o.long ? 'long' : o.child ? 'spiky' : 'short')
      if (style === 'braid') {
        // Thamarai: centre parting, hair swept over the ears into one thick plait to the waist
        hairShell({ hairline: 0.1, ears: true, nape: -0.09 })
        B.add(G.box(0.006, 0.004, 0.13), C(H).multiplyScalar(0.5), { at: [0, 0.2, 0.03], rot: [-0.9, 0, 0], grad: 0 }) // parting
        for (const s of [-1, 1]) B.add(G.oct(0.045), H, { at: [s * 0.1 * w, 0.03, 0.03], scale: [0.5, 1.6, 0.9], rot: [0, 0, s * 0.15] })
        B.add(G.ico(0.055, 0), H, { at: [0, -0.04, -0.115], scale: [1.1, 1.0, 0.9] })
        const len = child ? 7 : 11
        for (let i = 0; i < len; i++) {
          const y = -0.09 - i * 0.058, z = -0.135 - i * 0.006, rr = 0.042 - i * 0.0018
          for (const s of [-1, 1]) B.add(G.oct(rr), H, { at: [s * 0.016 + Math.sin(i * 1.3) * 0.005, y - (s > 0 ? 0.029 : 0), z], scale: [0.9, 1.35, 0.75], rot: [0, 0, s * 0.55] })
        }
        const end = -0.09 - len * 0.058
        B.add(G.cyl(0.024, 0.026, 0.03, 8), 0xd4af37, { m: 'gold', at: [0, end + 0.01, -0.135 - len * 0.006] })
        B.add(G.cone(0.03, 0.09, 6), H, { at: [0, end - 0.045, -0.135 - len * 0.006], rot: [Math.PI, 0, 0] })
        if (!child) B.add(G.ico(0.012, 0), 0xf4f0e0, { at: [0.07, 0.12, -0.08] }) // jasmine
      } else if (style === 'ponytail') {
        // Kaali: hair pulled back hard, a thick tied tail down the back
        hairShell({ hairline: 0.11, side: 0.02, nape: -0.04, lift: 1.06 })
        B.add(G.cyl(0.03, 0.03, 0.035, 8), 0x6a4a2a, { at: [0, 0.03, -0.14], rot: [1.2, 0, 0] })
        B.add(loft([[0.03, 0.05, 0.04, 0.045, 0, -0.15], [-0.08, 0.065, 0.05, 0.06, 0, -0.17], [-0.24, 0.055, 0.045, 0.05, 0, -0.18], [-0.4, 0.035, 0.03, 0.035, 0, -0.17], [-0.48, 0.008, 0.008, 0.008, 0, -0.16]], 8), H, { jit: 0.12, m: 'cloth' })
      } else if (style === 'long') {
        // Malli / Rudhra / villagers: loose long hair falling past the shoulders, locks framing the face
        hairShell({ hairline: 0.09, ears: true, nape: -0.12 })
        const L = o.child ? 0.42 : 0.36
        B.add(loft([[-0.08, 0.125 * w, 0.03, 0.07, 0, -0.06], [-0.2, 0.15 * w, 0.03, 0.08, 0, -0.08], [-L, 0.15 * w, 0.025, 0.07, 0, -0.1], [-L - 0.06, 0.1 * w, 0.02, 0.04, 0, -0.1]], 10, { top: false }), H, { jit: 0.14, m: 'cloth' })
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) B.add(G.cone(0.03, 0.2 + i * 0.05, 4), H, { at: [s * (0.11 + i * 0.012) * w, -0.08 - i * 0.04, 0.03 - i * 0.04], rot: [Math.PI - 0.1, 0, s * (0.12 + i * 0.05)], m: 'cloth' })
        if (o.child) for (let i = 0; i < 6; i++) B.add(G.cone(0.04, 0.12, 4), H, { at: [Math.sin(i) * 0.1, 0.17, Math.cos(i * 1.3) * 0.08], rot: [Math.cos(i) * 0.8, 0, Math.sin(i) * 0.8], m: 'cloth' })
        if (o.tie) B.add(G.cyl(0.02, 0.02, 0.02, 6), 0xd4af37, { m: 'gold', at: [0, -0.05, -0.13] })
      } else {
        hairShell({ hairline: style === 'grey' ? 0.11 : 0.1, side: 0.01, nape: -0.04, lift: style === 'spiky' ? 1.08 : 1.05 })
        if (style === 'spiky') {
          for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; B.add(G.cone(0.04, 0.1, 4), H, { at: [Math.sin(a) * 0.09 * w, 0.15 + (i % 3) * 0.012, Math.cos(a) * 0.085 - 0.01], rot: [Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0], m: 'cloth' }) }
          for (let i = 0; i < 4; i++) B.add(G.cone(0.035, 0.09, 4), H, { at: [-0.05 + i * 0.035, 0.15, 0.08], rot: [1.2, 0, (i - 1.5) * 0.2], m: 'cloth' })
        }
        if (style === 'grey') for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.add(G.ico(0.04, 0), H, { at: [Math.sin(a) * 0.105 * w, 0.11 + (i % 2) * 0.03, Math.cos(a) * 0.1 - 0.02] }) }
      }
    }
    // ---- beards
    if (o.beard != null) {
      const long = o.longBeard, len = long ? 0.3 : 0.075
      B.add(loft([[-0.14 - len * 0.6, 0.03, 0.03, 0.01, 0, 0.07], [-0.12, 0.07, 0.06, 0.03, 0, 0.065], [-0.07, 0.11, 0.1, 0.06, 0, 0.02], [-0.02, 0.12, 0.08, 0.08, 0, 0.0]], 9, { top: false }), o.beard, { jit: 0.1, grad: 0.15 })
      if (long) B.add(G.cone(0.075, len, 6), o.beard, { at: [0, -0.15 - len / 2, 0.075], rot: [Math.PI - 0.15, 0, 0], scale: [1, 1, 0.65] })
      for (const s of [-1, 1]) B.add(G.box(0.05, 0.02, 0.022), o.beard, { at: [s * 0.024, -0.047, 0.125], rot: [0, 0, s * -0.25] })
    }
    // ---- helmets
    if (o.helmet != null) {
      B.add(loft([[0.02, 0.135 * w, 0.13, 0.135], [0.1, 0.13 * w, 0.125, 0.13], [0.19, 0.08, 0.075, 0.08], [0.25, 0.015, 0.015, 0.015]], 9), o.helmet, { m: 'metal' })
      B.add(loft([[0.01, 0.14 * w, 0.135, 0.14], [0.04, 0.142 * w, 0.137, 0.142]], 9), C(o.helmet).multiplyScalar(0.8), { m: 'metal' })
      for (const s of [-1, 1]) B.add(G.chamfer(0.02, 0.13, 0.1, 0.008), o.helmet, { m: 'metal', at: [s * 0.125, -0.03, 0.02], rot: [0, 0, s * -0.12] })
      B.add(G.box(0.02, 0.09, 0.02), o.helmet, { m: 'metal', at: [0, 0.0, 0.135] })
      if (o.plume) for (let i = 0; i < 6; i++) B.add(G.oct(0.06), o.plume, { at: [0, 0.26 + Math.sin(i / 5 * Math.PI) * 0.05, 0.06 - i * 0.055], scale: [0.25, 1.1 + i * 0.08, 0.7], rot: [-0.3 - i * 0.15, 0, 0] })
    }
  }, 24)
  if (o.crown) {
    const crown = part(head, 'crown')
    meshPart(crown, 'crownGeometry', B => {
      B.add(G.cyl(0.135, 0.128, 0.065, 14, true), 0xd2a543, { m: 'gold', at: [0, 0.155, -0.005] })
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2
        B.add(G.cone(0.028, i === 0 ? 0.14 : 0.105, 4), 0xe2b755, { m: 'gold', at: [Math.sin(a) * 0.132, i === 0 ? 0.245 : 0.228, Math.cos(a) * 0.132 - 0.005] })
        B.add(G.oct(0.012), 0xb01a1a, { at: [Math.sin(a) * 0.137, 0.16, Math.cos(a) * 0.137 - 0.005] })
      }
    }, 25)
  }
  // ---------- arms ----------
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'R' : 'L'  // character's left is +x
    const bareUpper = !metal && (o.robe && !o.fullRobe || o.vest || o.apron), sleeve = o.sleeve ?? (o.fullRobe ? 'long' : o.shortSleeve ? 'short' : 'none')
    const sh = joint(spine, 'shoulder' + side, [0.235 * sx * sign, 0.555, 0])
    meshPart(sh, 'upperArm' + side, B => {
      const armCol = metal ? o.armor : (sleeve === 'long' ? (o.fullRobe ? o.robe : o.cloth) : o.skin)
      // deltoid + bicep loft
      tubes.push({ bone: sh, rings: [[0.07, 0.07 * b, 0.08, 0.08, -sign * 0.035], [0.0, 0.095 * b, 0.092, 0.088], [-0.09, 0.082 * b, 0.084, 0.072], [-0.19, 0.074 * b, 0.082, 0.064], [-0.3, 0.056 * b, 0.058, 0.055]], seg: 10, color: () => armCol, start: [spine, 0.45], end: [null, 0.5] })
      tubes.arm = tubes[tubes.length - 1]
      if (metal) {
        // layered pauldrons
        for (let i = 0; i < 3; i++) B.add(loft([[0, 0.1 * b - i * 0.008, 0.1, 0.1], [0.05, 0.085 * b - i * 0.008, 0.085, 0.085]], 8), C(o.armor).multiplyScalar(1.05 - i * 0.08), { m: 'metal', at: [sign * 0.01, 0.02 - i * 0.055, 0] })
        B.add(G.box(0.02, 0.02, 0.15), trim, { m: 'gold', at: [sign * 0.06, 0.05, 0] })
      } else if (sleeve === 'short' || (!bareUpper && sleeve !== 'none' && sleeve !== 'long')) {
        B.add(loft([[0.06, 0.1 * b, 0.1, 0.098], [-0.06, 0.106 * b, 0.104, 0.098], [-0.16, 0.096 * b, 0.096, 0.088]], 10), o.cloth, { at: [0, -0.01, 0], m: 'cloth' })
        if (o.cuff) B.add(loft([[-0.165, 0.1 * b, 0.1, 0.092], [-0.2, 0.098 * b, 0.098, 0.09]], 10), o.cuff, { m: 'cloth' })
      } else if (o.robe && !o.fullRobe && sign > 0) {
        B.add(loft([[0.07, 0.1 * b, 0.1, 0.1], [-0.12, 0.1 * b, 0.1, 0.092]], 10), o.robe, { m: 'cloth' })
      }
    }, side === 'L' ? 26 : 27)
    const elbow = joint(sh, 'elbow' + side, [0, -0.31, 0])
    tubes.arm.end[0] = elbow
    meshPart(elbow, 'forearm' + side, B => {
      const col = metal ? 0x3a3438 : sleeve === 'long' ? (o.fullRobe ? o.robe : o.cloth) : o.skin
      tubes.push({ bone: elbow, rings: [[0.02, 0.056 * b, 0.056, 0.054], [-0.06, 0.066 * b, 0.068, 0.058], [-0.17, 0.052 * b, 0.052, 0.046], [-0.27, 0.037, 0.038, 0.034]], seg: 10, color: () => col, capEnd: true })
      if (metal) B.add(loft([[-0.06, 0.062 * b, 0.062, 0.058], [-0.24, 0.048, 0.048, 0.045]], 7), o.armor, { m: 'metal' })
      if (o.apron || o.bracers) B.add(loft([[-0.12, 0.05, 0.05, 0.047], [-0.25, 0.042, 0.042, 0.04]], 7), leather)
      if (o.beads) for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; B.add(G.ico(0.014, 0), 0x5a3a22, { at: [Math.sin(a) * 0.04, -0.245, Math.cos(a) * 0.037] }); B.add(G.ico(0.013, 0), 0x5a3a22, { at: [Math.sin(a + 0.3) * 0.039, -0.222, Math.cos(a + 0.3) * 0.036] }) }
      if (o.burns && sign > 0) for (let i = 0; i < 3; i++) B.add(G.box(0.03, 0.05, 0.004), 0xa06a52, { at: [0.01, -0.08 - i * 0.04, 0.045], rot: [0, 0, 0.4 + i * 0.2] })
    }, 28 + sign)
    const hand = joint(elbow, 'hand' + side, [0, -0.29, 0])
    meshPart(hand, 'handGeometry' + side, B => {
      const hc = metal ? 0x2e2a2c : o.skin
      B.add(loft([[0.02, 0.03, 0.022, 0.02], [-0.04, 0.042, 0.022, 0.02], [-0.085, 0.04, 0.02, 0.018]], 6), hc, { grad: 0.1 })
      B.add(G.cyl(0.012, 0.014, 0.06, 5), hc, { at: [-sign * 0.038, -0.04, 0.018], rot: [0.3, 0, -sign * 0.5] }) // thumb
      for (let i = 0; i < 4; i++) B.add(G.chamfer(0.017, 0.045, 0.02, 0.005), hc, { at: [(i - 1.5) * 0.019, -0.11, 0.008], rot: [0.25, 0, 0] })
      if (sign > 0 && o.scar) B.add(G.box(0.035, 0.005, 0.005), 0xc08870, { at: [0, -0.04, 0.024], rot: [0, 0, 0.6] })
    }, 30)
    // ---------- legs ----------
    const hip = joint(hips, 'leg' + side, [0.095 * sx * sign, -0.05, 0])
    meshPart(hip, 'thigh' + side, B => {
      const shorts = o.shorts
      const col = shorts || o.robe || o.skirt || o.dress || o.dhoti ? o.skin : o.pants
      tubes.push({ bone: hip, rings: [[0.06, 0.098 * b, 0.1, 0.1, -sign * 0.01], [-0.08, 0.102 * b, 0.105, 0.098], [-0.26, 0.082 * b, 0.088, 0.078], [-0.44, 0.06 * b, 0.064, 0.06]], seg: 10, color: () => col, start: [hips, 0.5], end: [null, 0.5] })
      tubes.leg = tubes[tubes.length - 1]
      if (shorts) B.add(loft([[0.06, 0.1 * b, 0.1, 0.1], [-0.2, 0.09 * b, 0.092, 0.088]], 8), o.pants)
      if (o.baggy) B.add(loft([[0.05, 0.1 * b, 0.1, 0.1], [-0.2, 0.11 * b, 0.11, 0.105], [-0.44, 0.08 * b, 0.08, 0.075]], 8), o.pants, { jit: 0.1 })
      if (metal) B.add(loft([[-0.04, 0.095 * b, 0.1, 0.07], [-0.3, 0.08 * b, 0.09, 0.06]], 7), o.armor, { m: 'metal' })
    }, 32)
    const knee = joint(hip, 'knee' + side, [0, -0.45, 0])
    tubes.leg.end[0] = knee
    meshPart(knee, 'shin' + side, B => {
      const bare = o.robe || o.skirt || o.dress || o.shorts || o.dhoti
      tubes.push({ bone: knee, rings: [[0.02, 0.06 * b, 0.064, 0.06], [-0.1, 0.068 * b, 0.064, 0.082], [-0.28, 0.048 * b, 0.05, 0.05], [-0.41, 0.038, 0.04, 0.038]], seg: 10, color: () => bare ? o.skin : o.pants, capEnd: true })
      if (metal) {
        B.add(G.ico(0.07, 0), o.armor, { m: 'metal', at: [0, 0.0, 0.04], scale: [b, 0.95, 0.8] })
        B.add(loft([[-0.04, 0.066 * b, 0.072, 0.05], [-0.36, 0.05, 0.055, 0.042]], 7), o.armor, { m: 'metal' })
      } else if (o.boots) B.add(loft([[-0.2, 0.058, 0.058, 0.058], [-0.41, 0.05, 0.05, 0.05]], 7), leather, { jit: 0.1 })
    }, 33)
    const foot = joint(knee, 'foot' + side, [0, -0.42, 0])
    meshPart(foot, 'footGeometry' + side, B => {
      const shod = !o.barefoot && !o.child, boot = metal || o.boots
      const fc = boot ? (metal ? 0x2a2426 : leather) : o.skin
      B.add(loft([[0.0, 0.045, 0.05, 0.05], [-0.05, 0.05, 0.12, 0.05]], 7, {}), fc, { at: [0, 0, 0.0], grad: 0.1 })
      B.add(G.chamfer(0.085, 0.05, 0.2, 0.015), fc, { at: [0, -0.035, 0.06] })
      if (shod && !boot) {
        B.add(G.chamfer(0.095, 0.02, 0.24, 0.006), leatherDark, { at: [0, -0.062, 0.06] })
        for (let i = 0; i < 3; i++) B.add(G.box(0.1, 0.015, 0.02), leather, { at: [0, -0.03 + i * 0.012, 0.11 - i * 0.07], rot: [-0.2, 0, 0] })
        B.add(G.torus(0.05, 0.008, 3, 8), leather, { at: [0, 0.03, -0.0], rot: [Math.PI / 2, 0, 0] })
      }
      if (boot) B.add(G.chamfer(0.1, 0.03, 0.24, 0.008), 0x1e1814, { at: [0, -0.065, 0.06] })
    }, 34)
  }
  // ---------- cape ----------
  if (o.cape) {
    const cape = part(spine, 'cape', [0, 0.57, -0.15])
    meshPart(cape, 'capeGeometry', B => B.add(capeGeometry(0.56 * sx, o.shortCape ? 0.62 : 1.3), (f, cy) => C(o.cape).multiplyScalar(0.72 + cy * 0.36), { m: 'cloth', grad: 0.12, jit: 0.08 }), 35)
    if (o.capeCollar) meshPart(spine, 'capeCollar', B => B.add(loft([[0.52, 0.2 * sx, 0.13, 0.16], [0.62, 0.17 * sx, 0.12, 0.15]], 10), o.cape, { m: 'cloth' }), 36)
  }
  buildSkin(root, tubes.filter(t => t.bone))
  return root
}

function buildWeapon(kind, ironStaff) {
  const root = new THREE.Group()
  meshPart(root, 'weaponGeometry', B => {
    const wood = 0x6e4a2a, steel = 0xb8bcc4, gold = 0xc9a24a
    if (kind === 'staff') {
      // faceted 2 m staff with knots, brass (early) or iron (Ch. IV) caps
      B.add(loft([[-0.75, 0.028, 0.028, 0.028], [-0.2, 0.026, 0.026, 0.026], [0.2, 0.029, 0.029, 0.029], [0.7, 0.025, 0.025, 0.025], [1.25, 0.027, 0.027, 0.027]], 6), wood, { rot: [Math.PI / 2, 0, 0], at: [0, 0, 0], jit: 0.1, grad: 0 })
      for (const z of [0.1, 0.62]) B.add(G.ico(0.033, 0), 0x5a3a20, { at: [0, 0, z] })
      for (const z of [-0.75, 1.25]) {
        const capCol = ironStaff ? 0x6a6e74 : gold, m = ironStaff ? 'metal' : 'gold', d = z > 0 ? 1 : -1
        B.add(G.cyl(0.036, 0.036, 0.16, 8), capCol, { m, at: [0, 0, z - d * 0.06], rot: [Math.PI / 2, 0, 0] })
        for (const k of [-0.05, 0.05]) B.add(G.cyl(0.04, 0.04, 0.016, 8), ironStaff ? 0x8a8e94 : 0xe0b76a, { m, at: [0, 0, z - d * 0.06 + k], rot: [Math.PI / 2, 0, 0] })
        B.add(G.cone(0.036, 0.04, 8), capCol, { m, at: [0, 0, z + d * 0.04], rot: [d * Math.PI / 2, 0, 0] })
      }
    } else if (kind === 'sword' || kind === 'greatsword') {
      const big = kind === 'greatsword', length = big ? 1.5 : 0.9, width = big ? 0.12 : 0.066
      const position = [], cross = [[-width / 2, 0], [0, 0.016], [width / 2, 0], [0, -0.016]], start = 0.14, taper = start + length - 0.16, end = start + length
      for (let i = 0; i < 4; i++) {
        const A = [...cross[i], start], Bp = [...cross[(i + 1) % 4], start], Cp = [...cross[i], taper], D = [...cross[(i + 1) % 4], taper]
        position.push(...A, ...Cp, ...Bp, ...Bp, ...Cp, ...D, ...Cp, 0, 0, end, ...D)
      }
      const blade = new THREE.BufferGeometry(); blade.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
      B.add(blade, steel, { m: 'metal', jit: 0.03, grad: 0.02 })
      B.add(G.cyl(0.022, 0.024, big ? 0.26 : 0.17, 6), big ? 0x1a1414 : 0x3b0f0f, { at: [0, 0, big ? -0.02 : 0.03], rot: [Math.PI / 2, 0, 0] })
      B.add(G.chamfer(big ? 0.34 : 0.22, 0.03, 0.045, 0.01), big ? gold : 0x8a8e94, { m: big ? 'gold' : 'metal', at: [0, 0, 0.125] })
      if (big) B.add(G.oct(0.04), gold, { m: 'gold', at: [0, 0, 0.125], scale: [1, 1.6, 0.8] })
      B.add(G.oct(big ? 0.05 : 0.034), big ? gold : 0x8a8e94, { m: big ? 'gold' : 'metal', at: [0, 0, big ? -0.17 : -0.07] })
    } else if (kind === 'hammer') {
      B.add(G.cyl(0.03, 0.035, 1.7, 7), wood, { at: [0, 0, 0.6], rot: [Math.PI / 2, 0, 0] })
      B.add(G.chamfer(0.36, 0.22, 0.24, 0.04), 0x4a494e, { m: 'metal', at: [0, 0, 1.4] })
      B.add(G.chamfer(0.08, 0.26, 0.28, 0.02), 0x2e2d32, { m: 'metal', at: [0, 0, 1.4] })
      for (const z of [-0.11, 0.04, 1.22]) B.add(G.cyl(0.04, 0.04, 0.04, 6), 0x30221a, { at: [0, 0, z], rot: [Math.PI / 2, 0, 0] })
    } else if (kind === 'bird') {
      B.add(G.chamfer(0.08, 0.03, 0.07, 0.01), 0x6e4a2a, { at: [0, -0.02, 0.12] })
      B.add(G.ico(0.045, 0), 0xd06a2a, { at: [0, 0.03, 0.12], scale: [0.85, 1.05, 1.2] })
      B.add(G.ico(0.045, 0), 0x2a6ab0, { at: [0, 0.05, 0.1], scale: [0.9, 0.9, 1.3] })
      B.add(G.ico(0.033, 0), 0x2a6ab0, { at: [0, 0.09, 0.15] })
      B.add(G.cone(0.01, 0.07, 4), 0x1a1a1a, { at: [0, 0.088, 0.205], rot: [Math.PI / 2, 0, 0] })
    } else if (kind === 'broom') {
      B.add(G.cyl(0.018, 0.02, 1.3, 6), 0x8a6a40, { at: [0, 0, 0.2], rot: [Math.PI / 2, 0, 0] })
      for (let i = 0; i < 9; i++) B.add(G.cone(0.025, 0.42, 4), 0xc9a25a, { at: [Math.sin(i) * 0.04, Math.cos(i * 1.7) * 0.03, 0.98], rot: [-Math.PI / 2 + (i - 4) * 0.06, 0, (i - 4) * 0.08] })
      B.add(G.cyl(0.03, 0.03, 0.05, 6), 0x6a4a2a, { at: [0, 0, 0.83], rot: [Math.PI / 2, 0, 0] })
    } else if (kind === 'flower') {
      B.add(G.cyl(0.006, 0.006, 0.25, 4), 0x3f6b2d, { at: [0, 0, 0.1], rot: [Math.PI / 2, 0, 0] })
      for (let i = 0; i < 2; i++) B.add(G.oct(0.025), 0x4a7a32, { at: [0, 0.01, 0.05 + i * 0.06], scale: [0.4, 0.1, 1.5], rot: [0, i * 2, 0] })
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; B.add(G.oct(0.032), 0xa494ff, { m: 'glow', at: [Math.sin(a) * 0.03, Math.cos(a) * 0.03, 0.235], scale: [0.6, 1.2, 0.3], rot: [0, 0, -a], hdr: 1.4 }) }
      B.add(G.ico(0.016, 0), 0xf0e0ff, { m: 'glow', at: [0, 0, 0.246], hdr: 1.8 })
    }
  }, 39)
  return root
}

/* ------------------------------ poses ------------------------------ */
const POSES = {
  meditate: { hipsY: 0.3, spY: 0, spX: -0.02, lHpX: -1.45, rHpX: -1.45, lHpZ: 0.8, rHpZ: -0.8, lKn: 2.55, rKn: 2.55, lAnk: 0.4, rAnk: 0.4, lShX: -0.45, rShX: -0.45, lShZ: 0.3, rShZ: -0.3, lEl: -1.05, rEl: -1.05, neckX: 0.1, wpX: 0 },
  kneel: { hipsY: 0.55, spX: 0.22, lHpX: -1.4, rHpX: 0.25, lKn: 1.45, rKn: 1.65, lAnk: 0, rAnk: 0.9, lShX: 0.15, rShX: 0.15, neckX: 0.4, spY: 0 },
  defeated: { hipsY: 0.52, spX: 0.45, lHpX: -1.35, rHpX: 0.2, lKn: 1.5, rKn: 1.7, rAnk: 0.9, lShX: 0.6, rShX: -0.4, rEl: -0.6, lEl: -0.2, neckX: 0.5, spY: 0.1, wpX: 1.3 },
  sit: { hipsY: 0.48, spX: 0.05, spY: 0, lHpX: -1.5, rHpX: -1.5, lKn: 1.5, rKn: 1.5, lShX: -0.3, rShX: -0.3 },
  crossSit: { hipsY: 0.24, spX: 0.05, spY: 0, lHpX: -1.4, rHpX: -1.4, lHpZ: 0.7, rHpZ: -0.7, lKn: 2.4, rKn: 2.4, lShX: -0.5, rShX: -0.5, lEl: -0.9, rEl: -0.9 },
  bow: { spX: 0.6, neckX: 0.3, lShX: -0.9, rShX: -0.9, lShZ: -0.5, rShZ: 0.5, lEl: -1.6, rEl: -1.6, spY: 0 },
  lie: { hipsY: 0.15, bodyX: -Math.PI / 2, spY: 0, lShX: -0.2, rShX: 0.1, lShZ: 0.6, rShZ: -0.5, lHpX: 0.1, rHpX: -0.1, lKn: 0.2, rKn: 0.05, neckX: -0.2 },
  hold: { hipsY: 0.52, spX: 0.5, lHpX: -1.4, rHpX: 0.25, lKn: 1.45, rKn: 1.65, rAnk: 0.9, lShX: -1.1, rShX: -1.1, lShZ: -0.3, rShZ: 0.3, lEl: -1, rEl: -1, neckX: 0.55, spY: 0 },
  raise: { rShX: -2.9, rEl: -0.1, rShZ: -0.2, spX: -0.15, neckX: -0.3, wpX: 1.5, lHpX: -0.3, rHpX: 0.25, lKn: 0.3 },
  refuse: { lShX: -1.3, lShZ: 0.2, lEl: -0.55, leftPalm: 1.4, spY: -0.15, neckX: -0.06, spX: -0.04 },
  throne: { hipsY: 0.62, spX: -0.08, spY: 0, lHpX: -1.45, rHpX: -1.45, lHpZ: 0.12, rHpZ: -0.12, lKn: 1.45, rKn: 1.45, lShX: -0.45, rShX: -0.6, lShZ: 0.15, rShZ: -0.15, lEl: -0.55, rEl: -0.9, wpX: 1.4 },
  guard: { hipsY: 0.86, spX: 0.12, spY: -0.35, lHpX: -0.45, rHpX: 0.35, lHpZ: 0.12, rHpZ: -0.08, lKn: 0.55, rKn: 0.35, lAnk: -0.1, rAnk: 0.1, rShX: -0.9, rShZ: -0.25, rEl: -1.2, lShX: -1.15, lShZ: 0.4, lEl: -1.25, neckX: -0.05, wpX: 0.7 },
  dead: { bodyX: -Math.PI / 2, hipsY: 0.15, lShZ: 0.9, rShZ: -0.9, lHpX: 0, rHpX: 0, lKn: 0.1, rKn: 0.1, spY: 0, spX: 0 },
  point: { rShX: -1.5, rShZ: -0.1, rEl: -0.1, spY: 0.2 },
  teach: { hipsY: 0.24, spX: 0.1, lHpX: -1.4, rHpX: -1.4, lHpZ: 0.7, rHpZ: -0.7, lKn: 2.4, rKn: 2.4, rShX: -1.2, rShZ: -0.45, rEl: -0.9, lShX: -0.5, lEl: -1.1 },
  sweep: { spX: 0.35, lShX: -0.9, rShX: -0.7, lEl: -0.6, rEl: -0.4, lHpX: -0.2, lKn: 0.3, rKn: 0.15 },
}

/** Faceted, template-sharing joint rig with the existing story/combat API. */
export class Humanoid {
  constructor(options = {}) {
    const o = this.o = { skin: 0x8d5a3b, cloth: 0x6b3a1e, robe: null, pants: 0x3b2a1e, hair: 0x15100c, scale: 1, bulk: 1, weapon: null, helmet: null, crown: false, cape: null, beard: null, armor: null, child: false, ...options }
    if (o.teacher && !o.shawl) o.shawl = 0xc9a227
    if (o.armor != null && o.plume === 0xd4a017 && o.cape) o.shortCape = true
    const { scale, weapon, ironStaff, ...appearance } = o
    const key = JSON.stringify(Object.keys(appearance).sort().map(name => [name, appearance[name]]))
    this._template = retainTemplate(templates, key, () => buildCharacter(o))
    this.root = cloneSkinned(this._template.root)
    this._materials = new Map()
    this.mats = []
    this._ownMaterials(this.root)
    const bone = name => this.root.getObjectByName(name)
    this.body = bone('body'); this.body.scale.setScalar(scale * (o.child ? 0.62 : 1))
    this.hips = bone('hips'); this.spine = bone('spine'); this.neck = bone('neck'); this.head = bone('head')
    this.armL = { sh: bone('shoulderL'), el: bone('elbowL'), hand: bone('handL') }
    this.armR = { sh: bone('shoulderR'), el: bone('elbowR'), hand: bone('handR') }
    this.legL = { hp: bone('legL'), kn: bone('kneeL'), ft: bone('footL') }; this.legR = { hp: bone('legR'), kn: bone('kneeR'), ft: bone('footR') }
    this.skirt = bone('skirt'); this.capeMesh = bone('cape'); this.crown = bone('crown')
    this.weapon = part(this.armR.hand, 'weapon', [0, -0.07, 0.01])
    this.setWeapon(weapon)
    if (this.capeMesh) this._initCape()
    if (this.skirt) this._initSkirt()
    this.phase = Math.random() * 10
    this.idleT = Math.random() * 20
    this.action = null
    this.sustain = null
    this.combat = false     // guard stance when idle in a fight
    this.flash = 0
    this._pose = {}
    this._speed = 0
    this._lean = 0
  }
  _initCape() {
    const mesh = this.capeMesh.getObjectByProperty('isMesh', true)
    if (!mesh) return
    mesh.geometry = mesh.geometry.clone()           // per-character copy (animated)
    this._capeGeo = mesh.geometry
    this._capeRest = Float32Array.from(mesh.geometry.attributes.position.array)
  }
  /** Per-character copies of skirt geometry so the cloth can follow each leg. */
  _initSkirt() {
    this._skirt = []
    this.skirt.traverse(n => {
      if (!n.isMesh) return
      n.geometry = n.geometry.clone()
      this._skirt.push({ geo: n.geometry, rest: Float32Array.from(n.geometry.attributes.position.array) })
    })
  }
  _ownMaterials(root) {
    root.traverse(node => {
      if (!node.isMesh) return
      const source = node.material
      if (!this._materials.has(source)) {
        const material = source.clone()
        const baseHook = source.onBeforeCompile, baseKey = source.customProgramCacheKey?.() ?? ''
        // stylised rim light: characters separate from the background (story frames)
        material.onBeforeCompile = (shader, r) => {
          baseHook.call(material, shader, r)
          if (!material.isMeshStandardMaterial && !material.isMeshPhongMaterial && !material.isMeshLambertMaterial) return // unlit materials have no normals to rim-light
          shader.uniforms.uRim = RIM
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
            .replace('#include <dithering_fragment>', 'vec3 rimV = normalize(vViewPosition); float rimF = pow(1.0 - clamp(dot(normal, rimV), 0.0, 1.0), 2.6); gl_FragColor.rgb += uRim * rimF;\n#include <dithering_fragment>')
        }
        material.customProgramCacheKey = () => (material.isMeshBasicMaterial ? 'char|' : 'char-rim|') + baseKey
        this._materials.set(source, material)
        if (material.emissive) this.mats.push(material)
      }
      node.material = this._materials.get(source)
      node.userData.owner = this
    })
  }
  setWeapon(kind) {
    if (this._disposed) return
    releaseTemplate(this._weaponTemplate)
    this._weaponTemplate = null
    this.weapon.clear()
    this.o.weapon = kind
    this.blade = null
    if (!kind) return
    const key = kind + (this.o.ironStaff ? ':iron' : ':brass')
    this._weaponTemplate = retainTemplate(weaponTemplates, key, () => buildWeapon(kind, this.o.ironStaff))
    const group = this._weaponTemplate.root.clone(true)
    this._ownMaterials(group)
    this.weapon.add(group)
    group.scale.setScalar(1 / (this.o.scale * (this.o.child ? 0.62 : 1)))
    if (kind !== 'flower' && kind !== 'bird') this.blade = group.getObjectByName(kind === 'staff' ? 'std' : 'metal')
  }
  /** Something carried on the head (basket of herbs / clay pot). */
  setHeadProp(kind) {
    this._headProp?.removeFromParent(); this._headProp = null
    if (!kind) return
    const B = new Builder(77)
    if (kind === 'basket') {
      B.add(G.lathe([[0, 0], [0.16, 0], [0.22, 0.1], [0.24, 0.16], [0.22, 0.17]], 10), 0x9a6a3a, { jit: 0.12 })
      for (let i = 0; i < 7; i++) B.add(G.ico(0.06, 0), [0xf08a1a, 0x6a9a3a, 0xd02a2a][i % 3], { at: [Math.cos(i) * 0.1, 0.17, Math.sin(i) * 0.1] })
    } else {
      B.add(G.lathe([[0, 0], [0.1, 0], [0.17, 0.1], [0.18, 0.2], [0.1, 0.3], [0.07, 0.34], [0.09, 0.36], [0.06, 0.36]], 10), 0xb0603a, { jit: 0.08 })
    }
    B.add(G.torus(0.09, 0.025, 4, 10), 0xe8dcc0, { at: [0, -0.01, 0], rot: [Math.PI / 2, 0, 0] })
    const g = B.build(); g.position.set(0, 0.2, -0.01); this.head.add(g); this._headProp = g
    this._ownMaterials(g)
  }
  dropCrown(parent, position) {
    if (this._fallenCrown) return this._fallenCrown
    if (!this.crown || this._disposed) return null
    const crown = this.crown
    crown.removeFromParent()
    crown.traverse(node => { if (node.isMesh) { node.material = mat('gold'); delete node.userData.owner } })
    parent.add(crown)
    crown.position.set(position.x, position.y, position.z)
    crown.rotation.set(0.24, 0.3, -0.35)
    crown.scale.setScalar(this.o.scale)
    const record = this._template
    record.refs++
    let released = false
    crown.userData.dispose = () => { if (!released) { released = true; crown.removeFromParent(); releaseTemplate(record) } }
    this._fallenCrown = crown
    this.crown = null
    return crown
  }
  dispose() {
    if (this._disposed) return
    this._disposed = true
    this.root.removeFromParent()
    this._capeGeo?.dispose()
    for (const sk of this._skirt || []) sk.geo.dispose()
    releaseTemplate(this._template)
    releaseTemplate(this._weaponTemplate)
    for (const material of this._materials.values()) material.dispose()
    this._materials.clear()
    this.mats.length = 0
    this.action = null
  }

  play(name, dur, onHit) { this.action = { name, t: 0, dur: Math.max(0.001, dur || 0.001), onHit, hitDone: false } }
  get busy() { return !!this.action }
  setTint(hex) { for (const m of this.mats) m.emissive.setHex(hex) }

  /** speed: 0..1 normalized locomotion speed (1 = sprint) */
  update(dt, speed = 0) {
    if (this._disposed) return
    this._speed = lerp(this._speed, speed, Math.min(1, dt * 8))
    const sp = this._speed, run = Math.max(0, (sp - 0.55) / 0.45)
    this.phase += dt * (sp > 0.02 ? 5.2 + sp * 6.5 : 1)
    this.idleT += dt
    const p = this.phase, s = Math.sin(p), c = Math.cos(p), stride = Math.min(1, sp * 1.6)
    const T = this._pose
    // ---- locomotion: counter-rotating hips/shoulders, bob, foot roll, arm swing
    T.hipsY = 0.97 - 0.03 * stride + Math.abs(c) * (0.035 + run * 0.04) * stride
    T.bodyX = 0; T.rot = 0
    T.hipsRY = s * 0.16 * stride; T.hipsRZ = c * 0.05 * stride
    T.spX = 0.05 * stride + run * 0.18; T.spY = -s * 0.24 * stride; T.neckX = -0.04 * stride - run * 0.1; T.neckY = s * 0.12 * stride
    T.lHpX = s * (0.62 + run * 0.35) * stride; T.rHpX = -s * (0.62 + run * 0.35) * stride; T.lHpZ = 0; T.rHpZ = 0
    T.lKn = (Math.max(0, -c) * (1.0 + run * 0.6) + Math.max(0, s) * 0.15) * stride + 0.06
    T.rKn = (Math.max(0, c) * (1.0 + run * 0.6) + Math.max(0, -s) * 0.15) * stride + 0.06
    T.lAnk = (-T.lHpX * 0.4 - Math.max(0, -c) * 0.25) * stride; T.rAnk = (-T.rHpX * 0.4 - Math.max(0, c) * 0.25) * stride
    T.lShX = -s * (0.55 + run * 0.35) * stride; T.rShX = s * (0.55 + run * 0.35) * stride
    T.lShZ = 0.1; T.rShZ = -0.1
    T.lEl = -0.2 - (0.35 + run * 0.9) * stride - Math.max(0, s) * 0.3 * stride; T.rEl = -0.2 - (0.35 + run * 0.9) * stride - Math.max(0, -s) * 0.3 * stride
    T.wpX = 0; T.leftPalm = 0
    // ---- idle life: breathing, weight shift, glances
    const idle = 1 - stride
    if (idle > 0.01) {
      const br = Math.sin(this.idleT * 1.6), shift = Math.sin(this.idleT * 0.35)
      T.spX += br * 0.018 * idle; T.hipsRZ += shift * 0.035 * idle; T.hipsY += br * 0.004 * idle
      T.lHpZ += shift * 0.03 * idle; T.rHpZ += shift * 0.03 * idle
      T.lKn += Math.max(0, -shift) * 0.08 * idle; T.rKn += Math.max(0, shift) * 0.08 * idle
      T.neckY += Math.sin(this.idleT * 0.27) * 0.25 * idle * (Math.sin(this.idleT * 0.11) > 0.6 ? 1 : 0.2)
      T.lShZ += 0.04 * idle; T.rShZ -= 0.04 * idle; T.lEl -= 0.12 * idle; T.rEl -= 0.12 * idle
    }
    // ---- weapon carry
    const W = this.o.weapon
    if (W === 'staff') { T.rShX = -0.25 + T.rShX * 0.4; T.rEl = -0.85; T.rShZ = -0.12; T.wpX = -0.15 + stride * 0.2 }
    else if (W === 'sword' || W === 'greatsword') { T.rShX = -0.2 + T.rShX * 0.6; T.rEl = -0.5; T.wpX = 0.9 }
    else if (W === 'hammer') { T.rShX = -0.15 + T.rShX * 0.4; T.rEl = -0.4; T.wpX = 1.3; T.rShZ = -0.15 }
    else if (W === 'flower' || W === 'bird') { T.rShX = -0.9; T.rEl = -1.1; T.wpX = 0.2 }
    // ---- combat guard stance (idle in a fight)
    if (this.combat && !this.sustain && sp < 0.35) {
      const g = POSES.guard, k = 1 - sp / 0.35
      for (const key in g) T[key] = lerp(T[key] ?? 0, g[key], k)
      T.spX += Math.sin(this.idleT * 3) * 0.015; T.hipsY += Math.sin(this.idleT * 3) * 0.008
    }
    // ---- sustained poses
    const S = this.sustain
    if (POSES[S]) Object.assign(T, POSES[S], { hipsRY: 0, hipsRZ: 0, neckY: POSES[S].neckY ?? 0 })
    if (S === 'meditate' || S === 'crossSit' || S === 'teach') { T.spX += Math.sin(this.idleT * 0.9) * 0.012; T.lAnk = T.rAnk = 0.6 }
    // ---- ambient activities (village life): looping, layered over idle
    const AC = this.activity
    if (AC && !S && !this.action) {
      const t = this.idleT, w = Math.sin(t * 2.2), w2 = Math.sin(t * 1.1)
      if (AC === 'sweep') Object.assign(T, { spX: 0.42, neckX: 0.15, lShX: -0.9 + w * 0.35, rShX: -0.6 + w * 0.35, lShZ: 0.2, rShZ: -0.35, lEl: -0.5, rEl: -0.7, spY: w * 0.25, lKn: 0.25, rKn: 0.2, hipsY: 0.93 })
      if (AC === 'chat') { T.rShX = -0.55 + Math.max(0, Math.sin(t * 1.7)) * -0.5; T.rEl = -1.3 + Math.sin(t * 3.3) * 0.3; T.rShZ = -0.25; T.neckX = Math.sin(t * 2.5) * 0.08; T.neckY = Math.sin(t * 0.7) * 0.2; T.spY = Math.sin(t * 0.9) * 0.08 }
      if (AC === 'listen') { T.neckX = 0.06 + Math.max(0, Math.sin(t * 1.4)) * 0.1; T.lShX = -0.3; T.rShX = -0.3; T.lEl = -1.6; T.rEl = -1.6; T.lShZ = -0.25; T.rShZ = 0.25 }
      if (AC === 'carry') Object.assign(T, { lShX: -2.75, rShX: -2.75, lShZ: 0.35, rShZ: -0.35, lEl: -1.05, rEl: -1.05, neckX: -0.05 })
      if (AC === 'pray') Object.assign(T, { lShX: -0.65, rShX: -0.65, lShZ: -0.42, rShZ: 0.42, lEl: -1.85, rEl: -1.85, neckX: 0.25 + w2 * 0.03 })
      if (AC === 'hammer') { const k = (t * 1.3) % 1, up = k < 0.6 ? k / 0.6 : 1 - (k - 0.6) / 0.4; T.rShX = -0.4 - up * 2.4; T.rEl = -0.4 - up * 0.6; T.spX = 0.2 + (1 - up) * 0.25; T.wpX = 1.1 + up * 0.3; T.lShX = -0.8; T.lEl = -0.9; T.lKn = 0.25; T.rKn = 0.15 }
      if (AC === 'grind') Object.assign(T, { hipsY: 0.48, spX: 0.35, lHpX: -1.5, rHpX: -1.5, lKn: 1.5, rKn: 1.5, lShX: -0.9 + Math.sin(t * 3) * 0.25, rShX: -0.9 + Math.cos(t * 3) * 0.25, lEl: -0.6, rEl: -0.6, neckX: 0.3 })
      if (AC === 'draw') { const k = Math.sin(t * 2.4); T.lShX = -2.3 + k * 0.6; T.rShX = -1.7 - k * 0.6; T.lEl = -0.5; T.rEl = -0.5; T.spX = 0.08; T.lKn = 0.2 }
      if (AC === 'wave') { T.rShX = -2.6; T.rShZ = -0.3 + Math.sin(t * 7) * 0.3; T.rEl = -0.6; T.neckY = 0 }
      if (AC === 'sitchat') Object.assign(T, { hipsY: 0.48, spX: 0.05, lHpX: -1.5, rHpX: -1.5, lKn: 1.5, rKn: 1.5, lShX: -0.35, rShX: -0.55 + Math.max(0, Math.sin(t * 1.5)) * -0.6, rEl: -1.2, neckY: Math.sin(t * 0.6) * 0.3 })
    }
    // ---- one-shot actions (anticipation → strike → follow-through)
    let k = 1
    const A = this.action
    if (A) {
      A.t += dt; const u = Math.min(1, A.t / A.dur)
      if (!A.hitDone && u >= (A.hitAt ?? 0.42)) { A.hitDone = true; A.onHit?.() }
      const n = A.name
      const wind = ease(u / 0.35), strike = ease((u - 0.35) / 0.18), back = ease((u - 0.68) / 0.32)
      const sw = (a, b2, c2) => swing(a, b2, c2, wind, strike, back)
      const lunge = () => { T.lHpX = sw(-0.2, -0.3, -0.85); T.rHpX = sw(0.1, 0.25, 0.55); T.lKn = sw(0.3, 0.45, 0.8); T.rKn = sw(0.15, 0.2, 0.35); T.hipsY = sw(0.9, 0.9, 0.82) }
      if (n === 'attack1') { lunge(); T.rShX = sw(-0.6, -2.4, -0.4); T.rShZ = sw(-0.1, -1.0, 0.45); T.rEl = sw(-0.9, -0.6, -0.15); T.spY = sw(0, 0.75, -0.75); T.hipsRY = sw(0, 0.3, -0.35); T.wpX = sw(0, 0.6, 1.5); T.lShX = sw(-0.5, -0.8, -0.2) }
      if (n === 'attack2') { lunge(); T.rShX = sw(-0.6, -1.2, -1.5); T.rShZ = sw(-0.1, 0.5, -1.4); T.rEl = sw(-0.9, -0.4, -0.1); T.spY = sw(0, -0.8, 0.9); T.hipsRY = sw(0, -0.35, 0.4); T.wpX = sw(0, 1.4, 1.3); T.lShX = sw(-0.5, -1.1, -0.5) }
      if (n === 'attack3') { lunge(); T.rShX = sw(-0.6, -3.0, -0.5); T.lShX = sw(-0.5, -2.9, -0.6); T.rEl = -0.2; T.spX = sw(0.1, -0.35, 0.7); T.wpX = sw(0, 0.3, 1.55); T.hipsY = sw(0.92, 1.04, 0.74); T.neckX = sw(0, -0.2, 0.25) }
      if (n === 'heavy') { T.rShX = sw(-0.6, -3.1, -0.35); T.lShX = sw(-0.5, -3.0, -0.4); T.spX = sw(0, -0.5, 0.9); T.spY = sw(0, 0.4, 0); T.wpX = sw(0, -0.1, 1.55); T.hipsY = sw(0.95, 0.98, 0.62); T.lHpX = sw(0, -0.4, -1.0); T.lKn = sw(0.1, 0.4, 1.3); T.rHpX = sw(0, 0.2, 0.5); T.rKn = sw(0.1, 0.2, 0.9) }
      if (n === 'special') { T.rShX = sw(-0.6, -3.0, -2.6); T.lShX = sw(-0.5, -3.0, -2.6); T.spX = sw(0, -0.35, 0.4); T.rot = u * Math.PI * 2; T.hipsY = sw(0.95, 1.12, 0.7); T.lHpX = sw(0, -0.3, -0.9); T.lKn = sw(0, 0.3, 1.1) }
      if (n === 'dodge') { const q = Math.sin(u * Math.PI); T.hipsY = 0.95 - 0.45 * q; T.spX = 1.0 * q; T.lHpX = -1.3 * q; T.rHpX = 0.3 * q; T.lKn = 1.8 * q; T.rKn = 1.3 * q; T.lShX = 0.6 * q; T.rShX = 0.4 * q; T.neckX = 0.5 * q }
      if (n === 'hit') { const h = Math.sin(u * Math.PI); T.spX = -0.45 * h; T.spY += 0.3 * h; T.neckX = -0.45 * h; T.lShX = -0.7 * h; T.lShZ = 0.6 * h; T.rShZ = -0.6 * h; T.hipsY -= 0.06 * h }
      if (n === 'die') { const f = ease(u * 1.3), buckle = ease(u * 2.5); T.bodyX = -Math.PI / 2 * f; T.hipsY = lerp(0.95, 0.15, f); T.lKn = 1.2 * buckle * (1 - f); T.rKn = 1.0 * buckle * (1 - f); T.lShZ = 0.9 * f; T.rShZ = -0.9 * f; T.neckX = -0.3 * f; T.spX = 0.4 * buckle * (1 - f) }
      if (n === 'slam') { T.rShX = sw(-0.6, -3.2, -0.2); T.lShX = sw(-0.5, -3.1, -0.2); T.spX = sw(0, -0.55, 1.05); T.wpX = sw(0, -0.2, 1.6); T.hipsY = sw(0.95, 1.02, 0.6); T.lHpX = sw(0, -0.3, -1.0); T.lKn = sw(0, 0.3, 1.2); T.rKn = sw(0, 0.2, 0.7) }
      if (n === 'lunge') { lunge(); T.rShX = sw(-0.6, -1.0, -1.6); T.rEl = sw(-0.9, -1.7, 0); T.spX = sw(0, 0.0, 0.55); T.lHpX = sw(0, -0.3, -1.1); T.rHpX = sw(0, 0.2, 0.8); T.wpX = sw(0, 1.2, 1.55) }
      if (n === 'bell') { T.rShX = sw(-0.5, -2.3, -1.2); T.lShX = sw(-0.5, -2.3, -1.2); T.spX = sw(0, -0.25, 0.25); T.wpX = 0; T.lHpX = sw(0, -0.2, -0.4); T.lKn = sw(0, 0.2, 0.4) }
      if (n === 'kneelDown') { const f = ease(u); Object.assign(T, { hipsY: lerp(0.95, 0.55, f), spX: 0.25 * f, lHpX: -1.4 * f, rHpX: 0.25 * f, lKn: 1.45 * f, rKn: 1.65 * f, rAnk: 0.9 * f, neckX: 0.4 * f }) }
      if (A.t >= A.dur) { if (n === 'die') this.sustain = 'dead'; if (n === 'kneelDown') this.sustain = 'kneel'; this.action = null }
    }
    if (this.sustain === 'dead') Object.assign(T, POSES.dead, { hipsRY: 0, hipsRZ: 0, neckY: 0 })

    const f = A ? Math.min(1, dt * 20) : Math.min(1, dt * (S ? 4 : 11)) * k
    blend(this.hips.position, 'y', T.hipsY, f)
    blend(this.hips.rotation, 'y', (T.hipsRY ?? 0) + (T.rot ?? 0), T.rot ? 1 : f)
    blend(this.hips.rotation, 'z', T.hipsRZ ?? 0, f)
    blend(this.body.rotation, 'x', T.bodyX, f)
    blend(this.body.position, 'y', T.bodyX ? 0.16 : 0, f)
    blend(this.spine.rotation, 'x', T.spX, f); blend(this.spine.rotation, 'y', T.spY, f)
    blend(this.neck.rotation, 'x', T.neckX, f); blend(this.neck.rotation, 'y', T.neckY ?? 0, f * 0.6)
    blend(this.armL.sh.rotation, 'x', T.lShX, f); blend(this.armR.sh.rotation, 'x', T.rShX, f)
    blend(this.armL.sh.rotation, 'z', T.lShZ, f); blend(this.armR.sh.rotation, 'z', T.rShZ, f)
    blend(this.armL.el.rotation, 'x', T.lEl, f); blend(this.armR.el.rotation, 'x', T.rEl, f)
    blend(this.legL.hp.rotation, 'x', T.lHpX, f); blend(this.legR.hp.rotation, 'x', T.rHpX, f)
    blend(this.legL.hp.rotation, 'z', T.lHpZ ?? 0, f); blend(this.legR.hp.rotation, 'z', T.rHpZ ?? 0, f)
    blend(this.legL.kn.rotation, 'x', T.lKn, f); blend(this.legR.kn.rotation, 'x', T.rKn, f)
    if (this.legL.ft) { blend(this.legL.ft.rotation, 'x', T.lAnk ?? 0, f); blend(this.legR.ft.rotation, 'x', T.rAnk ?? 0, f) }
    blend(this.weapon.rotation, 'x', T.wpX, f)
    blend(this.armL.hand.rotation, 'x', T.leftPalm, f)
    // ---- cloth: cape sway with lag, skirt follows legs
    if (this.capeMesh) {
      this._lean = lerp(this._lean, sp, Math.min(1, dt * 3))
      this.capeMesh.rotation.x = 0.12 + this._lean * 0.65 - T.spX * 0.8 + Math.sin(this.idleT * 1.3) * 0.04
      if (this._capeGeo) {
        const P = this._capeGeo.attributes.position, R = this._capeRest, t = this.idleT
        for (let i = 0; i < P.count; i++) {
          const x = R[i * 3], y = R[i * 3 + 1], depth = -y
          P.setZ(i, R[i * 3 + 2] - depth * depth * 0.18 * (0.3 + this._lean) * (0.6 + 0.4 * Math.sin(t * 3 + x * 6)) + Math.sin(t * 2.2 + x * 5 + y * 3) * 0.025 * depth)
        }
        P.needsUpdate = true; this._capeGeo.computeVertexNormals()
      }
    }
    if (this.skirt) {
      const seated = S === 'meditate' || S === 'sit' || S === 'throne' || S === 'crossSit' || S === 'teach'
      const kneeling = S === 'kneel' || S === 'hold' || S === 'defeated'
      this.skirt.rotation.x = lerp(this.skirt.rotation.x, -T.spX * 0.2 + ((T.lHpX + T.rHpX) * -0.25), f)
      this.skirt.rotation.z = lerp(this.skirt.rotation.z, (T.lHpX - T.rHpX) * 0.04, f)
      this.skirt.scale.y = lerp(this.skirt.scale.y, seated ? 0.42 : kneeling ? 0.62 : 1, f)
      this.skirt.scale.x = lerp(this.skirt.scale.x, S === 'meditate' || S === 'crossSit' || S === 'teach' ? 1.35 : 1 + stride * 0.08, f)
      this.skirt.scale.z = lerp(this.skirt.scale.z, seated ? 1.2 : 1 + stride * 0.12, f)
      // cloth follows the legs: each side of the hem is pushed by its thigh, the back lags and flutters
      if (this._skirt && !seated && this.sustain !== 'dead' && this.sustain !== 'lie') {
        const lA = this.legL.hp.rotation.x, rA = this.legR.hp.rotation.x, lK = this.legL.kn.rotation.x, rK = this.legR.kn.rotation.x, t = this.idleT
        const motion = Math.abs(lA) + Math.abs(rA) + 0.02
        for (const sk of this._skirt) {
          const P = sk.geo.attributes.position, R = sk.rest
          for (let i = 0; i < P.count; i++) {
            const x = R[i * 3], y = R[i * 3 + 1], z = R[i * 3 + 2], d = Math.min(1, Math.max(0, -y / 0.8))
            const wl = Math.min(1, Math.max(0, (x + 0.06) / 0.18)), wr = 1 - wl
            const ang = lA * wl + rA * wr, kn = lK * wl + rK * wr
            const front = z > 0 ? 1 : 0.55
            const dz = -Math.sin(ang) * (-y) * 0.95 * front + (z < 0 ? -0.04 * motion * d : 0) + Math.sin(t * 3.1 + x * 9 + y * 4) * 0.012 * d * Math.min(1, motion * 2 + 0.3)
            const dy = (1 - Math.cos(ang)) * (-y) * 0.5 + (z > 0 ? kn * 0.03 * d : 0)
            P.setXYZ(i, x * (1 + motion * 0.06 * d), y + dy, z + dz * d)
          }
          P.needsUpdate = true; sk.geo.computeVertexNormals()
        }
      }
    }
    if (this.flash > 0) { this.flash -= dt; this.setTint(this.flash > 0 ? (this.flashColor ?? 0x661111) : 0) }
  }

  hitFlash(color = 0x882222, t = 0.12) { this.flash = t; this.flashColor = color }
}

// Character presets — colours from the turnaround boards --------------------------
export const PRESETS = {
  aruvan: { skin: 0x8a5a3c, robe: 0xd9822b, cloth: 0xd9822b, sash: 0xb8661d, pants: 0xb8661d, hair: null, beard: 0x1a120c, brow: 0x1a120c, weapon: 'staff', beads: true, scar: true, stern: true, bulk: 1.02 },
  aruvanKing: { skin: 0x8a5a3c, robe: 0xd9822b, cloth: 0xd9822b, sash: 0x8a3a1a, pants: 0xb8661d, hair: null, beard: 0x1a120c, brow: 0x1a120c, weapon: 'staff', ironStaff: true, beads: true, scar: true, shawl: 0xefe8d8, bulk: 1.02 },
  aruvanOld: { skin: 0x7d5538, robe: 0xc97a2e, cloth: 0xc97a2e, sash: 0xb8661d, pants: 0xa65e1f, hair: null, beard: 0xe8e4dc, brow: 0xb0aca4, longBeard: true, weapon: null, bulk: 0.9, beads: true, scar: true },
  veeran: { skin: 0x8a5a3c, cloth: 0x3b0f0f, armor: 0x4a4a52, pants: 0x241a14, helmet: 0x3a3a40, plume: 0x8b1a1a, hair: 0x15100c, beard: 0x1a120c, weapon: 'sword', cape: 0x6b0f0f, capeCollar: true, tabard: 0x6b0f0f, scar: true, stern: true, boots: true },
  guru: { skin: 0x7a5236, robe: 0xe8d9b5, fullRobe: true, cloth: 0xe8d9b5, pants: 0xd8c9a5, hair: null, beard: 0xf2f2f2, brow: 0xf2f2f2, longBeard: true, scale: 0.94, bulk: 0.86, blind: true, beads: true, guruSash: 0x6a5a48 },
  thamarai: { fem: true, earring: true, bindi: true, skin: 0x9a6644, cloth: 0x2f7a5f, shortSleeve: true, cuff: 0xe8dcc0, pants: 0x7a2f4f, skirt: 0x7a2f4f, underskirt: 0xe8dcc0, trimCol: 0xa8622a, hair: 0x120c08, long: true, braid: true, herbs: true, necklace: true, scale: 0.92, bulk: 0.92 },
  thamaraiOld: { fem: true, earring: true, bindi: true, skin: 0x9a6644, cloth: 0x2f7a5f, shortSleeve: true, cuff: 0xe8dcc0, pants: 0x7a2f4f, skirt: 0x7a2f4f, underskirt: 0xe8dcc0, trimCol: 0xa8622a, hair: 0x3a3430, long: true, braid: true, herbs: true, shawl: 0xe1d2b6, scale: 0.92, bulk: 0.92 },
  thamaraiChild: { fem: true, skin: 0x9a6644, cloth: 0x2f7a5f, pants: 0x7a2f4f, dress: true, hair: 0x120c08, long: true, braid: true, child: true, barefoot: true },
  ilan: { skin: 0x9a6644, cloth: 0xc9a227, shortSleeve: true, pants: 0x4a3a2a, hair: 0x120c08, hairStyle: 'spiky', child: true, shorts: true, barefoot: true, smile: true },
  ilanAdult: { skin: 0x9a6644, cloth: 0xc9a227, shortSleeve: true, pants: 0x6a5940, baggy: true, hair: 0x120c08, hairStyle: 'spiky', beard: 0x241c16, teacher: true, scale: 1.03, bulk: 0.92, smile: true },
  kaali: { fem: true, earring: true, skin: 0x6e452c, cloth: 0x5a2a1a, vest: true, pants: 0x2a2a2a, baggy: true, boots: true, hair: 0x120c08, long: true, ponytail: true, apron: true, burns: true, bracers: true, stern: true, bulk: 1.18, weapon: 'hammer' },
  villager: () => ({ skin: [0x8d5a3b, 0x9a6644, 0x6e452c][Math.random() * 3 | 0], cloth: [0x8a6f3a, 0x3a6f8a, 0x8a3a5a, 0x5a7a3a, 0xa0522d][Math.random() * 5 | 0], shortSleeve: true, pants: 0x4a3a2a, dhoti: 0xe8dcc0, hair: 0x15100c, long: Math.random() < 0.5, scale: 0.9 + Math.random() * 0.15 }),
  murugan: { skin: 0x7a5236, cloth: 0x8a6f3a, shortSleeve: true, dhoti: 0xd8ccb0, border: 0x6a4a30, pants: 0x4a3a2a, hair: 0x9a9690, hairStyle: 'grey', beard: null, scale: 0.86, bulk: 0.85 },
  malli: { fem: true, tie: true, skin: 0x9a6644, cloth: 0xb5a78a, shortSleeve: true, pants: 0xb5a78a, hair: 0x120c08, long: true, child: true, dress: true, barefoot: true },
  soldier: { skin: 0x8d5a3b, cloth: 0x2a2a30, armor: 0x55555e, pants: 0x1f1f24, helmet: 0x45454e, plume: 0x8b1a1a, beard: 0x1a120c, weapon: 'sword', boots: true, tabard: 0x6b1414 },
  captain: { skin: 0x8d5a3b, cloth: 0x2a2a30, armor: 0x55555e, pants: 0x1f1f24, helmet: 0x45454e, plume: 0xd4a017, beard: 0x1a120c, weapon: 'sword', cape: 0x6b0f0f, shortCape: true, boots: true, tabard: 0x6b1414 },
  senthil: { skin: 0x8d5a3b, cloth: 0x2a2a30, armor: 0x55555e, pants: 0x1f1f24, hair: 0x120c08, hairStyle: 'spiky', weapon: 'sword', scale: 0.94, bulk: 0.88, boots: true },
  senthilBuilder: { skin: 0x8d5a3b, cloth: 0x8a6f3a, shortSleeve: true, pants: 0x4a3a2a, dhoti: 0xe0d4b8, hair: 0x120c08, hairStyle: 'spiky', scale: 0.94, bulk: 0.9 },
  brute: { skin: 0x6e452c, cloth: 0x2a1a1a, armor: 0x3a3036, pants: 0x1f1414, helmet: 0x2a2a30, beard: 0x120c08, heavyJaw: true, weapon: 'hammer', bulk: 1.5, scale: 1.2, boots: true, tabard: 0x4a1010 },
  rudhra: { skin: 0x8a5a3c, cloth: 0x1a1a24, armor: 0x2c2c3a, pants: 0x14141a, hair: 0x0a0a0a, long: true, beard: 0x0a0a0a, smile: true, weapon: 'sword', cape: 0x3a0a4a, capeCollar: true, tabard: 0x3a0a4a, boots: true },
  rudhraYoung: { skin: 0x8a5a3c, cloth: 0x1a1a24, armor: 0x2c2c3a, pants: 0x14141a, hair: 0x0a0a0a, hairStyle: 'spiky', weapon: 'sword', cape: 0x3a0a4a, tabard: 0x3a0a4a, boots: true },
  rudhraPenitent: { skin: 0x8a5a3c, cloth: 0x6a5a4a, robe: 0x6a5a4a, fullRobe: true, pants: 0x504538, hair: 0x0a0a0a, long: true, beard: 0x0a0a0a },
  rudhraOld: { skin: 0x8a5a3c, cloth: 0x6a5a4a, robe: 0x6a5a4a, fullRobe: true, pants: 0x504538, hair: 0xaaaaa2, long: true, beard: 0xaaaaa2 },
  dunkan: { skin: 0xa0785a, cloth: 0x2a0a0a, armor: 0x1e1e22, pants: 0x140a0a, hair: 0x95908a, beard: 0xbab6ad, brow: 0x9a968e, longBeard: true, crown: true, stern: true, heavyJaw: true, weapon: 'greatsword', cape: 0x7a0a0a, capeCollar: true, tabard: 0x7a0a0a, bulk: 1.38, scale: 1.25, boots: true },
  dummy: { skin: 0xc9a86a, cloth: 0xb8975a, pants: 0xb8975a, hair: null },
}

export const CHARACTER_PRESET_NAMES = Object.freeze(Object.keys(PRESETS))

export function makeCharacter(preset, extra = {}) {
  const p = typeof PRESETS[preset] === 'function' ? PRESETS[preset]() : PRESETS[preset]
  return new Humanoid({ ...p, ...extra })
}

/** Compile representative rig/weapon materials under the chapter loading UI. */
export async function warmCharacterPresets(scene, renderer, names = CHARACTER_PRESET_NAMES) {
  const root = new THREE.Group(), characters = []
  root.name = 'characterShaderWarmup'
  const add = (name, extra) => { const character = makeCharacter(name, extra); characters.push(character); root.add(character.root) }
  for (const name of names) add(name)
  if (names.includes('villager')) for (const skin of [0x8d5a3b, 0x9a6644, 0x6e452c]) for (const cloth of [0x8a6f3a, 0x3a6f8a, 0x8a3a5a, 0x5a7a3a, 0xa0522d]) for (const long of [false, true]) add('villager', { skin, cloth, long })
  if (names.includes('ilan')) for (const cloth of [0xc94a4a, 0x4a8ac9, 0x8ac94a, 0xc9a24a, 0x9a4ac9]) add('ilan', { cloth })
  add('aruvan', { ironStaff: true })
  add('malli', { weapon: 'flower' })
  add('ilanAdult', { weapon: 'bird' })
  scene.add(root)
  try { await renderer.warm() } finally { root.removeFromParent(); for (const character of characters) character.dispose() }
}
