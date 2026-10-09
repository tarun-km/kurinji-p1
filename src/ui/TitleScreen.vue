<script setup>
// The title screen over the live mountain: the lockup condenses out of haze,
// the menu threads onto a gold line. Keyboard (arrows/Enter/Esc), mouse and touch all drive it.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { CHAPTER_NAMES } from '../game/story'
import { state } from '../game/store'
import { settings } from '../game/settings'
import { arrowDirection, focusables, stepFocus } from './nav'
import Logo from './Logo.vue'
import Glyph from './Glyph.vue'
import TitleAmbience from './TitleAmbience.vue'
import ChapterSelect from './ChapterSelect.vue'

const props = defineProps({
  ready: Boolean, launching: Boolean, save: { type: Object, default: null }, completed: Boolean,
  chapters: Boolean, mobile: Boolean, notice: Boolean, canInstall: Boolean, isIos: Boolean, iosHint: Boolean,
  covered: Boolean, // another layer (settings, credits, loading) sits on top
})
const emit = defineEmits(['begin', 'free-roam', 'settings', 'credits', 'fullscreen', 'install', 'update:chapters'])

const root = ref(null), menu = ref(null)
const revealed = ref(false), intro = ref(false), nudge = ref(false)
const canContinue = computed(() => !!props.save && props.save.chapter > 0)
const petalsFound = computed(() => Math.min(state.totalPetals, Array.isArray(props.save?.petals) ? props.save.petals.length : 0))
const continueLabel = computed(() => canContinue.value ? `Continue: ${CHAPTER_NAMES[props.save.chapter]}, ${petalsFound.value} of ${state.totalPetals} memories found` : '')
const touch = globalThis.matchMedia?.('(hover: none)').matches
const timers = new Set()
let alive = true
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (alive) fn() }, ms); timers.add(id); return id }

function reveal() {
  if (revealed.value) return
  revealed.value = true; intro.value = true
  later(() => { intro.value = false }, 1400) // the entrance plays once, not on every return from chapter select
  // keyboard players land on the first choice once the menu has threaded in
  if (!touch) later(() => { if (!props.chapters && !props.covered && document.activeElement === document.body) focusPrimary() }, 300)
}
function focusPrimary() { focusables(menu.value)[0]?.focus({ preventScroll: true }) }
watch(() => props.ready, on => { if (on) reveal() })
onMounted(() => { if (props.ready) reveal(); addEventListener('keydown', onWindowKey) })
onUnmounted(() => { alive = false; for (const timer of timers) clearTimeout(timer); removeEventListener('keydown', onWindowKey) })

function onMenuKey(e) {
  const dir = arrowDirection(e)
  if (dir !== 'up' && dir !== 'down') return
  e.preventDefault()
  stepFocus(focusables(menu.value), document.activeElement, dir === 'down' ? 1 : -1)?.focus()
}
// arrows with nothing focused yet pick up the menu
function onWindowKey(e) {
  if (props.covered || props.chapters || !props.ready || !arrowDirection(e)) return
  if (document.activeElement && document.activeElement !== document.body) return
  e.preventDefault(); focusPrimary()
}
const hover = e => { if (!e.currentTarget.disabled) e.currentTarget.focus({ preventScroll: true }) }

function openChapters() { emit('update:chapters', true) }
// back from chapter select: focus returns to the Chapters entry once the menu is back in place
function onSwapEnter() { if (!props.chapters) root.value?.querySelector('[data-chapters]')?.focus({ preventScroll: true }) }
function freeRoam() {
  if (props.completed) { emit('free-roam'); return }
  nudge.value = false; requestAnimationFrame(() => { nudge.value = true })
}
</script>

<template>
  <div ref="root" class="ts" :class="{ revealed, intro, chaptering: chapters, touch }" :inert="covered">
    <div class="ts-scrim" aria-hidden="true"></div>
    <TitleAmbience :active="!covered" class="ts-air" />

    <transition name="ts-swap" mode="out-in" @after-enter="onSwapEnter">
      <div v-if="!chapters" key="menu" class="ts-main">
        <div class="ts-column">
          <Logo class="ts-logo" :play="intro" />
          <p class="ts-tag"><span>Once a soldier. Then a monk. Then a king.</span> <span class="ts-tag-2">The flower blooms once in twelve years. He promised to wait.</span></p>

          <div v-if="!ready" class="ts-wait" role="status">Raising the mountain…</div>
          <nav v-else ref="menu" class="ts-menu" aria-label="Main menu" @keydown="onMenuKey">
            <div class="ts-list">
            <button v-if="canContinue" class="ts-item primary" data-nav :disabled="launching" :aria-label="continueLabel" style="--n: 0" @click="emit('begin', save.chapter)" @mouseenter="hover">
              <Glyph name="gem" class="ts-mark" /><span class="ts-label">Continue</span>
              <span class="ts-detail"><span>{{ CHAPTER_NAMES[save.chapter] }}</span><span class="ts-found"><Glyph name="blossom" />{{ petalsFound }} / {{ state.totalPetals }}</span></span>
            </button>
            <button class="ts-item" :class="{ primary: !canContinue }" data-nav :disabled="launching" style="--n: 1" @click="emit('begin', 0)" @mouseenter="hover">
              <Glyph name="gem" class="ts-mark" /><span class="ts-label">{{ save ? 'New Journey' : 'Begin' }}</span>
            </button>
            <button v-if="save && save.best > 0" class="ts-item" data-nav data-chapters :disabled="launching" style="--n: 2" @click="openChapters" @mouseenter="hover">
              <Glyph name="gem" class="ts-mark" /><span class="ts-label">Chapters</span>
            </button>
            <button class="ts-item" :class="{ locked: !completed, nudge }" data-nav :disabled="launching" :aria-disabled="!completed" style="--n: 3"
              :aria-label="completed ? 'Free roam' : 'Free roam, locked until you finish the story'" @click="freeRoam" @mouseenter="hover" @animationend="nudge = false">
              <Glyph :name="completed ? 'gem' : 'lock'" class="ts-mark" /><span class="ts-label">Free Roam</span>
              <span v-if="!completed" class="ts-detail">Finish the story to unlock</span>
            </button>
            </div>
            <div class="ts-utility" style="--n: 4">
              <button class="ts-item small" data-nav :disabled="launching" @click="emit('settings')" @mouseenter="hover"><Glyph name="gem" class="ts-mark" /><span class="ts-label">Settings</span></button>
              <button class="ts-item small" data-nav :disabled="launching" @click="emit('credits')" @mouseenter="hover"><Glyph name="gem" class="ts-mark" /><span class="ts-label">Credits</span></button>
              <label class="ts-switch"><input type="checkbox" role="switch" data-nav :disabled="launching" v-model="settings.voiceActing" /><span>Voiced dialogue</span></label>
            </div>
          </nav>
        </div>

        <div v-if="notice" class="ts-notice">
          <p><Glyph name="device" /><span>For the full experience, play in <b>landscape</b> and <b>fullscreen</b>.</span></p>
          <div class="ts-notice-actions">
            <button class="ts-chip" @click="emit('fullscreen')"><Glyph name="fullscreen" />Play fullscreen</button>
            <button v-if="canInstall || isIos" class="ts-chip" @click="emit('install')"><Glyph name="install" />Install the game</button>
          </div>
          <p v-if="iosHint" class="ts-ios">On iPhone and iPad: tap <b>Share</b>, then <b>Add to Home Screen</b>. Kurinji will open fullscreen like an app.</p>
        </div>
      </div>
      <div v-else key="chapters" class="ts-main ts-chapters">
        <ChapterSelect :best="save?.best || 0" :current="save ? save.chapter : -1" :launching="launching" @begin="emit('begin', $event)" @close="emit('update:chapters', false)" />
      </div>
    </transition>

    <div class="ts-bar top" aria-hidden="true"></div>
    <div class="ts-bar bottom"></div>
    <footer class="ts-foot">
      <p v-if="!mobile" class="ts-howto"><span><kbd>WASD</kbd>Move</span><span><kbd>Click</kbd>Look</span><span><kbd>J</kbd>Strike</span><span><kbd>K</kbd>Heavy</span><span><kbd>Space</kbd>Jump</span><span><kbd>F</kbd>Evade</span><span><kbd>Q</kbd>Kurinji Breath</span><span><kbd>E</kbd>Interact</span><span><kbd>Tab</kbd>Memories</span><span><kbd>Esc</kbd>Pause</span></p>
      <p v-else class="ts-howto">Left thumb moves (push fully to run) · right thumb looks · tap to fight</p>
      <p class="ts-byline">Story &amp; Characters by Tarun KM</p>
    </footer>
  </div>
</template>

<style scoped>
.ts {
  --lb: clamp(24px, 5vh, 54px); --lbb: clamp(42px, 6vh, 66px); --side: max(7vw, calc(env(safe-area-inset-left) + 24px));
  --ease: cubic-bezier(.16,1,.3,1);
  position: fixed; inset: 0; z-index: 20; overflow: hidden; color: var(--paper);
}
/* readable left side, cinema vignette, and a little warmth pooled at the bottom */
.ts-scrim {
  position: absolute; inset: 0; pointer-events: none; transition: background-color .6s;
  background:
    radial-gradient(120% 90% at 72% 46%, rgba(8,6,12,0) 40%, rgba(8,6,12,.5) 100%),
    linear-gradient(90deg, rgba(9,7,13,.86) 0%, rgba(9,7,13,.62) 28%, rgba(9,7,13,.18) 52%, rgba(9,7,13,0) 66%),
    linear-gradient(0deg, rgba(20,10,6,.5), rgba(20,10,6,0) 30%);
}
.chaptering .ts-scrim { background-color: rgba(9,7,13,.7); }
.ts-air { opacity: 0; transition: opacity 2.4s ease 1.2s; }
.revealed .ts-air { opacity: 1; }

/* A steady cinema frame leaves the upgraded mountain visible immediately. */
.ts-bar { position: absolute; left: 0; right: 0; height: var(--lb); background: #000; pointer-events: none; }
.ts-bar.top { top: 0; }
.ts-bar.bottom { bottom: 0; height: var(--lbb); }
.ts-bar.top::after, .ts-bar.bottom::before { content: ''; position: absolute; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, rgba(232,180,106,0), rgba(232,180,106,.22) 30%, rgba(232,180,106,.22) 70%, rgba(232,180,106,0)); }
.ts-bar.top::after { bottom: 0; } .ts-bar.bottom::before { top: 0; }

.ts-main { position: absolute; left: 0; right: 0; top: var(--lb); bottom: var(--lbb); display: flex; align-items: safe center; overflow-y: auto; padding: clamp(10px, 3vh, 36px) var(--side); }
.ts-column { display: flex; flex-direction: column; align-items: flex-start; max-width: min(620px, 46vw); }
.ts-logo { --size: clamp(56px, min(8.4vw, 12vh), 96px); margin-left: -.03em; }
.ts-tag { margin: clamp(14px, 3vh, 28px) 0 clamp(16px, 3.6vh, 34px); max-width: 31em; font: italic 400 clamp(17px, 1.45vw, 22px)/1.5 var(--serif); color: rgba(244,234,216,.9); text-shadow: 0 2px 12px rgba(0,0,0,.65); text-wrap: balance; }
.ts-tag span { display: block; }
.ts-wait { font: 500 14px var(--display); letter-spacing: .3em; text-transform: uppercase; color: #e9d9bd; animation: pulse 1.6s infinite; }

/* menu: items hang on a faint gold thread; the selected one wears the gem */
.ts-menu { display: flex; flex-direction: column; align-items: flex-start; }
.ts-list { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding-left: 2px; }
.ts-list::before { content: ''; position: absolute; left: 9px; top: 6px; bottom: 6px; width: 1px; background: linear-gradient(180deg, rgba(232,180,106,0), rgba(232,180,106,.42) 14%, rgba(232,180,106,.42) 70%, rgba(232,180,106,0)); transform-origin: top; transform: scaleY(0); transition: transform 1.2s var(--ease) 1.5s; }
.revealed .ts-list::before { transform: scaleY(1); }
.intro :is(.ts-list > *, .ts-utility) { animation: item-in .6s var(--ease) calc(var(--n, 0) * 35ms) backwards; }
@keyframes item-in { from { opacity: .8; transform: translateX(-5px); } }

.ts-item {
  position: relative; display: grid; grid-template-columns: 18px auto; align-items: center; column-gap: 18px; min-height: 48px; padding: 6px 34px 6px 0;
  background: none; border: 0; color: rgba(244,234,216,.8); font: 600 15px/1.2 var(--display); letter-spacing: .26em; text-transform: uppercase; text-align: left;
  transition: color .3s;
}
.ts-item::before { content: ''; position: absolute; left: -10px; right: 0; top: 4px; bottom: 4px; background: linear-gradient(90deg, rgba(232,180,106,.24), rgba(232,180,106,.09) 50%, rgba(232,180,106,0)); transform: scaleX(0); transform-origin: left; transition: transform .45s var(--ease); pointer-events: none; }
.ts-label { position: relative; }
.ts-label::after { content: ''; position: absolute; left: 0; right: -28px; bottom: -6px; height: 1px; background: linear-gradient(90deg, #e8b46a, rgba(232,180,106,0)); transform: scaleX(0); transform-origin: left; transition: transform .5s var(--ease) .05s; pointer-events: none; }
.ts-mark { width: 12px; height: 17px; margin-left: 2px; opacity: 0; transform: scale(.4) rotate(-45deg); transition: opacity .3s, transform .45s var(--ease); }
.ts-label { transition: transform .45s var(--ease); text-shadow: 0 2px 10px rgba(0,0,0,.7); }
.ts-detail { grid-column: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; margin-top: 3px; font: italic 500 17px/1.25 var(--serif); letter-spacing: 0; text-transform: none; color: rgba(236,228,255,.82); transition: transform .45s var(--ease); text-shadow: 0 2px 8px rgba(0,0,0,.7); }
.ts-found { display: inline-flex; align-items: center; gap: 6px; font-style: normal; font-feature-settings: 'lnum', 'tnum'; color: #cfc4ff; }
.ts-found svg { width: 17px; height: 17px; }

.ts-item.primary { font-size: 18px; color: #f6e7cc; }
.ts-item.primary .ts-mark { opacity: .55; transform: none; }
.ts-item:focus { outline: none; }
.ts-item:is(:hover, :focus):not(:disabled) { color: #ffe9bf; }
.ts-item:is(:hover, :focus):not(:disabled)::before, .ts-item:is(:hover, :focus):not(:disabled) .ts-label::after { transform: scaleX(1); }
.ts-item:is(:hover, :focus):not(:disabled) .ts-mark { opacity: 1; transform: none; }
.ts-item:is(:hover, :focus):not(:disabled) :is(.ts-label, .ts-detail) { transform: translateX(6px); }
.ts-item:disabled { color: rgba(244,234,216,.4); cursor: progress; }

.ts-item.locked { color: rgba(244,234,216,.5); cursor: not-allowed; }
.ts-item.locked .ts-mark { opacity: .8; transform: none; width: 16px; height: 16px; margin-left: 0; color: #d9a85e; }
.ts-item.locked .ts-detail { font-size: 15px; color: rgba(236,228,255,.62); }
.ts-item.locked:is(:hover, :focus) { color: rgba(244,234,216,.72); }
.ts-item.locked:is(:hover, :focus)::before { transform: scaleX(1); background: linear-gradient(90deg, rgba(244,234,216,.08), rgba(244,234,216,0)); }
.ts-item.locked:is(:hover, :focus) .ts-label::after { transform: scaleX(0); }
.ts-item.locked:is(:hover, :focus) .ts-mark { opacity: 1; transform: none; }
.ts-item.nudge .ts-mark { animation: nudge .42s cubic-bezier(.36,.07,.19,.97); }
@keyframes nudge { 20%, 60% { transform: translateX(-3px) rotate(-8deg); } 40%, 80% { transform: translateX(3px) rotate(8deg); } }

.ts-utility { display: flex; flex-wrap: wrap; align-items: center; gap: 0 6px; margin-top: 10px; }
.ts-item.small { min-height: 44px; font-size: 12px; letter-spacing: .16em; padding-right: 18px; column-gap: 12px; color: #ddd0b9; }
.ts-switch { display: inline-flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 6px 0 4px; font: italic 500 17px var(--serif); color: rgba(244,234,216,.82); cursor: pointer; text-shadow: 0 2px 8px rgba(0,0,0,.7); }
.ts-switch input { appearance: none; -webkit-appearance: none; flex: none; width: 38px; height: 20px; margin: 0; border: 1px solid rgba(232,180,106,.55); border-radius: 10px; cursor: pointer;
  background: radial-gradient(circle, #cdbb9d 0 6px, transparent 6.5px) no-repeat 2px 50% / 16px 16px, rgba(13,10,8,.55); transition: background-position .3s var(--ease), background-color .3s, border-color .3s; }
.ts-switch input:checked { background: radial-gradient(circle, #1a0f05 0 6px, transparent 6.5px) no-repeat calc(100% - 2px) 50% / 16px 16px, #e8b46a; border-color: #e8b46a; }
.ts-switch input:focus-visible { outline: 2px solid var(--violet); outline-offset: 3px; }
.ts-switch:hover input { border-color: #f0c983; }

/* mobile: landscape + fullscreen notice */
.ts-notice { max-width: 330px; margin-top: 18px; padding: 12px 14px; background: rgba(13,10,8,.88); border: 1px solid rgba(232,180,106,.4); font-size: 16px; line-height: 1.35; }
.revealed .ts-notice { opacity: 1; }
.ts-notice p { display: flex; gap: 10px; align-items: center; }
.ts-notice p svg { width: 22px; height: 22px; color: var(--gold); }
.ts-notice b { color: #f6dfb2; font-weight: 600; }
.ts-notice-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.ts-chip { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 14px; background: rgba(232,180,106,.1); border: 1px solid rgba(232,180,106,.5); color: #f4ead8; font: 600 11px var(--display); letter-spacing: .14em; text-transform: uppercase; }
.ts-chip svg { width: 16px; height: 16px; color: var(--gold); }
.ts-chip:active { background: rgba(232,180,106,.28); }
.ts-ios { margin-top: 8px; font-size: 14px; color: #e3d6c0; display: block !important; }

/* the bottom band carries the controls and the byline */
.ts-foot { position: absolute; left: var(--side); right: max(3.5vw, calc(env(safe-area-inset-right) + 16px)); bottom: 0; height: var(--lbb); display: flex; align-items: center; justify-content: space-between; gap: 24px; pointer-events: none; }
.revealed .ts-foot { opacity: 1; }
.ts-howto { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; font: 500 11px/1.4 var(--display); letter-spacing: .08em; text-transform: uppercase; color: #cabb9f; }
.ts-howto span { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.ts-howto kbd { display: inline-block; min-width: 20px; padding: 2px 5px 1px; border: 1px solid rgba(232,180,106,.4); border-bottom-width: 2px; font: 600 10px/1.3 var(--display); letter-spacing: .06em; color: #f0d8ac; text-align: center; }
.ts-byline { flex: none; font: italic 500 15px var(--serif); color: #d9b077; white-space: nowrap; }

/* swapping the menu for chapter select */
.ts-chapters { align-items: center; justify-content: center; }
.ts-swap-enter-active, .ts-swap-leave-active { transition: opacity .35s ease, transform .45s var(--ease); }
.ts-swap-enter-from { opacity: 0; transform: translateY(10px); }
.ts-swap-leave-to { opacity: 0; transform: translateX(-16px); }

@media (max-width: 1100px) { .ts-howto { gap: 3px 12px; } }
@media (max-height: 820px) and (min-height: 481px) { .ts-howto { font-size: 10px; } }

/* phones in landscape: menu column left, utilities and the notice on the right */
@media (max-height: 480px) {
  .ts { --lb: clamp(12px, 4.2vh, 22px); --lbb: max(32px, calc(env(safe-area-inset-bottom) + 16px)); --side: max(22px, calc(env(safe-area-inset-left) + 14px)); }
  .ts-main { padding: 6px var(--side) 8px; align-items: center; }
  .ts-column { max-width: min(470px, 56vw); }
  .ts-logo { --size: clamp(38px, 12vh, 48px); }
  .ts-tag { margin: 8px 0 10px; font-size: 14px; line-height: 1.35; max-width: 30em; }
  .ts-list { gap: 0; }
  .ts-list::before { left: 7px; }
  .ts-item { min-height: 44px; padding: 4px 22px 4px 0; column-gap: 12px; grid-template-columns: 14px auto; font-size: 13px; letter-spacing: .22em; }
  .ts-item.primary { font-size: 14px; }
  .ts-label::after { bottom: -4px; }
  .ts-mark { width: 10px; height: 14px; }
  .ts-item.locked .ts-mark { width: 14px; height: 14px; }
  .ts-detail { margin-top: 1px; font-size: 14px; gap: 2px 10px; }
  .ts-item.locked { min-height: 44px; }
  .ts-item.locked { grid-template-columns: 14px auto auto; }
  .ts-item.locked .ts-detail { grid-column: 3; grid-row: 1; margin: 0 0 0 4px; font-size: 13px; }
  .ts-utility { position: absolute; top: 6px; right: max(16px, calc(env(safe-area-inset-right) + 10px)); margin: 0; gap: 0 2px; justify-content: flex-end; }
  .ts-item.small { display: inline-flex; padding: 0 12px; font-size: 11px; letter-spacing: .18em; }
  .ts-item.small .ts-mark { display: none; }
  .ts-item.small::before { left: 0; }
  .ts-item.small .ts-label::after { right: 0; }
  .ts-switch { font-size: 14px; gap: 8px; padding-left: 8px; }
  .ts-notice { position: absolute; right: max(16px, calc(env(safe-area-inset-right) + 10px)); bottom: 8px; width: 344px; max-width: 46vw; margin: 0; padding: 8px 10px; font-size: 13px; }
  .ts-notice p svg { width: 18px; height: 18px; }
  .ts-notice-actions { margin-top: 6px; gap: 6px; }
  .ts-chip { padding: 0 10px; font-size: 10px; letter-spacing: .1em; }
  .ts-ios { font-size: 12px; }
  .ts-foot { gap: 12px; padding-bottom: env(safe-area-inset-bottom); }
  .ts-howto { font-size: 11px; letter-spacing: 0; }
  .ts-howto span:nth-child(n+5) { display: none; }
  .ts-byline { font-size: 12px; }
}
@media (max-height: 380px) { .ts-tag-2 { display: none !important; } .ts-tag { margin: 6px 0 6px; } }
@media (max-width: 700px) and (min-height: 481px) {
  .ts-column { max-width: 100%; }
  .ts-scrim { background: rgba(9,7,13,.62); }
  .ts-foot { flex-direction: column; justify-content: center; align-items: flex-start; gap: 2px; }
  .ts-howto span:nth-child(n+6) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ts-bar, .ts-list::before, .ts-foot, .ts-notice, .ts-air { transition-duration: .01ms !important; transition-delay: 0s !important; }
  .intro :is(.ts-list > *, .ts-utility) { animation: none; }
}
</style>
