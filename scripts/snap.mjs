// Headless snapshots of the running dev server (npm run dev) with the real GPU.
//
//   node scripts/snap.mjs studio "kind=char&ids=aruvan" out.png            isolated subject (tests/studio.html)
//   node scripts/snap.mjs view "x,y,z" "lx,ly,lz" day out.png [--js "…"]   a viewpoint in the full game world
//   node scripts/snap.mjs page home out.png [--wait 6000]                     any page as the player sees it (title = home; or e.g. "tests/runtime.html")
//   options: --w 1600 --h 900 --mobile (phone touch emulation) --port 5173 --wait 0 (extra ms)
//            --js "code" runs in the page before the shot (async body; `return x` is printed as jsResult)
//   handy --js: return await __measure(3000)   → { fps, calls, triangles } over 3 s in the game
//
// Prints the saved path plus draw-call/triangle stats, so an agent can Read the PNG.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf('--' + n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v }
const MOBILE = argv.includes('--mobile'); if (MOBILE) argv.splice(argv.indexOf('--mobile'), 1)
const W = +opt('w', MOBILE ? 844 : 1600), H = +opt('h', MOBILE ? 390 : 900), PORT = opt('port', process.env.PORT || 5173), WAIT = +opt('wait', 0), JS = opt('js', '')
const mode = argv[0]
const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && fs.existsSync(p))
if (!CHROME) { console.error('No Chrome/Edge found (set CHROME=path)'); process.exit(1) }

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-frame-rate-limit', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: MOBILE ? 2 : 1, isMobile: MOBILE, hasTouch: MOBILE },
  userDataDir: path.join(process.env.TEMP || '/tmp', 'kurinji-snap-' + process.pid),
})
const fail = async msg => { console.error(msg); await browser.close(); process.exit(1) }
try {
  const page = await browser.newPage()
  if (MOBILE) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')
  // frame-rate / triangle probe available to --js in the game
  await page.evaluateOnNewDocument(() => { window.__measure = async (ms = 3000) => { const g = window.__game; if (!g) return null; const gl = g.renderer.gl; let n = 0, tris = 0, calls = 0; const t0 = performance.now(); const orig = gl.info.autoReset; gl.info.autoReset = false; await new Promise(r => { const f = () => { gl.info.reset(); requestAnimationFrame(() => { tris = Math.max(tris, gl.info.render.triangles); calls = Math.max(calls, gl.info.render.calls); n++; performance.now() - t0 < ms ? f() : r() }) }; f() }); gl.info.autoReset = orig; return { fps: Math.round(n / ((performance.now() - t0) / 1000)), calls, triangles: tris } } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  let out
  if (mode === 'studio') {
    out = argv[2]
    await page.goto(`http://localhost:${PORT}/tests/studio.html?${argv[1]}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction('window.__ready === true', { timeout: 90000 }).catch(() => fail('studio did not become ready:\n' + errors.join('\n')))
  } else if (mode === 'view') {
    const [p, l, time] = [argv[1], argv[2], argv[3]]; out = argv[4]
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction('window.__game && window.__game.world && window.__view', { timeout: 180000 }).catch(() => fail('game did not load:\n' + errors.join('\n')))
    await page.evaluate(`(async () => { const g = __game; g.world.setBloom(0); g.world.setPetals(0); g.dropNpc?.('titleMonk'); __view([${p}], [${l}], '${time || 'day'}'); await new Promise(r => setTimeout(r, 2500)) })()`)
  } else if (mode === 'page') {
    out = argv[2]
    // Git Bash turns a leading "/" into a Windows path: accept "home", "" or a path without the slash
    const rel = (argv[1] || '').replace(/^[A-Za-z]:.*?Git\//, '').replace(/^\/+/, '').replace(/^home$/, '')
    await page.goto(`http://localhost:${PORT}/${rel}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction('window.__game && window.__game.world', { timeout: 180000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 2500))
  } else await fail('mode must be studio, view or page')
  const jsResult = JS ? await page.evaluate(`(async () => { ${JS} })()`).catch(e => 'js error: ' + e.message) : undefined
  if (WAIT) await new Promise(r => setTimeout(r, WAIT))
  await new Promise(r => setTimeout(r, 400))
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  if (mode === 'view') {
    // world views: read the canvas right after a render (headless compositing can present a stale/black frame)
    const data = await page.evaluate(jpg => new Promise(r => requestAnimationFrame(() => { const g = __game; g.renderer.composer.render(0.016); r(g.renderer.gl.domElement.toDataURL(jpg ? 'image/jpeg' : 'image/png', 0.9)) })), out.endsWith('.jpg'))
    fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'))
  } else await page.screenshot({ path: out, type: out.endsWith('.jpg') ? 'jpeg' : 'png', quality: out.endsWith('.jpg') ? 88 : undefined })
  const stats = await page.evaluate(() => window.__stats || (window.__game && { calls: __game.renderer.gl.info.render.calls, triangles: __game.renderer.gl.info.render.triangles }) || null)
  const gpu = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown' })
  console.log(JSON.stringify({ saved: path.resolve(out), stats, jsResult, gpu, errors: errors.filter(e => !/favicon|404 \(Not Found\)/.test(e)).slice(0, 8) }))
} finally { await browser.close() }
