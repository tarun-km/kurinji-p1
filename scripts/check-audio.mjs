/**
 * Focused mixer regressions. The production Audio class and cue metadata run
 * unchanged; only browser/audio I/O is replaced with deterministic adapters.
 * Run with: node scripts/check-audio.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import { voiceKey } from '../src/game/voiceKey.js'
import { runTasks } from '../src/game/assets.js'

const sourceUrl = new URL('../src/game/Audio.js', import.meta.url)
const source = (await readFile(sourceUrl, 'utf8'))
  .replace(/^import .*\r?\n/gm, '')
  .replaceAll('import.meta.env.BASE_URL', "''")
  .replace(/^export /gm, '')
const program = new vm.Script(`${source}\nglobalThis.AudioUnderTest = Audio`, { filename: sourceUrl.pathname })

const spoken = {
  prologue: { speaker: 'aruvan', text: 'I am here.' },
  ch1: { speaker: 'guru', text: 'The mountain remembers.' },
  shared: { speaker: 'soldier', text: 'Hold the gate.' },
  ch2: { speaker: 'thamarai', text: 'The village needs you.' },
}
for (const line of Object.values(spoken)) line.id = voiceKey(line.speaker, line.text)
const effectIds = ['staff_hit', 'whoosh', 'heavy_hit', 'hurt', 'dodge', 'petal', 'kurinji_breath', 'war_horn']
const ambienceIds = ['amb_wind', 'amb_village', 'amb_night', 'amb_rain', 'amb_fire', 'amb_water', 'amb_fortress']

async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve() }
function mixFor(audio, seconds) { for (let left = seconds; left > 0; left -= 0.05) audio.update(Math.min(left, 0.05)) }

function harness({ missingVoices = [] } = {}) {
  const env = { now: 1000, howls: [], media: [], events: [], urls: new Map(), revoked: [], requests: [], timers: new Map(), watchers: [], compressorCount: 0, nextSound: 0, nextTimer: 0, nextUrl: 0 }
  const settings = { master: 1, music: 1, voice: 1, sfx: 1, ambience: 1, voiceActing: true }
  const record = (kind, data = {}) => env.events.push({ kind, ...data })

  class Howl {
    constructor(options) {
      this.options = options; this.src = options.src[0]; this.groupVolume = options.volume ?? 1
      this.sounds = new Map(); this.listeners = []; this.status = 'unloaded'; this.unloaded = false
      env.howls.push(this); record('howl-create', { h: this, volume: this.groupVolume })
      if (options.preload !== false) this.load()
    }
    load() {
      this.status = 'loading'
      queueMicrotask(() => {
        if (this.unloaded) return
        this.status = 'loaded'; this.emit('load'); this.options.onload?.()
      })
      return this
    }
    once(event, fn, id) { this.listeners.push({ event, fn, id, once: true }); return this }
    off(event, fn, id) { this.listeners = this.listeners.filter(l => !(l.event === event && l.fn === fn && (id == null || l.id === id))); return this }
    emit(event, id) {
      const matching = this.listeners.filter(l => l.event === event && (l.id == null || l.id === id))
      for (const l of matching) { if (l.once) this.off(event, l.fn, l.id); l.fn(id) }
    }
    volume(value, id) {
      if (value == null) return id == null ? this.groupVolume : this.sounds.get(id)?.volume
      if (id != null) { const sound = this.sounds.get(id); if (sound) sound.volume = value }
      else { this.groupVolume = value; for (const sound of this.sounds.values()) sound.volume = value }
      record('howl-volume', { h: this, id, volume: value }); return this
    }
    rate(value) { this.playbackRate = value; return this }
    play(id) {
      if (id == null) { id = ++env.nextSound; this.sounds.set(id, { id, position: 0, volume: this.groupVolume, playing: false }) }
      const sound = this.sounds.get(id)
      assert.ok(sound, 'resuming a sound must use a valid existing playback ID')
      sound.playing = true; record('howl-play', { h: this, id, volume: sound.volume, position: sound.position }); return id
    }
    playing(id) { return id == null ? [...this.sounds.values()].some(s => s.playing) : !!this.sounds.get(id)?.playing }
    pause(id) { for (const sound of this.sounds.values()) if (id == null || sound.id === id) { sound.playing = false; record('howl-pause', { h: this, id: sound.id }) } }
    stop(id) { for (const sound of this.sounds.values()) if (id == null || sound.id === id) { sound.playing = false; sound.position = 0; record('howl-stop', { h: this, id: sound.id }); this.emit('stop', sound.id) } }
    unload() { this.stop(); this.unloaded = true; this.status = 'unloaded'; this.listeners = []; record('howl-unload', { h: this }); return null }
    state() { return this.status }
    duration() { return 4 }
  }

  class MediaElement {
    constructor(src) { this.src = src; this.volume = 1; this.paused = true; this.currentTime = 0; this.duration = 120; this.listeners = []; env.media.push(this) }
    addEventListener(event, fn, options) { this.listeners.push({ event, fn, once: options?.once }) }
    removeEventListener(event, fn) { this.listeners = this.listeners.filter(l => l.event !== event || l.fn !== fn) }
    load() {
      if (!this.src) return
      queueMicrotask(() => {
        for (const l of [...this.listeners].filter(l => l.event === 'canplaythrough')) { if (l.once) this.removeEventListener(l.event, l.fn); l.fn() }
      })
    }
    play() { this.paused = false; record('media-play', { el: this, volume: this.volume, position: this.currentTime }); return Promise.resolve() }
    pause() { this.paused = true; record('media-pause', { el: this }) }
    removeAttribute(name) { if (name === 'src') this.src = '' }
  }

  const masterGain = { disconnect() { record('master-disconnect') }, connect(to) { record('master-connect', { to }) } }
  const Howler = {
    masterGain,
    ctx: {
      destination: {}, resume: () => Promise.resolve(),
      createDynamicsCompressor() {
        env.compressorCount++
        return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(to) { record('limiter-connect', { to }) } }
      },
    },
    volume(value) { env.masterVolume = value; record('master-volume', { volume: value }) },
  }
  const watch = (getter, fn) => {
    const entry = { getter, fn, value: getter(), active: true }; env.watchers.push(entry)
    return () => { entry.active = false }
  }
  env.setSetting = (key, value) => {
    settings[key] = value
    for (const watcher of env.watchers.filter(w => w.active)) { const next = watcher.getter(); if (next !== watcher.value) { watcher.value = next; watcher.fn(next) } }
  }
  env.advance = ms => {
    env.now += ms
    for (const [id, timer] of [...env.timers]) if (timer.due <= env.now) { env.timers.delete(id); timer.fn() }
  }
  const fetchAsset = async (path, type = 'blob') => {
    env.requests.push(path)
    if (path === 'sfx/index.json') return [...effectIds, ...ambienceIds].map(id => ({ id }))
    if (path === 'voice/index.json') return Object.values(spoken).map(l => l.id).filter(id => !missingVoices.includes(id))
    if (path === 'voice/lines.json') return Object.entries(spoken).map(([chapter, line]) => ({ chapter, id: line.id }))
    assert.equal(type, 'blob', `unknown JSON fixture: ${path}`)
    return { path }
  }
  const context = vm.createContext({
    Howl, Howler, settings, watch, voiceKey, fetchAsset, runTasks, Blob,
    console, queueMicrotask, performance: { now: () => env.now }, window: { Audio: MediaElement },
    URL: {
      createObjectURL(blob) { const url = `blob:audio-test/${++env.nextUrl}`; env.urls.set(url, blob); return url },
      revokeObjectURL(url) { env.revoked.push(url) },
    },
    setTimeout(fn, ms) { const id = ++env.nextTimer; env.timers.set(id, { fn, due: env.now + ms }); return id },
    clearTimeout(id) { env.timers.delete(id) },
  })
  program.runInContext(context)
  env.Audio = context.AudioUnderTest; env.settings = settings
  env.create = async () => { const audio = new env.Audio(); await audio.ready; return audio }
  env.playingEffects = () => env.howls.filter(h => h.src.startsWith('sfx/') && !h.options.loop).flatMap(h => [...h.sounds.values()].filter(s => s.playing).map(s => ({ h, ...s })))
  return env
}

test('sounds begin below full gain; music begins muted and ambience has a shared budget', async t => {
  const env = harness(), audio = await env.create(); t.after(() => audio.destroy())
  await audio.loadSfx(['staff_hit', ...ambienceIds]); await audio.loadVoices('prologue')
  audio.sfx('hit'); audio.say(spoken.prologue.speaker, spoken.prologue.text)
  for (const id of ambienceIds) audio.ambLevel(id, 1)
  audio.update(1)
  const starts = env.events.filter(e => e.kind === 'howl-play')
  assert.ok(starts.length > 2, 'the fixture must exercise one-shots, speech, and ambient loops')
  for (const start of starts) assert.ok(start.volume >= 0 && start.volume <= 0.7, `${start.h.src} began at unsafe gain ${start.volume}`)
  const ambientGain = env.howls.filter(h => h.options.loop && h.src.startsWith('sfx/')).reduce((sum, h) => sum + h.volume(), 0)
  assert.ok(ambientGain <= 0.4, `simultaneous ambient beds exceeded their combined gain budget: ${ambientGain}`)
  assert.ok(env.masterVolume > 0 && env.masterVolume < 1, 'full slider output still needs master headroom')
  assert.equal(env.compressorCount, 1, 'the Howler output must have one limiter')
  audio.setMusic('main_theme', 0); await flush(); audio.update(1)
  const musicStart = env.events.find(e => e.kind === 'media-play')
  assert.ok(musicStart, 'cached music must start after its buffer becomes ready')
  assert.equal(musicStart.volume, 0, 'native music must be muted before play, including the first frame')
  assert.ok(musicStart.el.volume > 0 && musicStart.el.volume <= 0.4, 'music should fade into a quiet category mix')
})

test('repeated combat bursts never exceed six effects or two copies of one sound', async t => {
  const env = harness(), audio = await env.create(); t.after(() => audio.destroy())
  await audio.loadSfx(effectIds)
  for (let i = 0; i < 24; i++) {
    env.advance(80); audio.sfx(effectIds[i % effectIds.length])
    const active = env.playingEffects()
    assert.ok(active.length <= 6, `combat burst left ${active.length} sounds playing`)
    for (const h of new Set(active.map(s => s.h))) assert.ok(active.filter(s => s.h === h).length <= 2, `too many simultaneous copies of ${h.src}`)
  }
  for (let i = 0; i < 4; i++) { env.advance(80); audio.sfx('hit') }
  assert.equal(env.playingEffects().filter(s => s.h.src === 'sfx/staff_hit.mp3').length, 2)
  audio.pause(true); audio.pause(false)
  assert.equal(env.playingEffects().length, 0, 'short combat sounds must not replay on resume')
})

test('pause resumes the same spoken playback ID and does not finish the line early', async t => {
  const env = harness(), audio = await env.create(); t.after(() => audio.destroy())
  await audio.loadVoices('prologue')
  const line = audio.say(spoken.prologue.speaker, spoken.prologue.text), voice = audio.curVoice
  let ended = false; line.ended.then(() => { ended = true })
  voice.h.sounds.get(voice.sid).position = 1.75
  audio.pause(true); await flush()
  assert.equal(ended, false, 'pausing speech must not trigger dialogue advancement')
  assert.equal(voice.h.playing(), false)
  audio.pause(false); await flush()
  const plays = env.events.filter(e => e.kind === 'howl-play' && e.h === voice.h)
  assert.equal(plays.length, 2)
  assert.equal(plays[1].id, plays[0].id, 'resume must continue the voice, not create another instance')
  assert.equal(plays[1].position, 1.75, 'resume must keep the spoken position')
  assert.equal(voice.h.sounds.size, 1)
  voice.h.emit('end', voice.sid); await line.ended
  assert.equal(ended, true)
  const replacement = audio.say(spoken.prologue.speaker, spoken.prologue.text)
  env.setSetting('voiceActing', false); await replacement.ended
  assert.equal(voice.h.playing(), false, 'turning voices off must stop the current line')
})

test('replacing an audio scene releases its media, synth URLs, subscriptions, and timers', async t => {
  const env = harness(), first = await env.create()
  await first.ensureSynth(); await first.loadSfx(['staff_hit']); await first.loadVoices('prologue')
  first.sfx('hit'); first.say(spoken.prologue.speaker, spoken.prologue.text)
  first.setMusic('main_theme', 0); await flush(); first.update(1); first.duck(false)
  const oldHowls = [...env.howls], oldMedia = [...env.media], oldUrls = [...env.urls.keys()], oldWatchers = [...env.watchers]
  let abandonedTimerRan = false; first.defer(() => { abandonedTimerRan = true }, 100)
  const second = await env.create(); t.after(() => second.destroy()); await flush(); env.advance(1000)
  assert.equal(first.disposed, true, 'only one live audio scene may own the output')
  assert.ok(oldHowls.every(h => h.unloaded), 'all old decoded clips must unload')
  assert.ok(oldMedia.every(el => el.paused && !el.src), 'all old native players must release their source')
  assert.ok(oldUrls.every(url => env.revoked.includes(url)), 'old cached URLs must be revoked')
  assert.ok(oldWatchers.every(w => !w.active), 'old settings subscriptions must be removed')
  assert.equal(abandonedTimerRan, false, 'old deferred audio work must be cancelled')
  assert.equal(env.timers.size, 0)
  assert.equal(env.compressorCount, 1, 'scene replacement must reuse the existing limiter')
  second.destroy(); second.destroy(); await flush()
  assert.ok(env.watchers.every(w => !w.active), 'destroy should remain safe when called twice')
})

test('disabling spoken dialogue in the pause menu cannot resurrect the paused line', async t => {
  const env = harness(), audio = await env.create(); t.after(() => audio.destroy())
  await audio.loadVoices('prologue')
  const line = audio.say(spoken.prologue.speaker, spoken.prologue.text), voice = audio.curVoice
  audio.pause(true); env.setSetting('voiceActing', false); await line.ended
  audio.pause(false); await flush()
  assert.equal(voice.h.playing(), false, 'a voice stopped from settings must not reappear on resume')
  assert.equal(audio.curVoice, null, 'disabled speech should leave no active dialogue handle')
})

test('music fallbacks share buffered media and stay valid when another alias is evicted', async t => {
  const env = harness(), audio = await env.create(); t.after(() => audio.destroy())
  const credits = await audio.resolve('credits'), bloom = await audio.resolve('bloom'), battle = await audio.resolve('battle')
  assert.equal(credits.cue, bloom.cue, 'aliases of one score must share its buffer')
  assert.equal(env.requests.filter(path => path === 'audio/music_01_main_theme.mp3').length, 1, 'a shared score must download only once')
  assert.equal(env.requests.some(path => /music_(11|13)_/.test(path)), false, 'missing optional scores must resolve to their local fallback')
  audio.setMusic('credits', 0); await flush(); audio.update(1)
  const activePlayer = credits.cue.players.find(el => !el.paused); activePlayer.currentTime = 17
  await audio.releaseUnusedMusic(['bloom'])
  assert.equal(env.revoked.includes(credits.cue.url), false, 'retaining any alias must keep its shared URL alive')
  assert.equal(env.revoked.includes(battle.cue.url), true, 'unused scores must release their cached URL')
  audio.setMusic('bloom', 0); await flush()
  assert.equal(activePlayer.currentTime, 17, 'switching names for the same score must not restart it')
  audio.setMusic(null, 0); await audio.releaseUnusedMusic([])
  assert.equal(env.revoked.includes(credits.cue.url), true, 'the shared score must release after its last use')
  assert.ok(env.media.every(el => el.paused && !el.src))
})

test('looping music crossfades between two reusable players without stacking playback', async t => {
  const env = harness(), audio = await env.create(); t.after(() => audio.destroy())
  audio.setMusic('mountain', 0); await flush(); audio.update(1)
  const players = [...env.media], startingPosition = players[0].currentTime
  assert.equal(players.length, 2, 'the score should buffer one pair of native players')
  players[0].currentTime = 119; audio.update(0.25)
  assert.equal(players.filter(el => !el.paused).length, 2, 'both players must overlap near the loop boundary')
  const secondStart = env.events.filter(e => e.kind === 'media-play').at(-1)
  assert.equal(secondStart.volume, 0, 'the second loop player must enter muted')
  assert.equal(secondStart.position, startingPosition, 'the next loop should return to its lead-in offset')
  audio.update(1)
  assert.ok(players.every(el => el.volume > 0), 'both sides of the loop crossfade must contribute')
  audio.pause(true); assert.ok(players.every(el => el.paused)); audio.pause(false)
  assert.equal(players.filter(el => !el.paused).length, 2, 'resuming during a crossfade must keep its existing pair')
  mixFor(audio, 4)
  assert.equal(players.filter(el => !el.paused).length, 1, 'the outgoing player must stop at the end of the crossfade')
  for (let i = 0; i < 6; i++) {
    players.find(el => !el.paused).currentTime = 119; audio.update(0.1); mixFor(audio, 4)
    assert.equal(env.media.length, 2, 'successive loops must reuse the pair instead of creating players')
    assert.equal(players.filter(el => !el.paused).length, 1)
  }
  players.find(el => !el.paused).currentTime = 119; audio.update(0.1)
  audio.setMusic('battle', 0); await flush(); audio.update(1)
  assert.ok(players.every(el => el.paused), 'cue replacement must stop both previous crossfade players')
  assert.equal(env.media.filter(el => !el.paused).length, 1, 'rapid cue changes must leave only the new score playing')
})

test('chapter voice loading keeps shared lines, unloads old dialogue, and never fetches during say', async t => {
  const env = harness(), audio = await env.create(); t.after(() => audio.destroy())
  await audio.loadVoices('prologue')
  assert.equal(audio.voice.size, 2)
  assert.ok(audio.voice.has(spoken.prologue.id) && audio.voice.has(spoken.shared.id))
  assert.equal(audio.voice.has(spoken.ch1.id), false, 'future chapter dialogue should not occupy this session')
  const oldVoice = audio.voice.get(spoken.prologue.id), sharedVoice = audio.voice.get(spoken.shared.id)
  await audio.loadVoices('ch1')
  assert.equal(oldVoice.unloaded, true, 'past chapter speech must release its decoded audio')
  assert.equal(audio.voice.get(spoken.shared.id), sharedVoice, 'shared barks should remain cached')
  assert.ok(audio.voice.has(spoken.ch1.id)); assert.equal(audio.voice.size, 2)
  const before = env.requests.length
  const missingFromSession = audio.say(spoken.ch2.speaker, spoken.ch2.text)
  await missingFromSession.ended
  assert.equal(missingFromSession.silent, true)
  assert.equal(env.requests.length, before, 'speaking cannot introduce a runtime download')
  assert.equal(env.howls.filter(h => h.src === `voice/${spoken.shared.id}.mp3`).length, 1, 'shared dialogue must decode only once')
})

test('a missing recorded chapter line fails preparation rather than pretending to preload it', async t => {
  const env = harness({ missingVoices: [spoken.ch1.id] }), audio = await env.create(); t.after(() => audio.destroy())
  await assert.rejects(audio.loadVoices('ch1'), /Missing recorded dialogue/, 'a missing voice must reach the chapter loading recovery UI')
  assert.equal(audio.voice.has(spoken.ch1.id), false)
})
