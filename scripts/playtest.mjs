// Headless playtest of story chapters in parallel: page errors, console errors/warnings,
// failed requests and stalls, one chapter per browser.
//   PORT=5173 node scripts/playtest.mjs [chapters=0,1,…,8] [--speed 4] [--jobs 3] [--choice 0]
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf('--' + n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v }
const SPEED = +opt('speed', 4), JOBS = +opt('jobs', 3), CHOICE = +opt('choice', 0), PORT = process.env.PORT || 5173
const chapters = (argv[0] || '0,1,2,3,4,5,6,7,8').split(',').map(Number)
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p))

async function play(ch) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    defaultViewport: { width: 1100, height: 620 }, userDataDir: path.join(process.env.TEMP || '/tmp', `kurinji-play-${process.pid}-${ch}`),
  })
  const issues = new Set(), t0 = Date.now()
  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(() => localStorage.setItem('kurinji-settings-v3', JSON.stringify({ master: 0 })))
    page.on('pageerror', e => issues.add('PAGEERROR ' + e.message.slice(0, 300)))
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|THREE.WebGLRenderer: Context Lost|ReadPixels/.test(t))) issues.add(m.type().toUpperCase() + ' ' + t.slice(0, 300)) })
    page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) issues.add(`HTTP ${r.status()} ${r.url()}`) })
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction('window.__game && window.__game.world', { timeout: 240000 })
    await page.evaluate(async (ch, sp, choice) => {
      const m = await import('/tests/cinematic-audit.js'); window.__done = false
      m.run(ch, sp, choice).catch(e => { window.__err = String(e && e.stack || e) }).finally(() => { window.__done = true })
    }, ch, SPEED, CHOICE)
    let last = '', lastChange = Date.now(), result = 'ok'
    while (true) {
      await new Promise(r => setTimeout(r, 1500))
      const s = await page.evaluate(async () => { const s = (await import('/src/game/store.js')).state; return { ch: s.chapterIndex, done: window.__done, err: window.__err, key: [s.chapterIndex, s.dialogue?.text, s.objective, s.caption, s.loading?.label, s.card?.title, s.inCombat, s.deathMsg].join('|'), screen: s.screen, loadErr: s.loading?.error } })
      if (s.err) { issues.add('RUN ERROR ' + s.err.slice(0, 500)); result = 'error'; break }
      if (s.loadErr) { issues.add('LOAD ERROR ' + s.loadErr); result = 'error'; break }
      if (s.done || s.ch > ch || s.screen === 'credits') break
      if (s.key !== last) { last = s.key; lastChange = Date.now() }
      else if (Date.now() - lastChange > 120000) { issues.add('STALL at: ' + s.key.slice(0, 300)); result = 'stall'; break }
      if (Date.now() - t0 > 900000) { issues.add('TIMEOUT at: ' + s.key.slice(0, 300)); result = 'timeout'; break }
    }
    return { ch, result, secs: Math.round((Date.now() - t0) / 1000), issues: [...issues] }
  } catch (e) { return { ch, result: 'crash', issues: [...issues, 'CRASH ' + e.message.slice(0, 300)] } }
  finally { await browser.close() }
}

const queue = [...chapters], out = []
await Promise.all(Array.from({ length: JOBS }, async () => { while (queue.length) { const ch = queue.shift(); const r = await play(ch); out.push(r); console.log(JSON.stringify(r)) } }))
fs.mkdirSync('.tmp', { recursive: true }); fs.writeFileSync('.tmp/playtest.json', JSON.stringify(out.sort((a, b) => a.ch - b.ch), null, 1))
