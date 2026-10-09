<script setup>
// "Kurinji / The Last Bloom" lockup. Cinzel sets lowercase as small capitals, so the plain word
// reads as the storybook board's tall K over a small-cap run. The gold is cut into facets.
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
.logo { --size: 112px; display: inline-flex; flex-direction: column; align-items: center; }
.logo-word {
  position: relative; margin: 0; padding: .04em .04em .1em; font: 800 var(--size)/.92 var(--display); letter-spacing: .045em; white-space: nowrap;
  color: #e8b46a; -webkit-text-fill-color: transparent;
  background-image:
    linear-gradient(104deg, rgba(255,252,236,0) 38%, rgba(255,252,236,.9) 50%, rgba(255,252,236,0) 62%),
    linear-gradient(174deg, rgba(255,243,212,.42) 0 46%, rgba(70,34,8,.2) 46.5% 100%),
    linear-gradient(108deg, #f5d899 0 13%, #e2a95c 13% 26%, #f0c680 26% 40%, #d39a4e 40% 55%, #f3cd8a 55% 68%, #c78a42 68% 82%, #ecc07b 82% 100%);
  background-size: 260% 100%, 100% 100%, 100% 100%;
  background-position: 135% 0, 0 0, 0 0;
  background-repeat: no-repeat;
  -webkit-background-clip: text; background-clip: text;
  filter: blur(0) drop-shadow(0 .018em 0 #4b2a0c) drop-shadow(0 .1em .2em rgba(0,0,0,.55));
}
.logo-rule { display: flex; align-items: center; gap: .55em; width: 78%; margin-top: calc(var(--size) * .1); font-size: calc(var(--size) * .16); }
.logo-rule span { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(232,180,106,0), rgba(232,180,106,.9)); }
.logo-rule span:last-child { background: linear-gradient(270deg, rgba(232,180,106,0), rgba(232,180,106,.9)); }
.logo-gem { width: .55em; height: .8em; }
.logo-sub { margin-top: calc(var(--size) * .1); padding-left: .52em; font: 500 calc(var(--size) * .2)/1 var(--display); letter-spacing: .52em; text-transform: uppercase; color: #ece2ff; text-shadow: 0 2px 10px rgba(0,0,0,.6); white-space: nowrap; }

/* the title's one authored moment: the word condenses out of haze, the rule draws, light runs across the gold */
.play .logo-word { animation: word-in 2.4s cubic-bezier(.16,1,.3,1) both, shine 1.8s cubic-bezier(.45,0,.2,1) 1.7s both; }
.play .logo-rule span { animation: rule-in 1.6s cubic-bezier(.16,1,.3,1) .9s both; }
.play .logo-gem { animation: gem-in 1s cubic-bezier(.16,1,.3,1) 1.2s both; }
.play .logo-sub { animation: sub-in 1.8s cubic-bezier(.16,1,.3,1) 1.2s both; }
@keyframes word-in { from { opacity: 0; transform: scale(1.1); filter: blur(16px) drop-shadow(0 .018em 0 rgba(75,42,12,0)) drop-shadow(0 .1em .2em rgba(0,0,0,0)); } 55% { opacity: 1; } }
@keyframes shine { from { background-position: 100% 0, 0 0, 0 0; } to { background-position: -8% 0, 0 0, 0 0; } }
@keyframes rule-in { from { transform: scaleX(0); opacity: 0; } }
.logo-rule span:first-child { transform-origin: right center; }
.logo-rule span:last-child { transform-origin: left center; }
@keyframes gem-in { from { opacity: 0; transform: scale(.2) rotate(-90deg); } }
@keyframes sub-in { from { opacity: 0; transform: translateY(.5em); filter: blur(6px); } }
@media (prefers-reduced-motion: reduce) { .play .logo-word, .play .logo-rule span, .play .logo-gem, .play .logo-sub { animation: none; } }
</style>
