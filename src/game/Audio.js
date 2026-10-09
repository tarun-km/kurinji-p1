import { Howl, Howler } from 'howler'
import { watch } from 'vue'
import { settings } from './settings'
import { voiceKey } from './voiceKey'
import { fetchAsset, runTasks } from './assets'

const SR = 22050

function wav(seconds, fn) {
  const n = Math.floor(seconds * SR)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, fn(i / SR, i)))
    v.setInt16(44 + i * 2, s * 32767, true)
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

const TAU = Math.PI * 2
const rnd = () => Math.random() * 2 - 1
const note = (m) => 440 * Math.pow(2, (m - 69) / 12)

// --- instruments ---------------------------------------------------------
function bansuri(t, f, len) {            // breathy flute
  if (t < 0 || t > len) return 0
  const env = Math.min(1, t / 0.12) * Math.min(1, (len - t) / 0.3)
  const vib = 1 + 0.006 * Math.sin(TAU * 5.2 * t) * Math.min(1, t / 0.4)
  return env * (0.5 * Math.sin(TAU * f * vib * t) + 0.12 * Math.sin(TAU * 2 * f * vib * t) + 0.04 * rnd())
}
function taiko(t) {
  if (t < 0 || t > 0.6) return 0
  const f = 55 + 70 * Math.exp(-t * 18)
  return Math.exp(-t * 7) * (Math.sin(TAU * f * t) + 0.25 * rnd() * Math.exp(-t * 40))
}

function makeSounds() {
  const S = {}
  // Temple bell — inharmonic partials with long decay
  S.bell = wav(5, t => [1, 2.76, 5.4, 8.93].reduce((a, p, i) => a + Math.sin(TAU * 196 * p * t) * Math.exp(-t * (0.6 + i * 0.9)) / (i + 1.4), 0) * 0.7)
  S.swing = wav(0.25, t => rnd() * Math.sin(Math.PI * t / 0.25) * 0.5 * (0.5 + 0.5 * Math.sin(TAU * 900 * t * (1 - t))))
  S.hit = wav(0.3, t => (Math.sin(TAU * (120 - 200 * t) * t) * 0.9 + rnd() * 0.6 * Math.exp(-t * 30)) * Math.exp(-t * 14))
  S.heavy = wav(0.6, t => (Math.sin(TAU * (70 - 60 * t) * t) + rnd() * 0.7 * Math.exp(-t * 15)) * Math.exp(-t * 6))
  S.hurt = wav(0.35, t => (Math.sin(TAU * 90 * t) * 0.6 + rnd() * 0.5) * Math.exp(-t * 10) * 0.8)
  S.dodge = wav(0.3, t => rnd() * Math.sin(Math.PI * t / 0.3) * 0.25)
  S.pickup = wav(1.6, t => [76, 79, 83, 88].reduce((a, m, i) => a + Math.sin(TAU * note(m) * t) * Math.exp(-Math.max(0, t - i * 0.09) * 3) * (t > i * 0.09 ? 1 : 0), 0) * 0.25)
  S.special = wav(2.2, t => (Math.sin(TAU * 110 * t) * 0.5 + Math.sin(TAU * 220.5 * t) * 0.3 + Math.sin(TAU * 330 * t * (1 + t * 0.2)) * 0.2) * Math.exp(-t * 1.4) + rnd() * 0.3 * Math.exp(-t * 4))
  S.horn = wav(3, t => { const e = Math.min(1, t / 0.4) * Math.min(1, (3 - t) / 0.6); const f = 98 * (1 + 0.01 * Math.sin(TAU * 4 * t)); return e * 0.5 * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * 2 * f * t) + 0.3 * Math.sin(TAU * 3 * f * t)) })
  S.heartbeat = wav(1.2, t => taiko(t) * 0.6 + taiko(t - 0.22) * 0.4)
  S.fire = wav(4, (t, i) => rnd() * 0.12 * (0.6 + 0.4 * Math.sin(TAU * 0.7 * t)) + (Math.random() < 0.0009 ? 0.8 : 0) * rnd())

  // Ambient drone: tanpura-like Sa–Pa drone, loops
  S.drone = wav(8, t => {
    const sw = 0.5 + 0.5 * Math.sin(TAU * t / 8)
    return 0.16 * (Math.sin(TAU * 65.4 * t) + 0.6 * Math.sin(TAU * 98 * t + sw) + 0.4 * Math.sin(TAU * 130.8 * t) * sw + 0.2 * Math.sin(TAU * 196.2 * t) * (1 - sw))
  })
  // Theme: bansuri melody over drone (pentatonic, D)
  const theme = [[62, 1], [64, 1], [66, 2], [69, 1.5], [66, .5], [64, 2], [62, 1], [59, 1], [62, 3], [0, 1], [69, 1], [71, 1], [74, 2], [71, 1], [69, 1], [66, 2], [64, 1], [62, 1], [62, 4]]
  const beat = 0.62, starts = []; let acc = 0
  for (const [m, d] of theme) { starts.push([m, acc, d * beat]); acc += d * beat }
  const themeLen = acc + 1.5
  S.theme = wav(themeLen, t => {
    let s = 0.1 * (Math.sin(TAU * 73.4 * t) + 0.5 * Math.sin(TAU * 110 * t))
    for (const [m, st, d] of starts) if (m && t >= st && t < st + d + 0.3) s += bansuri(t - st, note(m), d + 0.25)
    return s * 0.7
  })
  // Battle drums: taiko pattern, loops
  const pat = [0, 0.75, 1, 1.5, 2, 2.25, 2.75, 3, 3.5, 3.75]
  S.battle = wav(4, t => {
    let s = 0
    for (const p of pat) s += taiko(t - p * 0.5 - 0.0) * (p % 1 === 0 ? 0.8 : 0.45)
    s += 0.12 * Math.sin(TAU * 55 * t) * (0.5 + 0.5 * Math.sin(TAU * t / 2))
    s += 0.08 * Math.sin(TAU * 220 * t + 3 * Math.sin(TAU * 1.5 * t)) * Math.max(0, Math.sin(TAU * t / 4))
    return s * 0.75
  })
  // Sorrow: slow, low bansuri
  const sorrow = [[57, 3], [60, 2], [62, 3], [60, 1], [57, 4], [55, 2], [57, 6]]
  let a2 = 0; const st2 = sorrow.map(([m, d]) => { const r = [m, a2, d * 0.8]; a2 += d * 0.8; return r })
  S.sorrow = wav(a2 + 2, t => {
    let s = 0.12 * Math.sin(TAU * 55 * t) + 0.06 * Math.sin(TAU * 82.4 * t)
    for (const [m, st, d] of st2) if (t >= st && t < st + d + 0.4) s += bansuri(t - st, note(m), d + 0.35) * 0.8
    return s * 0.7
  })
  return S
}

/* ---------------------------------------------------------------------------
   Composed music. Files live in /public/audio/<file>.mp3 and are streamed.
   gain     — per-track level so every track sits near -16 LUFS (measured)
   start    — seconds to skip at the head (leading silence)
   loopEnd  — loop point, in seconds before the end (just before the outro fade)
   xf       — crossfade length when looping back to `start`
   fb       — fallback cue if the file isn't there yet ('syn:*' = built-in synth)
--------------------------------------------------------------------------- */
const MUSIC = {
  main_theme:   { file: 'music_01_main_theme',   gain: 0.59, start: 0.5, loopEnd: -12,   xf: 5,   fb: 'syn:theme' },  // -11.4 LUFS
  mountain:     { file: 'music_02_mountain',     gain: 0.60, start: 0.4, loopEnd: -6,    xf: 3,   fb: 'syn:drone' },  // -11.6
  ash:          { file: 'music_03_ash',          gain: 0.68, start: 0,   loopEnd: -8,    xf: 4,   fb: 'syn:sorrow' }, // -12.6
  lullaby:      { file: 'music_04_lullaby',      gain: 0.58, start: 0,   loopEnd: -9,    xf: 5,   fb: 'syn:sorrow' }, // -11.3
  iron_banners: { file: 'music_05_iron_banners', gain: 0.72, start: 0,   loopEnd: -22,   xf: 4,   fb: 'syn:drone' },  // -13.1
  battle:       { file: 'music_06_battle',       gain: 0.61, start: 0,   loopEnd: -6.5,  xf: 2.5, fb: 'syn:battle' }, // -11.7
  rudhra:       { file: 'music_07_rudhra',       gain: 0.63, start: 0,   loopEnd: -12.5, xf: 3,   fb: 'battle' },     // -12.0
  dunkan:       { file: 'music_08a_dunkan',      fb: 'battle' },
  dunkan_rage:  { file: 'music_08b_dunkan_rage', fb: 'dunkan' },
  sorrow:       { file: 'music_09_sorrow',       fb: 'syn:sorrow' },
  reign:        { file: 'music_10_reign',        loop: false, fb: 'main_theme' },
  bloom:        { file: 'music_11_bloom',        fb: 'main_theme' },
  last_breath:  { file: 'music_12_last_breath',  loop: false, fb: 'main_theme' },
  credits:      { file: 'music_13_credits',      loop: false, fb: 'main_theme' },
}
for (const c of Object.values(MUSIC)) Object.assign(c, { gain: 0.6, start: 0, loopEnd: -6, xf: 4, ...c })
const MUSIC_LEVEL = 0.42, DUCK = 0.4

/** Old synth names → generated sound-effect files (synth stays as fallback). */
const SFX_ALIAS = { swing: 'whoosh', hit: 'staff_hit', heavy: 'heavy_hit', hurt: 'hurt', dodge: 'dodge', pickup: 'petal', special: 'kurinji_breath', horn: 'war_horn', heartbeat: 'heartbeat', bell: 'bell' }
const SFX_VOL = { bell: 0.9, whoosh: 0.55, step_dirt: 0.3, step_stone: 0.3, petal: 0.7, ui_click: 0.5, ui_page: 0.6, ui_open: 0.5, war_horn: 0.85, thunder: 0.8, chicken: 0.4, goat: 0.4, crowd_rally: 0.8 }
export const AMB = ['amb_wind', 'amb_village', 'amb_night', 'amb_rain', 'amb_fire', 'amb_water', 'amb_fortress']
const BASE = import.meta.env.BASE_URL

const clamp = (v, max = 1) => Math.max(0, Math.min(max, Number(v) || 0))
let activeAudio = null

/** Quiet category mix, bounded polyphony, fully cached chapter-local music. */
export class Audio {
  constructor() {
    activeAudio?.destroy()
    activeAudio = this
    this.h = {}; this.fx = {}; this.voice = new Map()
    this.voiceIndex = new Set(); this.sfxIndex = new Set(); this.lines = []
    this.cues = new Map(); this.music = null; this.musicToken = 0
    this.amb = {}; this.ambTarget = {}; this.effects = []; this.lastFx = new Map()
    this.timers = new Set(); this.voices = []; this.paused = false
    this.ready = Promise.all([
      fetchAsset('sfx/index.json', 'json').then(l => l.forEach(x => this.sfxIndex.add(x.id))),
      fetchAsset('voice/index.json', 'json').then(l => l.forEach(x => this.voiceIndex.add(x))),
      fetchAsset('voice/lines.json', 'json').then(l => { this.lines = l }),
    ])
    Howler.volume(clamp(settings.master) * 0.65)
    this.installLimiter()
    this.unwatch = [
      watch(() => settings.master, v => { Howler.volume(clamp(v) * 0.65); this.refreshMusic() }),
      watch(() => settings.music, () => this.refreshMusic()),
      watch(() => settings.voice, v => { if (this.curVoice) this.curVoice.h.volume(clamp(v) * 0.65, this.curVoice.sid) }),
      watch(() => settings.voiceActing, v => { if (!v) this.stopVoice() }),
      watch(() => settings.sfx, () => this.effects.forEach(e => e.h.volume(e.base * settings.sfx, e.id))),
    ]
  }
  installLimiter() {
    // Reuse the compressor across hot reloads; there is exactly one output chain.
    const ctx = Howler.ctx, gain = Howler.masterGain
    if (!ctx || !gain || gain.kurinjiLimiter) return
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -12; limiter.knee.value = 6; limiter.ratio.value = 12
    limiter.attack.value = 0.003; limiter.release.value = 0.18
    gain.disconnect(); gain.connect(limiter); limiter.connect(ctx.destination)
    gain.kurinjiLimiter = limiter
  }
  defer(fn, ms) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.disposed) fn() }, ms)
    this.timers.add(id); return id
  }
  ensureSynth() {
    if (this.synthUrls) return this.synthReady
    this.synthUrls = makeSounds()
    this.synthReady = Promise.all(Object.entries(this.synthUrls).map(([k, url]) => new Promise((resolve, reject) => {
      this.h[k] = new Howl({ src: [url], format: ['wav'], preload: true, volume: 0, loop: ['drone', 'battle', 'theme', 'sorrow'].includes(k), onload: resolve, onloaderror: (_, error) => reject(new Error(`Fallback audio: ${error}`)) })
    })))
    return this.synthReady
  }
  loadHowl(path, { loop = false } = {}) {
    const h = new Howl({ src: [`${BASE}${path}`], preload: false, loop, volume: 0, pool: 3 })
    h.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail('timed out'), 30000)
      const fail = reason => { clearTimeout(timer); h.unload(); reject(new Error(`Could not decode ${path}: ${reason}`)) }
      h.once('load', () => { clearTimeout(timer); if (this.disposed) { h.unload(); reject(new Error('Audio session ended')) } else resolve(h) })
      h.once('loaderror', (_, reason) => fail(reason))
      h.load()
    })
    return h
  }
  sfxTask(id) {
    return { label: 'Sound effects', run: async () => {
      let h = this.fx[id]
      if (!h) h = this.fx[id] = this.loadHowl(`sfx/${id}.mp3`, { loop: id.startsWith('amb_') })
      try { await h.ready } catch (e) { delete this.fx[id]; throw e }
    } }
  }
  loadSfx(ids = [...this.sfxIndex]) { return runTasks(ids.filter(id => this.sfxIndex.has(id)).map(id => this.sfxTask(id))) }
  sfx(id, opts = {}) {
    if (this.disposed || this.paused) return
    id = SFX_ALIAS[id] || id
    const now = performance.now(), cooldown = id.startsWith('step_') ? 170 : 65
    if (now - (this.lastFx.get(id) ?? -Infinity) < cooldown) return
    this.lastFx.set(id, now)
    // Six effects total, at most two instances of an individual effect.
    this.effects = this.effects.filter(e => e.h.playing(e.id))
    const same = this.effects.filter(e => e.key === id)
    if (same.length >= 2) { same[0].h.stop(same[0].id); this.effects = this.effects.filter(e => e !== same[0]) }
    if (this.effects.length >= 6) { const old = this.effects.shift(); old.h.stop(old.id) }
    const h = this.fx[id] || this.h[Object.keys(SFX_ALIAS).find(k => SFX_ALIAS[k] === id) || id]
    if (!h || h.state() !== 'loaded') return
    const base = clamp(opts.volume) * (SFX_VOL[id] ?? 0.55) * 0.42
    const level = (opts.volume == null ? (SFX_VOL[id] ?? 0.55) * 0.42 : base) * clamp(settings.sfx)
    // Set the group volume BEFORE play: pooled sounds must never begin at full gain.
    h.volume(level)
    h.rate(clamp(opts.rate ?? 1, 2) || 1)
    const sid = h.play()
    this.effects.push({ h, id: sid, key: id, base: level / (settings.sfx || 1) })
    return sid
  }
  play(k, opts = {}) { return this.sfx(k, opts) }
  ambLevel(id, level) { this.ambTarget[id] = clamp(level) }
  ambience(k, on) { this.ambLevel(k === 'fire' ? 'amb_fire' : k, on ? 0.8 : 0) }
  update(dt) {
    if (this.disposed || this.paused) return
    const total = AMB.reduce((sum, id) => sum + (this.ambTarget[id] || 0), 0)
    const gain = 0.32 * clamp(settings.ambience) / Math.max(1, total)
    for (const id of AMB) {
      const h = this.fx[id]; if (!h || h.state() !== 'loaded') continue
      const target = (this.ambTarget[id] || 0) * gain
      const cur = this.amb[id] ?? 0, next = cur + (target - cur) * Math.min(1, dt * 1.5)
      this.amb[id] = next
      if (next > 0.003 && !h.playing()) { h.volume(next); h.play() }
      if (h.playing()) { h.volume(next); if (next < 0.002 && target === 0) h.stop() }
    }
    this.updateMusic(dt)
  }
  voiceTasks(chapter) {
    this.stopVoice()
    const want = new Set(this.lines.filter(l => l.chapter === chapter || l.chapter === 'shared').map(l => l.id))
    for (const [id, h] of this.voice) if (!want.has(id)) { h.unload(); this.voice.delete(id) }
    return [...want].map(id => ({ label: 'Recorded dialogue', run: async () => {
      if (!this.voiceIndex.has(id)) throw new Error(`Missing recorded dialogue: ${id}`)
      let h = this.voice.get(id)
      if (!h) { h = this.loadHowl(`voice/${id}.mp3`); this.voice.set(id, h) }
      try { await h.ready } catch (e) { this.voice.delete(id); throw e }
    } }))
  }
  async loadVoices(chapter) { await this.ready; return runTasks(this.voiceTasks(chapter)) }
  hasVoice(speaker, text) { return this.voiceIndex.has(voiceKey(speaker, text)) }
  say(speaker, text, voiceDef, { whisper = false } = {}) {
    this.stopVoice()
    const h = this.voice.get(voiceKey(speaker, text))
    if (this.disposed || !settings.voiceActing || !h || h.state() !== 'loaded') return { duration: text.length / 14, ended: Promise.resolve(), silent: true }
    h.volume((whisper ? 0.5 : 0.65) * clamp(settings.voice)); h.rate(1)
    let finish
    const ended = new Promise(resolve => { finish = resolve })
    const sid = h.play()
    const settle = () => { h.off('end', settle, sid); h.off('stop', settle, sid); h.off('playerror', settle, sid); finish() }
    h.once('end', settle, sid); h.once('stop', settle, sid); h.once('playerror', settle, sid)
    this.curVoice = { h, sid, finish: settle }
    return { duration: h.duration(), ended }
  }
  stopVoice() {
    if (!this.curVoice) return
    const v = this.curVoice; this.curVoice = null
    this.resumeSounds = (this.resumeSounds || []).filter(sound => sound.h !== v.h || sound.sid !== v.sid)
    v.h.stop(v.sid); v.finish()
  }
  async resolve(name) {
    if (name?.startsWith('syn:')) { await this.ensureSynth(); return { syn: name.slice(4) } }
    const def = MUSIC[name]
    if (!def) return null
    if (this.cues.has(name)) return this.cues.get(name)
    const pending = (async () => {
      // The repository deliberately has seven music tracks. Resolve absent cues
      // to their documented fallback without making failing runtime requests.
      if (!/^music_0[1-7]_/.test(def.file)) return this.resolve(def.fb)
      const blob = await fetchAsset(`audio/${def.file}.mp3`)
      if (this.disposed) throw new Error('Audio session ended')
      const cue = { ...def, url: URL.createObjectURL(blob), players: [] }
      try {
        cue.players = [new window.Audio(cue.url), new window.Audio(cue.url)]
        await Promise.all(cue.players.map(el => new Promise((resolve, reject) => {
          el.preload = 'auto'; el.volume = 0
          const finish = error => { clearTimeout(timer); el.removeEventListener('canplaythrough', ready); el.removeEventListener('error', fail); error ? reject(error) : resolve() }
          const ready = () => finish(), fail = () => finish(new Error(`Could not buffer ${def.file}`))
          const timer = setTimeout(fail, 30000)
          el.addEventListener('canplaythrough', ready, { once: true }); el.addEventListener('error', fail, { once: true }); el.load()
        })))
        if (this.disposed) throw new Error('Audio session ended')
        return { cue }
      } catch (error) { for (const el of cue.players) this.releaseElement(el, true); URL.revokeObjectURL(cue.url); throw error }
    })()
    this.cues.set(name, pending)
    try { return await pending } catch (e) { this.cues.delete(name); throw e }
  }
  preload(names) { return runTasks([...new Set(names)].map(name => ({ label: 'Music', run: () => this.resolve(name) }))) }
  setMusic(name, fade = 2000) {
    if (this.disposed || this.music === name) return
    this.music = name
    const token = ++this.musicToken
    if (!name) { this.stopTrack(fade); return }
    this.resolve(name).then(r => { if (!this.disposed && token === this.musicToken) this.startTrack(r, fade) }).catch(e => console.warn('Music load failed:', e.message))
  }
  ensurePlaying() {
    if (this.disposed || this.paused) return
    Howler.ctx?.resume?.().catch(() => {})
    if (this.cur?.syn) { if (!this.cur.h.playing()) this.cur.h.play() }
    else for (const t of this.cur?.tracks || []) if (t.el.paused) t.el.play().catch(() => {})
  }
  beginElement(cue, volume = 0) {
    const el = cue.players.find(player => !(this.cur?.tracks || []).some(track => track.el === player)) || cue.players[0]
    el.preload = 'auto'; el.volume = volume; el.currentTime = cue.start
    if (!this.paused) el.play().catch(() => { /* first gesture will retry */ })
    return { el, gain: 0, age: 0 }
  }
  startTrack(r, fade) {
    if (!r) return
    if (this.cur && (r.cue ? this.cur.cue === r.cue : this.cur.syn === r.syn)) return
    // Stop previous crossfade players immediately. Rapid cue changes cannot stack.
    this.stopTrack(0)
    if (r.syn) {
      const h = this.h[r.syn]
      if (!h) return
      h.volume(0); if (!this.paused) h.play()
      this.cur = { syn: r.syn, h, base: 0.22, fade: Math.max(0.1, fade / 1000), age: 0 }; return
    }
    const cue = r.cue
    this.cur = { cue, base: cue.gain * MUSIC_LEVEL, fade: Math.max(0.1, fade / 1000), tracks: [this.beginElement(cue)], looping: false }
  }
  updateMusic(dt) {
    const c = this.cur; if (!c) return
    if (c.syn) { c.age += dt; c.h.volume(this.level(c.base) * Math.min(1, c.age / c.fade)); return }
    const last = c.tracks[c.tracks.length - 1], el = last.el
    if (c.cue.loop !== false && !c.looping && Number.isFinite(el.duration) && el.duration > 0 && el.currentTime >= el.duration + c.cue.loopEnd - c.cue.xf) {
      c.looping = true; c.tracks.push(this.beginElement(c.cue))
    }
    for (let i = 0; i < c.tracks.length; i++) {
      const t = c.tracks[i]; if (!t.el.paused) t.age += dt
      const latest = i === c.tracks.length - 1
      t.gain = latest ? Math.min(1, t.age / (c.looping ? c.cue.xf : c.fade)) : Math.max(0, 1 - c.tracks[c.tracks.length - 1].age / c.cue.xf)
      t.el.volume = clamp(this.level(c.base) * t.gain * clamp(settings.master) * 0.65)
    }
    if (c.looping && c.tracks[0].gain === 0) { const old = c.tracks.shift(); this.releaseElement(old.el); c.looping = false }
    if (c.stopping) { c.stopAge += dt; const k = Math.max(0, 1 - c.stopAge / c.stopping); c.tracks.forEach(t => { t.el.volume *= k }); if (!k) this.stopTrack(0) }
  }
  releaseElement(el, unload = false) { el.pause(); if (unload) { el.removeAttribute('src'); el.load() } }
  stopTrack(fade = 0) {
    const c = this.cur
    if (!c) return
    if (fade > 0 && !c.syn) { c.stopping = fade / 1000; c.stopAge = 0; return }
    if (c.syn) c.h.stop()
    for (const t of c.tracks || []) this.releaseElement(t.el)
    this.cur = null
  }
  level(base) { return base * this.duckF() * clamp(settings.music) }
  refreshMusic() { if (!this.paused) this.updateMusic(0) }
  duckF() { return this.ducked ? DUCK : 1 }
  duck(on) {
    clearTimeout(this.unduckT)
    if (!on) { this.unduckT = this.defer(() => this.applyDuck(false), 600); return }
    this.applyDuck(true)
  }
  applyDuck(on) { this.ducked = on; this.refreshMusic() }
  setMaster(v) { settings.master = clamp(v) }
  pause(on) {
    if (this.paused === on || this.disposed) return
    this.paused = on
    if (on) {
      this.resumeSounds = []
      for (const e of this.effects) e.h.stop(e.id)
      this.effects = []
      for (const h of [...Object.values(this.h), ...Object.values(this.fx), ...this.voice.values()]) if (h.playing()) {
        // Only sustained beds and the single dialogue line survive a pause.
        const sid = this.curVoice?.h === h ? this.curVoice.sid : undefined
        this.resumeSounds.push({ h, sid }); h.pause(sid)
      }
      for (const t of this.cur?.tracks || []) t.el.pause()
    } else {
      for (const { h, sid } of this.resumeSounds || []) h.play(sid)
      this.resumeSounds = []; this.ensurePlaying()
    }
  }
  async releaseUnusedMusic(names) {
    const keep = new Set()
    const visit = name => { if (!name || keep.has(name)) return; keep.add(name); visit(MUSIC[name]?.fb) }
    names.forEach(visit)
    const retained = new Set((await Promise.all([...this.cues].filter(([name]) => keep.has(name)).map(([, pending]) => pending.catch(() => null)))).map(r => r?.cue).filter(Boolean))
    const released = new Set()
    for (const [name, pending] of this.cues) if (!keep.has(name)) {
      this.cues.delete(name)
      const r = await pending.catch(() => null)
      if (r?.cue && !retained.has(r.cue) && r.cue !== this.cur?.cue && !released.has(r.cue)) { released.add(r.cue); for (const el of r.cue.players) this.releaseElement(el, true); URL.revokeObjectURL(r.cue.url) }
    }
  }
  destroy() {
    if (this.disposed) return
    this.disposed = true; ++this.musicToken
    this.stopTrack(0); this.stopVoice()
    for (const id of this.timers) clearTimeout(id)
    for (const stop of this.unwatch || []) stop()
    for (const h of [...Object.values(this.h), ...Object.values(this.fx), ...this.voice.values()]) h.unload()
    for (const url of Object.values(this.synthUrls || {})) URL.revokeObjectURL(url)
    for (const pending of this.cues.values()) pending.then(r => { if (r?.cue) { for (const el of r.cue.players) this.releaseElement(el, true); URL.revokeObjectURL(r.cue.url) } }).catch(() => {})
    this.cues.clear(); if (activeAudio === this) activeAudio = null
  }
  hush() { this.stopVoice() }
}
