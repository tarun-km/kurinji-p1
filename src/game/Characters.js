import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Builder, G, mat, rng, detailLevel } from './gfx/kit'
import { buildEnhancedCharacter } from './characters/cast'

/* ===========================================================================
   Faceted character rig, built from the turnaround boards (docs/art-reference).
   Bodies, fitted garments, armor and hair use shared anatomical surfaces.
   One skeleton drives merged meshes (one draw call per material).
   Cloth follows skirt/cape bones; cached buffers stay static during gameplay.
   Rig: body › hips › spine › chest › neck › head, shoulder › elbow › hand (L/R),
        leg › knee › foot (L/R), skirt, cape, crown, weapon.
=========================================================================== */

const lerp = THREE.MathUtils.lerp
const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t)
const swing = (a, b, c, wind, strike, back) => lerp(lerp(a, b, wind), c, strike) * (1 - back)
const blend = (object, key, value, factor) => { object[key] = lerp(object[key], value, factor) }

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

function buildWeapon(kind, ironStaff) {
  const root = new THREE.Group()
  meshPart(root, 'weaponGeometry', B => {
    const wood = 0x6e4a2a, steel = 0xb8bcc4, gold = 0xc9a24a
    if (kind === 'staff') {
      // faceted 2 m staff with knots, brass (early) or iron (Ch. IV) caps
      B.add(G.cyl(0.025, 0.028, 2, 7), wood, { rot: [Math.PI / 2, 0, 0], at: [0, 0, 0.25], jit: 0.1, grad: 0 })
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
    o.detail = Math.max(0, Math.min(3, o.detail ?? detailLevel()))
    const { scale, weapon, ironStaff, ...appearance } = o
    const key = JSON.stringify(Object.keys(appearance).sort().map(name => [name, appearance[name]]))
    this._template = retainTemplate(templates, key, () => buildEnhancedCharacter(o))
    this.root = cloneSkinned(this._template.root)
    // SkeletonUtils clones a skeleton per merged mesh. Share one per actor;
    // all meshes refer to the same cloned joints and need one palette update.
    this.skeleton = null
    this.root.traverse(node => { if (node.isSkinnedMesh) { if (!this.skeleton) this.skeleton = node.skeleton; else if (node.skeleton !== this.skeleton) { node.skeleton.dispose(); node.skeleton = this.skeleton } } })
    this._materials = new Map()
    this.mats = []
    this._ownMaterials(this.root)
    const bone = name => this.root.getObjectByName(name)
    const characterScale = scale * (o.child ? 0.62 : 1)
    this.body = bone('body'); this.body.scale.setScalar(characterScale)
    // Conservative static pose bounds include raised arms and fallen poses.
    const bound = new THREE.Sphere(new THREE.Vector3(0, 0.85 * characterScale, 0), 2.15 * characterScale)
    this.root.traverse(node => { if (node.isSkinnedMesh) { node.boundingSphere = bound; node.frustumCulled = true } })
    this.hips = bone('hips'); this.spine = bone('spine'); this.neck = bone('neck'); this.head = bone('head')
    this.armL = { sh: bone('shoulderL'), el: bone('elbowL'), hand: bone('handL') }
    this.armR = { sh: bone('shoulderR'), el: bone('elbowR'), hand: bone('handR') }
    this.legL = { hp: bone('legL'), kn: bone('kneeL'), ft: bone('footL') }; this.legR = { hp: bone('legR'), kn: bone('kneeR'), ft: bone('footR') }
    this.skirt = bone('skirt'); this.capeMesh = bone('cape'); this.crown = bone('crown')
    this.weapon = part(this.armR.hand, 'weapon', [0, -0.07, 0.01])
    this.setWeapon(weapon)
    this._clothRig = this.root.userData.clothRig
    this._skirtBones = []; this._capeBones = []
    for (let i = 0; i < this._clothRig.skirtChains; i++) this._skirtBones.push({ a: bone('skirt' + i + 'a'), b: bone('skirt' + i + 'b'), angle: i / this._clothRig.skirtChains * Math.PI * 2 })
    for (let i = 0; i < this._clothRig.capeCols; i++) for (let j = 0; j < this._clothRig.capeSegs; j++) this._capeBones.push({ bone: bone('cape' + i + '_' + j), column: i, segment: j })
    this._fingers = { l1: bone('fing1L'), l2: bone('fing2L'), r1: bone('fing1R'), r2: bone('fing2R'), tl: bone('thumbL'), tr: bone('thumbR') }
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
    this.skeleton?.dispose()
    this._headProp?.traverse(node => { if (node.isMesh) node.geometry.dispose() })
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
      if (AC === 'hammer') {
        // smith's strike: wind up over the shoulder, hang, drive down onto the anvil, small rebound
        const k = (t % 1.35) / 1.35
        const up = k < 0.55 ? ease(k / 0.55) : k < 0.62 ? 1 : k < 0.72 ? 1 - ease((k - 0.62) / 0.1) : Math.sin((k - 0.72) / 0.28 * Math.PI) * 0.12
        T.rShX = -0.55 - up * 2.35; T.rShZ = -0.18 - up * 0.1; T.rEl = -0.25 - up * 0.75; T.wpX = 1.45 - up * 0.35
        T.spX = 0.32 - up * 0.3; T.spY = -0.12 + up * 0.08; T.neckX = 0.3 - up * 0.12; T.neckY = 0
        T.lShX = -0.85; T.lShZ = 0.15; T.lEl = -0.75; T.leftPalm = 0
        T.lHpX = -0.25; T.rHpX = 0.15; T.lKn = 0.28 + (1 - up) * 0.12; T.rKn = 0.18; T.hipsY = 0.94 - (1 - up) * 0.03
        if (k >= 0.7 && (this._beatK ?? 0) < 0.7) this.onActivityHit?.()
        this._beatK = k
      }
      if (AC === 'grind') Object.assign(T, { hipsY: 0.48, spX: 0.35, lHpX: -1.5, rHpX: -1.5, lKn: 1.5, rKn: 1.5, lShX: -0.9 + Math.sin(t * 3) * 0.25, rShX: -0.9 + Math.cos(t * 3) * 0.25, lEl: -0.6, rEl: -0.6, neckX: 0.3 })
      if (AC === 'draw') {
        // hand over hand on the well rope, leaning back as each pull lands
        const k = Math.sin(t * 2.4), k2 = Math.sin(t * 2.4 + Math.PI)
        T.lShX = -1.5 + k * 0.38; T.rShX = -1.5 + k2 * 0.38; T.lEl = -0.45 - Math.max(0, -k) * 0.6; T.rEl = -0.45 - Math.max(0, -k2) * 0.6
        T.lShZ = 0.12; T.rShZ = -0.12; T.spX = -0.08 + Math.abs(k) * 0.05; T.neckX = -0.15; T.lKn = 0.18; T.rKn = 0.12; T.hipsY = 0.95 - Math.abs(k) * 0.012
      }
      if (AC === 'wave') { T.rShX = -2.6; T.rShZ = -0.3 + Math.sin(t * 7) * 0.3; T.rEl = -0.6; T.neckY = 0 }
      if (AC === 'sitchat') Object.assign(T, { hipsY: 0.48, spX: 0.05, lHpX: -1.5, rHpX: -1.5, lKn: 1.5, rKn: 1.5, lShX: -0.35, rShX: -0.55 + Math.max(0, Math.sin(t * 1.5)) * -0.6, rEl: -1.2, neckY: Math.sin(t * 0.6) * 0.3 })
    }
    // ---- acting: speech gestures + attention (set by Game.say / scenes)
    this.talking = lerp(this.talking || 0, this.speaking ? 1 : 0, Math.min(1, dt * 5))
    const seatedPose = S === 'meditate' || S === 'crossSit' || S === 'sit' || S === 'throne' || S === 'teach' || S === 'kneel' || S === 'hold' || S === 'defeated' || S === 'lie'
    if (this.talking > 0.01 && !this.action && S !== 'dead' && S !== 'lie') {
      const q = this.talking, t = this.idleT
      const b1 = Math.max(0, Math.sin(t * 2.1)), b2 = Math.max(0, Math.sin(t * 1.37 + 1.3))
      T.neckX += Math.sin(t * 4.3) * 0.05 * q                      // the head moves with the words
      T.spY += Math.sin(t * 0.8) * 0.07 * q
      T.spX += (this.mood === 'angry' ? 0.1 : this.mood === 'sad' ? 0.06 : 0.02) * q
      if (!AC) {
        T.lShX = lerp(T.lShX, -0.35 - b2 * 0.5, q * (seatedPose ? 0.45 : 0.85)); T.lEl = lerp(T.lEl, -1.1 - b2 * 0.35, q * (seatedPose ? 0.45 : 0.85))
        T.lShZ = lerp(T.lShZ, 0.2, q * 0.8); T.leftPalm = lerp(T.leftPalm, 0.6 * b2, q)
        if (!seatedPose) {
          if (!W || W === 'flower' || W === 'bird') { T.rShX = lerp(T.rShX, -0.55 - b1 * 0.55, q); T.rEl = lerp(T.rEl, -1.25 - b1 * 0.3, q); T.rShZ = lerp(T.rShZ, -0.22, q) }
          else if (W === 'sword' || W === 'greatsword') { T.rShX = lerp(T.rShX, -0.7 - b1 * 0.35, q); T.rEl = lerp(T.rEl, -0.55, q); T.wpX = lerp(T.wpX, 1.2 + b1 * 0.25, q) }
        }
      }
    }
    if (this.mood === 'sad' && !this.action) T.neckX += 0.18
    // attention: turn head (and a little of the chest) toward a world point
    if (this.lookTarget && S !== 'dead' && this.root.parent) {
      const L = this._lookLocal ||= new THREE.Vector3(), H = this._headLocal ||= new THREE.Vector3()
      this.root.updateWorldMatrix(true, false)
      L.copy(this.lookTarget); this.root.worldToLocal(L)
      this.head.getWorldPosition(H); this.root.worldToLocal(H)
      const yaw = Math.max(-1.25, Math.min(1.25, Math.atan2(L.x - H.x, L.z - H.z)))
      const pitch = Math.max(-0.5, Math.min(0.45, Math.atan2(L.y - H.y, Math.hypot(L.x - H.x, L.z - H.z) + 1e-3)))
      const w = seatedPose ? 0.75 : 1
      T.neckY = (T.neckY ?? 0) * 0.3 + yaw * 0.62 * w; T.spY += yaw * 0.32 * w
      T.neckX += -pitch * 0.7 * w
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
      // acting beats used by dialogue and cinematics
      const arc = Math.sin(u * Math.PI)
      if (n === 'point') { T.rShX = sw(-0.5, -1.7, -1.45); T.rShZ = sw(-0.1, -0.25, -0.15); T.rEl = sw(-0.6, -0.25, -0.1); T.wpX = sw(0.9, 1.6, 1.55); T.spX += 0.08 * arc; T.leftPalm = 0 }
      if (n === 'flourish') { T.rShX = sw(-0.4, -1.9, -0.6); T.rShZ = sw(-0.1, -0.9, -0.25); T.rEl = sw(-0.6, -0.3, -0.5); T.wpX = 0.9 + Math.sin(u * Math.PI * 4) * 1.3 * arc; T.spY = sw(0, 0.35, -0.1) }
      if (n === 'drawSword') { T.rShZ = sw(-0.1, 0.95, -0.3); T.rShX = sw(-0.2, -0.6, -1.9); T.rEl = sw(-0.4, -1.4, -0.3); T.wpX = sw(0.9, 0.4, 1.3); T.spY = sw(0, -0.3, 0.1) }
      if (n === 'gesture') { T.lShX = sw(-0.3, -1.25, -0.85); T.lShZ = sw(0.1, 0.55, 0.35); T.lEl = sw(-0.6, -0.45, -0.6); T.leftPalm = arc; T.spX += 0.06 * arc; T.neckX += -0.06 * arc }
      if (n === 'nod') T.neckX += Math.sin(u * Math.PI * 2) * 0.26
      if (n === 'shake') T.neckY = (T.neckY ?? 0) + Math.sin(u * Math.PI * 4) * 0.38 * arc
      if (n === 'clutch') { T.spX = 0.5 * arc + 0.2; T.lShX = -0.9; T.lShZ = -0.35; T.lEl = -1.95; T.rShX = -0.7; T.rEl = -1.6; T.hipsY -= 0.07 * arc; T.neckX = 0.35 * arc; T.lKn += 0.35 * arc; T.rKn += 0.2 * arc }
      if (n === 'stagger') { T.spX = -0.35 * arc; T.spY += 0.25 * arc; T.neckX = -0.3 * arc; T.hipsY -= 0.08 * arc; T.lShZ = 0.5 * arc; T.rShZ = -0.5 * arc; T.lHpX = -0.4 * arc; T.lKn = 0.5 * arc }
      if (n === 'kneelDown') { const f = ease(u); Object.assign(T, { hipsY: lerp(0.95, 0.55, f), spX: 0.25 * f, lHpX: -1.4 * f, rHpX: 0.25 * f, lKn: 1.45 * f, rKn: 1.65 * f, rAnk: 0.9 * f, neckX: 0.4 * f }) }
      if (A.t >= A.dur) { if (n === 'die') this.sustain = 'dead'; if (n === 'kneelDown') this.sustain = 'kneel'; this.action = null }
    }
    if (this.sustain === 'dead') Object.assign(T, POSES.dead, { hipsRY: 0, hipsRZ: 0, neckY: 0 })
    // ---- airborne: tuck on the way up, legs reaching for the ground on the way down; land with a dip
    if (this.air && !this.sustain) {
      const up = this.air > 0
      Object.assign(T, { lHpX: up ? -1.05 : -0.55, rHpX: up ? -0.25 : -0.15, lKn: up ? 1.45 : 0.55, rKn: up ? 0.85 : 0.35, lAnk: 0.35, rAnk: 0.25, spX: up ? 0.18 : 0.05, neckX: up ? -0.12 : 0.05 })
      if (!this.o.weapon) { T.lShX = up ? -0.9 : -0.4; T.rShX = up ? -0.9 : -0.4; T.lShZ = 0.45; T.rShZ = -0.45; T.lEl = -0.6; T.rEl = -0.6 }
      else { T.lShX = up ? -0.9 : -0.4; T.lShZ = 0.5; T.lEl = -0.6 }
    }
    if (this.landT > 0) { this.landT -= dt; const q = Math.sin(this.landT / 0.18 * Math.PI); T.hipsY -= 0.16 * q; T.lKn += 0.6 * q; T.rKn += 0.6 * q; T.spX += 0.15 * q }

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
    this._updateCloth(dt, T, S, stride, sp, f)
    this._updateFingers(!!this.o.weapon, S, f)
    if (this.flash > 0) { this.flash -= dt; this.setTint(this.flash > 0 ? (this.flashColor ?? 0x661111) : 0) }
  }

  hitFlash(color = 0x882222, t = 0.12) { this.flash = t; this.flashColor = color }

  _updateFingers(weapon, pose, factor) {
    const F = this._fingers, open = pose === 'refuse' || pose === 'raise'
    if (!F.r1) return
    const right = weapon ? 0.98 : pose === 'meditate' ? 0.25 : 0.12
    const left = open ? 0.02 : pose === 'meditate' ? 0.25 : 0.13
    // Fingers close toward the palm (inward x on each side).
    blend(F.r1.rotation, 'z', -right, factor); blend(F.r2.rotation, 'z', -right * 0.75, factor)
    blend(F.l1.rotation, 'z', left, factor); blend(F.l2.rotation, 'z', left * 0.75, factor)
    blend(F.tr.rotation, 'x', weapon ? -0.3 : 0, factor)
    blend(F.tl.rotation, 'x', open ? -0.1 : 0.06, factor)
  }
  _updateCloth(dt, T, pose, stride, speed, factor) {
    this._lean = lerp(this._lean, speed, Math.min(1, dt * 3))
    const seated = pose === 'meditate' || pose === 'sit' || pose === 'throne' || pose === 'crossSit' || pose === 'teach'
    const kneeling = pose === 'kneel' || pose === 'hold' || pose === 'defeated'
    if (this.capeMesh) blend(this.capeMesh.rotation, 'x', 0.08 + this._lean * 0.42 - T.spX * 0.48, factor)
    for (const entry of this._capeBones) {
      const wave = Math.sin(this.idleT * 2.1 + entry.column * 0.8 + entry.segment * 0.6)
      blend(entry.bone.rotation, 'x', 0.025 + entry.segment * 0.017 + wave * (0.012 + speed * 0.025), factor)
      blend(entry.bone.rotation, 'z', Math.sin(this.idleT * 1.2 + entry.column) * 0.018, factor)
    }
    if (!this.skirt) return
    blend(this.skirt.scale, 'y', seated ? 0.47 : kneeling ? 0.69 : 1, factor)
    blend(this.skirt.scale, 'x', seated ? 1.36 : 1 + stride * 0.06, factor)
    blend(this.skirt.scale, 'z', seated ? 1.22 : 1 + stride * 0.06, factor)
    for (const entry of this._skirtBones) {
      const side = Math.sin(entry.angle), front = Math.cos(entry.angle)
      const leg = side > 0 ? T.lHpX : T.rHpX
      const bend = seated ? -0.18 * Math.max(0, front) : leg * (0.44 + Math.max(0, front) * 0.30)
      blend(entry.a.rotation, 'x', bend + Math.sin(this.idleT * 2.2 + entry.angle) * 0.012 * (1 + speed), factor)
      blend(entry.b.rotation, 'x', -bend * 0.18, factor)
      blend(entry.a.rotation, 'z', seated ? -side * 0.15 : -side * stride * 0.018, factor)
    }
  }
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
