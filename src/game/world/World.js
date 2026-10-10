import * as THREE from 'three'
import gsap from 'gsap'
import { Builder, G, rock, jitter, rng, mat, WIND, SURF, detailLevel } from '../gfx/kit'
import { FOG } from '../gfx/Renderer'
import { PLACES, heightAt, pathX, BOUNDS, buildTerrain, TERRAIN_U, smooth } from './terrain'
import { Sky } from './sky'
import { Nature, blossomGeo } from './nature'
import { Water } from './water'
import { FX, dotTexture } from './fx'
import { Fauna } from './fauna'
import * as K from './props'
import { house, temple, TEMPLE_LAYOUT, bellTower, palisadeLog, watchtower, fortWall, roundTower, kolam, tileRoof } from './buildings'
import { settings } from '../settings'
import { RIM } from '../Characters'
import { TIMES, rimColor, createSunDisc } from './lighting'
import { accelerateRaycasts } from '../gfx/bvh'
import { Flags } from './flags'
import { buildRegions } from './regions'

export { PLACES, heightAt, pathX, BOUNDS }

/* Lighting presets (sky, sun, fog, rim, wetness, shafts, grade) live in ./lighting.js. */

export class World {
  constructor(scene, game) {
    this.scene = scene; this.game = game
    this.colliders = []           // {x, z, r}
    this.clear = []               // keep-open circles {x, z, r} and rects
    this.anim = []                // per-frame callbacks
    this.emitters = []            // point-light candidates {p, color, power, kind}
    this.fxTex = dotTexture()
    this.state = {}
    this.buildLights()
    this.sky = new Sky(scene)
    this.game?.renderer?.setSun?.(createSunDisc())   // sun shafts follow the sky's sun direction
    this.terrain = buildTerrain(scene)
    this.fx = new FX(scene, this)
    this.markOpen()
    this.flags = new Flags(scene)
    this.buildTemple(); this.buildRock(); this.buildLanternPath()
    this.buildVillage(); this.buildForge(); this.buildTraining()
    this.buildGate(); this.buildRoadside(); this.buildThennur(); this.buildFortress(); this.buildFortressOuter()
    buildRegions(this)
    this.flagMesh = this.flags.build()
    this.water = new Water(scene, this)
    this.nature = new Nature(scene, this)
    this.fauna = new Fauna(scene, this)
    this.setTime('dawn', 0)
  }
  y(x, z) { return heightAt(x, z) }
  solid(x, z, r) { const collider = { x, z, r }; this.colliders.push(collider); return collider }
  /** Walkable structure surfaces (platforms, steps, daises) layered over the terrain. */
  floor(f) { (this.floors ||= []).push(f) }
  /** Ground height for actors: terrain or the highest structure surface underfoot. */
  groundAt(x, z) {
    let h = heightAt(x, z)
    for (const f of this.floors || []) {
      if (f.enabled && !f.enabled()) continue
      if (f.disc) { if ((x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) h = Math.max(h, f.y) }
      else if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) h = Math.max(h, f.steps ? f.steps(x, z) : f.y)
    }
    return h
  }
  blocked(x, z, pad = 0) {
    for (const c of this.colliders) if (c.r && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true
    for (const c of this.clear) {
      const clearance = Math.max(0, pad)
      if (c.rect) { if (x > c.x0 - clearance && x < c.x1 + clearance && z > c.z0 - clearance && z < c.z1 + clearance) return true }
      else if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + clearance) ** 2) return true
    }
    return false
  }
  markOpen() {
    const c = (x, z, r) => this.clear.push({ x, z, r })
    c(0, -72, 11); c(0, -1, 10.5); c(14, 10, 5.5); c(-13, 8, 4); c(0, 46, 4); c(-8, 98, 7); c(20, -90, 3.2)
    const T = PLACES.temple
    this.clear.push({ rect: true, x0: T.x - 9.4, x1: T.x + 9.4, z0: T.z - 7.4, z1: T.z + 8.6 })
    this.clear.push({ rect: true, x0: T.x - 3.1, x1: T.x + 3.1, z0: T.z + 8, z1: T.z + 23 })
    this.clear.push({ rect: true, x0: -23, x1: 23, z0: 149, z1: 181 })
  }
  addMesh(b, opts) { const g = b.build(opts); this.scene.add(g); (this.occluders ||= []).push(g); if (this.bvh) accelerateRaycasts(g); return g }
  light(p, color = 0xffa040, power = 6, kind = 'lamp') { this.emitters.push({ p: new THREE.Vector3(...p), color: new THREE.Color(color), power, kind }) }

  /* ================= lights ================= */
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334422, 0.7); this.scene.add(this.hemi)
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 2)
    sun.castShadow = true
    const c = sun.shadow.camera; c.left = -45; c.right = 45; c.top = 45; c.bottom = -45; c.near = 1; c.far = 320
    sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.06   // retuned per map size in setShadowSize
    this.scene.add(sun, sun.target)
    this.sunOffset = new THREE.Vector3(50, 80, 30)
    this.pool = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffa040, 0, 16, 1.7); this.scene.add(l); return l })
    this.lampLevel = 0
  }
  setShadowSize(n) {
    this.sun.castShadow = n > 0
    if (n && this.sun.shadow.mapSize.x !== n) { this.sun.shadow.mapSize.set(n, n); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null }
    // bias in proportion to one shadow texel (90 m frustum); the receiver offset always points to the light (gfx/chunks.js)
    if (n) { const texel = 90 / n; this.sun.shadow.normalBias = texel * 1.4; this.sun.shadow.bias = -0.00012; this.sun.shadow.radius = n >= 4096 ? 1.8 : n >= 2048 ? 1.3 : 1 }
  }
  updateEnv() {
    const gl = this.game.renderer?.gl; if (!gl) return
    this.pmrem ||= new THREE.PMREMGenerator(gl)
    if (!this.envScene) { this.envScene = new THREE.Scene(); const d = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.sky.dome.material.clone()); d.material.uniforms = this.sky.U; this.envScene.add(d) }
    const rt = this.pmrem.fromScene(this.envScene, 0.05)
    this.envTarget?.dispose(); this.envTarget = rt; this.scene.environment = rt.texture
    this.scene.environmentIntensity = TIMES[this.timeName]?.env ?? 0.55
  }
  setTime(name, dur = 3) {
    const P = TIMES[name]; this.timeName = name
    this.sky.setPreset(P, dur, gsap)
    const tw = (col, hex) => { const t = new THREE.Color(hex); dur ? gsap.to(col, { r: t.r, g: t.g, b: t.b, duration: dur }) : col.copy(t) }
    this.scene.fog ||= new THREE.FogExp2(0xffffff, 0.004)
    tw(this.scene.fog.color, P.fog); tw(this.sun.color, P.sun); tw(this.hemi.color, P.sky); tw(this.hemi.groundColor, P.ground); tw(FOG.uFogSunCol.value, P.sun)
    tw(this.water.sky, P.top)
    { const rc = rimColor(P); dur ? gsap.to(RIM.value, { r: rc.r, g: rc.g, b: rc.b, duration: dur }) : RIM.value.copy(rc) }
    const n = new THREE.Vector3(...P.dir).normalize()
    const to = (o, props) => dur ? gsap.to(o, { ...props, duration: dur }) : Object.assign(o, props)
    to(this.scene.fog, { density: P.fogD }); to(this.sun, { intensity: P.si }); to(this.hemi, { intensity: P.hemi })
    to(this.sunOffset, { x: n.x * 140, y: n.y * 140, z: n.z * 140 })
    to(this.sky.U.sunDir.value, { x: n.x, y: n.y, z: n.z }); to(FOG.uFogSunDir.value, { x: n.x, y: n.y, z: n.z })
    to(FOG.uFogH.value, { x: P.hf[0], y: P.hf[1], z: P.hf[2] * (settings.preset === 'low' ? 0.7 : 1), w: P.hf[3] })
    to(this, { lampLevel: P.lamps })
    this.fx.fireflies.visible = name === 'night'
    this.game.renderer?.setGrade(name, dur)
    this.game.renderer?.setShafts?.(P.shafts ?? 0, dur)
    to(SURF.uSurfWet, { value: P.wet ?? 0 })
    this.updateEnv(); if (dur) setTimeout(() => { if (this.timeName === name) this.updateEnv() }, dur * 1000 + 50)
    this.fx.setRain(name === 'storm')
    this.storm = name === 'storm'
  }

  /* ================= structures ================= */
  buildTemple() {
    const T = PLACES.temple, b = new Builder(101)
    b.push([T.x, T.y, T.z])
    const t = temple(b, {})
    b.pop()
    this.templeGroup = this.addMesh(b)
    for (const l of t.lamps) this.light([T.x + l[0], T.y + l[1], T.z + l[2]], 0xffb050, 3, 'temple')
    this.statuePos = new THREE.Vector3(T.x, T.y + 2.6, T.z - 3)
    this.floor({ x0: T.x - 9, x1: T.x + 9, z0: T.z - 7, z1: T.z + 4, y: T.y + 1 })
    for (const sx of [-1, 1]) this.floor({ x0: T.x + (sx < 0 ? -9 : 2.6), x1: T.x + (sx < 0 ? -2.6 : 9), z0: T.z + 4, z1: T.z + 7, y: T.y + 1 })
    this.floor({ x0: T.x - 7, x1: T.x + 7, z0: T.z - 6, z1: T.z + 4, y: T.y + 2 })
    const stair = TEMPLE_LAYOUT.stair
    for (let i = 0; i < stair.count; i++) this.floor({ x0: T.x - stair.width / 2, x1: T.x + stair.width / 2, z0: T.z + stair.front - (i + 1) * stair.run, z1: T.z + stair.front - i * stair.run, y: T.y + stair.rise * (i + 1) })
    // Wall segments preserve the open shrine doorway; coarse circular blockers
    // previously made the visually hollow sanctum impossible to enter.
    for (const sx of [-1, 1]) for (let z = -4.6; z <= -0.6; z += 0.7) this.solid(T.x + sx * 3, T.z + z, 0.27)
    for (let x = -3; x <= 3; x += 0.65) this.solid(T.x + x, T.z - 4.6, 0.27)
    for (const sx of [-1, 1]) for (let x = 1.45; x <= 3; x += 0.55) this.solid(T.x + sx * x, T.z - 0.6, 0.25)
    this.solid(T.x, T.z - 3.6, 0.9)
    for (const [x, z] of TEMPLE_LAYOUT.pillars) this.solid(T.x + x, T.z + z, 0.42)
    // temple platform raises the floor: terraced ground handled by zone flattening; steps lead up at +z
    this.templeFires = [[-5, 7.2, 3.6], [4, 8.5, -1], [-1, 9.5, -2.6], [6, 6.8, 0.5], [-6.5, 6.6, -2]].map(([x, y, z]) => [T.x + x, T.y + y, T.z + z, 1.3])
    this.fx.setFires('temple', this.templeFires, false)
    // golden statue (separate so it glints)
    const s = new Builder(102); K.buddha(s, [T.x, T.y + 2.02, T.z - 3.6], 0, 1.2)
    for (const sx of [-1.6, 1.6]) { const lp = K.brassLamp(s, [T.x + sx, T.y + 2.02, T.z - 2.2], 1.05); this.light(lp, 0xffb050, 4, 'shrine') }
    K.fruit(s, [T.x - 0.5, T.y + 2.1, T.z - 2.3], 'banana', 5); K.fruit(s, [T.x + 0.5, T.y + 2.1, T.z - 2.3], 'orange', 5)
    const statue = this.addMesh(s)
    for (const m of statue.children) if (m.name === 'gold') { m.material = mat('gold').clone(); m.material.emissive = new THREE.Color(0x4a3008); m.material.emissiveIntensity = 0.9 }
    // terrace edge: retaining wall + stairs down to the lantern path (temple board)
    const w = new Builder(103), r = rng(5)
    const edge = T.z + 15.5
    for (let x = -15; x <= 15; x += 1.25) {
      if (Math.abs(x) < 2.8) continue
      const z = edge - Math.abs(x) * 0.18, y0 = heightAt(x, z + 1.2)
      const top = Math.max(y0, T.y)
      for (let y = y0 - 0.4; y < top + 0.5; y += 0.55) w.add(G.chamfer(1.22, 0.55, 0.7, 0.05), [0x8a8070, 0x9a8f80, 0x7a7470][(r() * 3) | 0], { at: [x, y + 0.27, z], m: 'stone' })
    }
    for (let i = 0; i < 9; i++) {
      const z = edge - 0.6 + i * 0.75, y = Math.max(heightAt(0, z) + 0.04, T.y - i * 0.45)
      w.add(G.chamfer(4.2, 0.4, 0.8, 0.04), 0xa8a090, { at: [0, y - 0.2, z], m: 'stone' })
      this.floor({ x0: -2.1, x1: 2.1, z0: z - 0.4, z1: z + 0.4, y })
    }
    for (const s2 of [-1, 1]) { K.fence(w, [s2 * 2.4, T.y, edge - 0.5], [s2 * 2.4, heightAt(s2 * 2.4, edge + 6), edge + 6]); this.light(K.brassLamp(w, [s2 * 2.6, T.y, edge - 0.9], 1.2), 0xffb050, 3, 'temple') }
    this.addMesh(w)
    // bell tower (9, -66) + swinging bronze bell
    const B = PLACES.bell, bt = new Builder(104)
    bt.push([B.x, B.y, B.z], [0, -0.3, 0]); bellTower(bt); bt.pop()
    this.addMesh(bt)
    const bb = new Builder(105); K.bell(bb)
    this.bell = bb.build(); this.bell.position.set(B.x, B.y + 3.85, B.z); this.bell.rotation.y = -0.3; this.scene.add(this.bell)
    this.solid(B.x, B.z, 1.6)
    this.floor({ disc: true, x: B.x, z: B.z, r: 1.7, y: B.y + 0.5 })
  }
  buildRock() {
    const R = PLACES.rock, b = new Builder(106)
    // the meditation rock: one wide flat weathered granite slab (4 m, < 1 m tall) among angular stones
    const slab = jitter(new THREE.CylinderGeometry(2.0, 2.15, 0.85, 12, 1), 0.15, 9)
    const vertices = slab.attributes.position
    for (let i = 0; i < vertices.count; i++) vertices.setY(i, vertices.getY(i) > 0 ? 0.43 : -0.42)
    b.add(slab, (f, cy) => new THREE.Color(cy > 0.8 ? 0x8a847c : 0x6e6a64), { at: [R.x, R.y + 0.35, R.z], m: 'stone', jit: 0.06 })
    if (detailLevel() > 0) for (let i = 0; i < 5; i++) {
      const a = i * 1.25 + 0.2
      b.add(G.box(0.018, 0.006, 0.85), 0x53524b, { at: [R.x + Math.sin(a) * 1.1, R.y + 0.782, R.z + Math.cos(a) * 1.1], rot: [0, a + 0.7, 0], m: 'stone', grad: 0, jit: 0 })
    }
    const r = rng(8)
    for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = 2.6 + r() * 3.5, s = 0.4 + r() * 0.9; b.add(rock(s, i + 20, 0.7, 1), 0x7a746c, { at: [R.x + Math.cos(a) * d, heightAt(R.x + Math.cos(a) * d, R.z + Math.sin(a) * d) + s * 0.25, R.z + Math.sin(a) * d], rot: [0, a, 0], m: 'stone' }) }
    this.addMesh(b)
    this.rockTop = new THREE.Vector3(R.x, R.y + 0.78, R.z)
    this.floor({ disc: true, x: R.x, z: R.z, r: 1.94, y: R.y + 0.78 })
  }
  buildLanternPath() {
    const b = new Builder(107)
    ;[-56.5, -49, -42, -35, -28, -21].forEach((z, i) => {
      const x = pathX(z) + (i % 2 ? 2.4 : -2.4)
      this.light(K.stoneLantern(b, [x, heightAt(x, z), z]), 0xffb060, 6, 'lantern')
      this.solid(x, z, 0.4)
    })
    this.addMesh(b)
  }

  buildVillage() {
    const b = new Builder(201), V = PLACES.village
    const H = [
      { id: 'thamarai', x: -14, z: -10, w: 4.8, d: 4.0, wall: 0xf0e4cc },
      { id: 'kaali', x: -17, z: 2, w: 4.6, d: 3.8, wall: 0xd8c4a0 },
      { id: 'murugan', x: -6, z: -16, w: 4.2, d: 3.6, wall: 0xe0d0b0 },
      { id: 'weaver', x: 8, z: -15, w: 4.8, d: 3.8, wall: 0xf0e4cc },
      { id: 'potter', x: 16, z: -6, w: 4.4, d: 3.8, wall: 0xe2d2b2 },
      { id: 'shepherd', x: 18, z: 22, w: 4.6, d: 4.0, wall: 0xd8c4a0 },
      { id: 'granary', x: -18, z: 18, w: 5.4, d: 4.4, wall: 0xe0d0b0 },
      { id: 'tea', x: -6, z: 20, w: 5.0, d: 4.0, wall: 0xf0e4cc },
      { id: 'carpenter', x: 7.6, z: 19.5, w: 4.4, d: 3.8, wall: 0xe2d2b2 },
      { id: 'beekeeper', x: -24, z: -18, w: 4.2, d: 3.6, wall: 0xd8c4a0 },
      { id: 'shrine', x: 24, z: -16, w: 4.0, d: 3.6, wall: 0xf0e4cc },
    ]
    this.houses = {}
    H.forEach((h, i) => {
      const rot = Math.atan2(V.x - h.x, V.z - h.z), y = heightAt(h.x, h.z) - 0.1
      b.push([h.x, y, h.z], [0, rot, 0])
      const info = house(b, { w: h.w, d: h.d, wall: h.wall, roof: [0xc4573a, 0xb04a2e, 0xc8603a][i % 3], seed: 300 + i })
      this.decorateHouse(b, h, info)
      b.pop()
      kolam(this.scene, h.x + Math.sin(rot) * (h.d / 2 + 3.4), heightAt(h.x + Math.sin(rot) * (h.d / 2 + 3.4), h.z + Math.cos(rot) * (h.d / 2 + 3.4)), h.z + Math.cos(rot) * (h.d / 2 + 3.4), rot, 1.5)
      this.houses[h.id] = { ...h, rot, y }
      this.solid(h.x, h.z, Math.max(h.w, h.d) * 0.55)
      this.solid(h.x + Math.sin(rot) * (h.d / 2 + 1.2), h.z + Math.cos(rot) * (h.d / 2 + 1.2), 1.2)
    })
    // well (2.4 m) with tiled pavilion roof, pulley and bucket
    const W = [3, -2.5], wy = heightAt(...W)
    b.push([W[0], wy, W[1]])
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; b.add(G.chamfer(0.55, 0.9, 0.32, 0.05), [0x8a8478, 0x9a948a, 0x7a746c][i % 3], { at: [Math.cos(a) * 1.03, 0.45, Math.sin(a) * 1.03], rot: [0, -a + Math.PI / 2, 0], m: 'stone' }) }
    b.add(G.cyl(1.05, 1.05, 0.05, 14), 0x1a2a30, { at: [0, 0.6, 0], m: 'metal' })
    b.add(G.cyl(1.2, 1.2, 1.6, 14), 0x8a8478, { at: [0, -0.7, 0], m: 'stone' })
    // The source well has two posts and a red pyramid cap, not a hexagonal
    // pavilion. The pulley remains visible between its two structural supports.
    for (const x of [-1.4, 1.4]) b.add(G.chamfer(0.2, 2.8, 0.2, 0.03), K.P.woodDark, { at: [x, 1.4, 0], m: 'wood' })
    b.add(G.chamfer(3.1, 0.18, 0.22, 0.03), K.P.woodDark, { at: [0, 2.8, 0], m: 'wood' })
    b.add(G.cone(2.25, 1.1, 4), K.P.tile, { at: [0, 3.4, 0], rot: [0, Math.PI / 4, 0], jit: 0.06, m: 'tile' })
    if (detailLevel() > 0) for (const sx of [-1, 1]) b.add(G.chamfer(0.12, 0.8, 0.15, 0.025), K.P.wood, { at: [sx * 1.15, 2.55, 0], rot: [0, 0, sx * 0.7], m: 'wood' })
    b.add(G.cyl(0.09, 0.09, 2.6, 6).rotateZ(Math.PI / 2), K.P.wood, { at: [0, 2.2, 0] , m: 'wood' })
    b.add(G.cyl(0.32, 0.32, 0.1, 8).rotateZ(Math.PI / 2), K.P.wood, { at: [0.6, 2.2, 0] , m: 'wood' })
    b.add(G.cyl(0.01, 0.01, 1.2, 3), 0x8a6a40, { at: [0.6, 1.6, 0] })
    K.bucket(b, [0.6, 0.8, 0]); K.pot(b, [1.6, 0, 0.6], 1.2, 0xb0603a); K.pot(b, [1.9, 0, -0.2], 0.9, 0x9a5a3a)
    b.pop()
    this.solid(W[0], W[1], 1.6); this.wellPos = new THREE.Vector3(W[0], wy, W[1])
    // A few broad paving stones ground the well and the approach without filling
    // the combat square with small props or separate draw calls.
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, x = W[0] + Math.cos(a) * 2, z = W[1] + Math.sin(a) * 2
      b.add(G.chamfer(0.7, 0.075, 0.6, 0.025), [0xa49a88, 0x948978, 0xb0a491][i % 3], { at: [x, heightAt(x, z) + 0.03, z], rot: [0, -a, 0], m: 'stone' })
    }
    // three market stalls (red / blue / yellow awnings) per the market board
    for (const [x, z, col, fr] of [[-8, 4, 0xb03a2a, ['orange', 'red', 'green']], [10, 3.5, 0x2a6ab0, ['green', 'orange', 'red']], [-4.2, 10.5, 0xc9a227, ['red', 'orange', 'banana']]]) {
      const rot = Math.atan2(-x, -z)
      K.stall(b, [x, heightAt(x, z), z], rot, col, fr); this.solid(x, z, 1.6)
    }
    K.crate(b, [-9.6, heightAt(-9.6, 6.4), 6.4], 0.3, 0.8); K.barrel(b, [-10.8, heightAt(-10.8, 5.2), 5.2]); K.barrel(b, [11.6, heightAt(11.6, 1.5), 1.5], 0, 0.9)
    // lantern posts around the square + marigold garlands strung between them
    const posts = []
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.2, x = Math.cos(a) * 11.5, z = Math.sin(a) * 11.5
      if (Math.abs(x - pathX(z)) < 2.6) continue
      const y = heightAt(x, z), rot = -a + Math.PI
      this.light(K.lanternPost(b, [x, y, z], rot), 0xffb060, 5, 'lantern')
      posts.push([x, y + 2.35, z]); this.solid(x, z, 0.3)
    }
    for (let i = 0; i < posts.length; i++) { const a = posts[i], c = posts[(i + 1) % posts.length]; if (Math.hypot(a[0] - c[0], a[2] - c[2]) < 12) K.garland(b, a, c, { kind: 'marigold', sag: 0.8 }) }
    // laundry line near the weaver, village tree with stone seat
    K.clothLine(b, [11, heightAt(11, -10), -10], [14.5, heightAt(14.5, -11.5), -11.5])
    const T = [-10, 13], ty = heightAt(...T)
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.add(G.chamfer(1.0, 0.5, 0.5, 0.05), 0x9a948a, { at: [T[0] + Math.cos(a) * 1.9, ty + 0.25, T[1] + Math.sin(a) * 1.9], rot: [0, -a + Math.PI / 2, 0], m: 'stone' }) }
    this.addMesh(b)
    this.villageTree = new THREE.Vector3(T[0], ty, T[1]); this.solid(T[0], T[1], 2.2)
    // the big village tree (shola-like, wide canopy)
    const vt = new Builder(202)
    vt.add(G.cyl(0.45, 0.75, 4, 8), 0x5e5442, { at: [T[0], ty + 2, T[1]], m: 'tree' })
    for (const [x, y, z, s] of [[0, 5.6, 0, 2.6], [2, 5, 0.8, 2], [-2.1, 5.1, -0.6, 2.1], [0.6, 5, 2.2, 1.9], [-0.4, 5.1, -2.3, 1.9], [0.2, 6.8, 0.2, 1.8]])
      vt.add(jitter(new THREE.IcosahedronGeometry(s, 1), 0.4, x * 5 + z), [0x3c6a2e, 0x2e5a26, 0x447634][(x * 3 + 6 | 0) % 3], { at: [T[0] + x, ty + y, T[1] + z], scale: [1, 0.78, 1], m: 'tree' })
    this.addMesh(vt)
  }
  decorateHouse(b, h, info) {
    const d = h.d, w = h.w, py = 0.45
    switch (h.id) {
      case 'thamarai':
        K.herbRack(b, [0, info.beamY - 0.1, d / 2 + 1.55], 0, w - 0.6); K.mortar(b, [1.3, py, d / 2 + 0.6]); K.basket(b, [-1.6, py + 0.42, d / 2 + 0.4], 0.8)
        K.pot(b, [2.6, 0, d / 2 + 1.9], 1.1); K.pot(b, [-2.7, 0, d / 2 + 1.4], 0.9, 0xb0603a, 'tulsi'); break
      case 'kaali':
        b.add(G.box(0.12, 2.2, 0.12), K.P.woodDark, { at: [-w / 2 - 1.2, 1.1, d / 2] , m: 'wood' }); b.add(G.box(1.6, 0.18, 0.2), K.P.woodDark, { at: [-w / 2 - 0.6, 2.2, d / 2] , m: 'wood' })
        K.hammerProp(b, [-w / 2 - 0.2, 1.05, d / 2], [Math.PI, 0, 0], 1); break
      case 'murugan':
        K.pot(b, [1.6, py, d / 2 + 0.5], 1.1, 0xb0603a, 'tulsi'); K.bench(b, [-1.4, py, d / 2 + 0.6], 0, 1.2)
        b.add(G.cyl(0.03, 0.035, 1.3, 5), K.P.wood, { at: [-0.4, py + 0.6, d / 2 + 0.15], rot: [0.3, 0, 0.2] , m: 'wood' }); break
      case 'weaver':
        K.clothLine(b, [-w / 2 - 0.6, 0, d / 2 + 2.6], [w / 2 + 0.6, 0, d / 2 + 2.6], [0xd9822b, 0x2a4a8a, 0x8a2a3a, 0xd9822b, 0x2a4a8a]); break
      case 'potter':
        for (let i = 0; i < 6; i++) K.pot(b, [-2 + (i % 3) * 0.55, py + (i > 2 ? 0.5 : 0), d / 2 + 0.6 + (i > 2 ? 0 : 0.2)], 0.9 + (i % 2) * 0.2, [0xb0603a, 0x9a5a3a, 0xc07040][i % 3])
        b.add(G.cyl(0.4, 0.45, 0.25, 10), 0x6a5a4a, { at: [1.6, py + 0.12, d / 2 + 0.6] }); break
      case 'shepherd':
        K.fence(b, [w / 2 + 0.5, 0, -1.5], [w / 2 + 4.5, 0, -1.5]); K.fence(b, [w / 2 + 4.5, 0, -1.5], [w / 2 + 4.5, 0, 2.5]); K.fence(b, [w / 2 + 0.5, 0, 2.5], [w / 2 + 4.5, 0, 2.5])
        K.woolBundle(b, [1.5, py, d / 2 + 0.6]); K.woolBundle(b, [2.1, py, d / 2 + 0.3]); break
      case 'granary':
        for (const [x, z] of [[-1.8, -1.4], [1.8, -1.4], [-1.8, 1.4], [1.8, 1.4]]) b.add(G.chamfer(0.3, 0.6, 0.3, 0.04), 0x8e877c, { at: [x, -0.2, z], m: 'stone' })
        for (let i = 0; i < 5; i++) b.add(jitter(G.ico(0.32, 0), 0.06, i), 0xd8c8a0, { at: [-1.6 + i * 0.7, py + 0.3, d / 2 + 0.9], scale: [1, 0.85, 0.8], m: 'cloth' }); break
      case 'tea':
        K.bench(b, [-1.4, py, d / 2 + 1.0], 0, 1.6); K.bench(b, [1.4, py, d / 2 + 1.0], 0, 1.6)
        b.add(G.lathe([[0, 0], [0.12, 0], [0.16, 0.12], [0.1, 0.22], [0.03, 0.26], [0, 0.26]], 8), 0x3a3a3a, { at: [0, py + 0.8, d / 2 + 0.6], m: 'metal' })
        K.table(b, [0, py, d / 2 + 0.6], 0, 1, 0.5); break
      case 'carpenter':
        K.table(b, [0, py, d / 2 + 0.8], 0, 1.8, 0.7)
        for (let i = 0; i < 3; i++) K.carvedBird(b, [-0.5 + i * 0.5, py + 0.79, d / 2 + 0.8], i, ['kingfisher', 'sparrow', 'mynah'][i], 1.4)
        for (let i = 0; i < 4; i++) b.add(G.chamfer(1.8, 0.16, 0.2, 0.02), K.P.woodLight, { at: [w / 2 + 0.6, 0.1 + i * 0.17, 0.2], rot: [0, Math.PI / 2, 0] , m: 'wood' }); break
      case 'beekeeper':
        for (let i = 0; i < 3; i++) K.beehive(b, [w / 2 + 1.2, 0, -1 + i * 1.3]); break
      case 'shrine':
        K.ganeshaShrine(b, [0, py, d / 2 + 0.9], 0); break
    }
  }
  buildForge() {
    const F = PLACES.forge, b = new Builder(210), y = heightAt(F.x, F.z)
    b.push([F.x, y, F.z], [0, 0.5, 0])
    for (const [x, z] of [[-2.5, -1.75], [2.5, -1.75], [-2.5, 1.75], [2.5, 1.75]]) b.add(G.chamfer(0.22, 3.2, 0.22, 0.03), K.P.woodDark, { at: [x, 1.6, z] , m: 'wood' })
    b.add(G.chamfer(5.6, 0.16, 0.2, 0.03), K.P.woodDark, { at: [0, 3.15, -1.75] , m: 'wood' }); b.add(G.chamfer(5.6, 0.16, 0.2, 0.03), K.P.woodDark, { at: [0, 2.95, 1.75] , m: 'wood' })
    b.push([0, 3.3, 0], [0, 0, 0]); tileRoof(b, 5.9, 2.3, 2.3, 0, 0.12, 0xb04a2e); b.pop()
    // Exposed rafters, braced posts and the smith's memorial beam give the
    // 5×3.5 m work shelter the same silhouette as the forge reference.
    for (let i = 0; i < 6; i++) b.add(G.chamfer(0.13, 0.16, 4.1, 0.02), K.P.wood, { at: [-2.3 + i * 0.92, 3.12, 0], m: 'wood' })
    for (const sx of [-1, 1]) b.add(G.chamfer(0.14, 0.95, 0.14, 0.02), K.P.woodDark, { at: [sx * 2.2, 2.74, 1.75], rot: [0, 0, sx * 0.65], m: 'wood' })
    b.add(G.chamfer(1.5, 0.2, 0.2, 0.03), K.P.woodDark, { at: [-1.3, 2.45, -1.75], m: 'wood' })
    K.hammerProp(b, [-1.3, 2.08, -1.6], [Math.PI, 0, 0], 0.6)
    K.garland(b, [-1.9, 2.48, -1.5], [-0.7, 2.48, -1.5], { sag: 0.32, kind: 'marigold', n: 14 })
    const fire = K.furnace(b, [-1.2, 0, -0.6])
    K.anvil(b, [0.9, 0, 0.2], 0.4); K.bucket(b, [1.9, 0, -0.9]); K.toolRack(b, [1.0, 0, -1.6], 0)
    K.hammerProp(b, [0.7, 0.85, 0.35], [0, 0, 1.5], 0.8)
    b.pop()
    this.addMesh(b)
    const fx = F.x + Math.cos(0.5) * -1.2 + Math.sin(0.5) * -0.6, fz = F.z - Math.sin(0.5) * -1.2 + Math.cos(0.5) * -0.6
    this.fx.setFires('forge', [[fx, y + 0.85, fz, 0.55]], true)
    this.light([fx, y + 1.8, fz], 0xff6a2a, 8, 'forge')
    this.solid(fx, fz, 1.2); this.solid(F.x + 0.6, F.z + 0.3, 0.5)
    // ploughs appear in the peaceful reign
    const pb = new Builder(211)
    K.plough(pb, [F.x + 3.5, heightAt(F.x + 3.5, F.z + 2), F.z + 2], 0.4); K.plough(pb, [F.x + 3.2, heightAt(F.x + 3.2, F.z + 3.4), F.z + 3.4], 0.6)
    this.ploughs = this.addMesh(pb); this.ploughs.visible = false
  }
  buildTraining() {
    const T = PLACES.training, b = new Builder(220), y = heightAt(T.x, T.z)
    K.weaponRack(b, [T.x + 4.5, heightAt(T.x + 4.5, T.z - 2), T.z - 2], -1.2)
    K.spear(b, [T.x + 5, heightAt(T.x + 5, T.z + 1), T.z + 1], [0, 0, 0.25])
    K.fence(b, [T.x - 5.5, heightAt(T.x - 5.5, T.z - 4.5), T.z - 4.5], [T.x + 5.5, heightAt(T.x + 5.5, T.z - 4.5), T.z - 4.5])
    K.fence(b, [T.x + 5.5, heightAt(T.x + 5.5, T.z - 4.5), T.z - 4.5], [T.x + 5.5, heightAt(T.x + 5.5, T.z + 5.5), T.z + 5.5])
    K.barrel(b, [T.x - 5, heightAt(T.x - 5, T.z + 4.5), T.z + 4.5])
    this.addMesh(b)
    this.solid(T.x + 4.5, T.z - 2, 0.9)
  }
  /** A straw training dummy as a standalone mesh (used by the 'dummy' enemy). */
  makeDummy(variant = 0) { const b = new Builder(230 + variant); K.dummy(b, [0, 0, 0], 0, variant); return b.build() }

  buildGate() {
    const G0 = PLACES.gate, b = new Builder(240)
    let k = 0
    for (let x = -34; x <= 34; x += 0.34) {
      if (Math.abs(x) < 4.6) continue
      const z = G0.z + Math.sin(x * 0.2) * 0.3, y = heightAt(x, z)
      palisadeLog(b, x, y, z, 4 + ((k * 7) % 9) / 10, k++)
      if (k % 3 === 0) this.solid(x, z, 0.55)
    }
    // interior walkway on brackets near the gate
    for (const s of [-1, 1]) for (let x = 5; x < 15; x += 2.5) {
      const xx = s * x, y = heightAt(xx, G0.z - 0.6)
      b.add(G.chamfer(0.12, 0.12, 1.2, 0.02), K.P.wood, { at: [xx, y + 2.8, G0.z - 0.7] , m: 'wood' })
      b.add(G.chamfer(0.1, 1.1, 0.1, 0.02), K.P.wood, { at: [xx, y + 2.3, G0.z - 0.85], rot: [0.7, 0, 0] , m: 'wood' })
    }
    for (const s of [-1, 1]) {
      b.add(G.chamfer(10.5, 0.1, 1.2, 0.02), K.P.woodLight, { at: [s * 9.8, heightAt(s * 9.8, G0.z - 0.6) + 2.92, G0.z - 0.7] , m: 'wood' })
      watchtower(b, [s * 4.6, heightAt(s * 4.6, G0.z), G0.z], 7)
      this.solid(s * 4.6, G0.z, 1.8)
      const tp = K.torch(b, [s * 3.15, heightAt(s * 3.15, G0.z + 0.6), G0.z + 0.6])
      this.light(tp, 0xff8a3a, 5, 'torch')
      ;(this.gateTorches ||= []).push([...tp, 0.5])
      K.banner(b, [s * 4.6, heightAt(s * 4.6, G0.z) + 6.2, G0.z + 1.45], 0, 1.1, 2.6, 0x8a1a1a)
    }
    this.addMesh(b)
    this.fx.setFires('gate', this.gateTorches, true)
    // doors (3 × 4.2 m, iron banded) swing inward
    this.gateDoors = []
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(G0.x + s * 3, heightAt(s * 3, G0.z), G0.z)
      const db = new Builder(250 + s)
      for (let i = 0; i < 9; i++) db.add(G.chamfer(0.33, 4.2, 0.24, 0.03), [0x4a2c18, 0x553420, 0x40261a][i % 3], { at: [-s * (0.17 + i * 0.33), 2.1, 0] })
      for (const yy of [0.7, 2.1, 3.5]) { db.add(G.box(2.9, 0.16, 0.06), K.P.iron, { at: [-s * 1.5, yy, 0.15], m: 'iron' }); for (let i = 0; i < 6; i++) db.add(G.oct(0.05), K.P.iron, { at: [-s * (0.3 + i * 0.5), yy, 0.2], m: 'iron' }) }
      for (const yy of [1.35, 2.85]) db.add(G.chamfer(3.1, 0.17, 0.09, 0.015), K.P.woodDark, { at: [-s * 1.5, yy, -0.18], rot: [0, 0, s * 0.48], m: 'wood' })
      db.add(G.torus(0.11, 0.028, 4, 10), K.P.iron, { at: [-s * 2.6, 2.05, 0.22], m: 'iron' })
      pivot.add(db.build()); pivot.userData.side = s; this.scene.add(pivot); this.gateDoors.push(pivot)
    }
    this.gateCollider = { x: G0.x, z: G0.z, r: 2.9 }; this.colliders.push(this.gateCollider)
    // shattered state pieces (hidden until the breach)
    const sb = new Builder(260), r = rng(4)
    for (let i = 0; i < 16; i++) sb.add(G.chamfer(0.3, 0.6 + r() * 1.6, 0.22, 0.02), 0x4a2c18, { at: [(r() - 0.5) * 6, heightAt(0, G0.z - 2) + 0.15, G0.z - 1 - r() * 4], rot: [Math.PI / 2 + (r() - 0.5) * 0.5, r() * 3, 0] })
    // battering ram with iron head
    sb.add(G.cyl(0.42, 0.42, 6.5, 9).rotateX(Math.PI / 2), K.P.wood, { at: [0.5, heightAt(0.5, G0.z + 5) + 0.6, G0.z + 5.5] , m: 'wood' })
    sb.add(G.ico(0.55, 0), K.P.iron, { at: [0.5, heightAt(0.5, G0.z + 2) + 0.6, G0.z + 2.2], m: 'iron' })
    for (const zz of [1, 2.5, 4]) sb.add(G.cyl(0.45, 0.45, 0.12, 9).rotateX(Math.PI / 2), K.P.iron, { at: [0.5, heightAt(0.5, G0.z + 3) + 0.6, G0.z + 2.5 + zz], m: 'iron' })
    this.gateRubble = this.addMesh(sb); this.gateRubble.visible = false
  }
  setGate(open, dur = 2, broken = false) {
    this.gateDoors.forEach(p => gsap.to(p.rotation, { y: open ? -p.userData.side * (broken ? 1.85 : 1.5) : 0, duration: dur, ease: open && broken ? 'power4.out' : 'power2.inOut' }))
    this.gateCollider.r = open ? 0 : 2.9
    this.gateRubble.visible = broken
  }
  buildRoadside() {
    // fallen trunk with the memory alcove (valley road board), fences along the road
    const b = new Builder(270)
    const F = [-20, 64], y = heightAt(...F)
    b.add(jitter(G.cyl(0.55, 0.7, 7, 8).rotateZ(Math.PI / 2), 0.12, 3), 0x5a4030, { at: [F[0], y + 0.5, F[1]], rot: [0, 0.6, 0.06], m: 'tree' })
    b.add(G.cyl(0.5, 0.5, 0.3, 8).rotateZ(Math.PI / 2), 0xb08a5a, { at: [F[0] + 3.2, y + 0.55, F[1] - 2], rot: [0, 0.6, 0] })
    for (const z of [58, 76, 120, 136]) { const x = pathX(z) - 3.4; K.fence(b, [x, heightAt(x, z), z], [x + 0.6, heightAt(x + 0.6, z + 6), z + 6]) }
    this.addMesh(b); this.solid(F[0], F[1], 1.4)
  }

  /* ---------------- Thennur: 7 houses around a well; burning / ruined / rebuilt ---------------- */
  buildThennur() {
    const T = PLACES.thennur, ring = [200, 250, 300, 350, 30, 75, 165].map(a => a * Math.PI / 180)
    this.thennur = {}; const fires = []
    for (const st of ['burning', 'ruined', 'rebuilt']) {
      const b = new Builder(300)
      ring.forEach((a, i) => {
        const R = 11 + (i % 2) * 1.5, x = T.x + Math.cos(a) * R, z = T.z + Math.sin(a) * R, rot = Math.atan2(T.x - x, T.z - z), y = heightAt(x, z) - 0.1
        b.push([x, y, z], [0, rot, 0])
        const info = house(b, { w: 4.4, d: 3.8, state: st === 'rebuilt' ? 'normal' : st, seed: 500 + i, wall: [0xf0e4cc, 0xe2d2b2, 0xd8c4a0][i % 3] })
        if (st === 'rebuilt' && i % 2 === 0) K.scaffold(b, [2.8, 0, 0], Math.PI / 2, 3.4, 3.2)
        if (st === 'rebuilt') { K.stoneBlock(b, [-3.2, 0, 2.8], 0.3); K.stoneBlock(b, [-3.6, 0.5, 2.6], 0.8, 0.9); K.pot(b, [2.5, 0.45, 2.2], 0.75, 0xb0603a, 'tulsi'); K.basket(b, [-2.2, 0.45, 2.1], 0.65) }
        b.pop()
        if (st === 'burning') for (const f of info.fires) { const c = Math.cos(rot), s = Math.sin(rot); fires.push([x + f[0] * c + f[2] * s, y + f[1], z - f[0] * s + f[2] * c, 0.95]) }
        if (st === 'burning') this.solid(x, z, 2.6)
      })
      // central well (ruined variant is broken)
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (st === 'ruined' && i % 4 === 0) continue; b.add(G.chamfer(0.55, st === 'ruined' ? 0.5 : 0.85, 0.32, 0.05), st === 'burning' ? 0x5a5048 : 0x8a8478, { at: [T.x + Math.cos(a) * 1.15, T.y + 0.4, T.z + Math.sin(a) * 1.15], rot: [0, -a + Math.PI / 2, 0], m: 'stone' }) }
      if (st !== 'rebuilt') { // carts, broken fences, scattered pots (burning village board)
        b.add(G.cyl(0.55, 0.55, 0.12, 10).rotateX(Math.PI / 2), 0x3a2a1a, { at: [T.x + 5, T.y + 0.55, T.z - 4], rot: [0, 0.4, 0] , m: 'wood' })
        b.add(G.chamfer(1.8, 0.2, 1.0, 0.03), 0x3a2a1a, { at: [T.x + 5.6, T.y + 0.7, T.z - 3.4], rot: [0, 0.4, 0.2] , m: 'wood' })
        K.pot(b, [T.x - 3, T.y, T.z + 3], 1.1, 0x7a4a2a); K.pot(b, [T.x + 2.5, T.y, T.z + 4], 0.9, 0x6a3a2a)
      }
      const g = this.addMesh(b); g.visible = false; this.thennur[st] = g
    }
    this.thennurFires = fires
    this.fx.setFires('thennur', fires, false)
    this.solid(T.x, T.z, 1.5)
    // Malli's beam (charred, 3.6 m) and the out-of-season bush
    const S = PLACES.malliSpot, mb = new Builder(310)
    mb.add(jitter(G.chamfer(0.38, 0.38, 3.6, 0.05), 0.04, 2), 0x1a1410, { at: [S.x + 0.6, heightAt(S.x, S.z) + 0.3, S.z], rot: [0, 0.6, 0.15] , m: 'wood' })
    this.addMesh(mb)
    const bush = new Builder(311)
    bush.add(jitter(G.ico(0.45, 0), 0.12, 3), 0x3a5a30, { at: [0, 0.35, 0], scale: [1.2, 0.8, 1.2] })
    const bg = blossomGeo(0.1)
    for (let i = 0; i < 14; i++) { const g = bg.clone(); g.rotateY(i); g.translate(Math.cos(i * 2.4) * 0.45 * Math.sqrt(i / 14), 0.6 + (i % 3) * 0.1, Math.sin(i * 2.4) * 0.45 * Math.sqrt(i / 14)); (bush.groups.glowflower ||= []).push(g) }
    this.malliBush = bush.build()
    for (const m of this.malliBush.children) if (m.name === 'glowflower') m.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: 0x6a54ff, emissiveIntensity: 1.6 })
    this.malliBush.position.set(S.x - 0.8, heightAt(S.x - 0.8, S.z + 0.8), S.z + 0.8); this.scene.add(this.malliBush); this.malliBush.visible = false
    this.setThennur('ruined')
  }
  setThennur(st) {
    this.state.thennur = st
    for (const k in this.thennur) this.thennur[k].visible = k === st
    this.fx.setFires('thennur', null, st === 'burning')
    TERRAIN_U.uAsh.value = st === 'rebuilt' ? 0.15 : st === 'burning' ? 0.35 : 0.85
  }

  /* ---------------- Dunkan's fortress ---------------- */
  buildFortress() {
    const F = PLACES.fortress, b = new Builder(400), y0 = F.y - 0.6
    const W = (x1, z1, x2, z2) => { b.push([0, y0, 0]); fortWall(b, x1, z1, x2, z2, 7); b.pop(); const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.5); for (let i = 0; i <= n; i++) this.solid(x1 + (x2 - x1) * i / n, z1 + (z2 - z1) * i / n, 1.1) }
    const r = 22, zf = F.z - 8, zb = F.z + 22
    W(-r, zf, -4, zf); W(4, zf, r, zf); W(-r, zf, -r, zb); W(r, zf, r, zb); W(-r, zb, r, zb)
    this.fortBanners = new Builder(401)
    for (const [x, z] of [[-r, zf], [r, zf], [-r, zb], [r, zb], [-6.5, zf], [6.5, zf]]) {
      roundTower(b, [x, y0, z], 11, false)
      K.banner(this.fortBanners, [x, y0 + 9.5, z - 2.55], Math.PI, 1.3, 4.2)
      this.solid(x, z, 2.5)
    }
    // gatehouse arch + portcullis frame, gate braziers
    b.add(G.chamfer(10, 2.2, 2.2, 0.06), 0x2a2628, { at: [0, y0 + 7.4, zf], m: 'stone' })
    for (let i = 0; i < 6; i++) b.add(G.box(0.12, 4, 0.12), K.P.ironDark, { at: [-2.5 + i, y0 + 4.4, zf - 0.2], m: 'iron' })
    // courtyard paving (dark stone)
    const rr = rng(3)
    for (let x = -20; x < 20; x += 2.1) for (let z = zf + 1.5; z < zb - 1; z += 2.1) { if (Math.hypot(x - 14, z - 168) < 5.5) continue; b.add(G.chamfer(2.0, 0.2, 2.0, 0.05), [0x4a4446, 0x403a3c, 0x55504f][(rr() * 3) | 0], { at: [x + 1, heightAt(x + 1, z + 1) + 0.0, z + 1], m: 'stone' }) }
    // throne hall facade behind the dais (silhouette from the story boards)
    b.push([0, y0, F.z + 19])
    for (let x = -8; x <= 8; x += 1.6) for (let y = 0; y < 13; y += 0.9) b.add(G.chamfer(1.6, 0.88, 2.2, 0.06), [0x2a2628, 0x332e2f][(rr() * 2) | 0], { at: [x, y + 0.45, 0], m: 'stone' })
    for (let x = -7; x <= 7; x += 2) b.add(G.chamfer(1.0, 1.2, 2.3, 0.05), 0x2a2628, { at: [x, 13.6, 0], m: 'stone' })
    b.pop()
    this.solid(0, F.z + 19, 6)
    for (const x of [-5.5, -2.2, 2.2, 5.5]) K.banner(this.fortBanners, [x, y0 + 12, F.z + 17.85], 0, 1.4, 6)
    // throne dais: 3 steps with crimson runner, iron throne (5 gold spikes) facing the gate
    const Tn = PLACES.throne
    b.push([Tn.x, Tn.y, Tn.z])
    for (let i = 0; i < 3; i++) b.add(G.chamfer(10 - i * 2, 0.4, 6 - i * 1.2, 0.05), 0x2a2628, { at: [0, 0.2 + i * 0.4, 0], m: 'stone' })
    for (let i = 0; i < 2; i++) b.add(G.box(1.5, 0.015, 0.6), K.P.crimson, { at: [0, 0.4 * (i + 1) + 0.01, -2.7 + i * 0.6], m: 'cloth' })
    b.add(G.box(1.5, 0.015, 2.8), K.P.crimson, { at: [0, 1.21, -0.4], m: 'cloth' })
    for (let i = 0; i < 3; i++) b.add(G.box(1.5, 0.4, 0.02), K.P.crimson, { at: [0, 0.2 + i * 0.4, -3 + i * 0.6 - 0.005], m: 'cloth' })
    K.ironThrone(b, [0, 1.2, 0.2], Math.PI)
    K.chain(b, [-4.5, 1.6, 0.4], [-1.2, 3.2, 0.6]); K.chain(b, [4.5, 1.6, 0.4], [1.2, 3.2, 0.6])
    b.pop()
    this.throneSeat = new THREE.Vector3(Tn.x, Tn.y + 2.06, Tn.z + 0.0)
    for (let i = 0; i < 3; i++) this.floor({ x0: Tn.x - 5 + i, x1: Tn.x + 5 - i, z0: Tn.z - 3 + i * 0.6, z1: Tn.z + 3 - i * 0.6, y: Tn.y + 0.4 * (i + 1) })
    this.solid(Tn.x, Tn.z + 0.2, 1.3)
    // braziers ×4
    const bz = []
    for (const [x, z] of [[-6, 4], [6, 4], [-6, 14], [6, 14]]) { const p = K.brazier(b, [F.x + x, heightAt(F.x + x, F.z + z), F.z + z]); bz.push([...p, 0.9]); this.solid(F.x + x, F.z + z, 0.6); this.light(p, 0xff6a2a, 8, 'brazier') }
    for (const x of [-6.5, 6.5]) { const p = K.brazier(b, [x, heightAt(x, zf - 3), zf - 3]); bz.push([...p, 0.9]); this.light(p, 0xff6a2a, 8, 'brazier') }
    this.fx.setFires('braziers', bz, true)
    // the mine: scarred pit, crane, slag heaps (east courtyard)
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.add(rock(0.8, 70 + i, 0.8, 0), 0x5a4a3a, { at: [14 + Math.cos(a) * 4.6, heightAt(14 + Math.cos(a) * 4.6, 168 + Math.sin(a) * 4.6), 168 + Math.sin(a) * 4.6], m: 'stone' }) }
    K.slagHeap(b, [10, heightAt(10, 175), 175], 1.4); K.slagHeap(b, [18.5, heightAt(18.5, 161), 161], 1)
    K.scaffold(b, [17.5, heightAt(17.5, 172), 172], 0.5, 2.5, 4.5)
    this.mineCollider = this.solid(14, 168, 4.8)
    this.addMesh(b)
    this.fortBannerMesh = this.addMesh(this.fortBanners)
    // The reign explicitly seals the mine. The visible cap and its conditional
    // walkable floor turn the pit into a usable part of the healing courtyard.
    const seal = new Builder(403), sealY = heightAt(14, 168) + 5.5 + 0.12
    seal.add(G.cyl(5.1, 5.1, 0.2, 14), 0x8d877b, { at: [14, sealY - 0.1, 168], m: 'stone' })
    for (let i = 0; i < 7; i++) seal.add(G.chamfer(1.1, 0.05, 1.3, 0.015), [0x9a9486, 0xb1a797][i % 2], { at: [11.8 + i % 3 * 1.65, sealY + 0.02, 166.2 + Math.floor(i / 3) * 1.65], m: 'stone' })
    this.mineSeal = this.addMesh(seal); this.mineSeal.visible = false
    this.floor({ disc: true, x: 14, z: 168, r: 5.1, y: sealY, enabled: () => this.state.fortress === 'healing' })
    // house-of-healing dressing (Ch. VII / epilogue)
    const hb = new Builder(402)
    for (let i = 0; i < 4; i++) { const x = -12 + i * 4; hb.add(G.chamfer(2, 0.4, 0.9, 0.04), 0xe8dcc0, { at: [x, heightAt(x, 156) + 0.5, 156], m: 'cloth' }); hb.add(G.box(0.1, 0.4, 0.8), K.P.wood, { at: [x - 0.9, heightAt(x, 156) + 0.2, 156] , m: 'wood' }) }
    K.herbRack(hb, [-15, heightAt(-15, 165) + 2.2, 165], Math.PI / 2, 3); K.herbRack(hb, [15, heightAt(15, 158) + 2.2, 158], Math.PI / 2, 3)
    for (const x of [-5.5, -2.2, 2.2, 5.5]) K.banner(hb, [x, y0 + 12, F.z + 17.85], 0, 1.4, 6, 0xd9822b)
    this.healing = this.addMesh(hb); this.healing.visible = false
  }
  /* ---------------- Dunkan's outer ward: curtain walls, great gatehouse, towers, the keep ---------------- */
  buildFortressOuter() {
    const F = PLACES.fortress, y0 = F.y - 0.6, b = new Builder(420), FL = this.flags, rr = rng(421)
    const wall = (x1, z1, x2, z2, h = 9) => {
      b.push([0, y0, 0]); fortWall(b, x1, z1, x2, z2, h); b.pop()
      const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.5)
      for (let i = 0; i <= n; i++) this.solid(x1 + (x2 - x1) * i / n, z1 + (z2 - z1) * i / n, 1.0)
      this.occludeWall?.(x1, z1, x2, z2)
    }
    const tower = (x, z, h, flagCol = 0x7a0a0a) => {
      roundTower(b, [x, y0, z], h, false); this.solid(x, z, 2.6)
      FL.add([x, y0 + h + 5.4, z], 0.4, 1.6, 0.95, flagCol, 0, { emblem: 0xc9a24a })
      FL.add([x, y0 + h - 0.6, z + 2.6], 0, 1.3, 4.6, 0x7a0a0a, 1, { emblem: 0xc9a24a, trim: 0x2a0606 })
    }
    // curtain: west, back and the front with a 15 m grand entrance (the road arrives at x ≈ -7)
    const zf = 136, zb = 210, xw = -44, xe = 24
    wall(xw, zf, -13.5, zf); wall(6.5, zf, xe, zf); wall(xw, zf, xw, zb); wall(xw, zb, xe, zb); wall(xe, 180, xe, zb)
    for (const [x, z] of [[xw, zf], [xe, zf], [xw, zb], [xe, zb], [xw, 173], [-10, zb], [xe, 195]]) tower(x, z, 15)
    // gatehouse: twin tall towers, a vaulted bridge with battlements, iron portcullis raised, braziers
    tower(-13.5, zf, 18); tower(6.5, zf, 18)
    b.add(G.chamfer(18, 3.2, 3.2, 0.08), 0x2a2628, { at: [-3.5, y0 + 12.6, zf], m: 'stone' })
    for (let x = -12; x <= 5; x += 1.4) b.add(G.chamfer(0.8, 1.0, 3.3, 0.05), 0x2a2628, { at: [x, y0 + 14.7, zf], m: 'stone' })
    for (let i = 0; i < 12; i++) b.add(G.box(0.14, 2.6, 0.14), 0x1a1616, { at: [-11 + i * 1.35, y0 + 9.6, zf - 0.3], m: 'iron' })
    b.add(G.box(16, 0.18, 0.18), 0x1a1616, { at: [-3.5, y0 + 8.3, zf - 0.3], m: 'iron' })
    const bz = []
    for (const x of [-16, 9]) { const p = K.brazier(b, [x, heightAt(x, zf - 3.5), zf - 3.5]); bz.push([...p, 1.0]); this.light(p, 0xff6a2a, 8, 'brazier'); this.solid(x, zf - 3.5, 0.6) }
    FL.add([-3.5, y0 + 11.0, zf - 1.7], 0, 2.4, 7.0, 0x7a0a0a, 1, { emblem: 0xc9a24a, trim: 0x2a0606 })
    // THE KEEP: a black stone block house rising behind the throne, corner turrets and a central spire
    const kx0 = -15, kx1 = 15, kz0 = 186, kz1 = 204, kh = 22
    b.push([0, y0, 0])
    fortWall(b, kx0, kz0, kx1, kz0, kh); fortWall(b, kx0, kz1, kx1, kz1, kh); fortWall(b, kx0, kz0, kx0, kz1, kh); fortWall(b, kx1, kz0, kx1, kz1, kh)
    b.pop()
    b.add(G.chamfer(30, 1.2, 18, 0.1), 0x241f21, { at: [0, y0 + kh + 0.2, 195], m: 'stone' })
    for (const [x, z] of [[kx0, kz0], [kx1, kz0], [kx0, kz1], [kx1, kz1]]) { roundTower(b, [x, y0, z], kh + 6, false); FL.add([x, y0 + kh + 11.4, z], 0.4, 1.8, 1.0, 0x7a0a0a, 0, { emblem: 0xc9a24a }) }
    roundTower(b, [0, y0, 195], kh + 14, false)
    FL.add([0, y0 + kh + 19.4, 195], 0.2, 2.6, 1.4, 0x7a0a0a, 0, { emblem: 0xc9a24a })
    // great door + tall windows on the keep's face (toward the throne)
    b.add(G.chamfer(4.6, 7.2, 0.6, 0.05), 0x140e0c, { at: [0, y0 + 3.6, kz0 - 0.6], m: 'wood' })
    b.add(G.torus(2.3, 0.35, 4, 12, Math.PI), 0x3a3436, { at: [0, y0 + 7.2, kz0 - 0.9], m: 'stone' })
    for (const x of [-10, -5, 5, 10]) { b.add(G.box(1.1, 3.6, 0.3), 0x0a0606, { at: [x, y0 + 13, kz0 - 0.95] }); b.add(G.box(1.1, 0.18, 0.18), 0xff7a2a, { at: [x, y0 + 11.3, kz0 - 1.0], m: 'glow' }) }
    for (const x of [-12.5, -7.5, 7.5, 12.5]) FL.add([x, y0 + kh - 0.6, kz0 - 0.95], 0, 2.0, 9.0, 0x7a0a0a, 1, { emblem: 0xc9a24a, trim: 0x2a0606 })
    for (let i = 0; i < 7; i++) this.solid(kx0 + i * 5, kz0 + 9, 5.2)
    // west ward: two long barracks, a smithy shed with its fire, stacked supplies, weapon racks, braziers
    for (const z of [148, 166]) {
      b.push([-34, heightAt(-34, z) - 0.1, z], [0, Math.PI / 2, 0])
      for (let x = -7; x <= 7; x += 2) b.add(G.chamfer(0.3, 3.0, 0.3, 0.04), 0x2a1c14, { at: [x, 1.5, 2.2], m: 'wood' })
      b.add(G.chamfer(15, 2.8, 4.0, 0.06), 0x3a3638, { at: [0, 1.4, -0.2], m: 'stone' })
      b.push([0, 3.5, 0], [0, 0, 0]); tileRoof(b, 15.6, 2.7, 2.7, 0, 0.45, 0x5a0e0e); b.pop()
      b.pop()
      this.solid(-34, z, 4.2); this.solid(-34, z - 5, 4.2); this.solid(-34, z + 5, 4.2)
    }
    for (let i = 0; i < 10; i++) K.crate(b, [-24 + (i % 4) * 1.1, heightAt(-24, 190) + Math.floor(i / 4) * 0.8, 190 + (i % 2) * 0.2], rr() * 0.3, 0.9)
    for (let i = 0; i < 6; i++) K.barrel(b, [-28 + i * 0.9, heightAt(-28, 194), 194])
    this.solid(-23, 190, 2.4); this.solid(-26, 194, 2.8)
    K.weaponRack(b, [-30, heightAt(-30, 140), 140.5], 0); K.weaponRack(b, [-26, heightAt(-26, 140), 140.5], 0)
    for (const [x, z] of [[-30, 157], [-30, 180], [-18, 200], [14, 150]]) { const p = K.brazier(b, [x, heightAt(x, z), z]); bz.push([...p, 0.9]); this.light(p, 0xff6a2a, 8, 'brazier'); this.solid(x, z, 0.6) }
    // banners down the approach road and over the inner gate
    for (const z of [112, 120, 128]) for (const s of [-1, 1]) { const x = pathX(z) + s * 4.2; FL.pole(b, [x, heightAt(x, z), z], s * 0.3, 7, 1.6, 2.2, 0x7a0a0a, { emblem: 0xc9a24a }); this.solid(x, z, 0.3) }
    this.fx.setFires('outerBraziers', bz, true)
    this.fortOuter = this.addMesh(b)
  }
  setFortress(mode) {
    this.state.fortress = mode
    this.fortBannerMesh.visible = mode !== 'healing'
    this.healing.visible = mode === 'healing'
    this.mineSeal.visible = mode === 'healing'
    this.mineCollider.r = mode === 'healing' ? 0 : 4.8
  }
  setTemple(mode) {
    this.state.temple = mode
    this.fx.setFires('temple', null, mode === 'burning')
  }
  setForge(mode) { this.ploughs.visible = mode === 'peaceful' }

  /* ================= global states ================= */
  setBloom(b) {
    this.bloomT = b
    this.nature.setBloom(b)
    TERRAIN_U.uBloom.value = b
  }
  setPetals(o) { this.fx.setPetals(o) }
  setFires(on) { this.setThennur(on ? 'burning' : 'ruined') }  // legacy
  spawnBurst(p, n, color, speed) { this.fx.burst(p, n, color, speed) }

  update(dt, t, focus, cam) {
    WIND.uTime.value = t
    // gusting wind: grass, canopies and every flag breathe together (storms blow hard)
    WIND.uWind.value = (this.timeName === 'storm' ? 2.1 : 1) * (0.78 + 0.28 * Math.sin(t * 0.21) + 0.16 * Math.sin(t * 0.83 + 1.3) + 0.08 * Math.sin(t * 2.3))
    for (const f of this.anim) f(dt, t)
    // shadows cover what the camera sees: centred ~22 m ahead of the lens (the follow camera's player,
    // 4–12 m ahead, stays well inside the 90 m frustum), snapped to texels to avoid shimmer
    const s = this.sun, size = 90 / (s.shadow.mapSize.x || 2048), camObj = this.game.camera
    let sx = focus.x, sz = focus.z, sy = focus.y
    if (camObj) {
      const d = camObj.getWorldDirection(this._shDir ||= new THREE.Vector3()), fl = Math.hypot(d.x, d.z) || 1
      sx = camObj.position.x + d.x / fl * 22; sz = camObj.position.z + d.z / fl * 22
      sy = heightAt(sx, sz)
    }
    const fx = Math.round(sx / size) * size, fz = Math.round(sz / size) * size
    s.target.position.set(fx, sy, fz); s.position.set(fx, sy, fz).add(this.sunOffset)
    this.sky.update(dt, t, cam)
    this.water.update(dt, t)
    this.fx.update(dt, t, cam)
    this.fauna.update(dt, t, this.game.player?.pos)
    this.nature.cull(cam)
    // point-light pool → nearest active emitters
    this.poolT = (this.poolT || 0) - dt
    if (this.poolT <= 0) {
      this.poolT = 0.35
      const night = this.lampLevel
      const act = this.emitters.filter(e => e.kind === 'brazier' || e.kind === 'forge' || e.kind === 'shrine' || (e.kind === 'torch' && this.fx.fireOn('gate')) || night > 0.05)
      act.sort((a, b) => a.p.distanceToSquared(cam) - b.p.distanceToSquared(cam))
      const fires = this.fx.activeFires.filter(f => f.s > 0.8).sort((a, b) => a.p.distanceToSquared(cam) - b.p.distanceToSquared(cam)).slice(0, 2)
      this.poolSel = [...fires.map(f => ({ p: f.p, color: new THREE.Color(0xff6a2a), power: 14, kind: 'fire' })), ...act].slice(0, this.pool.length)
    }
    this.pool.forEach((l, i) => {
      const e = this.poolSel?.[i]
      if (!e) { l.intensity = 0; return }
      l.position.copy(e.p); l.color.copy(e.color)
      const flick = e.kind === 'fire' || e.kind === 'brazier' || e.kind === 'forge' || e.kind === 'torch' ? 0.8 + 0.2 * Math.sin(t * 13 + i * 2) + 0.1 * Math.sin(t * 7.3 + i) : 1
      const lvl = e.kind === 'lamp' || e.kind === 'lantern' || e.kind === 'temple' ? this.lampLevel : e.kind === 'shrine' ? 0.6 + this.lampLevel * 0.4 : 1
      l.intensity = e.power * flick * lvl; l.distance = e.kind === 'fire' ? 24 : 14
    })
    // storm lightning
    if (this.storm && Math.random() < dt * 0.08) this.lightning()
  }
  lightning() {
    const s = this.sun, base = s.intensity
    gsap.timeline().to(s, { intensity: base + 6, duration: 0.05 }).to(s, { intensity: base, duration: 0.15 }).to(s, { intensity: base + 4, duration: 0.05, delay: 0.08 }).to(s, { intensity: base, duration: 0.6 })
    setTimeout(() => this.game.audio?.sfx?.('thunder', { volume: 0.8 }), 400 + Math.random() * 1200)
  }
}
