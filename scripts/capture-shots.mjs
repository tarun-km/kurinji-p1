// Captures cinematic in-game shots for the loading screens and chapter cards.
//
//   node scripts/capture-shots.mjs                 every shot in SHOTS (dev server must be running)
//   node scripts/capture-shots.mjs ch2 epilogue    only those chapter keys
//   options: --w 1920 --h 1080 --preset ultra --port 5173 --dry (render previews into .tmp/shots only)
//
// Each shot stages the real game world (world state, time of day, characters and poses) and a
// camera, renders through the game's renderer + post-processing at full resolution, and saves
// public/art/shots/<key>-<n>.webp (q 86) plus public/art/shots/index.json = { key: [files] }.
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf('--' + n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v }
const DRY = argv.includes('--dry'); if (DRY) argv.splice(argv.indexOf('--dry'), 1)
const W = +opt('w', 1920), H = +opt('h', 1080), PORT = opt('port', 5173), PRESET = opt('preset', 'ultra')
const ONLY = argv.filter(a => !a.startsWith('--'))
const OUT = path.resolve(DRY ? '.tmp/shots' : 'public/art/shots')

// ---------------------------------------------------------------------------------------
// Shot list. Coordinates are world space; y values are added to the ground height at the
// actor/target unless `abs` is set. actors: [id, preset, x, z, faceRadians, {sustain, weapon, activity, extra}]
// world: Thennur 'burning'|'ruined'|'rebuilt', temple 'peaceful'|'burning', gate [broken, t, storm],
//        fortress 'iron'|'healing', bloom 0..1, petals 0..1
// ---------------------------------------------------------------------------------------
export const SHOTS = {
  prologue: [
    { name: 'ash-hound', time: 'memory', world: { thennur: 'burning' }, actors: [['veeran', 'veeran', -4.6, 92.6, 0.15, { weapon: 'sword' }]], cam: [-6.6, 0.9, 89.2], look: [-4.4, 1.75, 93.4], fov: 32 },
    { name: 'iron-king', time: 'memory', world: { thennur: 'burning' }, actors: [['dunkan', 'dunkan', -2.6, 96.4, 3.6], ['rudhra', 'rudhraYoung', -5.6, 95.2, 3.2]], cam: [-4.2, 0.8, 92.9], look: [-2.6, 2.4, 96.4], fov: 30 },
    { name: 'malli', time: 'memory', world: { thennur: 'burning' }, actors: [['malli', 'malli', -12.8, 104.4, 0, { sustain: 'lie', weapon: 'flower' }], ['veeran', 'veeran', -13.55, 104.0, 1.2, { sustain: 'hold' }]], cam: [-10.8, 0.75, 106.8], look: [-12.6, 0.55, 104.2], fov: 34 },
    { name: 'the-climb', time: 'storm', world: { thennur: 'ruined' }, actors: [['veeran', 'veeran', 1.2, -48, Math.PI]], cam: [3.6, 0.9, -52.2], look: [1.2, 1.4, -48], fov: 36 },
  ],
  ch1: [
    { name: 'dawn-rock', time: 'dawn', world: {}, actors: [['aruvan', 'aruvan', 20, -90, 1.28, { sustain: 'meditate', onRock: true }]], cam: [15.8, 2.3, -92.2], look: [50, -4, -78], fov: 50 },
    { name: 'village-morning', time: 'day', world: {}, actors: [['thamarai', 'thamarai', -4, -5, 0.6, { activity: 'chat' }], ['aruvan', 'aruvan', -2.6, -3.2, 3.8], ['ilan', 'ilan', 4.5, -0.5, -1]], cam: [-7, 1.6, 2], look: [2, 2.2, -14], fov: 46 },
  ],
  ch2: [
    { name: 'iron-envoy', time: 'dusk', world: {}, actors: [['rudhra', 'rudhra', 0, 14, Math.PI], ['s1', 'soldier', -2, 17, Math.PI], ['s2', 'soldier', 2, 17, Math.PI], ['s3', 'captain', -4, 18, Math.PI]], cam: [-2.4, 0.7, 9], look: [0, 2.2, 18], fov: 36 },
    { name: 'face-off', time: 'dusk', world: {}, actors: [['aruvan', 'aruvan', -1.6, 8.4, 0], ['rudhra', 'rudhra', -1.5, 10.6, Math.PI]], cam: [1.2, 1.55, 7.2], look: [-1.5, 1.7, 10.4], fov: 32 },
  ],
  ch3: [
    { name: 'night-temple', time: 'night', world: {}, actors: [['guru', 'guru', 0, -60.5, 0, { sustain: 'meditate' }], ['aruvan', 'aruvan', 0, -58.4, Math.PI, { sustain: 'meditate' }]], cam: [4.5, 1.6, -57.5], look: [0, 1, -59.5], fov: 34 },
    { name: 'temple-burns', time: 'night', world: { temple: 'burning' }, actors: [], cam: [10, 9, -45], look: [0, 4, -70], fov: 44 },
  ],
  ch4: [
    { name: 'gate-storm', time: 'storm', world: { gate: [true, 0, true] }, actors: [['aruvan', 'aruvan', 0, 40, 0, { weapon: 'staff', extra: { ironStaff: true } }], ['kaali', 'kaali', -2.4, 39, 0.2]], cam: [-7, 1.2, 36], look: [0, 2.2, 46], fov: 50 },
  ],
  ch5: [
    { name: 'bush-in-ruins', time: 'dusk', world: { thennur: 'ruined', malliBush: true }, actors: [], cam: [-14.6, 1.1, 99.8], look: [-11.4, 1.0, 107], fov: 38 },
    { name: 'last-hound', time: 'dusk', world: { thennur: 'ruined' }, actors: [['rudhra', 'rudhra', -4, 110, Math.PI], ['aruvan', 'aruvan', -4, 105, 0]], cam: [-1.2, 1.2, 104], look: [-4, 1.8, 110], fov: 34 },
  ],
  ch6: [
    { name: 'iron-throne', time: 'night', world: { fortress: 'iron' }, actors: [['dunkan', 'dunkan', 0, 170, Math.PI, { sustain: 'throne' }]], cam: [-3.2, 0.9, 162.5], look: [0, 3.0, 170], fov: 38 },
    { name: 'empty-throne', time: 'dusk', world: { fortress: 'iron' }, actors: [['aruvan', 'aruvan', -1.2, 166, 0.3, { sustain: 'refuse' }]], cam: [-6.5, 1.6, 162.5], look: [0, 1.6, 167.6], fov: 40 },
  ],
  ch7: [
    { name: 'peaceful-reign', time: 'day', world: { thennur: 'rebuilt', fortress: 'healing' }, actors: [['ilanAdult', 'ilanAdult', -8, 98, 0.4, { sustain: 'teach' }], ['k1', 'ilan', -7, 100, Math.PI, { sustain: 'sit', extra: { cloth: 0xc94a4a } }], ['k2', 'ilan', -9, 100.4, Math.PI, { sustain: 'sit', extra: { cloth: 0x4a8ac9 } }]], cam: [-12.2, 1.3, 102.6], look: [-8, 0.9, 98], fov: 40 },
  ],
  epilogue: [
    { name: 'last-bloom', time: 'bloom', world: { bloom: 0.9, petals: 0.8 }, actors: [['aruvan', 'aruvanOld', 20, -90, 0.15, { sustain: 'meditate', onRock: true }]], cam: [22.6, 1.9, -94.6], look: [15, -6, -50], fov: 46 },
  ],
  freeroam: [
    { name: 'valley', time: 'day', world: { thennur: 'rebuilt' }, actors: [], cam: [34, 72, -44], look: [0, 30, 40], fov: 50, abs: true },
  ],
  title: [
    { name: 'poster', time: 'bloom', world: { bloom: 0.75, petals: 0.7 }, actors: [['aruvan', 'aruvanOld', 20, -90, 0.15, { sustain: 'meditate', onRock: true }]], cam: [22.4, 1.9, -94.4], look: [15, -6, -50], fov: 46 },
  ],
}

const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome']
  .find(p => p && fs.existsSync(p))
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  userDataDir: path.join(process.env.TEMP || '/tmp', 'kurinji-shots-' + process.pid),
})
fs.mkdirSync(OUT, { recursive: true })
const indexPath = path.join(OUT, 'index.json')
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8') || '{}') : {}
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.world && window.__view', { timeout: 180000 })
  await page.evaluate(async preset => {
    const s = await import('/src/game/settings.js')
    s.applyPreset(preset); s.settings.adaptive = false
    window.__game.dropNpc('titleMonk')
  }, PRESET)
  for (const [key, shots] of Object.entries(SHOTS)) {
    if (ONLY.length && !ONLY.includes(key)) continue
    index[key] = []
    for (let n = 0; n < shots.length; n++) {
      const shot = shots[n]
      const data = await page.evaluate(async s => {
        const g = window.__game, w = g.world
        for (const id of [...g.npcs.keys()]) g.dropNpc(id)
        w.setThennur?.(s.world.thennur || 'ruined'); w.setTemple?.(s.world.temple || 'peaceful')
        w.setFortress?.(s.world.fortress || 'iron'); w.setGate?.(...(s.world.gate || [false, 0, false]))
        if (w.malliBush) w.malliBush.visible = !!s.world.malliBush
        w.setBloom(s.world.bloom || 0); w.setPetals(s.world.petals || 0)
        const gy = (x, z) => w.groundAt(x, z)
        for (const [id, preset, x, z, face, o = {}] of s.actors) {
          const n = g.npc(id, preset, x, z, face, o.extra)
          n.lookAtPlayer = false
          if (o.onRock) { n.pos.y = w.rockTop.y; n.setPos?.(w.rockTop.x, w.rockTop.z, face); n.pos.y = w.rockTop.y }
          if (o.weapon) n.char.setWeapon(o.weapon)
          if (o.sustain) n.char.sustain = o.sustain
          if (o.activity) n.char.activity = o.activity
        }
        const at = (p, base) => s.abs ? p : [p[0], p[1] + gy(base[0], base[2]), p[2]]
        const target = s.look
        const cam = at(s.cam, s.cam), look = s.abs ? s.look : [target[0], target[1] + gy(target[0], target[2]), target[2]]
        window.__view(cam, look, s.time)
        g.lens.fov = s.fov; g.lens.roll = s.roll || 0; g.lens.hand = 0
        g.renderer.dynScale = 1; g.renderer.resize()
        await new Promise(r => setTimeout(r, 4500)) // poses settle, shadows and fades finish
        return new Promise(r => requestAnimationFrame(() => { g.renderer.composer.render(0.016); r(g.renderer.gl.domElement.toDataURL('image/png')) }))
      }, shot)
      const file = `${key}-${n + 1}.webp`
      await sharp(Buffer.from(data.split(',')[1], 'base64')).resize(W, H, { fit: 'cover' }).webp({ quality: 86 }).toFile(path.join(OUT, file))
      await sharp(Buffer.from(data.split(',')[1], 'base64')).resize(640, 360, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(OUT, file.replace('.webp', '-sm.webp')))
      index[key].push(file)
      console.log(`✓ ${file}  (${shot.name})`)
    }
  }
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n')
  if (errors.length) console.log('page errors:\n' + errors.slice(0, 10).join('\n'))
  console.log(`saved ${Object.values(index).flat().length} shots → ${OUT}`)
} finally { await browser.close() }
