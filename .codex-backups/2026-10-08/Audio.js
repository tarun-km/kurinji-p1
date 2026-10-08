import { Howl, Howler } from 'howler'
import { watch } from 'vue'
import { settings } from './settings'
import { voiceKey } from './voiceKey'

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
const MUSIC_LEVEL = 0.9, DUCK = 0.5

/** Old synth names → generated sound-effect files (synth stays as fallback). */
const SFX_ALIAS = { swing: 'whoosh', hit: 'staff_hit', heavy: 'heavy_hit', hurt: 'hurt', dodge: 'dodge', pickup: 'petal', special: 'kurinji_breath', horn: 'war_horn', heartbeat: 'heartbeat', bell: 'bell' }
const SFX_VOL = { bell: 0.9, whoosh: 0.55, step_dirt: 0.3, step_stone: 0.3, petal: 0.7, ui_click: 0.5, ui_page: 0.6, ui_open: 0.5, war_horn: 0.85, thunder: 0.8, chicken: 0.4, goat: 0.4, crowd_rally: 0.8 }
export const AMB = ['amb_wind', 'amb_village', 'amb_night', 'amb_rain', 'amb_fire', 'amb_water', 'amb_fortress']
const BASE = import.meta.env.BASE_URL

export class Audio {
  constructor() {
    const urls = makeSounds()
    const loops = ['drone', 'battle', 'fire', 'theme', 'sorrow']
    const vol = { drone: 0.5, battle: 0.55, fire: 0.35, theme: 0.6, sorrow: 0.6, bell: 0.8 }
    this.h = {}
    this.synVol = vol
    for (const k in urls) this.h[k] = new Howl({ src: [urls[k]], format: ['wav'], loop: loops.includes(k), volume: vol[k] ?? 0.7 })
    this.music = null
    this.voices = []
    const pick = () => { this.voices = speechSynthesis?.getVoices?.() || [] }
    if (window.speechSynthesis) { pick(); speechSynthesis.onvoiceschanged = pick }
    // file-based sound effects + voice lines
    this.fx = {}; this.voice = new Map(); this.voiceIndex = new Set(); this.sfxIndex = new Set()
    this.amb = {}; this.ambTarget = {}
    this.ready = Promise.all([
      fetch(`${BASE}sfx/index.json`).then(r => r.json()).then(l => l.forEach(x => this.sfxIndex.add(x.id))).catch(() => {}),
      fetch(`${BASE}voice/index.json`).then(r => r.json()).then(l => l.forEach(x => this.voiceIndex.add(x))).catch(() => {}),
      fetch(`${BASE}voice/lines.json`).then(r => r.json()).then(l => { this.lines = l }).catch(() => { this.lines = [] }),
    ])
    Howler.volume(settings.master)
    watch(() => settings.master, v => Howler.volume(v))
    watch(() => settings.music, () => this.refreshMusic())
  }

  /* ---------------- sound effects ---------------- */
  /** Load sound-effect files (one-shots + ambience loops). */
  loadSfx(ids) {
    return Promise.all(ids.filter(id => this.sfxIndex.has(id)).map(id => {
      if (this.fx[id]) return this.fx[id].ready
      const h = this.fx[id] = new Howl({ src: [`${BASE}sfx/${id}.mp3`], loop: id.startsWith('amb_'), preload: true })
      h.ready = new Promise(r => { h.once('load', r); h.once('loaderror', r) })
      return h.ready
    }))
  }
  sfx(id, opts = {}) {
    id = SFX_ALIAS[id] || id
    const s = this.fx[id]
    const v = (opts.volume ?? 1) * (SFX_VOL[id] ?? 0.8) * settings.sfx
    if (s && s.state() === 'loaded') {
      const sid = s.play(); s.volume(v, sid)
      if (opts.rate) s.rate(opts.rate, sid)
      return sid
    }
    // fallback: synthesized version
    const syn = Object.keys(SFX_ALIAS).find(k => SFX_ALIAS[k] === id) || id
    const h = this.h[syn]; if (!h) return
    const sid = h.play(); h.volume(v * 0.8, sid); if (opts.rate) h.rate(opts.rate, sid)
    return sid
  }
  play(k, opts = {}) { return this.sfx(k, opts) }

  /* ---------------- ambience layers ---------------- */
  /** Set target level (0..1) for an ambience loop; levels ease in update(). */
  ambLevel(id, level) { this.ambTarget[id] = level }
  ambience(k, on) { this.ambLevel(k === 'fire' ? 'amb_fire' : k, on ? 0.8 : 0) }
  update(dt) {
    for (const id of AMB) {
      const s = this.fx[id]; if (!s || s.state() !== 'loaded') continue
      const target = (this.ambTarget[id] || 0) * settings.ambience
      const cur = this.amb[id] ?? 0
      const next = cur + (target - cur) * Math.min(1, dt * 1.5)
      this.amb[id] = next
      if (next > 0.004 && !s.playing()) { s.volume(0); s.play() }
      if (s.playing()) { s.volume(next); if (next < 0.003 && target === 0) s.stop() }
    }
  }

  /* ---------------- voice lines ---------------- */
  hasVoice(speaker, text) { return this.voiceIndex.has(voiceKey(speaker, text)) }
  /** Preload the voice clips for a chapter (+ shared barks); unload the rest. */
  loadVoices(chapter) {
    const want = new Set((this.lines || []).filter(l => l.chapter === chapter || l.chapter === 'shared').map(l => l.id))
    for (const [id, h] of this.voice) if (!want.has(id)) { h.unload(); this.voice.delete(id) }
    return Promise.all([...want].filter(id => this.voiceIndex.has(id)).map(id => {
      if (this.voice.has(id)) return this.voice.get(id).ready
      const h = new Howl({ src: [`${BASE}voice/${id}.mp3`], preload: true })
      h.ready = new Promise(r => { h.once('load', r); h.once('loaderror', r) })
      this.voice.set(id, h); return h.ready
    }))
  }
  /**
   * Speak a line: the ElevenLabs clip when present, otherwise the browser voice.
   * Returns { duration, ended: Promise }.
   */
  say(speaker, text, voiceDef, { whisper = false } = {}) {
    this.stopVoice()
    if (!settings.voiceActing) return { duration: 0, ended: Promise.resolve(), silent: true }
    const id = voiceKey(speaker, text)
    let h = this.voice.get(id)
    if (!h && this.voiceIndex.has(id)) { h = new Howl({ src: [`${BASE}voice/${id}.mp3`] }); this.voice.set(id, h) }
    if (h) {
      const sid = h.play(); h.volume((whisper ? 0.85 : 1) * settings.voice, sid)
      this.curVoice = { h, sid }
      const ended = new Promise(r => { h.once('end', r, sid); h.once('stop', r, sid); h.once('playerror', r, sid) })
      return { duration: h.duration() || text.length / 14, ended }
    }
    this.speak(text, voiceDef)
    return { duration: text.length / 14, ended: new Promise(r => setTimeout(r, text.length * 70)) }
  }
  stopVoice() { if (this.curVoice) { this.curVoice.h.stop(this.curVoice.sid); this.curVoice = null } this.hush() }

  /* ---------------- music ---------------- */
  /** Switch background music to a cue name (see MUSIC) or null for silence. */
  setMusic(name, fade = 2000) {
    if (this.music === name) return
    this.music = name
    const token = this.musicToken = (this.musicToken || 0) + 1
    if (!name) { this.stopTrack(fade); return }
    this.resolve(name).then(r => { if (token === this.musicToken) this.startTrack(r, fade) })
  }
  preload(names) { return Promise.all(names.map(n => this.resolve(n))) }
  /** Restart the current track if the browser blocked it before the first user gesture. */
  ensurePlaying() {
    const c = this.cur, n = this.music, t = c?.tracks[c.tracks.length - 1]
    if (!n || (t && t.howl.playing(t.id))) return
    this.music = null; this.setMusic(n, 1500)
  }
  resolve(name) {
    if (name.startsWith('syn:')) return Promise.resolve({ syn: name.slice(4) })
    const cue = MUSIC[name]
    if (!cue) return Promise.resolve(this.h[name] ? { syn: name } : null)
    return this.loadCue(cue).then(ok => ok ? { cue } : this.resolve(cue.fb))
  }
  streamHowl(cue, extra = {}) {
    return new Howl({ src: [`${BASE}audio/${cue.file}.mp3`], html5: true, preload: true, ...extra })
  }
  loadCue(cue) {
    cue.ready ??= new Promise(res => {
      const done = ok => { clearTimeout(t); res(ok) }
      const t = setTimeout(() => done(!cue.missing), 8000) // slow network: try anyway
      cue.players = [this.streamHowl(cue, { onload: () => done(true), onloaderror: () => { cue.missing = true; done(false) } })]
    })
    return cue.ready
  }
  stopTrack(fade) {
    const c = this.cur; this.cur = null
    if (!c) return
    clearInterval(c.timer)
    for (const t of c.tracks) { t.howl.fade(t.howl.volume(), 0, fade); setTimeout(() => t.howl.stop(t.id), fade + 60) }
  }
  level(base) { return base * this.duckF() * settings.music }
  /**
   * Each Howl plays one sound at a time, so its group volume is that sound's volume.
   * Volume is set to 0 before play() and the fade starts on the 'play' event —
   * streamed (html5) sounds ignore volume/seek calls made while playback is starting.
   */
  begin(howl, base, len, seekTo = 0) {
    howl.stop(); howl.volume(0)
    const id = howl.play()
    howl.once('play', () => { if (seekTo) howl.seek(seekTo, id); howl.fade(0, this.level(base), len) }, id)
    return { howl, id }
  }
  startTrack(r, fade) {
    const same = this.cur && r && (r.cue ? this.cur.cue === r.cue : this.cur.syn === r.syn)
    if (same) return // a fallback resolved to what's already playing — keep it going
    this.stopTrack(fade)
    if (!r) return
    if (r.syn) {
      const howl = this.h[r.syn], base = this.synVol[r.syn] ?? 0.5
      this.cur = { syn: r.syn, base, tracks: [this.begin(howl, base, fade)] }
      return
    }
    const { cue } = r, base = cue.gain * MUSIC_LEVEL
    const c = this.cur = { cue, base, tracks: [this.begin(cue.players[0], base, fade, cue.start)] }
    if (cue.loop === false) return
    cue.players[1] ??= this.streamHowl(cue) // second player for the loop crossfade
    // crossfade-loop: start the other player just before the outro, fade the old one out
    c.timer = setInterval(() => {
      const t = c.tracks[c.tracks.length - 1], pos = t.howl.seek(t.id), dur = t.howl.duration()
      if (typeof pos !== 'number' || !dur || pos < dur + cue.loopEnd - cue.xf) return
      const xf = cue.xf * 1000, next = cue.players[t.howl === cue.players[0] ? 1 : 0]
      c.tracks = [t, this.begin(next, base, xf, cue.start)]
      t.howl.fade(t.howl.volume(), 0, xf)
      setTimeout(() => { t.howl.stop(t.id); c.tracks = c.tracks.filter(x => x !== t) }, xf + 60)
    }, 200)
  }
  refreshMusic() { const c = this.cur; if (!c) return; const t = c.tracks[c.tracks.length - 1]; t.howl.fade(t.howl.volume(), this.level(c.base), 300) }
  duckF() { return this.ducked ? DUCK : 1 }
  /** Lower the music while someone is speaking (release is delayed so lines in a row don't pump). */
  duck(on) {
    clearTimeout(this.unduckT)
    if (!on) { this.unduckT = setTimeout(() => this.applyDuck(false), 900); return }
    this.applyDuck(true)
  }
  applyDuck(on) {
    if (this.ducked === on) return
    this.ducked = on
    this.refreshMusic()
  }
  setMaster(v) { Howler.volume(v) }

  // ---- fallback: browser speech when no recorded clip exists ----
  speak(text, voiceDef = {}) {
    if (!window.speechSynthesis) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/[*_]/g, ''))
    const en = this.voices.filter(v => /^en/i.test(v.lang))
    const pref = en.find(v => (voiceDef.female ? /female|zira|samantha|susan|hazel|heera|google uk english female/i : /male|david|daniel|george|ravi|google uk english male/i).test(v.name))
    if (pref || en[0]) u.voice = pref || en[0]
    u.pitch = voiceDef.pitch ?? 1
    u.rate = voiceDef.rate ?? 0.95
    u.volume = 0.9 * settings.voice
    speechSynthesis.speak(u)
  }
  hush() { window.speechSynthesis?.cancel() }
}
