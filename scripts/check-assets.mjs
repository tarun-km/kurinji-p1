// Local-only media audit. No API keys, network requests or audio playback.
// node scripts/check-assets.mjs [--decode] [--all-voices]
// --decode uses ffprobe/ffmpeg when installed to verify the entire media payload.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const decode = process.argv.includes('--decode')
const allVoices = process.argv.includes('--all-voices')
const readJson = file => JSON.parse(fs.readFileSync(path.join(publicDir, file), 'utf8'))
const problems = []
const sfx = readJson('sfx/index.json')
const voices = readJson('voice/index.json')
const lines = readJson('voice/lines.json')
const voiceIds = new Set(voices)
const music = fs.readdirSync(path.join(publicDir, 'audio')).filter(name => name.endsWith('.mp3'))
const files = [
  ...sfx.map(({ id }) => `sfx/${id}.mp3`),
  ...voices.map(id => `voice/${id}.mp3`),
  ...music.map(name => `audio/${name}`),
]
if (voiceIds.size !== voices.length) problems.push('Voice index contains duplicate IDs')
if (new Set(sfx.map(({ id }) => id)).size !== sfx.length) problems.push('Sound-effect index contains duplicate IDs')
for (const line of lines) if (!voiceIds.has(line.id)) problems.push(`Unindexed dialogue: ${line.id}`)

function mp3Header(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const header = Buffer.alloc(16)
    const size = fs.readSync(fd, header, 0, header.length, 0)
    // Accept an ID3 tag or an MPEG frame sync; ffmpeg performs deeper validation.
    return size > 3 && (header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0))
  } finally { fs.closeSync(fd) }
}

for (const relative of files) {
  const file = path.join(publicDir, relative)
  if (!fs.existsSync(file)) { problems.push(`Missing file: ${relative}`); continue }
  if (fs.statSync(file).size < 512) { problems.push(`Truncated media: ${relative}`); continue }
  if (!mp3Header(file)) problems.push(`Invalid MP3 header: ${relative}`)
}

let decoded = 0
if (decode) {
  for (const executable of ['ffmpeg', 'ffprobe']) {
    const check = spawnSync(executable, ['-version'], { encoding: 'utf8' })
    if (check.error || check.status !== 0) {
      console.error(`${executable} is required for --decode. Run without --decode for the index/header audit.`)
      process.exit(2)
    }
  }
  for (const relative of files.filter(file => allVoices || !file.startsWith('voice/'))) {
    const file = path.join(publicDir, relative)
    if (!fs.existsSync(file)) continue
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels:format=duration', '-of', 'json', file], { encoding: 'utf8' })
    if (probe.status !== 0) { problems.push(`Probe failed: ${relative}: ${probe.stderr.trim()}`); continue }
    const metadata = JSON.parse(probe.stdout)
    if (!metadata.streams?.length || !(Number(metadata.format?.duration) > 0)) { problems.push(`No usable audio stream: ${relative}`); continue }
    const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' })
    if (result.status !== 0 || result.stderr.trim()) problems.push(`Decode failed: ${relative}: ${result.stderr.trim()}`)
    else decoded++
  }
}

console.log(`${sfx.length} sound effects/ambience, ${voices.length} voices, ${music.length} music tracks; ${files.length} media files checked.${decode ? ` ${decoded} fully decoded.` : ''}`)
if (problems.length) {
  problems.forEach(problem => console.error(problem))
  process.exitCode = 1
} else console.log('All indexed local media are present and valid.')
