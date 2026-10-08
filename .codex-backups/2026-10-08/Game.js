import * as THREE from 'three'
import gsap from 'gsap'
import { Renderer } from './gfx/Renderer'
import { settings } from './settings'
import { Pane } from 'tweakpane'
import { World, PLACES, heightAt } from './world/World'
import { Physics } from './Physics'
import { Audio } from './Audio'
import { Input } from './Input'
import { Player, NPC, Enemy } from './Actors'
import { state, ui, save, load } from './store'
import { CHAPTERS, SPEAKERS, PETALS } from './story'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const tmp = new THREE.Vector3()

export class Game {
  constructor(container) { this.container = container }

  async init() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 3000)
    this.renderer = new Renderer(this.container, this.scene, this.camera)
    const r = this.renderer.gl
    this.world = new World(this.scene, this)
    this.renderer.onShadowSize = n => this.world.setShadowSize(n)
    this.world.setShadowSize(this.renderer.shadowSize)
    this.world.updateEnv()
    this.physics = await new Physics().init(this.scene)
    this.physics.addGroundPatch(0, 4, 30); this.physics.addGroundPatch(0, 160, 30, 2.5)
    for (const [k, x, z] of [['crate', -9, 6], ['crate', -9.2, 7.1], ['barrel', -10.5, 5.5], ['barrel', 9, 1], ['crate', 11, 2], ['crate', 11, 2, 1.6], ['barrel', -2, 30], ['crate', 2, 31], ['barrel', 3, 33],
      ['crate', -8, 150], ['crate', -8, 151.2], ['barrel', 9, 150], ['barrel', 10, 151], ['crate', 12, 165], ['barrel', -12, 165]]) this.physics.addProp(k, x, z)
    this.audio = new Audio()
    this.audio.ready.then(() => this.audio.loadSfx([...this.audio.sfxIndex]))
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
    this.clock = new THREE.Clock(); this.t = 0

    this.marker = this.makeMarker()
    this.buildPetals()
    this.buildDebug()
    this.loop()
    return this
  }

  // ======================= loop =======================
  loop = () => {
    requestAnimationFrame(this.loop)
    const raw = Math.min(0.05, this.clock.getDelta())
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
    this.renderer.render(raw)
  }

  updateCamera(dt, controllable) {
    const c = this.cam, cam = this.camera
    let tx = 0, ty = 0
    if (this.shakeAmt > 0) { this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.6); tx = (Math.random() - .5) * this.shakeAmt; ty = (Math.random() - .5) * this.shakeAmt }
    if (this.cinematic) {
      cam.position.copy(this.cinePos).add(tmp.set(tx, ty, 0))
      const gy = heightAt(cam.position.x, cam.position.z) + 0.8; if (cam.position.y < gy) cam.position.y = gy
      cam.lookAt(this.cineLook)
      return
    }
    const l = this.input.consumeLook()
    if (controllable) { c.yaw -= l.x * 0.0035; c.pitch = Math.max(-0.25, Math.min(1.1, c.pitch + l.y * 0.0028)) }
    if (this.input.keys.has('KeyZ')) c.yaw += dt * 2; if (this.input.keys.has('KeyC')) c.yaw -= dt * 2
    // gentle auto-follow behind player when moving and no mouse input
    if (!this.input.locked && !state.mobile && this.player.vel.lengthSq() > 2) {
      let d = (this.player.facing) - c.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI
      c.yaw += d * dt * 0.8
    }
    c.target.lerp(tmp.copy(this.player.pos).setY(this.player.pos.y + 1.6), Math.min(1, dt * 10))
    const dist = c.dist * (state.inCombat ? 1.15 : 1)
    const want = V(c.target.x - Math.sin(c.yaw) * Math.cos(c.pitch) * dist, c.target.y + Math.sin(c.pitch) * dist, c.target.z - Math.cos(c.yaw) * Math.cos(c.pitch) * dist)
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
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a) }
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
    for (const p of this.petals) if (!p.taken) {
      p.mesh.rotation.y += dt * 1.5; p.mesh.position.y = p.y + Math.sin(this.t * 2 + p.i) * 0.2
      if (state.screen === 'game' && !this.cinematic && p.mesh.position.distanceTo(this.player.pos) < 1.8) this.collectPetal(p)
    }
  }
  updateInteract(ok) {
    const it = this.interactable
    if (!it) { state.prompt = ''; return }
    const p = typeof it.pos === 'function' ? it.pos() : it.pos
    const near = ok && tmp.copy(p).setY(0).distanceTo(V(this.player.pos.x, 0, this.player.pos.z)) < it.r
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
    this.petals = PETALS.map((d, i) => {
      const mesh = new THREE.Group()
      for (let k = 0; k < 5; k++) { const pe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshStandardMaterial({ color: 0xa494ff, emissive: 0x6a54ff, emissiveIntensity: 1.6 })); pe.scale.set(0.5, 0.15, 1); pe.position.set(Math.sin(k * 1.256) * 0.17, 0, Math.cos(k * 1.256) * 0.17); pe.rotation.y = k * 1.256; mesh.add(pe) }
      const y = heightAt(d.x, d.z) + 1.1
      mesh.position.set(d.x, y, d.z); this.scene.add(mesh)
      const light = new THREE.PointLight(0x8a7aff, 2, 5); mesh.add(light)
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
  persist() { save({ chapter: state.chapterIndex, karma: state.karma, petals: this.petals.filter(p => p.taken).map(p => p.i), maxHp: state.maxHp, rudhraSpared: !!state.rudhraSpared, senthil: !!state.senthil, best: Math.max(state.chapterIndex, load()?.best || 0) }) }

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
    pane.addBinding(state, 'voice', { label: 'voice acting' })
    pane.addButton({ title: 'Fill breath meter' }).on('click', () => state.breath = 100)
    addEventListener('keydown', e => { if (e.code === 'Backquote') pane.hidden = !pane.hidden; if (e.code === 'Tab') { e.preventDefault(); state.showJournal = !state.showJournal } })
    this.pane = pane
  }

  // ======================= story-facing API =======================
  wait(s) { return new Promise(r => setTimeout(r, s * 1000)) }
  npc(id, preset, x, z, face, extra) {
    if (this.npcs.has(id)) { const n = this.npcs.get(id); if (x != null) n.setPos(x, z, face); return n }
    const n = new NPC(this, id, preset, SPEAKERS[id]?.name || id, extra); n.setPos(x ?? 0, z ?? 0, face ?? 0)
    this.npcs.set(id, n); return n
  }
  get(id) { return this.npcs.get(id) }
  dropNpc(id) { const n = this.npcs.get(id); if (n) { n.remove(); this.npcs.delete(id) } }
  clearNPCs(keep = []) { for (const id of [...this.npcs.keys()]) if (!keep.includes(id)) this.dropNpc(id) }
  clearEnemies() { for (const e of this.enemies) e.remove(); this.enemies = []; state.boss = null }
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
    const n = this.npcs.get(id)
    if (n && opts.face !== false && !n.char.sustain) n.face(this.player.pos)
    if (opts.shot && n) { if (!this.cinematic) this.cine(true); this.dialogShot(n) }
    return new Promise(res => {
      let done = false
      const finish = () => { if (done) return; done = true; ui.advance = null; state.dialogue = null; this.audio.stopVoice(); this.audio.duck(false); this.input.clear(); res() }
      ui.advance = finish
      if (settings.autoAdvance) (v.silent ? this.wait(1.2 + text.length * 0.055) : v.ended).then(() => setTimeout(() => { if (!done) finish() }, v.silent ? 0 : 1000))
    })
  }
  /** A shout heard during play (no dialogue box): voiced + short subtitle. */
  bark(id, lines) {
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
    this.cinematic = on; state.letterbox = on
    if (on) { this.cinePos.copy(this.camera.position); this.cineLook.copy(this.cam.target); document.exitPointerLock?.() }
    else { this.cam.yaw = Math.atan2(this.player.pos.x - this.camera.position.x, this.player.pos.z - this.camera.position.z) }
  }
  shot(pos, look, dur = 0, ease = 'sine.inOut') {
    gsap.killTweensOf(this.cinePos); gsap.killTweensOf(this.cineLook)
    if (!dur) { this.cinePos.set(...pos); this.cineLook.set(...look); return Promise.resolve() }
    return new Promise(r => {
      gsap.to(this.cinePos, { x: pos[0], y: pos[1], z: pos[2], duration: dur, ease })
      gsap.to(this.cineLook, { x: look[0], y: look[1], z: look[2], duration: dur, ease, onComplete: r })
    })
  }
  /** Shot relative to a world point: offset [dx,dy,dz] from p, looking at p+[0,ly,0] */
  shotAt(p, off, ly = 1.5, dur = 0, ease) { return this.shot([p.x + off[0], p.y + off[1], p.z + off[2]], [p.x, p.y + ly, p.z], dur, ease) }
  dialogShot(n) {
    const P = this.player.pos, a = n.pos, mid = V((P.x + a.x) / 2, (P.y + a.y) / 2, (P.z + a.z) / 2)
    const dir = V(a.x - P.x, 0, a.z - P.z).normalize(), side = V(-dir.z, 0, dir.x)
    this.shot([mid.x + side.x * 4.5 - dir.x * 1.5, mid.y + 2, mid.z + side.z * 4.5 - dir.z * 1.5], [a.x, a.y + 1.5, a.z], 1.2)
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
  async start(fromChapter = 0) {
    state.screen = 'game'
    const s = load()
    if (s && fromChapter > 0) { state.karma = s.karma || 0; state.maxHp = s.maxHp || 100; state.rudhraSpared = s.rudhraSpared; state.senthil = s.senthil }
    state.hp = state.maxHp
    for (let i = fromChapter; i < CHAPTERS.length; i++) {
      state.chapterIndex = i; this.persist()
      this.clearEnemies(); this.markTarget = null; this.interactable = null; this.task = null
      await this.audio.loadVoices(CHAPTERS[i].name)
      await CHAPTERS[i](this)
    }
  }
}
