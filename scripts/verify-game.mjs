// Runs the real browser engine and story, using a separate muted profile.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
const mode = process.argv[2] || 'runtime', port = process.env.PORT || 5173
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p))
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'], defaultViewport: { width: 1280, height: 720 }, userDataDir: path.join(process.env.TEMP, `kurinji-verify-${process.pid}`) })
let failed = false
process.once('SIGINT', async () => { await browser.close(); process.exit(130) })
try {
  const page = await browser.newPage(), errors = []
  await page.evaluateOnNewDocument(() => localStorage.setItem('kurinji-settings-v3', JSON.stringify({ master: 0 })))
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 500)) })
  page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()) })
  if (mode === 'runtime') {
    await page.goto(`http://localhost:${port}/tests/runtime.html`, { waitUntil: 'domcontentloaded' })
    await page.click('#check')
    await page.waitForFunction('document.querySelector("#results").dataset.finished === "true"', { timeout: 300000 })
    const result = await page.$eval('#results', e => e.textContent)
    console.log(result); failed = result.includes('FAIL')
  } else if (mode === 'cinema') {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction('window.__game && window.__game.world && window.__view', { timeout: 180000 })
    await page.evaluate(() => {
      window.__auditDone = false
      import('/tests/cinematic-audit.js').then(async m => {
        window.__auditState = (await import('/src/game/store.js')).state
        window.__audit = m
        try { await m.run(0, 8); window.__auditResult = { lines: m.log.length, issues: m.report() } }
        catch (e) { window.__auditResult = { error: e.stack } }
        finally { window.__auditDone = true }
      })
    })
    for (let n = 0; n < 30; n++) {
      await new Promise(r => setTimeout(r, 15000))
      const progress = await page.evaluate(() => ({ done: window.__auditDone, lines: window.__audit?.log.length || 0, chapter: window.__auditState?.chapterIndex, loading: window.__auditState?.loading?.label, error: window.__auditState?.loading?.error }))
      console.log(JSON.stringify(progress))
      if (progress.done) break
    }
    const report = await page.evaluate(() => window.__auditResult || { error: 'Story audit timed out', lastLines: window.__audit?.report(true).slice(-6) })
    console.log(JSON.stringify(report, null, 2))
    failed = !!report.error || !!report.issues?.length
    fs.mkdirSync('.tmp/qa', { recursive: true }); fs.writeFileSync('.tmp/qa/cinematic-audit.json', JSON.stringify(report, null, 2))
  } else throw new Error(`Unknown mode ${mode}`)
  const significant = errors.filter(e => !/favicon|404 \(Not Found\)/.test(e))
  if (significant.length) { failed = true; console.log('Browser errors:', significant) }
} finally { await browser.close() }
if (failed) process.exitCode = 1
