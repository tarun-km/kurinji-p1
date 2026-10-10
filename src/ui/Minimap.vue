<script setup>
// Circular minimap that turns with the camera: the land around the player, the objective
// (an arrow on the rim when it is beyond the map), nearby lamps and places. Tap to open the map.
import { ref, onMounted, onUnmounted } from 'vue'
const emit = defineEmits(['open'])
const cv = ref(null)
const RANGE = 70 // metres from centre to rim
let raf = 0, tick = 0
function draw() {
  raf = requestAnimationFrame(draw)
  if ((tick = (tick + 1) % 2)) return // 30 fps is plenty
  const g = window.__game, c = cv.value
  if (!g?.map || !c || !g.player) return
  const M = g.map, size = c.clientWidth, dpr = Math.min(2, devicePixelRatio || 1)
  if (c.width !== size * dpr) { c.width = c.height = size * dpr }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size)
  const r = size / 2, k = r / RANGE, info = g.mapInfo(), p = info.player, rot = info.player.cam + Math.PI
  ctx.save(); ctx.beginPath(); ctx.arc(r, r, r - 2, 0, 7); ctx.clip()
  ctx.translate(r, r); ctx.rotate(rot)
  const [px, py] = M.toPx(p.x, p.z), s = k / M.scale
  ctx.drawImage(M.canvas, -px * s, -py * s, M.W * s, M.H * s)
  const W = (x, z) => [(x - p.x) * k, (z - p.z) * k]
  for (const l of info.lamps) { const [x, y] = W(l.x, l.z); if (x * x + y * y < r * r) { ctx.fillStyle = l.lit ? '#ffb040' : 'rgba(40,30,20,.6)'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill() } }
  for (const q of info.places) { const [x, y] = W(q.x, q.z); if (x * x + y * y < r * r) { ctx.fillStyle = q.found ? '#3a2a6a' : 'rgba(60,44,30,.6)'; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill() } }
  ctx.restore()
  // objective: dot inside, arrow on the rim outside
  if (info.target) {
    const dx = (info.target.x - p.x) * k, dz = (info.target.z - p.z) * k
    const a = Math.atan2(dz, dx) + rot, d = Math.min(Math.hypot(dx, dz), r - 9)
    const x = r + Math.cos(a) * d, y = r + Math.sin(a) * d
    ctx.fillStyle = '#d8323a'; ctx.save(); ctx.translate(x, y); ctx.rotate(a)
    ctx.beginPath(); if (d >= r - 9.5) { ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5) } else ctx.arc(0, 0, 4, 0, 7); ctx.fill(); ctx.restore()
  }
  // player (always facing relative to the camera)
  ctx.save(); ctx.translate(r, r); ctx.rotate(rot - p.facing + Math.PI)
  ctx.fillStyle = '#f2c070'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore()
  // rim + north tick
  ctx.strokeStyle = 'rgba(232,180,106,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r, r, r - 1.5, 0, 7); ctx.stroke()
  const na = -Math.PI / 2 + rot; ctx.fillStyle = '#f4ead8'; ctx.font = '600 11px Cinzel, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('N', r + Math.cos(na) * (r - 10), r + Math.sin(na) * (r - 10))
}
onMounted(() => { raf = requestAnimationFrame(draw) })
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<template>
  <button class="minimap" aria-label="Open map" @click="emit('open')"><canvas ref="cv"></canvas></button>
</template>

<style scoped>
.minimap { position: fixed; z-index: 12; right: max(18px, env(safe-area-inset-right)); top: calc(max(18px, env(safe-area-inset-top)) + 100px); width: 148px; height: 148px; padding: 0; border: 0; border-radius: 50%; background: rgba(13,10,8,.55); box-shadow: 0 6px 24px rgba(0,0,0,.45); cursor: pointer; }
canvas { width: 100%; height: 100%; display: block; border-radius: 50%; }
@media (max-height: 480px) { .minimap { width: 104px; height: 104px; top: calc(max(10px, env(safe-area-inset-top)) + 90px); } }
</style>
