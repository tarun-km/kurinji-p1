import * as THREE from 'three'
import gsap from 'gsap'
import { watch } from 'vue'
import { Renderer } from './gfx/Renderer'
import { accelerateRaycasts } from './gfx/bvh'
import { settings, GRAPHICS_KEYS } from './settings'
import { CHAPTER_ASSETS, runTasks, loadArtwork, fetchAsset, nextFrame } from './assets'
import { Pane } from 'tweakpane'
import { World, PLACES, heightAt } from './world/World'
import { Physics } from './Physics'
import { Audio } from './Audio'
import { Input } from './Input'
import { Player, NPC, Enemy } from './Actors'
import { warmCharacterPresets } from './Characters'
import { STORY_FRAMES } from './cinematics'
import { state, ui, save, load } from './store'
import { CHAPTERS, CHAPTER_NAMES, SPEAKERS, PETALS, freeRoam } from './story'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const tmp = new THREE.Vector3()
const ACTIVE_GAME = Symbol.for('kurinji.activeGame')

export class Game {
  constructor(container) { globalThis[ACTIVE_GAME]?.destroy(); this.container = container; globalThis[ACTIVE_GAME] = this }

  async init() {
    this.initializing = true
    const alive = () => { if (this.cancelled) throw new Error('Game session ended') }
    try {
    this.waiters = new Set(); this.cleanups = []; this.storyTimers = new Set()
    const progress = (value, label) => { if (state.loading) { state.loading.progress = value; state.loading.label = label } }
    progress(0.05, 'Preparing the mountain'); await nextFrame(); alive()
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 3000)
    this.renderer = new Renderer(this.container, this.scene, this.camera)
    const r = this.renderer.gl
    this.world = new World(this.scene, this)
    this.renderer.onShadowSize = n => this.world.setShadowSize(n)
    this.world.setShadowSize(this.renderer.shadowSize)
    this.world.updateEnv()
    // BVH-accelerated raycasts for the static world (camera clear-shot / line of sight)
    accelerateRaycasts(this.world.occluders); this.world.bvh = true
    this.ray = new THREE.Raycaster(); this.ray.firstHitOnly = true
    progress(0.35, 'Building the world'); await nextFrame(); alive()
    this.physics = await new Physics().init(this.scene)
    alive()
    this.physics.addGroundPatch(0, 4, 30); this.physics.addGroundPatch(0, 160, 30, 2.5)
    for (const [k, x, z] of [['crate', -9, 6], ['crate', -9.2, 7.1], ['barrel', -10.5, 5.5], ['barrel', 9, 1], ['crate', 11, 2], ['crate', 11, 2, 1.6], ['barrel', -2, 30], ['crate', 2, 31], ['barrel', 3, 33],
      ['crate', -8, 150], ['crate', -8, 151.2], ['barrel', 9, 150], ['barrel', 10, 151], ['crate', 12, 165], ['barrel', -12, 165]]) this.physics.addProp(k, x, z)
    this.audio = new Audio()
    await this.audio.ready
    alive(); progress(0.5, 'Preparing local audio'); await nextFrame(); alive()
    this.stepDist = 0
    this.input = new Input(r.domElement)
    this.player = new Player(this)
    this.player.kBody = this.physics.addKinematicSphere()
    this.npcs = new Map(); this.enemies = []; this.markers = []

    // camera rig
    this.cam = { yaw: Math.PI, pitch: 0.28, dist: 6.5, target: V(0, 0, 0) }
    this.cinematic = false
    this.cinePos = V(); this.cineLook = V()
    this.timeScale = 1; this.hitStopT = 0; this.shakeAmt = 0
    this.lastTime = performance.now(); this.t = 0

    this.marker = this.makeMarker()
    this.buildPetals()
    this.buildDebug()
    this.cleanups.push(watch(() => GRAPHICS_KEYS.map(k => settings[k]), () => {
      this.renderer.apply(); this.world.nature.applyDensity(); this.applyWorldQuality()
    }))
    this.cleanups.push(watch(() => state.paused || state.showJournal, paused => this.setPaused(paused || document.hidden)))
    const visibility = () => { if (document.hidden && state.screen === 'game') state.paused = true; this.setPaused(state.paused || state.showJournal || document.hidden) }
    document.addEventListener('visibilitychange', visibility)
    this.cleanups.push(() => document.removeEventListener('visibilitychange', visibility))
    ui.resume = () => { state.paused = false }
    this.applyWorldQuality()
    // Title assets are a small separate session; chapter voices load on Begin.
    await this.audio.preload(['main_theme'])
    alive()
    await this.audio.ensureSynth() // bell and documented music fallbacks prepare off the play path
    alive()
    await this.audio.loadSfx(['ui_click', 'ui_open', 'ui_page'])
    alive()
    await document.fonts.ready
    alive(); progress(0.7, 'Preparing character silhouettes'); await nextFrame(); alive()
    await warmCharacterPresets(this.scene, this.renderer)
    alive(); progress(0.9, 'Warming light and shaders'); await nextFrame(); alive()
    await this.renderer.warm()
    alive()
    progress(1, 'Ready')
    this.loop()
    return this
    } catch (error) { this.initializing = false; this.destroy(); throw error }
    finally { this.initializing = false }
  }

  // ======================= loop =======================
  loop = (now = performance.now()) => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.loop)
    const elapsed = Math.max(0.001, (now - this.lastTime) / 1000); this.lastTime = now
    const raw = Math.min(0.05, elapsed)
    if (this.paused || state.loading || state.cutscene || document.hidden) {
      this.input.reset()
      return
    }
    for (const w of this.waiters) { w.left -= raw; if (w.left <= 0) { this.waiters.delete(w); w.resolve() } }
    if (this.hitStopT > 0) this.hitStopT -= raw
    const dt = this.hitStopT > 0 ? 0 : raw * this.timeScale
    this.t += dt
    const controllable = !this.cinematic && !state.dialogue && !state.choices && state.screen === 'game' && !this.frozen
    if (!controllable) this.input.clear()
    this.player.update(dt, this.input, this.cam.yaw, controllable)
    for (const n of this.npcs.values()) n.update(dt)
    for (const e of this.enemies) e.update(dt)
    this.physics.step(dt)
    this.world.update(dt, this.t, this.player.pos, this.camera.position)
    this.updateMarkers(dt)
    this.updateCamera(raw, controllable)
    this.updateInteract(controllable)
    this.tickTasks(dt)
    // boulders hurt the player
    for (const b of this.physics.bodies) if (b.kind === 'boulder' && b.ttl != null && b.mesh.position.distanceTo(this.player.pos) < 1.4 && this.physics.velocityOf(b) > 4) this.player.takeHit(14, b.mesh.position)
    // slow regen outside of combat
    if (!state.inCombat && state.hp > 0) state.hp = Math.min(state.maxHp, state.hp + raw * 6)
    this.audio.update(raw)
    this.updateAmbience(raw)
    this.renderer.render(elapsed)
  }

  applyWorldQuality() {
    this.world.sky.clouds.visible = settings.clouds
    this.world.sky.mist.visible = settings.preset !== 'low'
    this.world.water.sprayPts.visible = settings.water === 'full'
    this.world.water.sprayPts.geometry.setDrawRange(0, Math.round(240 * settings.particles))
  }
  setPaused(on) {
    if (this.paused === on) return
    this.paused = on; this.input?.reset(); this.audio?.pause(on)
    // Freeze the story's GSAP movement, fades and camera along with gameplay.
    gsap.globalTimeline.paused(on)
    if (on) document.exitPointerLock?.()
  }

  updateCamera(dt, controllable) {
    const c = this.cam, cam = this.camera
    let tx = 0, ty = 0
    if (this.shakeAmt > 0) { this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.6); tx = (Math.random() - .5) * this.shakeAmt; ty = (Math.random() - .5) * this.shakeAmt }
    const L = this.lens ||= { fov: 50, roll: 0, hand: 0.6 }
    // safety net: if someone walks into the shot (or the speaker walks out) mid-line, recut
    if (this.cinematic && this.sayActor && state.dialogue && !gsap.isTweening(this.cinePos) && (this.checkT = (this.checkT || 0) + dt) > 0.25) {
      this.checkT = 0
      const ok = this.frames(this.sayActor, this.cinePos.toArray(), this.cineLook.toArray(), L.fov, 18)
      this.badFrameT = ok ? 0 : (this.badFrameT || 0) + 0.25
      if (this.badFrameT >= 0.5 && (this.recuts || 0) < 2) { this.recuts = (this.recuts || 0) + 1; this.badFrameT = 0; this.coverSide = -(this.coverSide ?? 1); this.cover(this.sayActor, this.listenerOf(this.sayActor)) }
    }
    if (this.cinematic && this.track) {
      const T = this.track
      if (!T.actor.root?.parent) this.track = null
      else {
        const H = this.headOf(T.actor), k = Math.min(1, (this.t - T.t0) / 6)
        this.cinePos.lerp(tmp.copy(H).add(T.eye).addScaledVector(T.push, k), Math.min(1, dt * 2.5))
        this.cineLook.lerp(tmp.copy(H).add(T.look), Math.min(1, dt * 3.5))
      }
    }
    if (this.cinematic) {
      // handheld drift: slow, layered noise — reads as an operator, never as shake
      const t = this.t, h = L.hand * 0.018 * Math.min(2.5, Math.sqrt(this.cinePos.distanceTo(this.cineLook) + 0.5))
      cam.position.copy(this.cinePos).add(tmp.set(tx + Math.sin(t * 0.63) * h + Math.sin(t * 1.7) * h * 0.35, ty + Math.sin(t * 0.81 + 1) * h * 0.7, Math.cos(t * 0.52) * h))
      const gy = heightAt(cam.position.x, cam.position.z) + 0.55; if (cam.position.y < gy) cam.position.y = gy
      cam.lookAt(this.cineLook)
      cam.rotateZ(L.roll + Math.sin(t * 0.4) * 0.003 * L.hand)
      if (Math.abs(cam.fov - L.fov) > 0.01) { cam.fov = L.fov; cam.updateProjectionMatrix() }
      return
    }
    if (Math.abs(cam.fov - 52) > 0.01) { cam.fov += (52 - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix() }
    const l = this.input.consumeLook()
    if (controllable) { c.yaw -= l.x * 0.0035 * settings.camSensitivity; c.pitch = Math.max(-0.25, Math.min(1.1, c.pitch + l.y * 0.0028 * settings.camSensitivity * (settings.invertY ? -1 : 1))) }
    if (controllable && this.input.keys.has('KeyZ')) c.yaw += dt * 2; if (controllable && this.input.keys.has('KeyC')) c.yaw -= dt * 2
    // gentle auto-follow behind player when moving and no mouse input
    if (!this.input.locked && !state.mobile && this.player.vel.lengthSq() > 2) {
      let d = (this.player.facing) - c.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI
      c.yaw += d * dt * 0.8
    }
    c.target.lerp(tmp.copy(this.player.pos).setY(this.player.pos.y + 1.6), Math.min(1, dt * 10))
    const dist = c.dist * (state.inCombat ? 1.15 : 1)
    const want = this.cameraWant ||= V()
    want.set(c.target.x - Math.sin(c.yaw) * Math.cos(c.pitch) * dist, c.target.y + Math.sin(c.pitch) * dist, c.target.z - Math.cos(c.yaw) * Math.cos(c.pitch) * dist)
    // Pull the camera toward its target before it crosses terrain or a building.
    // Sampling the short orbit segment avoids expensive world raycasts per frame.
    for (let i = 1; i <= 12; i++) {
      const u = i / 12, x = c.target.x + (want.x - c.target.x) * u, z = c.target.z + (want.z - c.target.z) * u
      const y = c.target.y + (want.y - c.target.y) * u
      const terrain = heightAt(x, z) + 0.45 > y
      const wall = this.world.colliders.some(p => p.r > 0 && (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 0.25) ** 2 && y < heightAt(p.x, p.z) + 4)
      if (terrain || wall) { want.lerpVectors(c.target, want, Math.max(0.18, (i - 1) / 12)); break }
    }
    const gy = heightAt(want.x, want.z) + 0.6; if (want.y < gy) want.y = gy
    cam.position.lerp(want, Math.min(1, dt * 12)).add(tmp.set(tx, ty, 0))
    cam.lookAt(c.target)
    this.cinePos.copy(cam.position); this.cineLook.copy(c.target)
  }


  // ======================= ambience & footsteps =======================
  updateAmbience(dt) {
    const A = this.audio, W = this.world, p = this.player.pos, time = W.timeName
    const near = (q, r) => Math.max(0, 1 - Math.hypot(p.x - q.x, p.z - q.z) / r)
    const day = !['night', 'storm', 'memory'].includes(time)
    A.ambLevel('amb_wind', 0.3 + 0.4 * Math.min(1, Math.max(0, (p.y - 35) / 15)))
    A.ambLevel('amb_village', day && state.screen === 'game' ? near(PLACES.village, 45) * 0.9 : 0)
    A.ambLevel('amb_night', time === 'night' ? 0.75 : 0)
    A.ambLevel('amb_rain', time === 'storm' ? 0.85 : 0)
    let fire = 0
    for (const f of W.fx.activeFires) if (f.s > 0.8) fire = Math.max(fire, 1 - f.p.distanceTo(p) / 35)
    A.ambLevel('amb_fire', fire)
    let water = 0
    for (const s of W.water.sprays) water = Math.max(water, 1 - s.p.distanceTo(p) / 45)
    A.ambLevel('amb_water', water * 0.9)
    A.ambLevel('amb_fortress', W.state.fortress !== 'healing' ? near(PLACES.fortress, 50) * 0.7 : 0)
    // footsteps from distance travelled on the ground
    const sp = this.player.vel.length()
    if (sp > 0.8 && !this.player.char.sustain && !this.cinematic) {
      this.stepDist += sp * dt
      if (this.stepDist > (sp > 6 ? 1.15 : 0.85)) {
        this.stepDist = 0
        const stone = near(PLACES.temple, 12) > 0 || near(PLACES.fortress, 26) > 0
        A.sfx(stone ? 'step_stone' : 'step_dirt', { rate: 0.9 + Math.random() * 0.25, volume: 0.8 })
      }
    }
  }

  // ======================= feedback =======================
  hitStop(s) { this.hitStopT = Math.max(this.hitStopT, s) }
  shake(a) { if (settings.cameraShake) this.shakeAmt = Math.max(this.shakeAmt, a) }
  slowMo(scale, dur) { gsap.killTweensOf(this, 'timeScale'); this.timeScale = scale; gsap.to(this, { timeScale: 1, duration: dur, ease: 'power2.in', delay: dur * 0.3 }) }
  damageFlash() { state.fadeColor = '#600'; gsap.fromTo(state, { fade: 0.35 }, { fade: 0, duration: 0.4 }) }
  toast(msg) { state.toast = msg; clearTimeout(this._toastT); this._toastT = setTimeout(() => state.toast = '', 2600) }
  telegraph(pos, facing, radius, dur, full) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius * (full ? 1 : 0.6), 32), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.0, depthWrite: false }))
    m.rotation.x = -Math.PI / 2
    const c = full ? pos : tmp.set(pos.x + Math.sin(facing) * radius * 0.5, 0, pos.z + Math.cos(facing) * radius * 0.5)
    m.position.set(c.x, heightAt(c.x, c.z) + 0.08, c.z); this.scene.add(m)
    gsap.to(m.material, { opacity: 0.45, duration: dur, ease: 'power1.in', onComplete: () => { this.scene.remove(m) } })
  }
  telegraphLine(pos, facing, len, dur) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, len), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false }))
    m.rotation.x = -Math.PI / 2; m.rotation.z = facing
    m.position.set(pos.x + Math.sin(facing) * len / 2, pos.y + 0.1, pos.z + Math.cos(facing) * len / 2); this.scene.add(m)
    gsap.to(m.material, { opacity: 0.4, duration: dur, onComplete: () => this.scene.remove(m) })
  }
  shockRing(pos, radius, color) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }))
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, pos.y + 0.3, pos.z); this.scene.add(m)
    gsap.to(m.scale, { x: radius, y: radius, z: radius * 3, duration: 0.6, ease: 'power2.out' })
    gsap.to(m.material, { opacity: 0, duration: 0.6, onComplete: () => this.scene.remove(m) })
  }

  // ======================= markers / interact =======================
  makeMarker() {
    const g = new THREE.Group()
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: 0xffcf6a, depthTest: false, transparent: true, opacity: 0.95 }))
    m.scale.y = 1.6; m.renderOrder = 999; g.add(m)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 40, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0.18, depthWrite: false }))
    beam.position.y = 20; g.add(beam)
    g.visible = false; this.scene.add(g); return g
  }
  updateMarkers(dt) {
    const mk = this.marker
    if (this.markTarget) { mk.visible = true; const p = typeof this.markTarget === 'function' ? this.markTarget() : this.markTarget; mk.position.set(p.x, p.y + 0.6 + Math.sin(this.t * 3) * 0.15, p.z); mk.rotation.y += dt * 2 }
    else mk.visible = false
    let glow = null, glowD = 14 * 14
    for (const p of this.petals) if (!p.taken) {
      p.mesh.rotation.y += dt * 1.5; p.mesh.position.y = p.y + Math.sin(this.t * 2 + p.i) * 0.2
      const d2 = p.mesh.position.distanceToSquared(this.player.pos)
      if (d2 < glowD) { glowD = d2; glow = p }
      if (state.screen === 'game' && !this.cinematic && d2 < 1.8 * 1.8) this.collectPetal(p)
    }
    // the shared petal light follows the nearest petal; it dims to 0 (never removed) when none is close
    const L = this.petalLight
    if (glow && !glow.taken) { L.position.copy(glow.mesh.position); L.intensity += (2 - L.intensity) * Math.min(1, dt * 6) }
    else L.intensity += (0 - L.intensity) * Math.min(1, dt * 6)
  }
  updateInteract(ok) {
    const it = this.interactable
    const p = it && (typeof it.pos === 'function' ? it.pos() : it.pos)
    const near = it && ok && tmp.copy(p).setY(0).distanceTo(V(this.player.pos.x, 0, this.player.pos.z)) < it.r
    if (!near) {
      // talk to villagers going about their day
      const t = ok && !state.inCombat ? this.nearestTalker() : null
      state.prompt = t ? `[E] Talk to ${t.label}` : ''
      if (t && this.input.take('interact')) t.talk()
      return
    }
    state.prompt = near ? it.label : ''
    if (near && this.input.take('interact')) { const f = it.done; this.interactable = null; state.prompt = ''; f() }
  }
  tickTasks(dt) { if (this.task) this.task(dt) }

  // ======================= petals (collectible memories) =======================
  buildPetals() {
    const saved = load()
    const got = new Set(saved?.petals || [])
    state.memories = PETALS.filter((p, i) => got.has(i)).map(p => p.memory)
    state.petals = got.size
    // Petals share one geometry/material, and ONE light that is never added or removed. Changing the
    // number of lights in the scene recompiles every lit shader (a multi-second freeze on pickup).
    const petalGeo = new THREE.SphereGeometry(0.16, 6, 4), petalMat = new THREE.MeshStandardMaterial({ color: 0xa494ff, emissive: 0x6a54ff, emissiveIntensity: 1.6 })
    this.petalLight = new THREE.PointLight(0x8a7aff, 0, 6); this.scene.add(this.petalLight)
    this.petals = PETALS.map((d, i) => {
      const mesh = new THREE.Group()
      for (let k = 0; k < 5; k++) { const pe = new THREE.Mesh(petalGeo, petalMat); pe.scale.set(0.5, 0.15, 1); pe.position.set(Math.sin(k * 1.256) * 0.17, 0, Math.cos(k * 1.256) * 0.17); pe.rotation.y = k * 1.256; mesh.add(pe) }
      const y = heightAt(d.x, d.z) + 1.1
      mesh.position.set(d.x, y, d.z); this.scene.add(mesh)
      const taken = got.has(i); mesh.visible = !taken
      return { mesh, y, i, taken, d }
    })
  }
  collectPetal(p) {
    p.taken = true; p.mesh.visible = false
    state.petals++; state.memories.push(p.d.memory)
    this.audio.play('pickup'); this.world.spawnBurst(p.mesh.position, 30, 0xa494ff, 4)
    state.maxHp += 5; state.hp = state.maxHp
    this.toast(`Kurinji petal ${state.petals}/${state.totalPetals} — “${p.d.memory.title}” (Tab: journal) · +5 vitality`)
    this.persist()
  }
  persist() { if (this.freeRoaming) { const s = load(); if (s) save({ ...s, petals: this.petals.filter(p => p.taken).map(p => p.i), maxHp: state.maxHp }); return } save({ chapter: state.chapterIndex, karma: state.karma, petals: this.petals.filter(p => p.taken).map(p => p.i), maxHp: state.maxHp, rudhraSpared: !!state.rudhraSpared, senthil: !!state.senthil, best: Math.max(state.chapterIndex, load()?.best || 0) }) }

  // ======================= debug (Tweakpane) =======================
  buildDebug() {
    const pane = new Pane({ title: 'Kurinji · debug (`)' }); pane.hidden = true
    pane.element.parentElement.style.zIndex = 50
    const P = { exposure: 1, bloom: 0.45, bloomFlowers: 0, god: false, time: 'dawn', chapter: 0 }
    pane.addBinding(P, 'exposure', { min: 0.3, max: 2 }).on('change', e => { this.renderer.grade.exposure = e.value; this.renderer.pushGrade() })
    pane.addBinding(P, 'bloom', { min: 0, max: 2 }).on('change', e => { this.renderer.bloomBoost = e.value / 0.45; this.renderer.pushGrade() })
    pane.addBinding(P, 'bloomFlowers', { min: 0, max: 1, label: 'kurinji bloom' }).on('change', e => this.world.setBloom(e.value))
    pane.addBinding(P, 'time', { options: { dawn: 'dawn', day: 'day', dusk: 'dusk', night: 'night', memory: 'memory', storm: 'storm', bloom: 'bloom' } }).on('change', e => this.world.setTime(e.value, 1))
    pane.addBinding(P, 'god').on('change', e => this.god = e.value)
    pane.addBinding(this.cam, 'dist', { min: 3, max: 14, label: 'camera dist' })
    pane.addBinding(settings, 'voiceActing', { label: 'voice acting' })
    pane.addButton({ title: 'Fill breath meter' }).on('click', () => state.breath = 100)
    const debugKey = e => { if (e.code === 'Backquote') pane.hidden = !pane.hidden; if (e.code === 'Tab' && state.screen === 'game' && !state.paused && !state.loading) { e.preventDefault(); state.showJournal = !state.showJournal } }
    addEventListener('keydown', debugKey); this.cleanups.push(() => removeEventListener('keydown', debugKey))
    this.pane = pane
  }

  // ======================= story-facing API =======================
  wait(s) { return new Promise(resolve => this.waiters.add({ left: s, resolve })) }
  npc(id, preset, x, z, face, extra) {
    if (this.npcs.has(id)) { const n = this.npcs.get(id); if (x != null) n.setPos(x, z, face); return n }
    const n = new NPC(this, id, preset, SPEAKERS[id]?.name || id, extra); n.setPos(x ?? 0, z ?? 0, face ?? 0)
    this.npcs.set(id, n); return n
  }
  get(id) { return this.npcs.get(id) }
  dropNpc(id) { const n = this.npcs.get(id); if (n) { n.remove(); this.npcs.delete(id) } }
  clearNPCs(keep = []) {
    this.talkers = (this.talkers || []).filter(t => keep.includes(t.npc.id))
    for (const id of [...this.npcs.keys()]) if (!keep.includes(id)) this.dropNpc(id)
  }
  clearEnemies() { for (const e of this.enemies) e.remove(); this.enemies = []; state.boss = null }
  nearestTalker() {
    let best = null, bd = 2.4
    for (const t of this.talkers || []) { if (!t.npc.root.parent || t.cool > this.t) continue; const d = t.npc.pos.distanceTo(this.player.pos); if (d < bd) { bd = d; best = t } }
    return best
  }
  /** Register a villager the player can talk to; say() is called with (game, npc). */
  addTalker(npc, label, say) {
    const t = { npc, label, cool: 0, talk: () => {
      t.cool = this.t + 6
      const prev = npc.char.activity
      npc.face(this.player.pos); npc.lookAtPlayer = true; npc.char.activity = 'chat'
      say(this, npc)
      setTimeout(() => { if (npc.char && !npc.char._disposed) npc.char.activity = prev }, 4000)
    } }
    ;(this.talkers ||= []).push(t)
    return t
  }
  nearestNpc(p, r) { let best = null, bd = r; for (const n of this.npcs.values()) { if (!n.root.visible) continue; const d = n.pos.distanceTo(p); if (d < bd) { bd = d; best = n } } return best }
  nearestEnemy(p, r) { let best = null, bd = r; for (const e of this.enemies) if (e.alive && e.state !== 'defeated' && !e.def.passive) { const d = e.pos.distanceTo(p); if (d < bd) { bd = d; best = e } } return best }

  async chapterCard(kicker, title, sub) {
    state.card = { kicker, title, sub }; state.chapter = title
    await this.wait(4.2); state.card = null; await this.wait(0.8)
  }
  say(id, text, opts = {}) {
    const S = SPEAKERS[id] || { name: id, color: '#ddd' }
    state.dialogue = { speaker: opts.as || S.name, text, color: S.color }
    this.audio.duck(true)
    const v = this.audio.say(id, text, S.voice)
    state.dialogue.duration = v.duration
    const n = this.npcs.get(id), actor = this.actorOf(id)
    if (n && opts.face !== false && !n.char.sustain) n.face(this.player.pos)
    const listenerFor = a => this.listenerOf(a)
    // conversations outside a fight always get a proper dialogue camera
    let force = false
    if (!this.cinematic && !state.inCombat && actor && opts.cine !== false && state.screen === 'game') { this.cine(true); force = true }
    if ((opts.shot || force) && actor) { if (!this.cinematic) this.cine(true); this.coverSide = -(this.coverSide ?? 1); this.cover(actor, listenerFor(actor)) }
    else if (this.cinematic && opts.cover !== false && actor) {
      // A story shot set just before the line is kept only if it really shows the speaker;
      // otherwise (and on every change of speaker) cut to validated coverage.
      const fresh = this.t - (this.lastShotT ?? -9) <= 0.6
      const tracking = this.track && this.track.actor === actor
      const dest = tracking || !this.shotDest ? { pos: this.cinePos.toArray(), look: this.cineLook.toArray(), fov: this.lens?.fov ?? 50 } : this.shotDest
      const visible = this.frames(actor, dest.pos, dest.look, dest.fov, fresh ? 18 : 12)
      const recut = fresh ? !visible : (!visible || this.lastSpeaker !== actor || this.coverage > 2)
      if (recut) { this.coverSide = -(this.coverSide ?? 1); this.cover(actor, listenerFor(actor)) }
    }
    if (actor) this.lastSpeaker = actor
    this.sayActor = actor; this.recuts = 0; this.badFrameT = 0
    return new Promise(res => {
      let done = false
      const finish = () => { if (done) return; done = true; ui.advance = null; state.dialogue = null; this.sayActor = null; this.audio.stopVoice(); this.audio.duck(false); this.input.clear(); res() }
      ui.advance = finish
      if (settings.autoAdvance) (v.silent ? this.wait(1.2 + text.length * 0.055) : v.ended).then(async () => { await this.wait(v.silent ? 0 : 1); if (!done && !this.disposed) finish() })
    })
  }
  /** A shout heard during play (no dialogue box): voiced + short subtitle. */
  bark(id, lines) {
    if (state.dialogue || this.paused || this.disposed) return
    const text = Array.isArray(lines) ? lines[(Math.random() * lines.length) | 0] : lines
    const S = SPEAKERS[id] || { name: id }
    this.audio.say(id, text, S.voice)
    this.toast(`${S.name}: “${text}”`)
  }
  /** A quiet line spoken as a caption (Aruvan's last breaths). */
  whisper(id, text) {
    if (!text) return
    state.caption = text
    this.audio.say(id, text, SPEAKERS[id]?.voice, { whisper: true })
  }
  choose(options) {
    state.choices = options
    return new Promise(res => {
      ui.choose = i => { ui.choose = null; this.input.clear(); state.choices = null; const k = options[i].karma || 0; state.karma += k; if (k > 0) this.toast('Compassion remembered'); if (k < 0) this.toast('Wrath remembered'); res(i) }
    })
  }
  cine(on) {
    this.cinematic = on; state.letterbox = on; this.track = null
    if (on) { this.cinePos.copy(this.camera.position); this.cineLook.copy(this.cam.target); document.exitPointerLock?.() }
    else { this.cam.yaw = Math.atan2(this.player.pos.x - this.camera.position.x, this.player.pos.z - this.camera.position.z); this.renderer.focus(null) }
  }
  /**
   * Camera move. opts: { fov, roll, hand } — fov defaults to a lens chosen by subject distance
   * (telephoto for close-ups, wide for establishing shots).
   */
  shot(pos, look, dur = 0, ease = 'sine.inOut', opts = {}) {
    const d = Math.hypot(pos[0] - look[0], pos[1] - look[1], pos[2] - look[2])
    const fov = opts.fov ?? (d < 2.6 ? 30 : d < 5 ? 34 : d < 9 ? 40 : d < 22 ? 46 : 54)
    const L = this.lens ||= { fov: 50, roll: 0, hand: 0.6 }
    gsap.killTweensOf(L)
    const lensTo = { fov, roll: opts.roll ?? 0, hand: opts.hand ?? (d < 6 ? 0.8 : 0.5) }
    dur ? gsap.to(L, { ...lensTo, duration: dur, ease }) : Object.assign(L, lensTo)
    this.renderer.focus(this.cineLook, d < 3.5 ? 3.2 : d < 12 ? 2.2 : 0.7)
    this.lastShotT = this.t; this.coverage = 0; this.track = null
    if (opts.safe !== false && d < 12) pos = this.clearShot(pos, look)
    this.shotDest = { pos: [...pos], look: [...look], fov }
    gsap.killTweensOf(this.cinePos); gsap.killTweensOf(this.cineLook)
    if (!dur) { this.cinePos.set(...pos); this.cineLook.set(...look); return Promise.resolve() }
    return new Promise(r => {
      gsap.to(this.cinePos, { x: pos[0], y: pos[1], z: pos[2], duration: dur, ease })
      gsap.to(this.cineLook, { x: look[0], y: look[1], z: look[2], duration: dur, ease, onComplete: r })
    })
  }
  /** Move a camera position forward until nothing solid (buildings, walls) sits between it and the subject. */
  clearShot(pos, look) {
    const occ = (this.world.occluders || []).filter(g => g.visible)
    if (!occ.length) return pos
    const eye = V(...pos), at = V(...look), dir = eye.clone().sub(at), dist = dir.length()
    if (dist < 0.3) return pos
    dir.normalize()
    const ray = this.ray ||= new THREE.Raycaster()
    const blocked = d3 => { ray.set(at, d3); ray.far = dist + 0.3; ray.near = 0.25; return ray.intersectObjects(occ, true)[0] }
    // a camera hugging a wall fills half the frame: require ~1 m of free space around the lens
    const cramped = (eyeP, d3) => {
      const side = V(-d3.z, 0, d3.x).normalize()
      for (const v of [side, side.clone().negate(), V(d3.x, 0, d3.z).normalize()]) { ray.set(eyeP, v); ray.near = 0; ray.far = 1.1; if (ray.intersectObjects(occ, true).length) return true }
      return false
    }
    const first = blocked(dir)
    if (!first && !cramped(eye, dir)) return pos
    // swing around the subject (same distance & height) to find a clear angle
    const flat = V(dir.x, 0, dir.z), h = dir.y
    for (const a of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.5, -1.5, 2.0, -2.0]) {
      const d3 = flat.clone().applyAxisAngle(V(0, 1, 0), a).setY(h).normalize()
      const out = at.clone().addScaledVector(d3, dist)
      if (out.y < heightAt(out.x, out.z) + 0.5) continue
      if (!blocked(d3) && !cramped(out, d3)) return out.toArray()
    }
    for (const lift of [0.35, 0.7]) {
      const d3 = V(dir.x, h + lift, dir.z).normalize(), out = at.clone().addScaledVector(d3, dist)
      if (!blocked(d3) && !cramped(out, d3)) return out.toArray()
    }
    if (!first) return pos
    const d = Math.max(0.9, first.distance - 0.4)
    const out = at.clone().addScaledVector(dir, d)
    return [out.x, Math.max(out.y, heightAt(out.x, out.z) + 0.5), out.z]
  }
  /** Shot relative to a world point: offset [dx,dy,dz] from p, looking at p+[0,ly,0] */
  shotAt(p, off, ly = 1.5, dur = 0, ease, opts) { return this.shot([p.x + off[0], p.y + off[1], p.z + off[2]], [p.x, p.y + ly, p.z], dur, ease, opts) }
  dialogShot(n) { this.cover(n, this.player) }
  /** Head position of an actor (works for seated / kneeling / lying poses). */
  headOf(actor) { const h = actor.char?.head; return h ? h.getWorldPosition(V()) : V(actor.pos.x, actor.pos.y + 1.6, actor.pos.z) }
  /**
   * Dialogue coverage like a film: alternates over-the-shoulder, a 3/4 medium close-up
   * and a clean single on the speaker, with telephoto lenses and a slow push.
   */
  cover(speaker, listener) {
    const S = this.headOf(speaker), Lh = listener ? this.headOf(listener) : null
    let dir = Lh ? V(S.x - Lh.x, 0, S.z - Lh.z) : V(Math.sin(speaker.root.rotation.y), 0, Math.cos(speaker.root.rotation.y)).negate()
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1)
    dir.normalize()
    const side = V(-dir.z, 0, dir.x), k = (this.coverage = (this.coverage || 0) + 1)
    const flip = this.coverSide = (this.coverSide ?? 1)
    const look = S.clone().add(V(0, -0.06, 0)), toward = dir.clone().negate()
    const ots = f => Lh && Lh.distanceTo(S) < 9 ? [Lh.clone().addScaledVector(dir, -0.85).addScaledVector(side, 0.5 * f).add(V(0, 0.12, 0)), 30] : null
    const mcu = f => [S.clone().addScaledVector(toward, 2.1).addScaledVector(side, 0.9 * f).add(V(0, -0.05, 0)), 32]
    const front = [S.clone().addScaledVector(toward, 1.7).add(V(0, 0.02, 0)), 30]
    const high = f => [S.clone().addScaledVector(toward, 2.4).addScaledVector(side, 1.1 * f).add(V(0, 0.75, 0)), 34]
    const wide = f => [S.clone().addScaledVector(toward, 3.6).addScaledVector(side, 1.8 * f).add(V(0, 0.4, 0)), 40]
    // film grammar first (OTS, then a 3/4 single), then any angle that actually shows the face
    const order = (Lh && k % 3 !== 0 ? [ots(flip), mcu(flip)] : [mcu(flip), ots(flip)])
      .concat([ots(-flip), mcu(-flip), front, high(flip), high(-flip), wide(flip), wide(-flip)]).filter(Boolean)
    let pick = null
    for (const [eye, fov] of order) {
      const gy = heightAt(eye.x, eye.z) + 0.5; if (eye.y < gy) eye.y = gy
      if (this.frames(speaker, eye.toArray(), look.toArray(), fov, 12)) { pick = [eye, fov]; break }
    }
    const [eye, fov] = pick || mcu(flip)
    this.shot(eye.toArray(), look.toArray(), 0, 'sine.inOut', { fov, roll: (k % 4 === 2 ? 0.035 : 0) * flip, safe: !pick })
    this.coverage = k
    // follow the speaker (they may walk or kneel mid-line) with a slow push-in
    this.track = { actor: speaker, eye: this.cinePos.clone().sub(S), look: look.clone().sub(S), push: dir.clone().multiplyScalar(0.25), t0: this.t }
  }
  /** Which body speaks a line: story NPC, a boss/enemy of that kind, or the player. */
  actorOf(id) {
    if (id === 'aruvan' || id === 'veeran') return this.player
    const alias = { ilanAdult: 'ilan' }[id]
    return this.npcs.get(id) || (alias && this.npcs.get(alias)) || this.enemies.find(e => e.type === id && e.root.parent) || null
  }
  listenerOf(a) {
    if (a !== this.player) return this.player
    return this.lastSpeaker && this.lastSpeaker !== this.player && this.lastSpeaker.root?.parent ? this.lastSpeaker : this.nearestNpc(this.player.pos, 8) || this.nearestEnemy(this.player.pos, 8)
  }
  /** Would a camera at pos -> look show actor's face: in frame, close enough, nothing solid or anyone else in the way? */
  frames(actor, pos, look, fov, maxDist = 12) {
    if (!actor?.root?.parent) return false
    const cam = this.probeCam ||= new THREE.PerspectiveCamera()
    cam.fov = fov; cam.aspect = this.camera.aspect; cam.near = 0.1; cam.far = 500; cam.updateProjectionMatrix()
    cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld()
    const H = this.headOf(actor), d = cam.position.distanceTo(H)
    if (d > maxDist || d < 0.6) return false
    const p = H.clone().project(cam)
    if (p.z > 1 || Math.abs(p.x) > 0.8 || p.y < -0.7 || p.y > 0.85) return false
    const bodies = [this.player, ...this.npcs.values(), ...this.enemies].filter(a => a !== actor && a.root?.parent && a.root.visible && a.pos.distanceTo(cam.position) < d + 1).map(a => a.root)
    const ray = this.ray ||= new THREE.Raycaster()
    // eyes and chin must both be clear (a shoulder hiding half the face reads as a blocked shot)
    const solids = [...(this.world.occluders || []).filter(o => o.visible), ...bodies]
    for (const pt of [H, H.clone().add(V(0, -0.15, 0))]) {
      const dd = cam.position.distanceTo(pt)
      ray.set(cam.position, pt.clone().sub(cam.position).normalize()); ray.near = 0.05; ray.far = dd - 0.3
      if (ray.intersectObjects(solids, true).length) return false
    }
    return true
  }
  fade(to, dur = 1, color = '#000') { state.fadeColor = color; return new Promise(r => gsap.to(state, { fade: to, duration: dur, onComplete: r })) }
  async caption(text, dur = 3.5) {
    state.caption = text
    const v = this.audio.say('narrator', text, SPEAKERS.narrator?.voice)
    await Promise.all([this.wait(dur), v.silent ? null : v.ended])
    state.caption = ''; await this.wait(0.5)
  }
  objective(t) { state.objective = t; if (t) this.audio.play('pickup', { volume: 0.25, rate: 1.5 }) }
  goTo(p, r = 3, label) {
    if (this.cinematic) this.cine(false)
    if (label) this.objective(label)
    const pt = p.isVector3 ? p : V(p.x, heightAt(p.x, p.z), p.z)
    this.markTarget = pt.clone().setY(pt.y + 1.5)
    return new Promise(res => { this.task = () => { if (tmp.copy(this.player.pos).setY(0).distanceTo(V(pt.x, 0, pt.z)) < r) { this.task = null; this.markTarget = null; state.objective = ''; res() } } })
  }
  talkTo(id, label) {
    if (this.cinematic) this.cine(false)
    const n = this.npcs.get(id)
    if (label) this.objective(label)
    this.markTarget = () => tmp.copy(n.pos).setY(n.pos.y + 2.4)
    return new Promise(res => { this.interactable = { pos: () => n.pos, r: 2.8, label: `[E] Speak with ${n.name}`, done: () => { this.markTarget = null; state.objective = ''; res() } } })
  }
  interact(p, label, prompt) {
    if (this.cinematic) this.cine(false)
    if (label) this.objective(label)
    const pt = p.isVector3 ? p.clone() : V(p.x, heightAt(p.x, p.z), p.z)
    this.markTarget = pt.clone().setY(pt.y + 2)
    return new Promise(res => { this.interactable = { pos: pt, r: 2.6, label: prompt || '[E] Interact', done: () => { this.markTarget = null; state.objective = ''; res() } } })
  }
  music(k, fade) { this.audio.setMusic(k, fade) }
  time(k, d) { this.world.setTime(k, d) }
  movePlayer(x, z, face) { this.player.setPos(x, z, face); this.cam.yaw = face ?? this.cam.yaw; this.cam.target.copy(this.player.pos) }

  /**
   * Run a fight. waves: [[{type,x,z,opts}]]. Retries automatically on death.
   * opts: { anchor:[x,z,face], nonLethal, onPhase(enemy), endOnBoss }
   */
  async battle(waves, opts = {}) {
    if (this.cinematic) this.cine(false)
    state.inCombat = true; this.music(opts.music ?? 'battle')
    while (true) {
      const result = await this.runWaves(waves, opts)
      if (result === 'won') break
      // died: retry
      await this.wait(2.2)
      await this.fade(1, 0.8)
      this.clearEnemies(); state.deathMsg = ''
      state.hp = state.maxHp; state.breath = Math.max(state.breath, 50)
      this.player.char.action = null; this.player.char.sustain = null
      if (opts.anchor) this.movePlayer(...opts.anchor)
      await this.wait(0.4); await this.fade(0, 0.8)
    }
    state.inCombat = false; state.boss = null
    this.music(opts.after ?? 'mountain')
  }
  runWaves(waves, opts) {
    return new Promise(async res => {
      this.onDeath = () => res('died')
      for (let w = 0; w < waves.length; w++) {
        if (w > 0) { this.toast(`Wave ${w + 1} / ${waves.length}`); await this.wait(1.5) }
        if (state.hp <= 0) return
        opts.onWave?.(w)
        const list = waves[w].map(s => { const e = new Enemy(this, s.type, s.x, s.z, { nonLethal: opts.nonLethal, ...s.opts }); this.enemies.push(e); return e })
        this.onBossPhase = opts.onPhase
        const done = await new Promise(r2 => {
          this.onBossDefeated = (e) => { this.defeatedBoss = e; r2('won') }
          this.onDeath = () => r2('died')
          this.waveCheck = () => { if (list.every(e => !e.alive)) r2('won') }
        })
        this.waveCheck = null
        if (done === 'died') { res('died'); return }
      }
      this.onDeath = null; res('won')
    })
  }
  onEnemyDown(e) {
    state.breath = Math.min(100, state.breath + 6)
    this.world.spawnBurst(tmp.copy(e.pos).setY(e.pos.y + 1), 25, 0xffaa66, 5)
    setTimeout(() => this.waveCheck?.(), 50)
    setTimeout(() => { if (this.enemies.includes(e) && !e.def.passive) { gsap.to(e.root.position, { y: e.root.position.y - 2, duration: 2, delay: 3, onComplete: () => { e.remove(); this.enemies = this.enemies.filter(x => x !== e) } }) } }, 100)
  }
  onPlayerDeath() {
    if (this.god) { state.hp = state.maxHp; this.player.char.action = null; this.player.char.sustain = null; return }
    state.deathMsg = ['The mountain remembers you. Rise again.', 'Breathe. The fall is also part of the path.', 'Even the Kurinji waits twelve years. Try again.'][Math.random() * 3 | 0]
    this.slowMo(0.2, 1.5)
    this.onDeath?.()
  }

  // ======================= director =======================
  /** Free roam after the ending: the reign's peaceful world, no story beats. */
  async freeRoam() {
    if (this.running) return
    this.running = true; this.freeRoaming = true
    state.paused = false; state.showJournal = false; state.screen = 'game'
    const s = load()
    state.karma = s?.karma || 0; state.maxHp = s?.maxHp || 100; state.hp = state.maxHp
    try {
      this.clearEnemies(); this.markTarget = null; this.interactable = null; this.task = null
      await this.prepareChapter(7, 'freeroam')
      if (this.disposed) return
      state.chapterIndex = 7; state.chapter = 'Free Roam'
      await freeRoam(this)
    } finally { this.running = false }
  }
  async start(fromChapter = 0) {
    if (this.running) return
    this.running = true
    state.paused = false; state.showJournal = false
    if (this.world.fallenCrown) { this.world.fallenCrown.userData.dispose?.(); this.world.fallenCrown.removeFromParent(); this.world.fallenCrown = null }
    state.screen = 'game'
    const s = load()
    if (s && fromChapter > 0) { state.karma = s.karma || 0; state.maxHp = s.maxHp || 100; state.rudhraSpared = s.rudhraSpared; state.senthil = s.senthil }
    state.hp = state.maxHp
    try { for (let i = fromChapter; i < CHAPTERS.length && !this.disposed; i++) {
      this.clearEnemies(); this.markTarget = null; this.interactable = null; this.task = null
      await this.prepareChapter(i)
      if (this.disposed) break
      state.chapterIndex = i; this.persist()
      await CHAPTERS[i](this)
    } } finally { this.running = false }
  }

  async prepareChapter(i, voiceSet) {
    const manifest = CHAPTER_ASSETS[i]
    const loading = state.loading = { title: voiceSet === 'freeroam' ? 'Free Roam' : CHAPTER_NAMES[i], sub: 'The mountain is preparing your next chapter.', art: `${import.meta.env.BASE_URL}art/story${manifest.art}-sm.webp`, progress: 0, label: 'Preparing assets', error: '' }
    this.audio.setMusic(null, 0); this.audio.stopVoice()
    await this.audio.releaseUnusedMusic(manifest.music)
    await nextFrame()
    await this.loadCutsceneIndex()
    for (const url of this.cutsceneAssets?.values() || []) URL.revokeObjectURL(url)
    this.cutsceneAssets = new Map()
    const tasks = [
      { label: 'Chapter artwork', run: async () => { this.chapterArt = await loadArtwork(manifest.art) } },
      ...this.audio.voiceTasks(voiceSet || manifest.key),
      ...[...this.audio.sfxIndex].map(id => this.audio.sfxTask(id)),
      ...manifest.music.map(name => ({ label: 'Music', run: () => this.audio.resolve(name) })),
      ...manifest.frames.map(frame => ({ label: 'Story films', run: async () => {
        const id = STORY_FRAMES[frame].id, file = this.cutsceneFile(id)
        if (!file || this.cutsceneAssets.has(id)) return
        const blob = await fetchAsset(`cutscenes/${file}`).catch(() => null)
        if (blob && !this.disposed) this.cutsceneAssets.set(id, URL.createObjectURL(blob))
      } })),
    ]
    while (!this.disposed) {
      try {
        await runTasks(tasks, (done, count, label) => { loading.progress = done / (count + 1); loading.label = label })
        loading.label = 'Warming light and shaders'; await nextFrame(); await this.renderer.warm()
        loading.progress = 1; await nextFrame(); state.loading = null; ui.retryLoad = null
        this.lastTime = performance.now(); return
      } catch (e) {
        loading.error = `${e.message}. Retry to continue.`
        await new Promise(resolve => { ui.retryLoad = () => { loading.error = ''; ui.retryLoad = null; resolve() } })
      }
    }
  }

  async loadCutsceneIndex() {
    if (this.cutsceneIndex) return
    try { this.cutsceneIndex = await fetchAsset('cutscenes/index.json', 'json') } catch { this.cutsceneIndex = {} }
  }
  cutsceneFile(id) {
    const index = this.cutsceneIndex
    const entry = Array.isArray(index) ? index.find(x => x === id || x.id === id) : index[id]
    if (!entry) return null
    const file = typeof entry === 'object' ? (entry.file || `${id}.${entry.type === 'webp' ? 'webp' : 'mp4'}`) : (typeof entry === 'string' && /\.(mp4|webp)$/.test(entry) ? entry : `${id}.mp4`)
    return /^[a-zA-Z0-9_-]+\.(mp4|webp)$/.test(file) ? file : null
  }
  async cutscene(id) {
    const src = this.cutsceneAssets?.get(id), file = this.cutsceneFile(id)
    if (!src || !file || this.disposed) return
    this.audio.pause(true); document.exitPointerLock?.()
    state.cutscene = { src, type: file.endsWith('.webp') ? 'image' : 'video' }
    await new Promise(resolve => { ui.endCutscene = resolve })
    state.cutscene = null; ui.endCutscene = null
    this.audio.pause(!!state.paused); this.lastTime = performance.now()
  }

  destroy() {
    if (this.initializing) { this.cancelled = true; this.audio?.destroy(); return }
    if (this.disposed) return
    this.disposed = true; cancelAnimationFrame(this.frame)
    this.audio?.destroy(); this.input?.destroy(); this.pane?.dispose()
    for (const cleanup of this.cleanups || []) cleanup()
    for (const id of this.storyTimers || []) clearTimeout(id)
    const ownsSession = globalThis[ACTIVE_GAME] === this
    if (ownsSession) { gsap.globalTimeline.clear(); gsap.globalTimeline.paused(false); globalThis[ACTIVE_GAME] = null }
    gsap.killTweensOf(this.cinePos); gsap.killTweensOf(this.cineLook); gsap.killTweensOf(this.renderer?.grade)
    // Resolve a cutscene only; leave abandoned story waits dormant after teardown.
    if (ownsSession) { ui.endCutscene?.(); ui.endCutscene = null; ui.advance = null; ui.choose = null; ui.resume = null; ui.retryLoad = null }
    if (this.enemies) this.clearEnemies(); if (this.npcs) this.clearNPCs(); this.player?.char?.dispose?.()
    this.physics?.destroy?.(); this.world?.pmrem?.dispose()
    this.world?.envTarget?.dispose(); this.world?.fallenCrown?.userData.dispose?.()
    for (const url of this.cutsceneAssets?.values() || []) URL.revokeObjectURL(url)
    const geometries = new Set(), materials = new Set(), textures = new Set()
    this.scene?.traverse(o => { gsap.killTweensOf(o); gsap.killTweensOf(o.position); gsap.killTweensOf(o.rotation); if (o.geometry) geometries.add(o.geometry); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m) materials.add(m) })
    for (const m of materials) for (const value of Object.values(m)) if (value?.isTexture) textures.add(value)
    for (const g of geometries) if (!g.userData.sharedCharacter) g.dispose()
    for (const m of materials) if (!m.userData.sharedCharacter && !m.userData.sharedKit) m.dispose()
    for (const t of textures) t.dispose()
    this.renderer?.dispose?.()
  }
}
