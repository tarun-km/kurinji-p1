<script setup>
// Pause → Aruvan: spend Blessings on the staff, robes, powers and the horse's tack.
import { ref } from 'vue'
import { progress, STAFFS, COSTUMES, POWERS, HORSE_COATS, HORSE_BLANKETS, choose, owned } from '../game/progress'
const msg = ref('')
const SW = { saffron: '#d9822b', monsoon: '#2a3a7a', forest: '#3a6a3a', ash: '#4a4648', dawn: '#a8302a', royal: '#efe8d8', bay: '#6a3a1e', white: '#e8e2d6', black: '#221c1a', dapple: '#9a9690', crimson: '#8a1a1a', indigo: '#2a3a7a', jade: '#2f7a5f' }
function pick(kind, item) {
  const r = choose(kind, item.key)
  msg.value = r === 'poor' ? `You need ${item.cost} Blessings for ${item.name}.` : r === 'bought' ? `${item.name} — yours.` : `${item.name} equipped.`
  window.__game?.applyLook?.()
}
const sections = [
  { kind: 'staff', title: 'Staff', list: STAFFS, note: s => `×${s.dmg.toFixed(2)} damage` },
  { kind: 'costume', title: 'Robes', list: COSTUMES },
  { kind: 'power', title: 'Power (G / SKILL)', list: POWERS, note: p => `${p.cd}s cooldown` },
  { kind: 'coat', title: 'Horse', list: HORSE_COATS },
  { kind: 'blanket', title: 'Saddle cloth', list: HORSE_BLANKETS },
]
</script>

<template>
  <div class="aruvan-panel">
    <p class="bless">✦ {{ progress.blessings }} Blessings <small>Earned from chapters, landmarks, lamps, petals, quests and great foes.</small></p>
    <p v-if="msg" class="msg" role="status">{{ msg }}</p>
    <section v-for="sec in sections" :key="sec.kind">
      <h4>{{ sec.title }}</h4>
      <div class="cards">
        <button v-for="it in sec.list" :key="it.key" class="card" :class="{ on: progress[sec.kind] === it.key, locked: !owned(sec.kind, it.key) }" @click="pick(sec.kind, it)">
          <span v-if="SW[it.key]" class="sw" :style="{ background: SW[it.key] }"></span>
          <b>{{ it.name }}</b>
          <small v-if="it.desc">{{ it.desc }}</small>
          <small v-if="sec.note">{{ sec.note(it) }}</small>
          <em>{{ progress[sec.kind] === it.key ? 'Equipped' : owned(sec.kind, it.key) ? 'Equip' : `✦ ${it.cost}` }}</em>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.aruvan-panel { display: flex; flex-direction: column; gap: 12px; }
.bless { font: 600 18px Cinzel, serif; color: #8a5a18; display: flex; flex-direction: column; gap: 2px; }
.bless small { font: italic 14px "Cormorant Garamond", serif; color: #6a5a48; }
.msg { font: 15px "Cormorant Garamond", serif; color: #3a2a18; background: rgba(201,162,74,.18); padding: 6px 10px; }
h4 { font: 600 13px Cinzel, serif; letter-spacing: .12em; text-transform: uppercase; color: #5a4028; margin: 6px 0 4px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.card { position: relative; text-align: left; display: flex; flex-direction: column; gap: 3px; min-height: 64px; padding: 9px 10px 8px; background: rgba(255,250,238,.7); border: 1px solid rgba(90,64,40,.25); color: #2a1a0c; cursor: pointer; font: 14px "Cormorant Garamond", serif; }
.card b { font: 600 13px Cinzel, serif; letter-spacing: .03em; }
.card small { font-size: 13px; color: #6a5a48; line-height: 1.25; }
.card em { margin-top: auto; font: italic 600 13px "Cormorant Garamond", serif; color: #8a5a18; }
.card.on { border-color: #c9a24a; box-shadow: inset 0 0 0 2px rgba(201,162,74,.6); background: rgba(255,244,214,.95); }
.card.locked { opacity: .82; }
.card:focus-visible, .card:hover { border-color: #8a5a18; }
.sw { position: absolute; right: 8px; top: 8px; width: 16px; height: 16px; border-radius: 50%; border: 1px solid rgba(0,0,0,.3); }
</style>
