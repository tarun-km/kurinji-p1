<script setup>
// Cinematic chapter loading: in-game shots (public/art/shots/index.json) drift and cross-dissolve
// behind letterbox bars; the chapter title sits over them; a hairline fills along the lower bar.
// A missing capture leaves the dark stage visible while assets prepare.
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { state, ui } from '../game/store'
import { loadShots, shots, loadingKey, loadingShots, splitChapter } from './shots'
import Logo from './Logo.vue'
import Glyph from './Glyph.vue'

// render from the last non-empty loading state, so the fade-out can play after it clears
const view = ref(state.loading || { title: '', sub: '', art: '', progress: 0, label: '', error: '' })
watch(() => state.loading, l => { if (l) view.value = l })

const key = computed(() => loadingKey(view.value, state.chapterIndex))
const boot = computed(() => key.value === 'title' && view.value.title === 'Kurinji')
const heading = computed(() => splitChapter(view.value.title))
const progress = computed(() => Math.max(0, Math.min(1, Number(view.value.progress) || 0)))
const pct = computed(() => Math.round(progress.value * 100))
const showSub = computed(() => view.value.error || !/^The mountain is preparing your next chapter\.?$/.test(view.value.sub || ''))
const retry = ref(null)

const TIPS = [
  'A violet petal carries a memory of the mountain.',
  'Evade a heavy strike, then answer with your staff.',
  'Kurinji Breath gathers as you fight. Save it for a crowded moment.',
  'Listen to the mountain. There is more than one way through a conversation.',
  'Each petal you gather adds to your vitality.',
  'Lost petals glow faintly violet. Look beyond the path.',
  'Your choices lean toward Compassion or Wrath. The mountain remembers both.',
]
const tipIndex = ref(Math.max(0, state.chapterIndex) % TIPS.length)
const tip = computed(() => TIPS[tipIndex.value])

// ---- shots: two-layer cross-dissolve with a different slow camera drift on each ----
const MOTIONS = ['kb-a', 'kb-b', 'kb-c', 'kb-d']
const slides = ref([])
const solo = ref(false)
let alive = true, seq = 0, cursor = 0, list = [], cycle = 0, tipTimer = 0, reel = 0
const timers = new Set()
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (alive) fn() }, ms); timers.add(id); return id }

function decode(src) {
  const img = new Image(); img.decoding = 'async'; img.src = src
  return img.decode().then(() => src)
}
async function present(src, first = false) {
  const id = ++seq
  try { await decode(src) } catch { return false }
  if (!alive || id !== seq) return false
  const slide = { id, src, motion: MOTIONS[(id - 1) % MOTIONS.length], on: false }
  slides.value = [...slides.value, slide]
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const s = slides.value.find(x => x.id === id); if (s) s.on = true
  }))
  // older layers leave once the new one has fully dissolved in over them
  later(() => { slides.value = slides.value.filter(s => s.id >= id) }, first ? 1300 : 2000)
  return true
}
async function nextShot(first = false) {
  const generation = reel
  // Skip an unavailable capture immediately rather than waiting through an
  // empty slide. There is one decode in flight and at most two visible layers.
  for (let tries = 0; tries < list.length && alive && generation === reel; tries++) {
    const source = list[cursor++ % list.length]
    if (await present(source, first)) return
  }
}
function schedule() {
  clearInterval(cycle); clearInterval(tipTimer)
  if (document.hidden || view.value.error || !alive) return
  if (list.length > 1) cycle = setInterval(() => nextShot(), 6200)
  tipTimer = setInterval(() => { tipIndex.value = (tipIndex.value + 1) % TIPS.length }, 8500)
}
function start() {
  clearInterval(cycle)
  ++reel; ++seq
  for (const id of timers) clearTimeout(id)
  timers.clear(); slides.value = []
  list = loadingShots(key.value)
  cursor = 0; solo.value = list.length < 2
  if (list.length) nextShot(true)
  schedule()
}
const onVisibility = () => schedule()

onMounted(() => {
  // Display already-preloaded captures immediately, then revalidate the index.
  document.addEventListener('visibilitychange', onVisibility)
  start()
  loadShots(true)
  if (view.value.error) nextTick(() => retry.value?.focus({ preventScroll: true }))
})
// a different chapter (or the index arriving late) restarts the reel
watch([key, shots], ([k], [oldKey]) => { if (alive && (k !== oldKey || loadingShots(k).join() !== list.join())) start() })
watch(() => view.value.error, async error => { schedule(); if (error) { await nextTick(); retry.value?.focus({ preventScroll: true }) } })
onUnmounted(() => { alive = false; ++seq; ++reel; clearInterval(cycle); clearInterval(tipTimer); for (const id of timers) clearTimeout(id); document.removeEventListener('visibilitychange', onVisibility) })
</script>

<template>
  <div class="ld" :class="{ failed: !!view.error, boot }">
    <div class="ld-stage" aria-hidden="true">
      <img v-for="s in slides" :key="s.id" class="ld-shot" :class="[solo ? 'kb-solo' : s.motion, { on: s.on }]" :src="s.src" alt="" />
    </div>
    <div class="ld-grade" aria-hidden="true"></div>

    <div class="ld-bar top" aria-hidden="true"><span class="ld-word">Kurinji</span></div>
    <div class="ld-bar bottom">
      <div v-if="!view.error" class="ld-line" role="progressbar" aria-label="Chapter preparation" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100">
        <span class="ld-fill" :style="{ transform: `scaleX(${progress})` }"></span>
        <span class="ld-head" :style="{ transform: `translateX(${progress * 100}cqw) rotate(45deg)` }"></span>
      </div>
      <div v-if="!view.error" class="ld-row" aria-live="off">
        <transition name="ld-tip" mode="out-in"><p :key="tipIndex" class="ld-tip"><Glyph name="blossom" />{{ tip }}</p></transition>
        <div class="ld-status"><span>{{ view.label || 'Preparing your journey…' }}</span><output>{{ pct }}<small>%</small></output></div>
      </div>
    </div>

    <div class="ld-content" role="status" aria-live="polite">
      <template v-if="boot && !view.error"><Logo tag="h2" :sub="view.sub" class="ld-logo" /></template>
      <template v-else>
        <h2 class="ld-title">{{ heading.name }}</h2>
        <div v-if="heading.mark" class="ld-mark"><Glyph name="gem" />{{ heading.mark }}<span class="ld-mark-rule"></span></div>
        <p v-if="view.sub && showSub" class="ld-sub">{{ view.sub }}</p>
      </template>
      <template v-if="view.error">
        <p id="loading-error" class="ld-error">{{ view.error }}</p>
        <button ref="retry" class="primary-button ld-retry" aria-describedby="loading-error" @click="ui.retryLoad?.()">Try again</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ld { --lb: clamp(30px, 10.5vh, 100px); --side: max(7vw, calc(env(safe-area-inset-left) + 24px)); --ease: cubic-bezier(.16,1,.3,1);
  position: fixed; inset: 0; z-index: 80; overflow: hidden; background: #0d0a08; color: var(--paper); }

.ld-stage { position: absolute; inset: 0; }
.ld-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 45%; opacity: 0; transition: opacity 1.6s cubic-bezier(.4,0,.2,1); }
.ld-shot.on { opacity: 1; }
.kb-a { animation: kb-a 13s cubic-bezier(.33,0,.67,1) both; }
.kb-b { animation: kb-b 13s cubic-bezier(.33,0,.67,1) both; }
.kb-c { animation: kb-c 13s cubic-bezier(.33,0,.67,1) both; }
.kb-d { animation: kb-d 13s cubic-bezier(.33,0,.67,1) both; }
.kb-solo { animation: kb-a 26s cubic-bezier(.45,0,.55,1) infinite alternate both; }
@keyframes kb-a { from { transform: scale(1.04) translate(1%, .8%); } to { transform: scale(1.15) translate(-1.6%, -1%); } }
@keyframes kb-b { from { transform: scale(1.16) translate(-1.4%, .6%); } to { transform: scale(1.05) translate(1%, -.6%); } }
@keyframes kb-c { from { transform: scale(1.11) translate(2.4%, 0); } to { transform: scale(1.11) translate(-2.4%, -.4%); } }
@keyframes kb-d { from { transform: scale(1.06) translate(-1%, -1.4%); } to { transform: scale(1.17) translate(1.2%, .8%); } }

/* grade: vignette, a low warm scrim for the type, and the left side held a little darker */
.ld-grade { position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(130% 100% at 60% 40%, rgba(10,7,5,0) 45%, rgba(10,7,5,.55) 100%),
    linear-gradient(0deg, rgba(10,7,5,.92) 0, rgba(10,7,5,.62) calc(var(--lb) + 9%), rgba(10,7,5,.12) calc(var(--lb) + 34%), rgba(10,7,5,0) 62%),
    linear-gradient(90deg, rgba(10,7,5,.5), rgba(10,7,5,0) 50%); }

.ld-bar { position: absolute; left: 0; right: 0; height: var(--lb); background: #000; display: flex; align-items: center; padding: 0 var(--side); }
.ld-bar.top { top: 0; animation: bar-top 1.1s cubic-bezier(.7,0,.16,1) both; }
.ld-bar.bottom { bottom: 0; flex-direction: column; align-items: stretch; justify-content: center; padding-bottom: env(safe-area-inset-bottom); animation: bar-bottom 1.1s cubic-bezier(.7,0,.16,1) both; }
@keyframes bar-top { from { transform: translateY(-100%); } }
@keyframes bar-bottom { from { transform: translateY(100%); } }
.ld-word { font: 600 12px var(--display); letter-spacing: .5em; text-transform: uppercase; color: rgba(232,180,106,.6); }

/* the progress hairline runs the full width of the frame along the lower bar's edge */
.ld-line { position: absolute; left: 0; right: 0; top: 0; height: 1px; background: rgba(232,180,106,.16); container-type: inline-size; }
.ld-fill { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(232,180,106,.35), #e8b46a 70%, #fbe3b5); transform-origin: left; transition: transform .5s var(--ease); }
.ld-head { position: absolute; left: -3px; top: -2px; width: 5px; height: 5px; background: #fff3d6; transform: rotate(45deg); box-shadow: 0 0 10px 2px rgba(240,190,110,.75); transition: transform .5s var(--ease); }
.ld-row { display: flex; align-items: center; justify-content: space-between; gap: 32px; min-width: 0; }
.ld-tip { display: flex; align-items: center; gap: 10px; min-width: 0; font: italic 500 clamp(16px, 1.25vw, 18px)/1.3 var(--serif); color: #dcd0bb; }
.ld-tip svg { width: 16px; height: 16px; flex: none; }
.ld-tip-enter-active, .ld-tip-leave-active { transition: opacity .6s ease, transform .6s var(--ease); }
.ld-tip-enter-from { opacity: 0; transform: translateY(6px); }
.ld-tip-leave-to { opacity: 0; transform: translateY(-6px); }
.ld-status { flex: none; display: flex; align-items: baseline; gap: 16px; font: 500 12px var(--display); letter-spacing: .1em; text-transform: uppercase; color: #c9bba3; }
.ld-status output { min-width: 3.2em; text-align: right; font: 600 18px var(--display); letter-spacing: .04em; color: #f0c983; font-variant-numeric: tabular-nums; }
.ld-status small { font-size: 11px; margin-left: 2px; color: rgba(240,201,131,.7); }

/* chapter title over the image, just above the lower bar */
.ld-content { position: absolute; left: var(--side); right: var(--side); bottom: calc(var(--lb) + clamp(18px, 5.5vh, 56px)); max-width: 900px; }
.ld-mark { display: flex; align-items: center; gap: 12px; margin-top: 14px; font: 600 13px var(--display); letter-spacing: .25em; text-transform: uppercase; color: #e8b46a; }
.ld-mark svg { width: 10px; height: 14px; }
.ld-mark-rule { width: 64px; height: 1px; background: linear-gradient(90deg, rgba(232,180,106,.85), rgba(232,180,106,0)); }
.ld-title { font: 600 clamp(34px, 4.5vw, 70px)/1.06 var(--display); letter-spacing: .03em; color: #f7ecd6; text-wrap: balance; text-shadow: 0 4px 30px rgba(0,0,0,.6); animation: title-in 1.2s var(--ease) both; }
.ld-sub { margin-top: clamp(8px, 1.4vh, 14px); max-width: 34em; font: italic 500 clamp(18px, 1.7vw, 24px)/1.35 var(--serif); color: #eadcc5; text-shadow: 0 2px 12px rgba(0,0,0,.7); }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } }
@keyframes draw { from { transform: scaleX(0); } }
@keyframes title-in { from { opacity: 0; transform: translateY(14px); filter: blur(10px); } }

.boot .ld-content { left: 0; right: 0; bottom: auto; top: 50%; max-width: none; transform: translateY(-58%); display: flex; flex-direction: column; align-items: center; }
.ld-logo { --size: clamp(54px, min(8vw, 13vh), 112px); animation: rise 1.8s var(--ease) .2s both; }
.ld-error { margin: 18px 0 20px; max-width: 34em; font-size: 20px; line-height: 1.5; color: #f1d9cf; }
.ld-retry { min-height: 48px; padding: 0 28px; font: 600 13px var(--display); letter-spacing: .2em; text-transform: uppercase; }
.failed .ld-content { bottom: calc(var(--lb) + 6vh); max-height: calc(100dvh - var(--lb) * 2 - 6vh); overflow-y: auto; padding: 8px 4px; }

@media (max-height: 480px) {
  .ld { --lb: clamp(30px, 10vh, 40px); --side: max(22px, calc(env(safe-area-inset-left) + 14px)); }
  .ld-word { font-size: 10px; }
  .ld-tip { font-size: 14px; gap: 7px; }
  .ld-tip svg { width: 13px; height: 13px; }
  .ld-row { gap: 16px; }
  .ld-status { gap: 10px; font-size: 9px; letter-spacing: .14em; }
  .ld-status output { font-size: 14px; }
  .ld-content { bottom: calc(var(--lb) + 14px); }
  .ld-mark { font-size: 11px; gap: 9px; margin-top: 8px; }
  .ld-title { font-size: clamp(24px, 4.2vw, 34px); margin-top: 6px; }
  .ld-sub { font-size: 15px; margin-top: 4px; }
  .ld-logo { --size: 44px; }
  .ld-error { font-size: 15px; margin: 8px 0 10px; }
}
@media (max-width: 700px) {
  .ld { --lb: max(64px, 12vh); }
  .ld-row { flex-direction: column-reverse; align-items: flex-start; gap: 2px; }
  .ld-tip { font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .ld-shot { animation: none !important; transform: scale(1.04); }
  .ld-bar, .ld-mark, .ld-mark-rule, .ld-title, .ld-sub, .ld-logo { animation: none; }
}
</style>
