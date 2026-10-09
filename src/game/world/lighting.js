import * as THREE from 'three'

/* ===========================================================================
   Lighting presets — the seven lighting boards (docs/art-reference/lighting_*)
   plus the story frames. One entry drives sky, sun, hemisphere fill, fog,
   height-fog, character rim light, wetness, sun shafts and the colour grade.

   TIMES[name]
     top / bottom / haze     sky dome zenith, horizon and horizon-haze colours
     fog, fogD               scene fog colour and FogExp2 density
     hf                      height fog [base height, falloff, amount, sun scatter]
     sun, si, dir            key light colour, intensity and direction (toward the light)
     hemi, sky, ground       hemisphere fill intensity, sky and ground colours
     mistAmt, cloud*, sunSize, hazeAmt   sky.js extras
     night, lamps            moon/stars on, lantern level 0..1
     rim, rimI               character rim-light colour and strength
     wet                     surface wetness 0..1 (storm puddles / dark wet stone)
     shafts                  sun-shaft (god ray) strength 0..1
     env                     image-based (sky) light intensity

   GRADES[name] (applied after tone mapping by gfx/grade.js)
     exposure, bloom, thr (bloom threshold), vignette
     sat / vibrance / contrast / bright
     lift, gain (rgb), gamma, sh / hi (shadow / highlight tints, rgb), balance
     ca                      chromatic aberration during cinematics only
=========================================================================== */
export const TIMES = {
  dawn: {
    top: 0x5b7fb8, bottom: 0xf3b98a, fog: 0xe8c3a8, haze: 0xf0c6a8, sun: 0xffc48a, si: 3.2, dir: [70, 20, -40],
    hemi: 0.5, sky: 0xf2d2c0, ground: 0x4a4434, fogD: 0.0017, hf: [18, 0.12, 0.21, 0.75], mistAmt: 0.9,
    cloud: 0xffc8b0, cloudLit: 0xfff0e8, cloudGlow: 0.5, sunSize: 1.6, night: false, lamps: 0.6, hazeAmt: 0.16,
    rim: 0xffb27a, rimI: 0.34, wet: 0, shafts: 0.85, env: 0.5,
  },
  day: {
    top: 0x3f7fd0, bottom: 0xbfdcf0, fog: 0xc8dcea, haze: 0xcfe2f0, sun: 0xfff2dd, si: 3.45, dir: [42, 72, 34],
    hemi: 0.6, sky: 0xd2e6ff, ground: 0x56603a, fogD: 0.0014, hf: [18, 0.12, 0.11, 0.35], mistAmt: 0.45,
    cloud: 0xe8f0ff, cloudLit: 0xffffff, cloudGlow: 0.42, sunSize: 1, night: false, lamps: 0, hazeAmt: 0.1,
    rim: 0xfff0dc, rimI: 0.18, wet: 0, shafts: 0.3, env: 0.6,
  },
  dusk: {
    top: 0x2b2550, bottom: 0xe0703a, fog: 0xb0705a, haze: 0xd88a6a, sun: 0xff7a3a, si: 2.7, dir: [-70, 15, 50],
    hemi: 0.38, sky: 0xb07a96, ground: 0x3a2a2c, fogD: 0.0027, hf: [22, 0.08, 0.25, 0.9], mistAmt: 0.65,
    cloud: 0xff9a6a, cloudLit: 0xffd0b0, cloudGlow: 0.5, sunSize: 2, night: false, lamps: 1,
    rim: 0xff8a4a, rimI: 0.44, wet: 0, shafts: 1, env: 0.45,
  },
  night: {
    top: 0x050818, bottom: 0x1a2440, fog: 0x141c30, haze: 0x1a2440, sun: 0x9fb4ff, si: 1.0, dir: [-30, 70, -20],
    hemi: 0.27, sky: 0x40507e, ground: 0x15161e, fogD: 0.0036, hf: [20, 0.08, 0.2, 0.2], mistAmt: 0.45,
    cloud: 0x1a2440, cloudLit: 0x6a7aa0, cloudGlow: 0.2, sunSize: 1, night: true, lamps: 1,
    rim: 0x7f96e0, rimI: 0.36, wet: 0, shafts: 0.12, env: 0.32,
  },
  memory: {
    top: 0x1a0505, bottom: 0xa03414, fog: 0x4e170a, haze: 0x8e2c12, sun: 0xff6428, si: 3.0, dir: [-30, 20, 70],
    hemi: 0.46, sky: 0x8c3e2c, ground: 0x2a0f08, fogD: 0.0026, hf: [12, 0.07, 0.18, 1.0], mistAmt: 0.2,
    cloud: 0x8a2a14, cloudLit: 0x4a160c, cloudGlow: 0.7, sunSize: 4, night: false, lamps: 1,
    rim: 0xff6a2a, rimI: 0.5, wet: 0, shafts: 0.9, env: 0.4,
  },
  storm: {
    top: 0x2a2e38, bottom: 0x6a6a70, fog: 0x5a5e66, haze: 0x6a6e76, sun: 0xc8ccd8, si: 1.45, dir: [-20, 60, -40],
    hemi: 0.72, sky: 0x8a90a0, ground: 0x3a3c40, fogD: 0.0038, hf: [24, 0.07, 0.27, 0.2], mistAmt: 0.75,
    cloud: 0x4a4e58, cloudLit: 0x8a8e98, cloudGlow: 0.25, sunSize: 0.6, night: false, lamps: 1,
    rim: 0xb8c4d8, rimI: 0.24, wet: 1, shafts: 0, env: 0.75,
  },
  bloom: {
    top: 0x6a8fd8, bottom: 0xf7d2e8, fog: 0xe6d6f0, haze: 0xeed4ea, sun: 0xfff0d8, si: 3.15, dir: [70, 28, -60],
    hemi: 0.66, sky: 0xeadcff, ground: 0x4e4a5c, fogD: 0.0019, hf: [22, 0.08, 0.2, 0.7], mistAmt: 0.75,
    cloud: 0xffd8e8, cloudLit: 0xfff4f0, cloudGlow: 0.55, sunSize: 1.4, night: false, lamps: 0.3,
    rim: 0xffd6f0, rimI: 0.3, wet: 0, shafts: 0.8, env: 0.6,
  },
  white: {
    top: 0xffffff, bottom: 0xffffff, fog: 0xffffff, haze: 0xffffff, sun: 0xffffff, si: 2.5, dir: [0, 80, 0],
    hemi: 1.2, sky: 0xffffff, ground: 0xffffff, fogD: 0.02, hf: [30, 0.05, 1, 0], mistAmt: 1,
    cloud: 0xffffff, cloudLit: 0xffffff, cloudGlow: 1, sunSize: 1, night: false, lamps: 0,
    rim: 0xffffff, rimI: 0.2, wet: 0, shafts: 0, env: 1,
  },
}

const GRADE_SRC = {
  dawn:   { exposure: 1.02, bloom: 0.72, thr: 0.74, vignette: 0.42, sat: -0.02, vibrance: 0.18, contrast: 0.14, bright: 0.0,
            lift: [0.014, 0.008, 0.026], gain: [1.03, 1.0, 0.95], gamma: 1.0, sh: [-0.012, -0.004, 0.022], hi: [0.03, 0.012, -0.018], balance: 0.0, ca: 0.0012 },
  day:    { exposure: 0.94, bloom: 0.45, thr: 0.82, vignette: 0.34, sat: -0.08, vibrance: 0.16, contrast: 0.16, bright: 0.0,
            lift: [0.008, 0.01, 0.022], gain: [1.02, 1.0, 0.97], gamma: 1.0, sh: [-0.012, -0.002, 0.02], hi: [0.018, 0.01, -0.012], balance: 0.0, ca: 0.001 },
  dusk:   { exposure: 1.06, bloom: 0.85, thr: 0.68, vignette: 0.48, sat: 0.02, vibrance: 0.2, contrast: 0.16, bright: 0.0,
            lift: [0.02, 0.006, 0.04], gain: [1.04, 0.98, 0.92], gamma: 1.0, sh: [0.0, -0.01, 0.035], hi: [0.035, 0.008, -0.025], balance: 0.0, ca: 0.0014 },
  night:  { exposure: 1.22, bloom: 1.05, thr: 0.55, vignette: 0.58, sat: -0.06, vibrance: 0.1, contrast: 0.14, bright: 0.012,
            lift: [0.006, 0.012, 0.03], gain: [0.98, 1.0, 1.04], gamma: 1.02, sh: [-0.01, 0.0, 0.03], hi: [0.03, 0.016, -0.01], balance: -0.05, ca: 0.0014 },
  memory: { exposure: 1.16, bloom: 1.05, thr: 0.6, vignette: 0.68, sat: 0.06, vibrance: 0.12, contrast: 0.2, bright: 0.0,
            lift: [0.03, 0.006, 0.004], gain: [1.06, 0.95, 0.88], gamma: 1.0, sh: [0.02, -0.01, -0.006], hi: [0.04, 0.012, -0.02], balance: 0.0, ca: 0.002 },
  storm:  { exposure: 1.08, bloom: 0.75, thr: 0.62, vignette: 0.58, sat: -0.14, vibrance: 0.05, contrast: 0.18, bright: 0.0,
            lift: [0.006, 0.012, 0.024], gain: [0.98, 1.0, 1.03], gamma: 1.0, sh: [-0.01, 0.0, 0.02], hi: [0.0, 0.004, 0.012], balance: 0.0, ca: 0.0014 },
  bloom:  { exposure: 1.04, bloom: 0.92, thr: 0.64, vignette: 0.38, sat: 0.02, vibrance: 0.2, contrast: 0.1, bright: 0.008,
            lift: [0.024, 0.012, 0.04], gain: [1.02, 0.99, 1.0], gamma: 1.0, sh: [0.008, -0.006, 0.03], hi: [0.025, 0.01, 0.012], balance: 0.0, ca: 0.0012 },
  white:  { exposure: 1.2, bloom: 1.2, thr: 0.6, vignette: 0.2, sat: 0.0, vibrance: 0.0, contrast: 0.0, bright: 0.05,
            lift: [0, 0, 0], gain: [1, 1, 1], gamma: 1.0, sh: [0, 0, 0], hi: [0, 0, 0], balance: 0.0, ca: 0 },
}
/** Flatten a grade (rgb arrays → scalar fields) so gsap can tween it. */
export function flatGrade(g) {
  return {
    exposure: g.exposure, bloom: g.bloom, thr: g.thr, vignette: g.vignette, sat: g.sat, vibrance: g.vibrance, contrast: g.contrast, bright: g.bright,
    liftR: g.lift[0], liftG: g.lift[1], liftB: g.lift[2], gainR: g.gain[0], gainG: g.gain[1], gainB: g.gain[2], gamma: g.gamma,
    shR: g.sh[0], shG: g.sh[1], shB: g.sh[2], hiR: g.hi[0], hiG: g.hi[1], hiB: g.hi[2], balance: g.balance, ca: g.ca,
  }
}
export const GRADES = Object.fromEntries(Object.entries(GRADE_SRC).map(([k, g]) => [k, flatGrade(g)]))

/** Rim-light colour for a preset (Characters RIM uniform). */
export function rimColor(P) { return new THREE.Color(P.rim ?? P.sun).multiplyScalar(P.rimI ?? 0.22) }

/**
 * Light-source mesh for the sun shafts (god rays). It is never part of the scene: the
 * renderer keeps it on the sun direction just inside the far plane and renders it only
 * into the god-ray mask, so the sky dome's own sun disc stays the visible one.
 */
export function createSunDisc() {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xfff0d8, fog: false, toneMapped: false, transparent: true, depthWrite: false }))
  m.name = 'sunDisc'; m.frustumCulled = false
  return m
}
