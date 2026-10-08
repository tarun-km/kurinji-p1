// Renders every line in public/voice/lines.json with ElevenLabs and saves
// public/voice/<id>.mp3 + public/voice/index.json. Only missing lines are sent,
// so re-running after a story edit costs only the new/changed lines.
//
//   node --env-file=.env.local scripts/gen-voices.mjs [--model eleven_v4] [--only epilogue,prologue] [--force] [--dry]
//
// The key is read from ELEVENLABS_API_KEY (.env.local). It is never bundled into the game.
import fs from 'node:fs'

const KEY = process.env.ELEVENLABS_API_KEY
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const MODEL = arg('--model', 'eleven_v4_turbo')
const ONLY = arg('--only', '')?.split(',').filter(Boolean)
const FORCE = process.argv.includes('--force'), DRY = process.argv.includes('--dry')
const DIR = new URL('../public/voice/', import.meta.url)

// Premade ElevenLabs voices (available on every plan). speed < 1 = slower, stability lower = more emotional range.
const CAST = {
  aruvan:    { voice: 'JBFqnCBsd6RMkjVDRZzb', stability: 0.5, similarity: 0.8, speed: 0.92 }, // George — warm storyteller
  veeran:    { voice: 'JBFqnCBsd6RMkjVDRZzb', stability: 0.38, similarity: 0.8, speed: 0.97 }, // same actor, younger, rawer
  guru:      { voice: 'pqHfZKP75CvOlQylNhV4', stability: 0.62, similarity: 0.8, speed: 0.86 }, // Bill — wise, old
  thamarai:  { voice: 'EXAVITQu4vr4xnSDxMaL', stability: 0.42, similarity: 0.8, speed: 1.0 },  // Sarah
  ilan:      { voice: 'FGY2WhTYpPnrIDTdsKH5', stability: 0.35, similarity: 0.75, speed: 1.05 }, // Laura — bright, quick
  ilanAdult: { voice: 'bIHbv24MWmeRgasZH58o', stability: 0.5, similarity: 0.8, speed: 0.95 },  // Will
  kaali:     { voice: 'pFZP5JQG7iQjIQuC4Bku', stability: 0.5, similarity: 0.8, speed: 0.98 },  // Lily — confident
  malli:     { voice: 'cgSgspJ2msm6clMCkdW9', stability: 0.55, similarity: 0.75, speed: 0.86 }, // Jessica — small, soft
  rudhra:    { voice: 'N2lVS1w4EtoT3dr4eOWO', stability: 0.33, similarity: 0.8, speed: 1.0 },  // Callum — husky
  dunkan:    { voice: 'pNInz6obpgDQGcFmaJgB', stability: 0.42, similarity: 0.85, speed: 0.88 }, // Adam — dominant
  senthil:   { voice: 'TX3LPaxmHKxFdv7VOQHJ', stability: 0.3, similarity: 0.75, speed: 1.08 },  // Liam — young, scared
  villager:  { voice: 'iP95p4xoKVk53GoZ742B', stability: 0.35, similarity: 0.75, speed: 1.0 },  // Chris
  villagerF: { voice: 'XrExE9yKIg1WjnnlVkGX', stability: 0.45, similarity: 0.75, speed: 0.98 }, // Matilda
  kid:       { voice: 'cgSgspJ2msm6clMCkdW9', stability: 0.3, similarity: 0.75, speed: 1.1 },   // Jessica, brighter
  soldier:   { voice: 'SOYHLrjzK2X1ezoPC6cr', stability: 0.3, similarity: 0.75, speed: 1.05 },  // Harry — fierce
  narrator:  { voice: 'nPczCjzI2devNBz1zQrb', stability: 0.7, similarity: 0.8, speed: 0.9 },   // Brian — deep, comforting
}
// Gentler, slower delivery for the old king's last day.
const TWEAK = { 'aruvan@epilogue': { stability: 0.62, speed: 0.84 }, 'aruvan@ch7': { speed: 0.88 } }

const lines = JSON.parse(fs.readFileSync(new URL('lines.json', DIR), 'utf8'))
const exists = id => fs.existsSync(new URL(`${id}.mp3`, DIR))
const todo = lines.filter(l => (FORCE || !exists(l.id)) && (!ONLY?.length || ONLY.includes(l.chapter)))
const cost = todo.reduce((n, l) => n + l.text.length, 0) * (/turbo|flash/.test(MODEL) ? 0.5 : 1)

async function credits() {
  const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': KEY } })
  const d = await r.json(); return d.character_limit - d.character_count
}
function writeIndex() {
  const have = lines.filter(l => exists(l.id)).map(l => l.id)
  fs.writeFileSync(new URL('index.json', DIR), JSON.stringify(have))
  return have.length
}

async function render(l) {
  const c = { ...CAST[l.speaker], ...TWEAK[`${l.speaker}@${l.chapter}`] }
  if (!c.voice) throw new Error(`no voice cast for ${l.speaker}`)
  const body = {
    text: l.text, model_id: MODEL,
    voice_settings: { stability: c.stability, similarity_boost: c.similarity, speed: c.speed, use_speaker_boost: true },
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${c.voice}?output_format=mp3_44100_64`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify(body),
    })
    if (r.ok) { fs.writeFileSync(new URL(`${l.id}.mp3`, DIR), Buffer.from(await r.arrayBuffer())); return }
    const msg = await r.text()
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 2000 * (attempt + 1))); continue }
    throw new Error(`${r.status} ${msg.slice(0, 300)}`)
  }
  throw new Error('gave up after retries')
}

if (!KEY) { console.error('ELEVENLABS_API_KEY missing (run with --env-file=.env.local)'); process.exit(1) }
const left = await credits()
console.log(`${todo.length} lines to render with ${MODEL} ≈ ${Math.ceil(cost)} credits · ${left} credits left`)
if (DRY) process.exit(0)
if (cost > left) { console.error('Not enough credits for this batch — use --only <chapters> or wait for the monthly reset.'); process.exit(1) }

let done = 0, failed = 0
const queue = [...todo]
async function worker() {
  while (queue.length) {
    const l = queue.shift()
    try { await render(l); done++; process.stdout.write(`\r${done}/${todo.length} ${l.id.padEnd(22)}`) }
    catch (e) { failed++; console.error(`\n✗ ${l.id} "${l.text.slice(0, 40)}": ${e.message}`); if (/quota|credits|401/.test(e.message)) queue.length = 0 }
  }
}
await Promise.all([worker(), worker()]) // free plan allows 2 concurrent requests
console.log(`\nrendered ${done}, failed ${failed}; ${writeIndex()} of ${lines.length} lines voiced · ${await credits()} credits left`)
