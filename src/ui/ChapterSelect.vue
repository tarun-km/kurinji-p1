<script setup>
// Chapter select: a real capture from each chapter of the game.
import { ref, onMounted, nextTick } from 'vue'
import { CHAPTER_NAMES } from '../game/story'
import { chapterCardArt, splitChapter, loadShots } from './shots'
import { arrowDirection, focusables, spatialFocus } from './nav'
import Glyph from './Glyph.vue'

const props = defineProps({ best: { type: Number, default: 0 }, current: { type: Number, default: -1 }, launching: Boolean })
const emit = defineEmits(['begin', 'close'])
const root = ref(null)
const chapters = CHAPTER_NAMES.map((full, i) => ({ i, full, ...splitChapter(full) }))
const failed = ref({})
loadShots(true)

function onKey(e) {
  const dir = arrowDirection(e)
  if (!dir) return
  e.preventDefault()
  const items = focusables(root.value)
  spatialFocus(items, document.activeElement, dir)?.focus()
}
const hover = e => { if (!e.currentTarget.disabled) e.currentTarget.focus({ preventScroll: true }) }

onMounted(async () => {
  await nextTick()
  const cards = focusables(root.value, '.ch-card')
  const start = cards.find(c => Number(c.dataset.index) === props.current) || cards[0]
  start?.focus({ preventScroll: true })
})
</script>

<template>
  <section ref="root" class="ch" aria-labelledby="ch-heading" @keydown="onKey">
    <header class="ch-head">
      <button class="ch-back" data-nav :disabled="launching" @click="emit('close')" @mouseenter="hover"><Glyph name="back" /><span>Back</span></button>
      <h2 id="ch-heading">Chapters</h2>
      <span class="ch-head-space" aria-hidden="true"></span>
    </header>
    <ol class="ch-grid">
      <li v-for="c in chapters" :key="c.i" :style="{ '--i': c.i }">
        <button class="ch-card" data-nav :data-index="c.i" :class="{ locked: c.i > best, current: c.i === current }" :disabled="c.i > best || launching"
          :aria-label="`${c.full}${c.i > best ? ', locked' : ''}${c.i === current ? ', last played' : ''}`" @click="emit('begin', c.i)" @mouseenter="hover">
          <span class="ch-art">
            <img v-if="chapterCardArt(c.i) && failed[c.i] !== chapterCardArt(c.i)" :src="chapterCardArt(c.i)" alt="" loading="lazy" decoding="async" @error="failed[c.i] = chapterCardArt(c.i)" />
            <span v-if="c.i > best" class="ch-lock"><Glyph name="lock" /></span>
            <span v-if="c.i === current" class="ch-badge"><Glyph name="blossom" />Last played</span>
          </span>
          <Glyph name="gem" class="ch-gem" />
          <span class="ch-label"><span class="ch-mark">{{ c.mark }}</span><span class="ch-name">{{ c.name }}</span></span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.ch { --gap: clamp(10px, 1.4vw, 22px); width: min(1340px, 100%); margin: auto; display: flex; flex-direction: column; gap: clamp(10px, 3vh, 30px); }
.ch-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; }
.ch-head h2 { font: 600 clamp(20px, 2.1vw, 30px)/1 var(--display); letter-spacing: .24em; padding-left: .24em; color: #f3dcae; text-transform: uppercase; text-shadow: 0 2px 14px rgba(0,0,0,.6); }
.ch-back { justify-self: start; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px 0 10px; background: rgba(13,10,8,.5); border: 1px solid rgba(232,180,106,.38); color: #efe3cf; font: 600 12px var(--display); letter-spacing: .22em; text-transform: uppercase; transition: border-color .25s, background-color .25s, color .25s; }
.ch-back svg { width: 18px; height: 18px; }
.ch-back:hover, .ch-back:focus { outline: none; border-color: #e8b46a; background: rgba(232,180,106,.14); color: #fff3da; }
.ch-back:focus-visible { box-shadow: 0 0 0 3px rgba(164,148,255,.55); }

.ch-grid { list-style: none; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--gap); }
.ch-grid li { width: calc((100% - 4 * var(--gap)) / 5); }
@keyframes card-in { from { opacity: 0; transform: translateY(16px); } }

.ch-card { position: relative; display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 0; background: none; border: 0; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.ch-card:focus { outline: none; }
.ch-art { position: relative; display: block; aspect-ratio: 16 / 9; overflow: hidden; background: #15100b; box-shadow: 0 0 0 1px rgba(232,180,106,.26), 0 16px 28px -14px rgba(0,0,0,.85); transition: box-shadow .35s; }
.ch-art img { display: block; width: 100%; height: 100%; object-fit: cover; transform: scale(1.02); transition: transform 1.4s cubic-bezier(.16,1,.3,1), filter .4s; }
.ch-art::after { content: ''; position: absolute; inset: 5px; border: 1px solid rgba(244,234,216,0); transition: border-color .35s; pointer-events: none; }
.ch-gem { position: absolute; left: 50%; top: -1px; width: 10px; height: 14px; transform: translate(-50%, -60%) scale(.4); opacity: 0; transition: transform .45s cubic-bezier(.16,1,.3,1), opacity .3s; }
.ch-label { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ch-mark { font: 600 11px/1.2 var(--display); letter-spacing: .26em; text-transform: uppercase; color: #d9a85e; }
.ch-name { font: 500 clamp(15px, 1.3vw, 20px)/1.15 var(--serif); color: #efe5d3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: color .3s; }

.ch-card:not(:disabled):is(:hover, :focus) .ch-art { box-shadow: 0 0 0 1px #e8b46a, 0 18px 34px -12px rgba(0,0,0,.9), 0 0 26px -6px rgba(232,180,106,.45); }
.ch-card:not(:disabled):is(:hover, :focus) .ch-art img { transform: scale(1.09); }
.ch-card:not(:disabled):is(:hover, :focus) .ch-art::after { border-color: rgba(244,224,180,.55); }
.ch-card:not(:disabled):is(:hover, :focus) .ch-gem { opacity: 1; transform: translate(-50%, -38%) scale(1); }
.ch-card:not(:disabled):is(:hover, :focus) .ch-name { color: #fbe3b5; }
.ch-card:focus-visible .ch-art { box-shadow: 0 0 0 1px #e8b46a, 0 0 0 4px rgba(164,148,255,.55), 0 18px 34px -12px rgba(0,0,0,.9); }

.ch-card.locked { cursor: not-allowed; opacity: 1; }
.ch-card.locked img { filter: grayscale(.9) brightness(.38) blur(1.5px); }
.ch-card.locked .ch-mark { color: rgba(217,168,94,.55); }
.ch-card.locked .ch-name { color: rgba(239,229,211,.48); }
.ch-lock { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(232,180,106,.85); }
.ch-lock svg { width: clamp(20px, 2vw, 30px); height: clamp(20px, 2vw, 30px); }
.ch-badge { position: absolute; left: 8px; top: 8px; display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px 4px 6px; background: rgba(13,10,8,.82); border: 1px solid rgba(164,148,255,.55); font: 600 10px/1 var(--display); letter-spacing: .16em; text-transform: uppercase; color: #ddd4ff; }
.ch-badge svg { width: 13px; height: 13px; }

@media (max-height: 480px) {
  .ch { gap: 8px; }
  .ch-grid { --gap: 10px; row-gap: 8px; }
  .ch-card { gap: 4px; }
  .ch-mark { font-size: 9px; letter-spacing: .2em; }
  .ch-name { font-size: 14px; line-height: 1.1; }
  .ch-badge { left: 4px; top: 4px; padding: 3px 6px 3px 4px; font-size: 8px; letter-spacing: .1em; }
  .ch-badge svg { width: 10px; height: 10px; }
  .ch-head h2 { font-size: 18px; }
}
@media (max-width: 560px) { .ch-grid li { width: calc((100% - 2 * var(--gap)) / 3); } }
@media (prefers-reduced-motion: reduce) { .ch-grid li { animation: none; } .ch-art img { transition: none; } }
</style>
