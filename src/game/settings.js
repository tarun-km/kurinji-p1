import { reactive, watch } from 'vue'

const KEY = 'kurinji-settings-v3'

/** Graphics presets. Each value can still be changed individually (preset becomes 'custom'). */
export const PRESETS = {
  low:    { renderScale: 0.7,  shadows: 'off',   ao: false, bloom: true,  dof: false, aa: false, foliage: 0.45, particles: 0.5,  clouds: false, water: 'simple' },
  medium: { renderScale: 0.85, shadows: 'low',   ao: false, bloom: true,  dof: true,  aa: true,  foliage: 0.7,  particles: 0.75, clouds: true,  water: 'simple' },
  high:   { renderScale: 1,    shadows: 'high',  ao: true,  bloom: true,  dof: true,  aa: true,  foliage: 1,    particles: 1,    clouds: true,  water: 'full' },
  ultra:  { renderScale: 1.25, shadows: 'ultra', ao: true,  bloom: true,  dof: true,  aa: true,  foliage: 1.35, particles: 1.25, clouds: true,  water: 'full' },
}
export const GRAPHICS_KEYS = Object.keys(PRESETS.high)

export const isMobile = globalThis.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

function guessPreset() {
  if (isMobile) return 'low'
  const cores = navigator.hardwareConcurrency || 4
  const memory = navigator.deviceMemory || 4
  return cores >= 8 && memory >= 8 ? 'high' : 'medium'
}

const defaults = () => ({
  preset: guessPreset(),
  ...PRESETS[guessPreset()],
  adaptive: true,          // lower resolution automatically when frame rate drops
  showFps: false,
  // audio (0..1)
  master: 0.5, music: 0.55, voice: 0.8, sfx: 0.6, ambience: 0.35,
  // story & gameplay
  voiceActing: true,
  autoAdvance: true,       // continue dialogue when the line has been spoken
  subtitles: true,
  textSize: 'm',           // s | m | l
  textSpeed: 1,            // typewriter speed multiplier
  camSensitivity: 1,
  invertY: false,
  cameraShake: true,
  touchLook: 1,            // touch camera drag speed
  haptics: true,           // vibrate on touch buttons and hits (Android)
  touchButtonScale: 1,     // size of the on-screen buttons
})

function load() {
  const result = defaults()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result
    const ranges = { renderScale: [0.5, 1.25], foliage: [0.25, 1.35], particles: [0.25, 1.25], master: [0, 1], music: [0, 1], voice: [0, 1], sfx: [0, 1], ambience: [0, 1], textSpeed: [0.5, 2], camSensitivity: [0.25, 2.5], touchLook: [0.4, 2.5], touchButtonScale: [0.8, 1.3] }
    const values = { preset: [...Object.keys(PRESETS), 'custom'], shadows: ['off', 'low', 'high', 'ultra'], water: ['simple', 'full'], textSize: ['s', 'm', 'l'] }
    for (const key of Object.keys(result)) {
      const v = saved[key]
      if (ranges[key] && typeof v === 'number' && Number.isFinite(v)) result[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], v))
      else if (values[key]?.includes(v)) result[key] = v
      else if (typeof result[key] === 'boolean' && typeof v === 'boolean') result[key] = v
    }
    if (result.preset !== 'custom' && GRAPHICS_KEYS.some(key => result[key] !== PRESETS[result.preset][key])) result.preset = 'custom'
    return result
  } catch { return result }
}

export const settings = reactive(load())

let applying = false
export function applyPreset(name) {
  if (!PRESETS[name]) return
  applying = true
  settings.preset = name
  Object.assign(settings, PRESETS[name])
  queueMicrotask(() => { applying = false })
}
export function resetSettings() { Object.assign(settings, defaults()) }

// Changing any single graphics option turns the preset into "custom".
watch(() => GRAPHICS_KEYS.map(k => settings[k]), () => {
  if (applying || settings.preset === 'custom') return
  const p = PRESETS[settings.preset]
  if (p && GRAPHICS_KEYS.some(k => p[k] !== settings[k])) settings.preset = 'custom'
})
watch(settings, () => { try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch {} }, { deep: true })
