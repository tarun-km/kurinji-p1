import { reactive } from 'vue'

export const state = reactive({
  screen: 'title',          // title | game | credits
  loading: null,           // { title, sub, art, progress, label, error }
  paused: false,
  cutscene: null,          // { src, type: 'video' | 'image' }
  hp: 100, maxHp: 100,
  breath: 0,                // 0..100, "Kurinji Breath" special meter
  karma: 0,                 // + compassion / - wrath
  petals: 0, totalPetals: 12,
  memories: [],             // unlocked lore fragments
  objective: '',
  chapter: '', chapterIndex: 0,
  card: null,               // { kicker, title, sub }
  dialogue: null,           // { speaker, text, color }
  choices: null,            // [{ text, karma }]
  letterbox: false,
  fade: 0, fadeColor: '#000',
  caption: '',              // centered cinematic caption
  prompt: '',               // "[E] Talk"
  boss: null,               // { name, hp, max }
  combo: 0,
  toast: '',
  deathMsg: '',
  breathingPrompt: false,
  showJournal: false,
  voice: true,
  mobile: false,
  inCombat: false,
})

// non-reactive callbacks between UI and game
export const ui = { advance: null, choose: null, resume: null, retryLoad: null, endCutscene: null }

// Finishing the story once unlocks free roam for good (kept apart from the chapter save).
const DONE = 'kurinji-complete-v1'
export function markComplete() { try { localStorage.setItem(DONE, '1') } catch {} }
export function isComplete() { try { return localStorage.getItem(DONE) === '1' } catch { return false } }

const SAVE = 'kurinji-save-v1'
export function save(data) { try { localStorage.setItem(SAVE, JSON.stringify(data)) } catch {} }
export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE))
    if (!data || !Number.isInteger(data.chapter) || data.chapter < 0 || data.chapter > 8) return null
    return { ...data, best: Math.max(data.chapter, Math.min(8, Number.isInteger(data.best) ? data.best : data.chapter)) }
  } catch { return null }
}
