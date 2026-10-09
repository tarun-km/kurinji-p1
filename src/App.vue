<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import gsap from 'gsap'
import { state, ui, load, isComplete } from './game/store'
import { Game } from './game/Game'
import { CHAPTER_NAMES } from './game/story'
import { settings, applyPreset, resetSettings, isMobile } from './game/settings'
import TitleScreen from './ui/TitleScreen.vue'
import LoadingScreen from './ui/LoadingScreen.vue'
import Logo from './ui/Logo.vue'
import { loadShots } from './ui/shots'

const host = ref(null), joyZone = ref(null)
let game = null, mounted = true
const ready = ref(false)
const saveData = ref(load())
const showChapters = ref(false)
const completed = ref(isComplete())
// mobile: landscape + fullscreen notice and the install-as-app button
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const canInstall = ref(!!window.__installPrompt)
const iosHint = ref(false)
const onInstallable = () => { canInstall.value = true }
async function installApp() {
  const prompt = window.__installPrompt
  if (prompt) { prompt.prompt(); const r = await prompt.userChoice.catch(() => null); if (r?.outcome === 'accepted') { canInstall.value = false; window.__installPrompt = null } return }
  if (isIOS) iosHint.value = !iosHint.value
}
const showSettings = ref(false), showCredits = ref(false), launching = ref(false)
const settingsTab = ref('graphics'), settingsPanel = ref(null), cutsceneVideo = ref(null), creditsPanel = ref(null)
const portrait = ref(innerHeight > innerWidth), rotateDismissed = ref(false)
const tabs = ['graphics', 'audio', 'story', 'camera']
const audioControls = [['master', 'Master'], ['music', 'Music'], ['voice', 'Voices'], ['sfx', 'Sound effects'], ['ambience', 'Ambience']]
const credits = [
  ['Story & Characters', 'Tarun KM'], ['Music', 'Gemini'], ['Coding', 'Claude'],
  ['Character Visualizations & Visuals', 'ChatGPT'], ['Cut scenes', 'Stable Diffusion'], ['Voices', 'ElevenLabs'],
]
// loading screens play in-game shots from public/art/shots/index.json (see src/ui/shots.js),
// falling back to each chapter's story painting
loadShots()
const BASE = import.meta.env.BASE_URL
state.mobile = isMobile

function updateOrientation() { portrait.value = innerHeight > innerWidth }
const isFullscreen = ref(false)
const onFullscreen = () => { isFullscreen.value = !!(document.fullscreenElement || document.webkitFullscreenElement) }
async function toggleFullscreen() {
  try {
    if (isFullscreen.value) await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
    else await requestLandscape(true)
  } catch {}
}
// Fullscreen and orientation-lock promises can stay pending forever on some phones, so callers must
// never wait on them: this resolves after at most 800ms while the request carries on in the background.
function requestLandscape(force = false) {
  if (!state.mobile && !force) return Promise.resolve()
  const el = document.documentElement
  const run = async () => {
    try { if (!document.fullscreenElement && !document.webkitFullscreenElement) await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.()) } catch {}
    try { await screen.orientation?.lock?.('landscape') } catch {}
  }
  return Promise.race([run(), new Promise(resolve => setTimeout(resolve, 800))])
}
const kick = () => game?.audio?.ensurePlaying()

onMounted(async () => {
  addEventListener('resize', updateOrientation)
  addEventListener('kurinji-installable', onInstallable)
  document.addEventListener('fullscreenchange', onFullscreen); document.addEventListener('webkitfullscreenchange', onFullscreen)
  addEventListener('keydown', onKey, true)
  Object.assign(state, { screen: 'title', paused: false, showJournal: false, cutscene: null, dialogue: null, choices: null, card: null, caption: '', prompt: '', deathMsg: '', fade: 0, breathingPrompt: false })
  ui.retryLoad = null
  state.loading = { title: 'Kurinji', sub: 'The Last Bloom', art: `${BASE}art/story12-sm.webp`, progress: 0, label: 'Raising the mountain…', error: '' }
  try {
    game = new Game(host.value)
    await game.init()
    if (!mounted) { game.destroy?.(); return }
    window.__game = game
    window.__view = (pos, look, time) => { state.screen = 'dev'; game.cine(true); state.letterbox = false; game.shot(pos, look, 0); if (time) game.world.setTime(time, 0) }
    game.cine(true); state.letterbox = false
    game.world.setTime('bloom', 0); game.world.setBloom(0.75); game.world.setPetals(0.7)
    // title: the last-bloom poster — Aruvan meditating on the rock above the violet valley
    {
      const R = game.world.rockTop, monk = game.npc('titleMonk', 'aruvanOld', R.x, R.z, 0.15)
      monk.char.sustain = 'meditate'; monk.lookAtPlayer = false; monk.pos.y = R.y
      game.shot([R.x + 2.4, R.y + 1.9, R.z - 4.4], [R.x - 5, R.y - 6, R.z + 40], 0, 'none', { fov: 46 })
      game.shot([R.x + 4.6, R.y + 4.6, R.z - 8.2], [R.x - 6, R.y - 8, R.z + 44], 50, 'sine.inOut', { fov: 50 })
    }
    game.player.setPos(0, -200)
    state.loading = null; ready.value = true
    if (state.mobile) game.input.initJoystick(joyZone.value)
    game.music('main_theme')
    addEventListener('pointerdown', kick, { once: true }); addEventListener('keydown', kick, { once: true })
  } catch (error) {
    if (!mounted) return
    console.error('Kurinji could not start:', error)
    game?.destroy?.()
    state.loading = { title: 'The mountain could not load', sub: 'Your saved journey is safe.', art: '/art/story01.webp', progress: 0, label: '', error: `${error?.message || 'The game could not prepare its assets.'} Reload to try again.` }
    ui.retryLoad = () => location.reload()
  }
})

async function begin(ch = 0) {
  if (!ready.value || launching.value || state.loading) return
  launching.value = true
  requestLandscape() // fire and forget: starting the story must not wait on the browser's fullscreen prompt
  game.audio.ensurePlaying()
  showChapters.value = false
  try {
    game.audio.play('bell', { volume: 0.5 })
    await game.fade(1, 1.2)
    game.world.setBloom(0); game.world.setPetals(0); game.dropNpc('titleMonk')
    game.cine(false)
    await game.start(ch)
  } catch (error) {
    if (!mounted) return
    console.error('The journey could not begin:', error)
    if (!state.loading?.error) {
      state.loading = { title: 'This chapter could not load', sub: CHAPTER_NAMES[ch], art: '/art/story01.webp', progress: 0, label: '', error: 'Reload to return to your saved journey and try again.' }
      ui.retryLoad = () => location.reload()
    }
  } finally { launching.value = false }
}

async function beginFreeRoam() {
  if (!ready.value || launching.value || state.loading || !completed.value) return
  launching.value = true
  requestLandscape()
  game.audio.ensurePlaying()
  showChapters.value = false
  try {
    game.audio.play('bell', { volume: 0.5 })
    await game.fade(1, 1.2)
    game.world.setBloom(0); game.world.setPetals(0); game.dropNpc('titleMonk')
    game.cine(false)
    await game.freeRoam()
  } catch (error) {
    if (!mounted) return
    console.error('Free roam could not begin:', error)
    state.loading = { title: 'Free roam could not load', sub: 'Your saved journey is safe.', art: '/art/story11.webp', progress: 0, label: '', error: 'Reload to try again.' }
    ui.retryLoad = () => location.reload()
  } finally { launching.value = false }
}

// ---------- dialogue typewriter ----------
const typed = ref(''), typing = ref(false)
let typeTimer = null, typePosition = 0
let currentDialogue = null
watch(() => [state.dialogue, state.dialogue?.duration, settings.textSpeed], ([d]) => {
  clearInterval(typeTimer)
  if (!d) { typed.value = ''; typing.value = false; currentDialogue = null; return }
  if (d !== currentDialogue) { currentDialogue = d; typePosition = 0; typed.value = ''; typing.value = true }
  if (!typing.value) return
  const duration = Number(d.duration)
  const interval = Math.max(12, Math.min(70, Number.isFinite(duration) && duration > 0 ? duration * 850 / Math.max(1, d.text.length) : 24)) / settings.textSpeed
  typeTimer = setInterval(() => {
    if (state.paused || state.showJournal || state.loading || state.cutscene) return
    typePosition += 1; typed.value = d.text.slice(0, typePosition)
    if (typePosition >= d.text.length) { clearInterval(typeTimer); typing.value = false }
  }, interval)
})
function advance() {
  if (!state.dialogue || state.paused || state.loading || state.cutscene) return
  if (typing.value && settings.subtitles) { clearInterval(typeTimer); typed.value = state.dialogue.text; typing.value = false; return }
  ui.advance?.()
}
function choose(i) { if (!state.paused && !state.loading && !state.cutscene) ui.choose?.(i) }
function breathe() { if (ui.breathe) { breathPulse(); ui.breathe() } }
const breathScale = ref(1)
function breathPulse() { gsap.fromTo(breathScale, { value: 1 }, { value: 1.8, duration: 1.4, yoyo: true, repeat: 1, ease: 'sine.inOut' }) }

function openSettings() {
  showSettings.value = true
  if (state.screen === 'game') { state.paused = true; document.exitPointerLock?.() }
}
function openPause() {
  if (state.loading || state.screen !== 'game') return
  state.paused = true; document.exitPointerLock?.()
}
watch(portrait, value => { if (value && state.mobile && state.screen === 'game') openPause() })
function resume() {
  showSettings.value = false
  if (ui.resume) ui.resume()
  else state.paused = false
}
let priorFocus = null
watch(() => state.paused || showSettings.value, async open => {
  if (open) { priorFocus = document.activeElement; await nextTick(); settingsPanel.value?.querySelector('button')?.focus() }
  else priorFocus?.focus?.()
})
// credits opened from the title: move focus in, and back to the Credits entry on close
let creditsFocus = null
watch(showCredits, async open => {
  if (open) { creditsFocus = document.activeElement; await nextTick(); creditsPanel.value?.querySelector('button')?.focus({ preventScroll: true }) }
  else creditsFocus?.focus?.({ preventScroll: true })
})
watch(() => state.paused, paused => {
  const video = cutsceneVideo.value
  if (!video) return
  if (paused) video.pause()
  else video.play().catch(() => {})
})
function onKey(e) {
  if (e.code === 'Escape') {
    e.preventDefault(); e.stopImmediatePropagation()
    if (state.showJournal) { state.showJournal = false; return }
    if (showCredits.value) { showCredits.value = false; return }
    if (state.paused || showSettings.value) { resume(); return }
    if (showChapters.value && state.screen === 'title') { showChapters.value = false; return }
    openPause()
    return
  }
  if (state.paused || showSettings.value || showCredits.value) {
    if (e.code === 'Tab') {
      const controls = [...(settingsPanel.value?.querySelectorAll('button:not([disabled]), select, input') || [])]
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    e.stopImmediatePropagation(); return
  }
  if (state.loading || state.cutscene || state.showJournal || /^(INPUT|SELECT|BUTTON)$/.test(e.target.tagName)) return
  if (state.choices) { const n = parseInt(e.key); if (n >= 1 && n <= state.choices.length) { e.preventDefault(); e.stopImmediatePropagation(); choose(n - 1) } return }
  if (state.dialogue && ['Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); advance(); return }
  if (state.breathingPrompt && e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); breathe() }
}
onUnmounted(() => {
  mounted = false
  clearInterval(typeTimer); gsap.killTweensOf(breathScale)
  removeEventListener('keydown', onKey, true); removeEventListener('resize', updateOrientation); removeEventListener('kurinji-installable', onInstallable)
  document.removeEventListener('fullscreenchange', onFullscreen); document.removeEventListener('webkitfullscreenchange', onFullscreen)
  removeEventListener('pointerdown', kick); removeEventListener('keydown', kick)
  game?.destroy?.()
})

const onWhite = computed(() => state.fadeColor === '#fff' && state.fade > 0.5)
const hpPct = computed(() => (state.hp / state.maxHp) * 100)
const breathDash = computed(() => `${(state.breath / 100) * 157} 157`)
const press = a => { if (!state.paused && !state.loading && !state.cutscene) game?.input.press(a) }
// touch controls hide for story conversations (but stay during fights, where dialogue moves to the top)
const touchControls = computed(() => state.mobile && state.screen === 'game' && !state.letterbox && !state.paused && !state.loading && !state.cutscene && !state.showJournal && !state.choices && !state.breathingPrompt && !(state.dialogue && !state.inCombat))
const movedOnce = ref(false)
watch(touchControls, on => { if (on && !movedOnce.value) setTimeout(() => { movedOnce.value = true }, 9000) })
const promptText = computed(() => state.mobile ? String(state.prompt || '').replace(/^\[[^\]]+\]\s*/, '') : state.prompt)
const restartToTitle = () => location.reload()
const tech = ['three.js', 'Bullet3 · ammo.js', 'GSAP', 'Vue.js', 'Vite', 'Howler.js', 'nippleJS', 'Tweakpane']
</script>

<template>
  <div class="interface" :class="`text-${settings.textSize}`">
  <div ref="host" class="host"></div>

  <!-- letterbox & fades -->
  <div class="bar top" :class="{ on: state.letterbox }"></div>
  <div class="bar bottom" :class="{ on: state.letterbox }"></div>
  <div class="fade" :style="{ opacity: state.fade, background: state.fadeColor }"></div>

  <!-- ============ TITLE ============ -->
  <transition name="fadeout">
    <TitleScreen v-if="state.screen === 'title'" v-model:chapters="showChapters" :ready="ready" :launching="launching" :save="saveData" :completed="completed"
      :mobile="state.mobile" :notice="state.mobile && !standalone" :can-install="canInstall" :is-ios="isIOS" :ios-hint="iosHint"
      :covered="showSettings || showCredits || !!state.loading"
      @begin="begin" @free-roam="beginFreeRoam" @settings="openSettings" @credits="showCredits = true" @fullscreen="requestLandscape(true)" @install="installApp" />
  </transition>

  <!-- ============ HUD ============ -->
  <div v-if="state.screen === 'game'" class="hud" :class="{ hidden: state.letterbox }">
    <div class="vitals">
      <svg class="ring" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="25" class="ring-bg" />
        <circle cx="30" cy="30" r="25" class="ring-fg" :class="{ full: state.breath >= 100 }" :stroke-dasharray="breathDash" />
        <text x="30" y="35" text-anchor="middle">{{ state.breath >= 100 ? 'F' : '❀' }}</text>
      </svg>
      <div class="bars">
        <div class="name">Aruvan <span class="karma" :class="state.karma >= 0 ? 'calm' : 'wrath'">{{ state.karma >= 0 ? '☸ Compassion' : '🔥 Wrath' }} {{ Math.abs(state.karma) }}</span></div>
        <div class="hp"><div :style="{ transform: `scaleX(${Math.max(0, Math.min(1, hpPct / 100))})` }"></div></div>
        <div class="petals">❀ {{ state.petals }} / {{ state.totalPetals }} memories</div>
      </div>
    </div>
    <div class="chapter-tag">{{ state.chapter }}</div>
    <transition name="slide"><div v-if="state.objective" class="objective" :key="state.objective"><span>◆</span> {{ state.objective }}</div></transition>
    <transition name="pop"><div v-if="state.combo > 1" class="combo" :key="state.combo">{{ state.combo }}<small>chain</small></div></transition>
    <div v-if="state.boss" class="boss">
      <div class="boss-name">{{ state.boss.name }}</div>
      <div class="boss-bar"><div :style="{ transform: `scaleX(${Math.max(0, Math.min(1, state.boss.hp / state.boss.max))})` }"></div></div>
    </div>
    <div v-if="state.prompt" class="prompt" @click="press('interact')">{{ promptText }}</div>
  </div>
  <button v-if="state.screen === 'game' && !state.loading" class="pause-button" :class="{ cinematic: state.letterbox }" @click="openPause" aria-label="Pause and open settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg><span>{{ state.mobile ? 'Pause' : 'Esc' }}</span></button>
  <transition name="slide"><div v-if="state.toast" class="toast">{{ state.toast }}</div></transition>

  <!-- mobile controls: floating stick on the left, action cluster on the right -->
  <div ref="joyZone" class="joy" v-show="touchControls"></div>
  <div v-if="touchControls" class="touch-hint" :class="{ gone: movedOnce }">Drag left to move · push fully to run · drag right to look</div>
  <div v-if="touchControls" class="mbtns" :style="{ '--tb': settings.touchButtonScale }">
    <button class="tb strike" @pointerdown.prevent="press('attack')" aria-label="Strike"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 18 6m-3-1 4 4M4 20l2-5 3 3z" /></svg><span>Strike</span></button>
    <button class="tb heavy" @pointerdown.prevent="press('heavy')" aria-label="Heavy strike"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 17 7m-4-3 7 7M3 21l3-1-2-2z" /><path d="M14 3l7 7" /></svg><span>Heavy</span></button>
    <button class="tb evade" @pointerdown.prevent="press('dodge')" aria-label="Evade"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c4-8 10-10 16-8M16 4l4 4-4 4" /></svg><span>Evade</span></button>
    <button class="tb breath" :class="{ glow: state.breath >= 100 }" :disabled="state.breath < 100" @pointerdown.prevent="press('special')" aria-label="Kurinji Breath">
      <svg class="fill" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="26" :style="{ strokeDasharray: `${(state.breath / 100) * 163} 163` }" /></svg>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4c2 3 2 5 0 8-2-3-2-5 0-8zM12 12c3-2 5-2 8 0-3 2-5 2-8 0zM12 12c-3-2-5-2-8 0 3 2 5 2 8 0zM12 12c2 3 2 5 0 8-2-3-2-5 0-8z" /></svg><span>Breath</span>
    </button>
    <transition name="fadeout"><button v-if="state.prompt" class="tb talk" @pointerdown.prevent="press('interact')" aria-label="Interact"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z" /></svg><span>Talk</span></button></transition>
  </div>
  <button v-if="state.mobile && state.screen === 'game' && !state.loading && !state.letterbox && !state.paused" class="journal-button" @click="state.showJournal = !state.showJournal" aria-label="Memories journal"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c2 3 2 6 0 9-2-3-2-6 0-9zM12 12c3-1 6 0 8 3-3 1-6 0-8-3zM12 12c-3-1-6 0-8 3 3 1 6 0 8-3zM12 12v9" /></svg><span>{{ state.memories.length }}</span></button>

  <!-- ============ CINEMATIC LAYERS ============ -->
  <transition name="card">
    <div v-if="state.card" class="card" :class="{ ink: onWhite }">
      <div class="kicker">{{ state.card.kicker }}</div>
      <h2>{{ state.card.title }}</h2>
      <div class="line"></div>
      <div class="sub">{{ state.card.sub }}</div>
    </div>
  </transition>
  <transition name="fadeout"><div v-if="state.caption && settings.subtitles" class="caption" :class="{ ink: onWhite }" :key="state.caption">{{ state.caption }}</div></transition>

  <transition name="slide">
    <div v-if="state.dialogue && settings.subtitles" class="dialogue" :class="{ top: state.mobile && state.inCombat }" role="button" tabindex="0" aria-label="Continue dialogue" @click="advance" @keydown.enter.prevent="advance" @keydown.space.prevent="advance">
      <div class="speaker" :style="{ color: state.dialogue.color }">{{ state.dialogue.speaker }}</div>
      <div class="text">{{ typed }}<span v-if="!typing" class="next">▾</span></div>
    </div>
  </transition>
  <button v-if="state.dialogue && !settings.subtitles && !state.paused" class="dialogue-continue" @click="advance">Continue dialogue</button>
  <transition name="slide">
    <div v-if="state.choices" class="choices">
      <button v-for="(c, i) in state.choices" :key="i" @click="choose(i)" :class="c.karma > 0 ? 'k-calm' : c.karma < 0 ? 'k-wrath' : ''">
        <span class="n">{{ i + 1 }}</span>{{ c.text }}
      </button>
    </div>
  </transition>

  <transition name="fadeout"><div v-if="state.deathMsg" class="death"><h3>Fallen</h3><p>{{ state.deathMsg }}</p></div></transition>

  <div v-if="state.breathingPrompt" class="breathe" @click="breathe">
    <div class="orb" :style="{ transform: `scale(${breathScale})` }"></div>
    <div class="breathe-t">{{ state.mobile ? 'Tap' : 'Press Space' }} to breathe</div>
  </div>

  <!-- journal -->
  <transition name="fadeout">
    <div v-if="state.showJournal" class="journal" @click.self="state.showJournal = false">
      <div class="jbox">
        <h3>Memories of the Mountain <small>{{ state.memories.length }} / {{ state.totalPetals }}</small></h3>
        <p v-if="!state.memories.length" class="empty">No petals found yet. They glow faintly violet, hidden across the mountain.</p>
        <div v-for="m in state.memories" :key="m.title" class="mem"><h4>❀ {{ m.title }}</h4><p>{{ m.text }}</p></div>
        <button class="ghost small" @click="state.showJournal = false">Close (Tab)</button>
      </div>
    </div>
  </transition>

  <!-- ============ CREDITS ============ -->
  <div v-if="state.screen === 'credits' || showCredits" ref="creditsPanel" class="credits">
    <div class="roll">
      <Logo class="roll-logo" />
      <p class="dedic">For everyone still waiting for something gentle to bloom.</p>
      <div class="credit-person" v-for="[role, name] in credits" :key="role"><h4>{{ role }}</h4><p>{{ name }}</p></div>
      <h4>Characters</h4>
      <p>Aruvan — the monk who was a soldier<br />Malli of Thennur<br />Guru Nilakantha<br />Thamarai, the healer<br />Ilan, who carves birds<br />Kaali of the forge<br />Rudhra, the last Hound<br />Dunkan, the Iron King</p>
      <h4>Your path</h4>
      <p>{{ state.karma >= 0 ? 'Compassion' : 'Wrath' }} {{ Math.abs(state.karma) }} · Memories found {{ state.petals }}/{{ state.totalPetals }}<br />{{ state.rudhraSpared ? 'Rudhra swept the temple steps.' : 'Rudhra rests in Thennur.' }}</p>
      <div class="made"><div class="made-h">MADE WITH</div><div class="made-l"><span v-for="t in tech" :key="t">{{ t }}</span></div></div>
      <button @click="showCredits ? showCredits = false : restartToTitle()">Return to the mountain</button>
    </div>
  </div>

  <div v-if="state.paused || showSettings" class="settings-overlay" @click.self="resume">
    <section ref="settingsPanel" class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
      <header class="settings-header"><div><h2 id="settings-heading">{{ state.paused ? 'A moment of stillness' : 'Settings' }}</h2><p>{{ state.paused ? state.chapter || 'Your journey is paused.' : 'Make the mountain feel like home.' }}</p></div><button class="close-button" @click="resume" aria-label="Close settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
      <nav class="settings-tabs" aria-label="Settings categories"><button v-for="tab in tabs" :key="tab" :class="{ selected: settingsTab === tab }" :aria-pressed="settingsTab === tab" @click="settingsTab = tab">{{ tab }}</button></nav>
      <div class="settings-body">
        <template v-if="settingsTab === 'graphics'">
          <label class="setting-row"><span>Graphics quality<small>A starting point for your computer.</small></span><select :value="settings.preset" @change="applyPreset($event.target.value)"><option v-for="name in ['low', 'medium', 'high', 'ultra']" :key="name" :value="name">{{ name }}</option><option v-if="settings.preset === 'custom'" value="custom">Custom</option></select></label>
          <label class="setting-row"><span>Render scale<small>Lower for a smoother journey.</small></span><div class="slider-control"><input type="range" min="0.5" max="1.25" step="0.05" v-model.number="settings.renderScale" /><output>{{ Math.round(settings.renderScale * 100) }}%</output></div></label>
          <label class="setting-row"><span>Shadows</span><select v-model="settings.shadows"><option value="off">Off</option><option value="low">Low</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
          <label class="setting-row"><span>Ambient occlusion<small>Soft shadows where surfaces meet.</small></span><input type="checkbox" v-model="settings.ao" /></label>
          <label class="setting-row"><span>Bloom</span><input type="checkbox" v-model="settings.bloom" /></label>
          <label class="setting-row"><span>Cinematic focus</span><input type="checkbox" v-model="settings.dof" /></label>
          <label class="setting-row"><span>Anti-aliasing<small>Smooth the edges of the mountain.</small></span><input type="checkbox" v-model="settings.aa" /></label>
          <label class="setting-row"><span>Foliage density</span><div class="slider-control"><input type="range" min="0.25" max="1.35" step="0.05" v-model.number="settings.foliage" /><output>{{ Math.round(settings.foliage * 100) }}%</output></div></label>
          <label class="setting-row"><span>Particle density</span><div class="slider-control"><input type="range" min="0.25" max="1.25" step="0.05" v-model.number="settings.particles" /><output>{{ Math.round(settings.particles * 100) }}%</output></div></label>
          <label class="setting-row"><span>Clouds</span><input type="checkbox" v-model="settings.clouds" /></label>
          <label class="setting-row"><span>Water detail</span><select v-model="settings.water"><option value="simple">Simple</option><option value="full">Full</option></select></label>
          <label class="setting-row"><span>Adaptive resolution<small>Adjust detail when the frame rate falls.</small></span><input type="checkbox" v-model="settings.adaptive" /></label>
          <label class="setting-row"><span>Performance display</span><input type="checkbox" v-model="settings.showFps" /></label>
        </template>
        <template v-else-if="settingsTab === 'audio'">
          <label v-for="[key, label] in audioControls" :key="key" class="setting-row"><span>{{ label }}</span><div class="slider-control"><input type="range" min="0" max="1" step="0.05" v-model.number="settings[key]" /><output>{{ Math.round(settings[key] * 100) }}%</output></div></label>
          <label class="setting-row"><span>Voiced dialogue</span><input type="checkbox" v-model="settings.voiceActing" /></label>
        </template>
        <template v-else-if="settingsTab === 'story'">
          <label class="setting-row"><span>Auto-advance dialogue<small>Continue when each spoken line ends.</small></span><input type="checkbox" v-model="settings.autoAdvance" /></label>
          <label class="setting-row"><span>Subtitles</span><input type="checkbox" v-model="settings.subtitles" /></label>
          <label class="setting-row"><span>Text size</span><select v-model="settings.textSize"><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option></select></label>
          <label class="setting-row"><span>Text reveal speed</span><div class="slider-control"><input type="range" min="0.5" max="2" step="0.1" v-model.number="settings.textSpeed" /><output>{{ settings.textSpeed.toFixed(1) }}×</output></div></label>
        </template>
        <template v-else>
          <label class="setting-row"><span>Camera sensitivity</span><div class="slider-control"><input type="range" min="0.25" max="2.5" step="0.05" v-model.number="settings.camSensitivity" /><output>{{ settings.camSensitivity.toFixed(2) }}×</output></div></label>
          <label class="setting-row"><span>Invert vertical look</span><input type="checkbox" v-model="settings.invertY" /></label>
          <label class="setting-row"><span>Camera shake</span><input type="checkbox" v-model="settings.cameraShake" /></label>
          <template v-if="state.mobile">
            <label class="setting-row"><span>Touch look speed<small>How fast dragging turns the camera.</small></span><div class="slider-control"><input type="range" min="0.4" max="2.5" step="0.05" v-model.number="settings.touchLook" /><output>{{ settings.touchLook.toFixed(2) }}×</output></div></label>
            <label class="setting-row"><span>Button size</span><div class="slider-control"><input type="range" min="0.8" max="1.3" step="0.05" v-model.number="settings.touchButtonScale" /><output>{{ Math.round(settings.touchButtonScale * 100) }}%</output></div></label>
            <label class="setting-row"><span>Vibration<small>A light buzz on strikes and hits.</small></span><input type="checkbox" v-model="settings.haptics" /></label>
            <label class="setting-row"><span>Fullscreen</span><button class="ghost small" @click="toggleFullscreen">{{ isFullscreen ? 'Exit' : 'Enter' }}</button></label>
            <p class="settings-note">Left thumb: move (push fully to run) · right thumb: look · Strike, Heavy, Evade and Breath on the right · Talk appears near people · the petal shows your memories.</p>
          </template>
          <p v-else class="settings-note">WASD to move · J to strike · K for a heavy strike · Space to evade · F for Kurinji Breath · E to speak · Tab for memories.</p>
        </template>
      </div>
      <footer class="settings-footer"><button class="ghost small" @click="resetSettings">Reset settings</button><button v-if="state.screen === 'game' && state.paused" class="ghost small" @click="restartToTitle">Return to title</button><button class="primary-button" @click="resume">{{ state.paused ? 'Resume journey' : 'Done' }}</button></footer>
    </section>
  </div>

  <div v-if="state.cutscene" class="cutscene" role="dialog" aria-label="Story cutscene">
    <video v-if="['video', 'mp4'].includes(state.cutscene.type)" ref="cutsceneVideo" :src="state.cutscene.src" :volume="Math.min(0.5, settings.master * settings.voice)" :muted="!settings.voiceActing || settings.master === 0" autoplay playsinline @ended="ui.endCutscene?.()" @error="ui.endCutscene?.()"></video>
    <img v-else :src="state.cutscene.src" alt="A scene from the mountain's story" @error="ui.endCutscene?.()" />
    <button class="ghost small" @click="ui.endCutscene?.()">Continue story</button>
  </div>

  <transition name="loader"><LoadingScreen v-if="state.loading" /></transition>

  <div v-if="state.mobile && portrait && !rotateDismissed" class="rotate-overlay" role="dialog" aria-modal="true" aria-label="Rotate your device">
    <svg class="rotate-device" viewBox="0 0 100 100" aria-hidden="true"><rect x="29" y="13" width="42" height="74" rx="5" /><path d="M47 78h6M13 32a40 40 0 0 1 18-18M13 32l-1-12m1 12 12-1M87 68a40 40 0 0 1-18 18M87 68l1 12m-1-12-12 1" /></svg>
    <h2>The mountain is wider than this.</h2><p>Turn your device to landscape to begin your journey.</p><button class="primary-button" @click="requestLandscape(true)">Enter fullscreen</button><button class="ghost small" @click="rotateDismissed = true">Continue in portrait</button>
  </div>
  </div>
</template>
