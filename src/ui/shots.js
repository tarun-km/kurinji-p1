// In-game cinematic shots for the loading screens and the chapter cards.
//
// Contract: public/art/shots/index.json = { "<chapterKey>": ["<file>.webp", …] }
//   chapterKey: title · prologue · ch1 … ch7 · epilogue · freeroam
//   an entry is a file name inside art/shots/ ("ch2-1.webp"), a site path ("/art/story05.webp"),
//   or { "src": "ch2-1.webp", "thumb": "ch2-1-sm.webp" } when a small card image exists.
// A chapter without shots falls back to its story painting (state.loading.art / art/storyNN).
import { shallowRef } from 'vue'
import { CHAPTER_ASSETS } from '../game/assets'
import { CHAPTER_NAMES } from '../game/story'

const BASE = import.meta.env.BASE_URL
export const CHAPTER_KEYS = ['prologue', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'epilogue']
const VALID_KEYS = new Set([...CHAPTER_KEYS, 'title', 'freeroam'])
const FILE = /^[\w-]+(\/[\w-]+)*\.(webp|avif|jpe?g|png)$/i

/** key → [{ src, thumb }] once index.json has arrived (an empty object until then or when it is missing). */
export const shots = shallowRef({})
let request = null

function resolve(path) {
  if (typeof path !== 'string') return null
  if (path.startsWith('/')) return FILE.test(path.slice(1)) && !path.includes('..') ? `${BASE}${path.slice(1)}` : null
  return FILE.test(path) ? `${BASE}art/shots/${path}` : null
}

export function loadShots() {
  // The service worker keeps everything under /art/ cache-first; a Range request passes it by,
  // so a newly captured index.json reaches installed players too.
  request ||= fetch(`${BASE}art/shots/index.json`, { cache: 'no-cache', headers: { Range: 'bytes=0-' } })
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then(data => {
      const out = {}
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const [key, list] of Object.entries(data)) {
          if (!VALID_KEYS.has(key) || !Array.isArray(list)) continue
          const entries = list.map(e => {
            const src = resolve(typeof e === 'object' && e ? e.src : e)
            return src && { src, thumb: (typeof e === 'object' && e && resolve(e.thumb)) || src }
          }).filter(Boolean)
          if (entries.length) out[key] = entries
        }
      }
      shots.value = out
      return out
    })
  return request
}

/** Story painting for chapter i (0..8), small or full size. */
export const storyArt = (i, small = true) => `${BASE}art/story${CHAPTER_ASSETS[Math.max(0, Math.min(8, i))]?.art || '01'}${small ? '-sm' : ''}.webp`

/** Card artwork for chapter i: the first captured shot (its thumbnail when present), else the story painting. */
export function chapterCardArt(i) {
  const list = shots.value[CHAPTER_KEYS[i]]
  return list?.[0]?.thumb || storyArt(i)
}

/** Which chapter a loading screen belongs to, from its title (chapter loads, free roam, boot) or sub (errors). */
export function loadingKey(loading, chapterIndex = 0) {
  if (!loading) return 'title'
  if (loading.title === 'Free Roam') return 'freeroam'
  if (loading.title === 'Kurinji') return 'title'
  let i = CHAPTER_NAMES.indexOf(loading.title)
  if (i < 0) i = CHAPTER_NAMES.indexOf(loading.sub)
  if (i >= 0) return CHAPTER_KEYS[i]
  const art = /story(\d\d)/.exec(loading.art || '')?.[1]
  i = CHAPTER_ASSETS.findIndex(c => c.art === art)
  return i >= 0 ? CHAPTER_KEYS[i] : CHAPTER_KEYS[Math.max(0, Math.min(8, chapterIndex))]
}

/** The shot list for a loading screen: captured shots, else the screen's own painting. */
export function loadingShots(key, fallbackArt) {
  const list = shots.value[key] || (key === 'freeroam' ? shots.value.ch7 : null)
  if (list?.length) return list.map(s => s.src)
  return fallbackArt ? [fallbackArt] : []
}

/** Split "II — The Iron Envoy" into { mark: 'Chapter II', name: 'The Iron Envoy' }. */
export function splitChapter(title = '') {
  const m = /^(.+?)\s+—\s+(.+)$/.exec(title)
  if (!m) return { mark: '', name: title }
  const head = m[1].trim()
  return { mark: /^[IVXLC]+$/.test(head) ? `Chapter ${head}` : head, name: m[2].trim() }
}
