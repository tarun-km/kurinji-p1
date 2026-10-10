import { reactive, watch } from 'vue'

/* ===========================================================================
   Progression: Blessings are earned by playing (chapters, landmarks, lamps,
   petals, side quests, defeated enemies) and spent at the "Aruvan" tab of the
   pause menu on staff upgrades, robes, powers and the horse's tack.
=========================================================================== */
export const STAFFS = [
  { key: 'wood', name: "Monk's Staff", cost: 0, dmg: 1.0, desc: 'Teak, brass caps. Balance before force.' },
  { key: 'iron', name: 'Iron-Capped Staff', cost: 6, dmg: 1.22, desc: "Kaali melted her father's sword into its caps." },
  { key: 'kurinji', name: 'Kurinji Staff', cost: 14, dmg: 1.5, desc: 'Violet inlay that glows with every strike. +Breath gain.' },
  { key: 'sun', name: 'Staff of the Rising Sun', cost: 26, dmg: 1.85, desc: 'Gold bands and a dawn-fire tip. Strikes stagger brutes.' },
]
export const COSTUMES = [
  { key: 'saffron', name: 'Saffron Robe', cost: 0, look: {} },
  { key: 'monsoon', name: 'Monsoon Indigo', cost: 4, look: { robe: 0x2a3a7a, cloth: 0x2a3a7a, sash: 0x1a2450, pants: 0x1a2450 } },
  { key: 'forest', name: 'Shola Green', cost: 4, look: { robe: 0x3a6a3a, cloth: 0x3a6a3a, sash: 0x2a4a26, pants: 0x2a4a26 } },
  { key: 'ash', name: 'Ash-Hound Grey', cost: 8, look: { robe: 0x4a4648, cloth: 0x4a4648, sash: 0x6b0f0f, pants: 0x2a2628 } },
  { key: 'dawn', name: 'Dawn Crimson', cost: 10, look: { robe: 0xa8302a, cloth: 0xa8302a, sash: 0xc9a24a, pants: 0x7a1a14 } },
  { key: 'royal', name: 'King of Kurinji', cost: 14, look: { robe: 0xefe8d8, cloth: 0xefe8d8, sash: 0xc9a24a, pants: 0xd8c9a5, shawl: 0xd9822b } },
]
export const POWERS = [
  { key: 'stomp', name: 'Mountain Stomp', cost: 5, cd: 8, desc: 'Slam the staff down: a shockwave throws back everyone nearby.' },
  { key: 'dash', name: 'Petal Dash', cost: 8, cd: 6, desc: 'Flash forward through a line of foes, leaving a trail of petals.' },
  { key: 'heal', name: 'Healing Breath', cost: 10, cd: 24, desc: 'Breathe in the mountain: restore 40 vitality and steady your stance.' },
]
export const HORSE_COATS = [{ key: 'bay', name: 'Bay', cost: 0 }, { key: 'white', name: 'White Marwari', cost: 6 }, { key: 'black', name: 'Night Black', cost: 6 }, { key: 'dapple', name: 'Dapple Grey', cost: 4 }]
export const HORSE_BLANKETS = [{ key: 'saffron', name: 'Saffron', cost: 0 }, { key: 'crimson', name: 'Crimson', cost: 2 }, { key: 'indigo', name: 'Indigo', cost: 2 }, { key: 'jade', name: 'Jade', cost: 2 }]

const KEY = 'kurinji-progress-v1'
function load() {
  const base = { blessings: 0, staff: 'wood', staffs: ['wood'], costume: 'saffron', costumes: ['saffron'], powers: [], power: null, coat: 'bay', coats: ['bay'], blanket: 'saffron', blankets: ['saffron'], earned: {} }
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...base, ...s } } catch { return base }
}
export const progress = reactive(load())
watch(progress, v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }, { deep: true })

export const staffOf = () => STAFFS.find(s => s.key === progress.staff) || STAFFS[0]
export const powerOf = () => POWERS.find(p => p.key === progress.power) || null
/** Visual options for the player's character (merged into setLook extras for Aruvan presets). */
export function lookExtras() {
  const c = COSTUMES.find(x => x.key === progress.costume)
  return { ...(c?.look || {}), staffTier: progress.staff === 'wood' ? undefined : progress.staff, ironStaff: progress.staff !== 'wood' ? true : undefined }
}
/** Earn once per `id` (or every time if no id). Returns true when granted. */
export function earn(n, id = null) {
  if (id) { if (progress.earned[id]) return false; progress.earned[id] = 1 }
  progress.blessings += n
  return true
}
const LIST = { staff: [STAFFS, 'staffs'], costume: [COSTUMES, 'costumes'], power: [POWERS, 'powers'], coat: [HORSE_COATS, 'coats'], blanket: [HORSE_BLANKETS, 'blankets'] }
export function owned(kind, key) { return progress[LIST[kind][1]].includes(key) }
/** Buy (if needed) and equip. Returns 'equipped' | 'bought' | 'poor'. */
export function choose(kind, key) {
  const [list, ownKey] = LIST[kind], item = list.find(x => x.key === key)
  if (!item) return 'poor'
  if (!progress[ownKey].includes(key)) {
    if (progress.blessings < item.cost) return 'poor'
    progress.blessings -= item.cost; progress[ownKey].push(key)
    progress[kind] = key; return 'bought'
  }
  progress[kind] = key; return 'equipped'
}
