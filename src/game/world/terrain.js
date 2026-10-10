import * as THREE from 'three'
import { rng } from '../gfx/kit'
import { patchFog } from '../gfx/Renderer'

/* ===========================================================================
   Terrain: canonical layout from the modeling guide (x, z in metres, north = -z)
   plus the landscape features the boards show: a cliff waterfall feeding a
   stream down the valley, a gorge that puts the fortress on a cliff edge, a
   misty eastern drop below the meditation rock and rolling hills beyond.
=========================================================================== */

// ---------- noise ----------
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s) }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf)
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
export const fbm = (x, z, o = 4) => { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); t += a; a *= 0.5; f *= 2.03 } return s / t }
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }

// ---------- canonical places ----------
export const PLACES = {
  temple: new THREE.Vector3(0, 0, -72),
  bell: new THREE.Vector3(9, 0, -66),
  rock: new THREE.Vector3(20, 0, -90),
  village: new THREE.Vector3(0, 0, 0),
  forge: new THREE.Vector3(-13, 0, 8),
  training: new THREE.Vector3(14, 0, 10),
  gate: new THREE.Vector3(0, 0, 46),
  thennur: new THREE.Vector3(-8, 0, 98),
  malliSpot: new THREE.Vector3(-12, 0, 104),
  fortress: new THREE.Vector3(0, 0, 158),
  throne: new THREE.Vector3(0, 0, 170),
}
export const pathX = z => Math.sin(z * 0.035) * 7
const baseH = z => 30 - z * 0.12 + (z < -60 ? (-60 - z) * 0.25 : 0)
const ZONES = [
  { p: PLACES.temple, r: 15, d: 0 }, { p: PLACES.rock, r: 5, d: 2.2 }, { p: PLACES.village, r: 24, d: 0 },
  { p: PLACES.gate, r: 9, d: 0 }, { p: PLACES.thennur, r: 17, d: 0 }, { p: PLACES.fortress, r: 25, d: 3 }, { p: PLACES.throne, r: 9, d: 4 },
]
for (const z of ZONES) z.h = baseH(z.p.z) + z.d
// Dunkan's outer ward (west and south of the inner keep): one broad pad, applied first so the
// inner fortress / throne pads keep their exact levels
ZONES.unshift({ p: new THREE.Vector3(-9, 0, 172), r: 34, h: baseH(158) + 3 })

/* ---------- the wider land (free roam): ten landmarks around the valley, linked by trails ---------- */
export const REGIONS = [
  { key: 'grove', name: 'Shola Grove Shrine', x: -112, z: 4, r: 13 },
  { key: 'hermit', name: "Hermit's Ledge", x: -140, z: -82, r: 9 },
  { key: 'lotus', name: 'Lotus Pond', x: -128, z: 80, r: 15 },
  { key: 'kovil', name: 'Kovil Hamlet', x: -112, z: 180, r: 24 },
  { key: 'ghats', name: 'River Ghats', x: -50, z: 240, r: 13 },
  { key: 'meadow', name: "Shepherd's Meadow", x: 108, z: 20, r: 17 },
  { key: 'ridge', name: 'Watchtower Ridge', x: 134, z: 108, r: 11 },
  { key: 'terraces', name: 'Tea Terraces', x: 98, z: 205, r: 22 },
  { key: 'stones', name: 'Circle of Stones', x: 98, z: -122, r: 12 },
  { key: 'pass', name: 'Prayer-Flag Pass', x: -46, z: -152, r: 12 },
]
const RG = Object.fromEntries(REGIONS.map(r => [r.key, r]))
// waypoint chains (x, z); the land between is carved into packed-earth trails
export const TRAILS = [
  [[-18, 2], [-50, -4], [-82, 6], [RG.grove.x, RG.grove.z], [-128, -36], [RG.hermit.x, RG.hermit.z]],
  [[RG.grove.x, RG.grove.z], [-122, 40], [RG.lotus.x, RG.lotus.z], [-116, 128], [RG.kovil.x, RG.kovil.z]],
  [[-14, 100], [-48, 92], [-90, 84], [RG.lotus.x, RG.lotus.z]],
  [[RG.kovil.x, RG.kovil.z], [-86, 214], [RG.ghats.x, RG.ghats.z], [-28, 214], [-26, 196]],
  [[20, 12], [52, 20], [80, 16], [RG.meadow.x, RG.meadow.z], [124, 60], [RG.ridge.x, RG.ridge.z], [116, 156], [RG.terraces.x, RG.terraces.z]],
  [[-4, -84], [-14, -112], [-34, -134], [RG.pass.x, RG.pass.z]],
  [[24, -96], [52, -112], [76, -118], [RG.stones.x, RG.stones.z]],
  [[RG.meadow.x, RG.meadow.z], [104, -40], [RG.stones.x + 6, RG.stones.z + 24]],
]
export function trailDist(x, z) {
  let best = 1e9
  for (const T of TRAILS) for (let i = 0; i < T.length - 1; i++) {
    const [ax, az] = T[i], [bx, bz] = T[i + 1], abx = bx - ax, abz = bz - az, L2 = abx * abx + abz * abz
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / L2))
    // trails meander a little (deterministic wobble along the segment)
    const wob = Math.sin((ax + az + t * Math.sqrt(L2)) * 0.11) * 2.2
    const d = Math.hypot(x - ax - abx * t + wob * abz / Math.sqrt(L2), z - az - abz * t - wob * abx / Math.sqrt(L2))
    if (d < best) best = d
  }
  return best
}

// ---------- the stream: falls from the east cliff (z≈58), runs south, drops into the gorge by the fortress ----------
export const STREAM = [[31.5, 57], [27, 61], [22, 68], [18.5, 80], [17, 95], [18.5, 112], [20, 126], [23.5, 138], [27.5, 146]].map(([x, z]) => new THREE.Vector2(x, z))
function streamDist(x, z) {
  let best = 1e9, along = 0, acc = 0
  for (let i = 0; i < STREAM.length - 1; i++) {
    const a = STREAM[i], b = STREAM[i + 1], abx = b.x - a.x, abz = b.y - a.y, L = Math.hypot(abx, abz)
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.y) * abz) / (L * L)))
    const d = Math.hypot(x - a.x - abx * t, z - a.y - abz * t)
    if (d < best) { best = d; along = acc + t * L }
    acc += L
  }
  return [best, along]
}

function rawHeight(x, z) {
  let h = baseH(z)
  const ax = Math.abs(x - pathX(z))
  // valley walls, then the land falls away into misty outer valleys
  // forested shoulders rising beside the valley, then rolling down into misty outer valleys
  const wall = 26 * smooth(20, 62, ax) + (fbm(x * 0.03 + 3, z * 0.03) - 0.5) * 14 * smooth(24, 50, ax)
  const out = Math.max(0, ax - 75)
  // beyond the shoulders the land rolls on (walkable): a soft descent and broad hills
  h += wall - Math.min(16, out * 0.22) + (fbm(x * 0.012 + 7, z * 0.012) - 0.5) * 30 * smooth(70, 160, ax) + (fbm(x * 0.035 + 2, z * 0.035) - 0.5) * 6 * smooth(70, 120, ax)
  // far outside the playable land: true mountains/valleys again (seen through the mist)
  const far = Math.max(0, Math.max(Math.abs(x) - 185, z - 280, -190 - z))
  h += far > 0 ? (fbm(x * 0.01, z * 0.01) - 0.4) * Math.min(80, far * 0.7) : 0
  h += (fbm(x * 0.05, z * 0.05) - 0.5) * 7 * smooth(4, 14, ax)
  h += (fbm(x * 0.2, z * 0.2) - 0.5) * 0.6
  // the far north climbs to the high ridge behind the temple
  if (z < -100) h += (-100 - z) * 0.18 + (fbm(x * 0.03, z * 0.03) - 0.5) * 16 * smooth(-100, -160, z)
  // misty eastern drop below the meditation rock (sunrise side)
  if (x > 22 && z < -5 && z > -170) {
    const k = smooth(25, 38, x) * smooth(-170, -125, z) * smooth(-5, -75, z)
    h = h + (13 + (fbm(x * 0.025, z * 0.025) - 0.5) * 34 + (fbm(x * 0.09, z * 0.09) - 0.5) * 6 - h) * k
  }
  // waterfall cliff: a ledge on the east wall where the stream begins
  if (z > 44 && z < 74 && x > 28) {
    const k = smooth(29.6, 31.2, x) * smooth(44, 49, z) * smooth(74, 69, z)
    h = Math.max(h, h + (baseH(58) + 13 - h) * k)
  }
  // the gorge east and south of the fortress (fortress stands on its cliff edge)
  if (x > 22 && z > 128) {
    const k = smooth(25.5, 27.5, x) * smooth(130, 138, z) * (1 - smooth(110, 150, x))
    h = h + (-6 + (fbm(x * 0.06, z * 0.06) - 0.5) * 3 - h) * k
  }
  // stream bed
  if (z > 50 && z < 150 && x > 8) {
    const [d] = streamDist(x, z)
    if (d < 6) h -= 1.5 * (1 - smooth(1.6, 5.5, d))
  }
  return h
}

export function heightAt(x, z) {
  let h = rawHeight(x, z)
  // landmark pads: flatten to the region's own natural level
  for (const g of REGIONS) {
    const d = Math.hypot(x - g.x, z - g.z)
    if (d > g.r + 12) continue
    h = h + (g.h - h) * (1 - smooth(g.r, g.r + 12, d))
  }
  // trails: soften bumps so paths read as worn earth
  if (Math.abs(x) > 18 || z < -80 || z > 186) { const td = trailDist(x, z); if (td < 3) h -= 0.25 * (1 - smooth(1, 3, td)) }
  for (const zn of ZONES) {
    const d = Math.hypot(x - zn.p.x, z - zn.p.z)
    if (d > zn.r + 10) continue
    const w = 1 - smooth(zn.r, zn.r + 10, d)
    h = h + (zn.h - h) * w
  }
  // Dunkan's mine pit, inside the east courtyard
  const pd = Math.hypot(x - 14, z - 168)
  if (pd < 5) h -= 5.5 * (1 - smooth(2.6, 4.8, pd))
  return h
}
for (const g of REGIONS) g.h = rawHeight(g.x, g.z)
for (const k in PLACES) PLACES[k].y = heightAt(PLACES[k].x, PLACES[k].z)
for (const g of REGIONS) g.y = heightAt(g.x, g.z)

// 350 × 440 m of walkable land (≈5.7× the original valley)
export const BOUNDS = { minX: -175, maxX: 175, minZ: -178, maxZ: 262 }
export const streamInfo = streamDist

/* ---------------- terrain meshes ---------------- */
const COL = {
  grassL: new THREE.Color(0x6a9a3e), grassD: new THREE.Color(0x3f6a2a), tuft: new THREE.Color(0x7a9a44),
  dirt: new THREE.Color(0x8a6a44), plaza: new THREE.Color(0xa58761), rock: new THREE.Color(0x6e6a64), snow: new THREE.Color(0xeef2f6),
  forest: new THREE.Color(0x2c4a26), far: new THREE.Color(0x3a5a4a), wet: new THREE.Color(0x4a3a2a), red: new THREE.Color(0x9a5a3a),
}

/** Shared uniforms: Kurinji bloom wave + Thennur ash. */
export const TERRAIN_U = {
  uBloom: { value: 0 }, uBloomCenter: { value: new THREE.Vector2(PLACES.rock.x, PLACES.rock.z) },
  uAsh: { value: 0 }, uViolet: { value: new THREE.Color(0x7c6ae8) }, uAshCol: { value: new THREE.Color(0x2a2420) },
}
function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })
  m.onBeforeCompile = s => {
    patchFog(s); Object.assign(s.uniforms, TERRAIN_U)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aZone; varying vec2 vZone; varying vec2 vWxz;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = aZone; vWxz = (modelMatrix * vec4(transformed,1.0)).xz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uBloom; uniform vec2 uBloomCenter; uniform float uAsh; uniform vec3 uViolet; uniform vec3 uAshCol;
        varying vec2 vZone; varying vec2 vWxz;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bd = distance(vWxz, uBloomCenter);
        float front = uBloom * 420.0;
        float on = step(0.0005, uBloom);
        float wave = (1.0 - smoothstep(front - 40.0, front, bd)) * on;
        float rim = smoothstep(front - 6.0, front, bd) * (1.0 - smoothstep(front, front + 6.0, bd)) * on;
        diffuseColor.rgb = mix(diffuseColor.rgb, uViolet * (0.9 + 0.25 * sin(vWxz.x * 1.7 + vWxz.y * 2.3)), vZone.x * wave * 0.85);
        diffuseColor.rgb += uViolet * rim * vZone.x * 0.6;
        diffuseColor.rgb = mix(diffuseColor.rgb, uAshCol, vZone.y * uAsh);`)
    m.userData.shader = s
  }
  m.customProgramCacheKey = () => 'terrain'
  return m
}

function buildGrid(x0, z0, w, d, nx, nz, colorFn, sink) {
  const r = rng(nx * 31 + nz)
  const tris = nx * nz * 2, pos = new Float32Array(tris * 9), col = new Float32Array(tris * 9), zone = new Float32Array(tris * 6)
  const H = new Float32Array((nx + 1) * (nz + 1)), dx = w / nx, dz = d / nz
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * dx, z = z0 + j * dz
    H[j * (nx + 1) + i] = sink && sink(x, z) ? heightAt(x, z) - 40 : heightAt(x, z)
  }
  let t = 0
  const c = new THREE.Color(), v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3()
  const put = (ix, jz) => [x0 + ix * dx, H[jz * (nx + 1) + ix], z0 + jz * dz]
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const p00 = put(i, j), p10 = put(i + 1, j), p01 = put(i, j + 1), p11 = put(i + 1, j + 1)
    const flip = (i + j) % 2 === 0
    const quads = flip ? [[p00, p01, p10], [p10, p01, p11]] : [[p00, p01, p11], [p00, p11, p10]]
    for (const tri of quads) {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3, cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3
      a.set(tri[1][0] - tri[0][0], tri[1][1] - tri[0][1], tri[1][2] - tri[0][2]); b.set(tri[2][0] - tri[0][0], tri[2][1] - tri[0][1], tri[2][2] - tri[0][2])
      v.crossVectors(a, b).normalize(); const ny = Math.abs(v.y)
      const z2 = colorFn(c, cx, cy, cz, ny, r)
      for (let k = 0; k < 3; k++) {
        pos.set(tri[k], t * 9 + k * 3); col[t * 9 + k * 3] = c.r; col[t * 9 + k * 3 + 1] = c.g; col[t * 9 + k * 3 + 2] = c.b
        zone[t * 6 + k * 2] = z2[0]; zone[t * 6 + k * 2 + 1] = z2[1]
      }
      t++
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aZone', new THREE.BufferAttribute(zone, 2))
  g.computeVertexNormals()
  return g
}

function innerColor(c, x, y, z, ny, r) {
  const ax = Math.abs(x - pathX(z))
  c.copy(COL.grassL).lerp(COL.grassD, Math.min(1, fbm(x * 0.09, z * 0.09) * 1.25 - 0.1))
  if (fbm(x * 0.3 + 3, z * 0.3) > 0.68) c.lerp(COL.tuft, 0.5)
  const onPath = Math.max(1 - smooth(1.4, 2.6, ax), 1 - smooth(1.2, 2.4, trailDist(x, z)))
  c.lerp(COL.dirt, onPath * 0.9)
  for (const g of REGIONS) { const d = Math.hypot(x - g.x, z - g.z); if (d < g.r) c.lerp(COL.plaza, 0.35 * (1 - smooth(g.r * 0.4, g.r, d))) }
  for (const zn of ZONES) {
    const d = Math.hypot(x - zn.p.x, z - zn.p.z)
    if (d < zn.r * 0.85) c.lerp(zn.p === PLACES.village ? COL.plaza : COL.dirt, 0.55 * (1 - smooth(zn.r * 0.5, zn.r * 0.85, d)))
  }
  // stream banks
  if (z > 50 && z < 150 && x > 8) { const [d] = streamDist(x, z); if (d < 3.2) c.lerp(COL.wet, 0.7 * (1 - smooth(1.5, 3.2, d))) }
  const steep = smooth(0.74, 0.5, ny)
  c.lerp(COL.rock, steep)
  if (steep > 0.6 && r() < 0.3) c.lerp(COL.red, 0.25)
  c.lerp(COL.snow, smooth(88, 104, y) * (0.6 + 0.4 * ny))
  c.multiplyScalar(0.92 + r() * 0.16)
  // Kurinji coverage (bloom wave) and Thennur ash
  const kur = (1 - onPath) * smooth(0.45, 0.62, fbm(x * 0.05 + 10, z * 0.05)) * (1 - steep) * (y < 70 ? 1 : 0)
  const ash = 1 - smooth(14, 26, Math.hypot(x - PLACES.thennur.x, z - PLACES.thennur.z))
  return [kur, ash]
}
function outerColor(c, x, y, z, ny, r) {
  const d = Math.hypot(x, z - 40)
  c.copy(COL.forest).lerp(COL.grassD, smooth(0.4, 0.7, fbm(x * 0.02, z * 0.02)))
  c.lerp(COL.rock, smooth(0.8, 0.55, ny))
  c.lerp(COL.snow, smooth(85, 110, y) * ny)
  c.lerp(COL.far, smooth(300, 700, d) * 0.5)
  c.multiplyScalar(0.9 + r() * 0.18)
  return [smooth(0.42, 0.6, fbm(x * 0.03 + 4, z * 0.03)) * (1 - smooth(0.8, 0.6, ny)) * (y < 90 ? 1 : 0), 0]
}

export const INNER = { x0: -230, z0: -240, w: 460, d: 560 }
export function buildTerrain(scene) {
  const material = terrainMaterial()
  const inner = new THREE.Mesh(buildGrid(INNER.x0, INNER.z0, INNER.w, INNER.d, 368, 448, innerColor), material)
  inner.receiveShadow = true; inner.name = 'terrain'
  const inside = (x, z) => x > INNER.x0 + 1 && x < INNER.x0 + INNER.w - 1 && z > INNER.z0 + 1 && z < INNER.z0 + INNER.d - 1
  const outer = new THREE.Mesh(buildGrid(-900, -860, 1800, 1800, 180, 180, outerColor, inside), material)
  outer.receiveShadow = true; outer.name = 'terrain-outer'
  scene.add(inner, outer)
  return { inner, outer, material }
}
