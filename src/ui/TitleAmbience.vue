<script setup>
// Foreground air over the live title shot: a few faceted Kurinji petals tumbling on the wind
// (the nearest ones out of focus) and warm motes rising. One small 2D canvas, a handful of
// sprite blits per frame; it stops whenever the title is hidden, and holds still for reduced motion.
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { settings, isMobile } from '../game/settings'

const props = defineProps({ active: { type: Boolean, default: true } })
const canvas = ref(null)
let ctx = null, w = 0, h = 0, dpr = 1, raf = 0, last = 0, skip = false, frame = 0
let petals = [], motes = [], sprites = null
const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')

function petalSprite(size, soft) {
  const scale = soft ? 0.22 : 1, n = Math.max(8, Math.round(size * scale))
  const c = document.createElement('canvas'); c.width = c.height = n
  const g = c.getContext('2d'); g.translate(n / 2, n / 2)
  const ry = n * 0.46, rx = n * 0.3
  const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * rx, y * ry) : g.moveTo(x * rx, y * ry))); g.closePath(); g.fillStyle = fill; g.fill() }
  poly([[0, 1], [-1, 0.3], [-0.82, -0.48], [0, -1]], '#b9a7ff')
  poly([[0, -1], [-0.82, -0.48], [-0.1, -0.12]], '#ddd3ff')
  poly([[0, 1], [1, 0.3], [0.82, -0.48], [0, -1]], '#7d66e6')
  poly([[0, 1], [0.3, 0.55], [0, 0.2]], '#6a52d6')
  if (!soft) return c
  const big = document.createElement('canvas'); big.width = big.height = size
  const b = big.getContext('2d'); b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high'; b.drawImage(c, 0, 0, size, size)
  return big
}
function moteSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 32
  const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  r.addColorStop(0, 'rgba(255,236,190,1)'); r.addColorStop(0.22, 'rgba(250,206,130,.75)'); r.addColorStop(0.55, 'rgba(240,165,74,.18)'); r.addColorStop(1, 'rgba(240,165,74,0)')
  g.fillStyle = r; g.fillRect(0, 0, 32, 32)
  return c
}

const rnd = (a, b) => a + Math.random() * (b - a)
function spawnPetal(p = {}, fresh = false) {
  const z = Math.random() ** 1.6 // most petals far away, a few close to the lens
  Object.assign(p, {
    z, soft: z > 0.82, size: z > 0.82 ? rnd(46, 74) : 9 + z * 26,
    x: fresh ? rnd(0, w) : rnd(w * 0.2, w + 80), y: fresh ? rnd(-40, h) : rnd(-90, -20),
    vx: -(10 + z * 34), vy: 12 + z * 30, sway: rnd(8, 26), swayF: rnd(0.25, 0.7), phase: rnd(0, 6.3),
    rot: rnd(0, 6.3), spin: rnd(-0.9, 0.9), flip: rnd(0, 6.3), flipF: rnd(0.6, 1.8), alpha: z > 0.82 ? rnd(0.28, 0.42) : rnd(0.55, 0.9),
  })
  if (!fresh && Math.random() < 0.45) { p.x = w + 40; p.y = rnd(-40, h * 0.7) } // some ride in from the right
  return p
}
function spawnMote(m = {}, fresh = false) {
  return Object.assign(m, { x: rnd(0, w), y: fresh ? rnd(0, h) : h + 10, vy: -rnd(5, 16), vx: rnd(-4, 6), size: rnd(3, 9), phase: rnd(0, 6.3), tw: rnd(0.6, 1.6), alpha: rnd(0.3, 0.75) })
}

function resize() {
  const el = canvas.value; if (!el) return
  dpr = Math.min(devicePixelRatio || 1, isMobile ? 1 : 1.5)
  w = innerWidth; h = innerHeight
  el.width = Math.round(w * dpr); el.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
function populate() {
  const light = isMobile || settings.preset === 'low'
  petals = Array.from({ length: light ? 8 : 15 }, () => spawnPetal({}, true))
  motes = Array.from({ length: light ? 10 : 22 }, () => spawnMote({}, true))
}

function draw(t, dt) {
  ctx.clearRect(0, 0, w, h)
  const textSide = w * 0.42
  ctx.globalCompositeOperation = 'lighter'
  for (const m of motes) {
    m.x += m.vx * dt; m.y += m.vy * dt
    if (m.y < -20) spawnMote(m)
    const a = m.alpha * (0.45 + 0.55 * Math.sin(t * m.tw + m.phase) ** 2), s = m.size * 4
    ctx.globalAlpha = a; ctx.drawImage(sprites.mote, m.x - s / 2, m.y - s / 2, s, s)
  }
  ctx.globalCompositeOperation = 'source-over'
  for (const p of petals) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; p.flip += p.flipF * dt
    if (p.y > h + 80 || p.x < -90) spawnPetal(p)
    const x = p.x + Math.sin(t * p.swayF + p.phase) * p.sway, fx = Math.cos(p.flip)
    // keep the menu column clear: petals thin out over the text side
    const keep = p.soft ? (x < textSide ? 0.25 : 1) : Math.min(1, 0.45 + Math.max(0, x - textSide * 0.5) / textSide)
    ctx.globalAlpha = p.alpha * keep
    const sx = Math.abs(fx) < 0.18 ? 0.18 * Math.sign(fx || 1) : fx, c = Math.cos(p.rot), s0 = Math.sin(p.rot)
    ctx.setTransform(dpr * c * sx, dpr * s0 * sx, -dpr * s0, dpr * c, x * dpr, p.y * dpr) // rotate × tumble (scale x)
    const img = p.soft ? sprites.soft : sprites.petal, s = p.size
    ctx.drawImage(img, -s / 2, -s / 2, s, s)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  ctx.globalAlpha = 1
}

function loop(now) {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now
  // phones and the low preset draw every other frame: slow air reads the same at 30 fps
  if (skip && (frame++ & 1)) return
  draw(now / 1000, skip ? dt * 2 : dt)
}
function start() {
  if (raf || !ctx || !props.active || document.hidden) return
  if (reduced?.matches) { draw(0, 0); return }
  last = performance.now(); raf = requestAnimationFrame(loop)
}
function stop() { cancelAnimationFrame(raf); raf = 0 }
const onVisibility = () => (document.hidden ? stop() : start())
const onResize = () => { resize(); if (!raf) draw(0, 0) }

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  if (!ctx) return
  skip = isMobile || settings.preset === 'low'
  sprites = { petal: petalSprite(64, false), soft: petalSprite(96, true), mote: moteSprite() }
  resize(); populate(); start()
  addEventListener('resize', onResize); document.addEventListener('visibilitychange', onVisibility)
})
watch(() => props.active, on => (on ? start() : stop()))
onUnmounted(() => { stop(); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVisibility) })
</script>

<template>
  <canvas ref="canvas" class="ambience" aria-hidden="true"></canvas>
</template>

<style scoped>
.ambience { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
