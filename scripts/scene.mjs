// Film strip of a story scene, rendered headless on the real GPU.
//   node scripts/scene.mjs <chapter> "<start line text>" "<end line text>" <outdir> [--every 350] [--speed 1] [--choice 0]
// Plays the chapter (auto-walking, auto-talking, enemies auto-defeated, voices muted) and saves a
// numbered JPEG of the game canvas every N ms from the moment the start line is spoken until the
// end line, plus frames.txt describing each frame (time, current dialogue, camera position).
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf('--' + n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v }
const EVERY = +opt('every', 350), SPEED = +opt('speed', 1), CHOICE = +opt('choice', 0), W = +opt('w', 1280), H = +opt('h', 720)
const [chapter, startText, endText, outDir] = argv
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p))
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H }, userDataDir: path.join(process.env.TEMP || '/tmp', 'kurinji-scene-' + process.pid),
})
fs.mkdirSync(outDir, { recursive: true })
try {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => localStorage.setItem('kurinji-settings-v3', JSON.stringify({ master: 0 })))
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(`http://127.0.0.1:${process.env.PORT || 5173}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction('window.__game && window.__game.world', { timeout: 180000 })
  await page.evaluate(async (ch, sp, choice) => {
    const m = await import('/tests/cinematic-audit.js'); window.__done = false
    m.run(ch, sp, choice).catch(e => { window.__err = String(e) }).finally(() => { window.__done = true })
  }, +chapter, SPEED, CHOICE)
  const said = () => page.evaluate(async () => (await import('/src/game/store.js')).state.dialogue?.text || (await import('/src/game/store.js')).state.caption || '')
  const t0 = Date.now()
  while (!(await said()).includes(startText)) { if (Date.now() - t0 > +(process.env.MAXMS || 600000) || await page.evaluate('window.__done')) throw new Error('start line not reached: ' + JSON.stringify(await page.evaluate(async () => { const s = (await import('/src/game/store.js')).state; return { err: window.__err, done: window.__done, ch: s.chapterIndex, obj: s.objective, dlg: s.dialogue?.text?.slice(0, 60), cap: s.caption, loading: s.loading?.title, screen: s.screen, inCombat: s.inCombat, enemies: window.__game.enemies.length } })) + ' errors: ' + errors.slice(0, 5).join(' | ')); await new Promise(r => setTimeout(r, 100)) }
  const log = []; let n = 0, seenEnd = false, endT = 0
  while (true) {
    const f = await page.evaluate(() => new Promise(r => requestAnimationFrame(async () => { const g = __game; g.renderer.composer.render(0.016); const img = g.renderer.gl.domElement.toDataURL('image/jpeg', 0.82); const s = (await import('/src/game/store.js')).state; r({ img, text: s.dialogue ? s.dialogue.speaker + ': ' + s.dialogue.text.slice(0, 60) : s.caption ? 'CAPTION ' + s.caption.slice(0, 60) : '', cam: g.camera.position.toArray().map(v => +v.toFixed(1)), cine: g.cinematic }) })))
    const file = `f${String(++n).padStart(3, '0')}.jpg`
    fs.writeFileSync(path.join(outDir, file), Buffer.from(f.img.split(',')[1], 'base64'))
    log.push(`${file} t=${((Date.now() - t0) / 1000).toFixed(1)} cine=${f.cine} cam=${f.cam} | ${f.text}`)
    if (f.text.includes(endText)) { seenEnd = true; endT ||= Date.now() }
    if ((seenEnd && Date.now() - endT > 1500) || n > 400 || await page.evaluate('window.__done')) break
    await new Promise(r => setTimeout(r, EVERY))
  }
  fs.writeFileSync(path.join(outDir, 'frames.txt'), log.join('\n') + (errors.length ? '\n\nERRORS:\n' + errors.join('\n') : ''))
  console.log(`${n} frames → ${outDir}${errors.length ? ' · errors: ' + errors.slice(0, 3).join(' | ') : ''}`)
} finally { await browser.close() }
