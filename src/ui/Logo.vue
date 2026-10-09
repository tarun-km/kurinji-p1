<script setup>
// "Kurinji / The Last Bloom" lockup. Cinzel sets lowercase as small capitals, so the plain word
// reads as the storybook board's tall K over a small-cap run.
import Glyph from './Glyph.vue'
defineProps({ tag: { type: String, default: 'h1' }, sub: { type: String, default: 'The Last Bloom' }, play: { type: Boolean, default: false } })
</script>

<template>
  <div class="logo" :class="{ play }">
    <component :is="tag" class="logo-word">Kurinji</component>
    <div class="logo-rule" aria-hidden="true"><span></span><Glyph name="gem" class="logo-gem" /><span></span></div>
    <div v-if="sub" class="logo-sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.logo { --size: 96px; display: inline-flex; flex-direction: column; align-items: center; }
.logo-word {
  position: relative; margin: 0; padding: .04em .04em .1em; font: 800 var(--size)/.92 var(--display); letter-spacing: .045em; white-space: nowrap;
  color: #efc783; text-shadow: 0 .09em .22em rgba(0,0,0,.55);
}
.logo-rule { display: flex; align-items: center; gap: .55em; width: 78%; margin-top: calc(var(--size) * .1); font-size: calc(var(--size) * .16); }
.logo-rule span { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(232,180,106,0), rgba(232,180,106,.9)); }
.logo-rule span:last-child { background: linear-gradient(270deg, rgba(232,180,106,0), rgba(232,180,106,.9)); }
.logo-gem { width: .55em; height: .8em; }
.logo-sub { margin-top: calc(var(--size) * .1); padding-left: .52em; font: 500 calc(var(--size) * .2)/1 var(--display); letter-spacing: .52em; text-transform: uppercase; color: #ece2ff; text-shadow: 0 2px 10px rgba(0,0,0,.6); white-space: nowrap; }

/* One brief entrance, with the lettering visible from its first frame. */
.play .logo-word { animation: word-in 1.3s cubic-bezier(.16,1,.3,1) both; }
.play .logo-rule span { animation: rule-in 1.1s cubic-bezier(.16,1,.3,1) .15s both; }
.play .logo-gem { animation: gem-in .9s cubic-bezier(.16,1,.3,1) .2s both; }
.play .logo-sub { animation: sub-in 1.1s cubic-bezier(.16,1,.3,1) .15s both; }
@keyframes word-in { from { opacity: .7; transform: scale(1.02); filter: blur(4px); } }
@keyframes rule-in { from { transform: scaleX(0); opacity: 0; } }
.logo-rule span:first-child { transform-origin: right center; }
.logo-rule span:last-child { transform-origin: left center; }
@keyframes gem-in { from { opacity: .6; transform: scale(.7); } }
@keyframes sub-in { from { opacity: .7; transform: translateY(.15em); } }
@media (prefers-reduced-motion: reduce) { .play .logo-word, .play .logo-rule span, .play .logo-gem, .play .logo-sub { animation: none; } }
</style>
