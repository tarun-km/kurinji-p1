<script setup>
// Authored icon set for the menus: faceted gems drawn as polygons (the game's faceted-3D language)
// and a few line icons in one 1.6 stroke.
defineProps({ name: { type: String, required: true } })

// five broad petals, each split down its midrib into a lit and a shaded facet
const petals = Array.from({ length: 5 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI * 2) / 5
  const p = (r, da) => `${(Math.cos(a + da) * r).toFixed(2)},${(Math.sin(a + da) * r).toFixed(2)}`
  return { lit: `0,0 ${p(4.4, -0.46)} ${p(9, -0.3)} ${p(11.2, 0)}`, shade: `0,0 ${p(11.2, 0)} ${p(9, 0.3)} ${p(4.4, 0.46)}` }
})
</script>

<template>
  <svg v-if="name === 'gem'" class="glyph gem" viewBox="0 0 20 28" aria-hidden="true">
    <polygon points="10,0 10,14 0,14" fill="#fff0c4" />
    <polygon points="10,0 20,14 10,14" fill="#efc078" />
    <polygon points="0,14 10,14 10,28" fill="#c98b40" />
    <polygon points="10,14 20,14 10,28" fill="#8f5a22" />
  </svg>
  <svg v-else-if="name === 'blossom'" class="glyph blossom" viewBox="-12 -12 24 24" aria-hidden="true">
    <g v-for="(p, i) in petals" :key="i"><polygon :points="p.lit" fill="#cfc4ff" /><polygon :points="p.shade" fill="#8572ec" /></g>
    <circle r="1.9" fill="#f6d79a" />
  </svg>
  <svg v-else class="glyph line" viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="name === 'lock'"><rect x="5.5" y="11" width="13" height="9.5" rx="1" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></template>
    <path v-else-if="name === 'back'" d="M15 5 8 12l7 7" />
    <path v-else-if="name === 'fullscreen'" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    <path v-else-if="name === 'install'" d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" />
    <template v-else-if="name === 'device'"><rect x="3" y="6.5" width="18" height="11" rx="2" /><path d="M17.5 12h.01" /></template>
  </svg>
</template>

<style scoped>
.glyph { display: block; flex: none; }
.line { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
</style>
