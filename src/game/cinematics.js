import { PLACES } from './world/terrain'

// Camera compositions follow the twelve story boards. Coordinates stay relative
// to the modeled places/actors so terrain changes do not strand a shot underground.
export const STORY_FRAMES = {
  // aerial/low tracking handled in the prologue script; this is the establishing angle
  1: { id: 'story_01_thennur_burning', place: 'thennur', eye: [-11, 9, -19], look: [3, 2, 30], fov: 44 },
  // low two-shot at the fallen beam, faces in profile, fire behind
  2: { id: 'story_02_malli_flower', place: 'malliSpot', eye: [2.0, 0.75, 2.4], look: [0.2, 0.55, -0.2], fov: 34 },
  // from behind the monk on the rock, toward the sunrise over the misty drop
  3: { id: 'story_03_dawn_meditation', place: 'rock', eye: [-4.2, 2.3, -2.2], look: [30, -4, 12], fov: 50 },
  // eye-level in the square: well and pavilion mid-ground, temple on its hill beyond
  4: { id: 'story_04_village_morning', place: 'village', eye: [-7, 1.6, 2], look: [2, 2.2, -14], fov: 46 },
  // low angle in front of the envoy, banners rising behind him
  5: { id: 'story_05_iron_envoy', place: 'village', eye: [-2.4, 0.7, -5], look: [0, 2.2, 4], fov: 36 },
  // low on the temple steps: Aruvan cradling the Guru, pillars and fire behind
  6: { id: 'story_06_guru_farewell', place: 'temple', eye: [2.6, 0.5, 2.2], look: [-0.3, 0.7, -0.4], fov: 34 },
  // wide low action angle at the breached gate in the storm
  7: { id: 'story_07_gate_battle', place: 'gate', eye: [-7, 1.2, -10], look: [0, 2.2, 0], fov: 50 },
  // the single bush in the ruins at sunset, fortress beyond
  8: { id: 'story_08_bush_in_ruins', place: 'malliSpot', eye: [-2.6, 1.1, -4.2], look: [0.6, 1.0, 3], fov: 38 },
  // looking up the dais at the Iron King on his throne
  9: { id: 'story_09_iron_throne', place: 'throne', eye: [-3.2, 0.9, -7.5], look: [0, 3.0, 0], fov: 38 },
  // the crown refused: kneeling king, raised palm, crown on the steps
  10: { id: 'story_10_empty_throne', place: 'throne', eye: [-6.5, 1.6, -7.5], look: [0, 1.6, -2.4], fov: 40 },
  // Ilan teaching under the tree, builders behind
  11: { id: 'story_11_peaceful_reign', place: 'thennur', eye: [-4.2, 1.3, 4.6], look: [0, 0.9, 0], fov: 40 },
  // poster: from behind the seated monk over the blooming valley
  12: { id: 'story_12_last_bloom_poster', place: 'rock', eye: [2.6, 1.9, -4.6], look: [-5, -6, 40], fov: 46 },
}

/** An explicit story-board angle, optionally centered on a moving actor. */
export function storyFrame(g, number, anchor, duration = 0, ease = 'sine.inOut') {
  const frame = STORY_FRAMES[number]
  if (!frame) throw new Error(`Unknown story frame: ${number}`)
  const p = anchor || PLACES[frame.place]
  const at = offset => [p.x + offset[0], p.y + offset[1], p.z + offset[2]]
  return g.shot(at(frame.eye), at(frame.look), duration, ease, { fov: frame.fov })
}

/** Saved cutscenes are optional; the engine falls back to the live 3D scene. */
export function storyCutscene(g, number) {
  return g.cutscene?.(STORY_FRAMES[number].id) || Promise.resolve(false)
}
