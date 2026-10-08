// Generates sound effects + ambience loops with ElevenLabs and saves them to public/sfx/<id>.mp3
// Only missing files are generated.   node --env-file=.env.local scripts/gen-sfx.mjs [--only id,id] [--dry]
import fs from 'node:fs'

const KEY = process.env.ELEVENLABS_API_KEY
const DIR = new URL('../public/sfx/', import.meta.url)
const ONLY = (process.argv[process.argv.indexOf('--only') + 1] || '').split(',').filter(s => process.argv.includes('--only') && s)
const DRY = process.argv.includes('--dry')
const NO_MUSIC = ', no music, no voice, clean isolated sound effect'

export const SFX = [
  // ---- combat
  { id: 'whoosh', d: 0.8, t: 'fast swing of a long wooden fighting staff cutting through the air, sharp whoosh' },
  { id: 'staff_hit', d: 0.8, t: 'wooden fighting staff striking steel plate armor, solid knock with metallic clank' },
  { id: 'heavy_hit', d: 1.4, t: 'powerful wooden staff blow slamming into an armored soldier, heavy thump and armor rattle' },
  { id: 'sword_clash', d: 1.0, t: 'steel sword blade clashing against an iron capped wooden staff, bright ringing clang' },
  { id: 'hammer_slam', d: 1.8, t: 'giant iron war hammer smashing into rocky ground, deep boom, cracking stone and debris' },
  { id: 'body_fall', d: 1.4, t: 'armored soldier collapsing onto dirt ground, metal armor clatter and dull thud' },
  { id: 'dodge', d: 0.7, t: 'quick evasive roll on dirt ground, cloth robe swish and scuffing feet' },
  { id: 'hurt', d: 0.6, t: 'blunt punch impact to a body, short muffled thud' },
  { id: 'still_mind', d: 1.6, t: 'time slowing down, deep reversed whoosh with soft airy shimmer' },
  { id: 'kurinji_breath', d: 3.0, t: 'magical burst of crystalline energy, rising airy whoosh, sparkling glass chimes and a soft expanding shockwave' },
  { id: 'quake', d: 3.0, t: 'earthquake ground slam, deep rumbling roar of earth, rocks cracking and tumbling' },
  { id: 'boulder', d: 1.4, t: 'large boulder crashing down onto rocky ground, heavy impact and gravel' },
  // ---- world and story
  { id: 'step_dirt', d: 0.5, t: 'single footstep of a leather sandal on packed dirt path' },
  { id: 'step_stone', d: 0.5, t: 'single footstep of a leather sandal on a stone step' },
  { id: 'war_horn', d: 4.0, t: 'distant ancient war horn blowing across a mountain valley, long low ominous call with echo' },
  { id: 'ram', d: 1.6, t: 'massive wooden battering ram hitting a thick wooden gate, deep boom and creaking wood' },
  { id: 'gate_break', d: 3.0, t: 'thick wooden fortress gate bursting open and splintering, heavy wood cracking and crashing' },
  { id: 'gate_open', d: 3.0, t: 'heavy wooden gate doors slowly creaking open on iron hinges' },
  { id: 'crowd_rally', d: 3.5, t: 'group of village men and women shouting a determined battle cry together outdoors' },
  { id: 'heartbeat', d: 2.0, t: 'slow deep human heartbeat, two soft beats, intimate' },
  { id: 'thunder', d: 5.0, t: 'rolling thunder crack in mountains during a rainstorm' },
  { id: 'petal', d: 1.8, t: 'soft magical chime sparkle, gentle glassy twinkle rising, collecting a glowing flower' },
  { id: 'anvil', d: 2.0, t: 'blacksmith hammer striking a hot iron bar on an anvil twice, ringing metal' },
  { id: 'chicken', d: 2.0, t: 'village hen clucking softly' },
  { id: 'goat', d: 1.8, t: 'goat bleating once outdoors' },
  { id: 'fire_burst', d: 2.0, t: 'roof thatch catching fire with a sudden whoomp and crackling flames' },
  { id: 'sword_draw', d: 1.0, t: 'steel sword drawn from a leather scabbard, metallic slide' },
  { id: 'ui_click', d: 0.5, t: 'soft wooden click, subtle elegant menu button press' },
  { id: 'ui_page', d: 1.0, t: 'single page of an old paper book turning' },
  { id: 'ui_open', d: 1.2, t: 'soft low singing bowl tone, gentle and short' },
  // ---- ambience loops
  { id: 'amb_wind', d: 12, loop: true, t: 'gentle high mountain wind blowing over grassy slopes, soft gusts, peaceful' },
  { id: 'amb_village', d: 14, loop: true, t: 'peaceful South Indian hill village morning ambience, songbirds, distant chickens, faint villagers chatting, light breeze' },
  { id: 'amb_night', d: 12, loop: true, t: 'calm night ambience in tropical hills, crickets and insects chirping, soft distant frogs' },
  { id: 'amb_rain', d: 12, loop: true, t: 'steady heavy rain falling on stone and leaves, continuous downpour' },
  { id: 'amb_fire', d: 10, loop: true, t: 'large village fire burning, roaring flames and crackling wood, continuous' },
  { id: 'amb_water', d: 10, loop: true, t: 'mountain stream flowing over rocks with a distant waterfall, continuous' },
  { id: 'amb_fortress', d: 10, loop: true, t: 'cold wind howling around stone fortress walls, banners flapping, distant iron chains clinking' },
]

async function credits() {
  const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': KEY } })
  const d = await r.json(); return d.character_limit - d.character_count
}
async function gen(s) {
  const body = { text: s.t + NO_MUSIC, duration_seconds: s.d, prompt_influence: 0.55 }
  if (s.loop) body.loop = true
  for (let a = 0; a < 3; a++) {
    const r = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (r.ok) { fs.writeFileSync(new URL(`${s.id}.mp3`, DIR), Buffer.from(await r.arrayBuffer())); return }
    const msg = await r.text()
    if (r.status === 422 && body.loop) { delete body.loop; continue } // older model: no loop flag
    if (r.status === 429 || r.status >= 500) { await new Promise(x => setTimeout(x, 2500 * (a + 1))); continue }
    throw new Error(`${r.status} ${msg.slice(0, 200)}`)
  }
  throw new Error('gave up')
}

if (!KEY) { console.error('ELEVENLABS_API_KEY missing'); process.exit(1) }
fs.mkdirSync(DIR, { recursive: true })
const todo = SFX.filter(s => !fs.existsSync(new URL(`${s.id}.mp3`, DIR)) && (!ONLY.length || ONLY.includes(s.id)))
const secs = todo.reduce((n, s) => n + s.d, 0)
console.log(`${todo.length} sounds, ${secs.toFixed(1)} s ≈ ${Math.ceil(secs * 10)} credits · ${await credits()} left`)
if (DRY) process.exit(0)
let ok = 0
for (const s of todo) {
  try { await gen(s); ok++; console.log(`✓ ${s.id}`) } catch (e) { console.error(`✗ ${s.id}: ${e.message}`); if (/quota|credit/i.test(e.message)) break }
}
const have = SFX.filter(s => fs.existsSync(new URL(`${s.id}.mp3`, DIR))).map(s => ({ id: s.id, loop: !!s.loop }))
fs.writeFileSync(new URL('index.json', DIR), JSON.stringify(have))
console.log(`generated ${ok}; ${have.length}/${SFX.length} available`)
