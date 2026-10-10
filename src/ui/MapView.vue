<script setup>
// Full-screen painted map: landmarks (found / unknown), settlements, lamps, the objective and the
// player. Tap/click a place (or anywhere) to set a waypoint; the on-screen pointer then leads there.
import { ref, onMounted, onUnmounted } from 'vue'
const emit = defineEmits(['close'])
const cv = ref(null), hover = ref(null)
let raf = 0, view = { s: 1, ox: 0, oy: 0 }
const ICON = { temple: '⛩', rock: '◈', village: '⌂', gate: '⛫', fortress: '♜', landmark: '✦' }

function draw() {
  const g = window.__game, c = cv.value
  if (!g?.map || !c) { raf = requestAnimationFrame(draw); return }
  const M = g.map, dpr = Math.min(2, devicePixelRatio || 1)
  const W = c.clientWidth, H = c.clientHeight
  if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
  const s = Math.min((W - 24) / M.W, (H - 24) / M.H), ox = (W - M.W * s) / 2, oy = (H - M.H * s) / 2
  view = { s, ox, oy }
  ctx.drawImage(M.canvas, ox, oy, M.W * s, M.H * s)
  const P = (x, z) => { const [px, py] = M.toPx(x, z); return [ox + px * s, oy + py * s] }
  const info = g.mapInfo()
  // lamps
  for (const l of info.lamps) { const [x, y] = P(l.x, l.z); ctx.fillStyle = l.lit ? '#ffb040' : 'rgba(60,44,30,.55)'; ctx.beginPath(); ctx.arc(x, y, l.lit ? 3.2 : 2.4, 0, 7); ctx.fill() }
  // places
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (const q of info.places) {
    const [x, y] = P(q.x, q.z), big = q.kind !== 'landmark'
    ctx.fillStyle = q.found ? (big ? '#5a2a14' : '#3a2a6a') : 'rgba(70,52,34,.45)'
    ctx.font = `${big ? 18 : 15}px Cinzel, serif`; ctx.fillText(q.found ? ICON[q.kind] : '?', x, y)
    ctx.font = `${big ? 12 : 11}px "Cormorant Garamond", serif`; ctx.fillStyle = q.found ? 'rgba(40,26,14,.92)' : 'rgba(70,52,34,.55)'
    ctx.fillText(q.found ? q.name : 'Undiscovered', x, y + 14)
  }
  // objective
  if (info.target) { const [x, y] = P(info.target.x, info.target.z), k = 1 + Math.sin(performance.now() / 260) * 0.15; ctx.strokeStyle = '#c8282a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9 * k, 0, 7); ctx.stroke(); ctx.fillStyle = '#c8282a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill() }
  // player arrow
  const [px, py] = P(info.player.x, info.player.z)
  ctx.save(); ctx.translate(px, py); ctx.rotate(-info.player.facing + Math.PI)
  ctx.fillStyle = '#e8b46a'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore()
  // compass rose
  ctx.save(); ctx.translate(ox + M.W * s - 40, oy + 44); ctx.fillStyle = 'rgba(40,26,14,.85)'; ctx.font = '14px Cinzel, serif'; ctx.fillText('N', 0, -22)
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(5, 0); ctx.lineTo(0, 16); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.restore()
  raf = requestAnimationFrame(draw)
}
function pick(ev) {
  const g = window.__game; if (!g?.map) return
  const r = cv.value.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top
  const [wx, wz] = g.map.toWorld((mx - view.ox) / view.s, (my - view.oy) / view.s)
  // snap to a place if close
  let best = null, bd = 18 * 18
  for (const q of g.mapInfo().places) { const d = (q.x - wx) ** 2 + (q.z - wz) ** 2; if (d < bd) { bd = d; best = q } }
  if (best) g.setWaypoint(best.x, best.z, best.found ? best.name : 'Undiscovered place')
  else g.setWaypoint(wx, wz, 'Waypoint')
}
function clearWaypoint() { window.__game?.setWaypoint(null); emit('close') }
onMounted(() => { raf = requestAnimationFrame(draw) })
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="mapview" role="dialog" aria-label="Map of the land" @click.self="emit('close')">
    <div class="map-frame">
      <header><h3>The Land of Kurinji</h3><p>Tap a place to set a waypoint · M / Esc to close</p></header>
      <canvas ref="cv" @click="pick"></canvas>
      <footer>
        <span><b>◆</b> objective</span><span><b class="lit">●</b> lamp lit</span><span><b>●</b> unlit lamp</span><span><b>✦</b> landmark</span>
        <button class="ghost small" @click="clearWaypoint">Clear waypoint</button>
        <button class="primary-button" @click="emit('close')">Close</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.mapview { position: fixed; inset: 0; z-index: 45; background: rgba(8, 6, 4, .72); display: flex; align-items: center; justify-content: center; padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)); }
.map-frame { display: flex; flex-direction: column; width: min(1100px, 100%); height: min(860px, 100%); background: #e9dec4; border: 1px solid #8a6a40; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
header { display: flex; align-items: baseline; gap: 16px; padding: 10px 16px 4px; color: #3a2a18; }
header h3 { font: 600 20px Cinzel, serif; letter-spacing: .08em; margin: 0; }
header p { font: italic 15px "Cormorant Garamond", serif; margin: 0; opacity: .8; }
canvas { flex: 1; width: 100%; min-height: 0; cursor: crosshair; touch-action: none; }
footer { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; padding: 6px 16px 10px; font: 14px "Cormorant Garamond", serif; color: #3a2a18; }
footer b { color: #c8282a; } footer b.lit { color: #ffb040; }
footer .ghost { margin-left: auto; color: #3a2a18; border-color: rgba(58,42,24,.4); }
@media (max-height: 480px) { header p { display: none; } header { padding: 6px 12px 2px; } header h3 { font-size: 16px; } footer { padding: 4px 12px 6px; gap: 10px; font-size: 13px; } }
</style>
