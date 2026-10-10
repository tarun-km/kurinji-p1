import * as THREE from 'three'
import { Builder, G, rock, jitter, rng } from '../gfx/kit'
import { REGIONS, heightAt } from './terrain'
import * as K from './props'
import { house, watchtower, tileRoof, kolam } from './buildings'

/* ===========================================================================
   The wider land around the valley (free roam): ten landmarks, each with its
   own architecture, props, lamps to light, flags, people and animals.
   Outputs on the world:
     world.regionLamps  [{ p:[x,y,z], key }]           unlit brass lamps (collectible: light them)
     world.regionNpcs   [{ id, preset, x, z, face, act, prop, extra, label, lines }]
     world.herds        [{ kind, x, z, n }]             goats / chickens for the fauna
=========================================================================== */
const PAL = { plaster: [0xf0e4cc, 0xe2d2b2, 0xd8c4a0, 0xeadcc0], roof: [0xc4573a, 0xb04a2e, 0xc8603a], wood: 0x6a4a2a, woodDark: 0x4a3424, stone: 0x9a9284 }
const CHAT = {
  shrine: ['The old shrine keeper says Ganesha watches the forest paths.', 'Leave a flower. The forest remembers kindness.'],
  hermit: ['Up here the wind does the talking. I just listen.', 'Twelve years I have watched the valley. It is gentler now.'],
  lotus: ['The lotus grows from mud, Aruvan. Like all of us.', 'Sit by the water a while. The fish are not in a hurry.'],
  kovil: ['Welcome to Kovil! We heard the king of Kurinji walks alone.', 'The millet came in fat this year.', 'My son wants to carve birds like Ilan.', 'Fresh jaggery! Sweet as the hills!'],
  ghats: ['The river carries the ash of the old wars away.', 'Every evening we float lamps for the ones we lost.'],
  shepherd: ['The goats know the way better than I do.', 'Careful — that one bites. She likes you though.'],
  ridge: ['From the tower you can see the whole valley. Even the fortress.', 'Dunkan\'s men kept watch here once. Now only the hawks do.'],
  terrace: ['Pick only the two top leaves and the bud. Gently.', 'Tea from these slopes goes all the way to the coast now.'],
  stones: ['Nobody knows who raised these stones. Older than the temple.', 'At the bloom, the shadows of the stones point at the rock.'],
  pass: ['Every flag carries a prayer. The wind reads them aloud.', 'Beyond this pass the snow never melts.'],
}

export function buildRegions(world) {
  world.regionLamps = []; world.regionNpcs = []; world.herds = []
  const R = Object.fromEntries(REGIONS.map(g => [g.key, g]))
  const F = world.flags
  const b = new Builder(900)
  const r = rng(901)
  const gy = (x, z) => heightAt(x, z)
  const P = (g, dx, dz, dy = 0) => [g.x + dx, gy(g.x + dx, g.z + dz) + dy, g.z + dz]
  const lamp = (g, dx, dz, kind = 'brass') => {
    const p = P(g, dx, dz)
    if (kind === 'stone') K.stoneLantern(b, p, 0); else { b.add(G.cyl(0.32, 0.4, 0.5, 8), 0x8a8478, { at: [p[0], p[1] + 0.25, p[2]], m: 'stone' }); K.brassLamp(b, [p[0], p[1] + 0.5, p[2]], 0.9) }
    world.regionLamps.push({ p: [p[0], p[1] + (kind === 'stone' ? 1.25 : 1.45), p[2]], key: g.key })
    world.solid(p[0], p[2], 0.45)
  }
  const npc = (g, id, preset, dx, dz, face, act, lines, extra, prop) => world.regionNpcs.push({ id, preset, x: g.x + dx, z: g.z + dz, face, act, prop, extra, label: extra?.label || 'a villager', lines, region: g.key })
  const hut = (g, dx, dz, rot, o = {}) => {
    const x = g.x + dx, z = g.z + dz, y = gy(x, z) - 0.1
    b.push([x, y, z], [0, rot, 0]); house(b, { w: 4.4, d: 3.8, roof: PAL.roof[(r() * 3) | 0], wall: PAL.plaster[(r() * 4) | 0], seed: (r() * 1e4) | 0, ...o }); b.pop()
    world.solid(x, z, Math.max(o.w || 4.4, o.d || 3.8) * 0.55)
    kolam(world.scene, x + Math.sin(rot) * 3.4, gy(x + Math.sin(rot) * 3.4, z + Math.cos(rot) * 3.4), z + Math.cos(rot) * 3.4, rot, 1.4)
    return { x, z, rot }
  }
  const faceTo = (g, dx, dz) => Math.atan2(-dx, -dz)

  /* ---------- Shola Grove Shrine: forest Ganesha shrine, lantern ring, bell, benches ---------- */
  { const g = R.grove
    K.ganeshaShrine(b, P(g, 0, -3), 0)
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5; K.stoneLantern(b, P(g, Math.cos(a) * 8, Math.sin(a) * 8), -a); world.solid(g.x + Math.cos(a) * 8, g.z + Math.sin(a) * 8, 0.4) }
    for (const s of [-1, 1]) K.bench(b, P(g, s * 3.6, 2.6), Math.PI / 2 * s, 1.8)
    K.pot(b, P(g, -1.2, -1.4), 0.9, 0xb0603a, 'flower'); K.pot(b, P(g, 1.3, -1.4), 0.9, 0xb0603a, 'flower')
    K.garland(b, P(g, -2.2, -2.6, 2.4), P(g, 2.2, -2.6, 2.4), { kind: 'marigold', sag: 0.4 })
    // great banyan: trunk cluster, aerial roots, wide canopy
    const T = P(g, 9, -7)
    for (let i = 0; i < 5; i++) b.add(jitter(G.cyl(0.35, 0.55, 6, 7), 0.08, i), 0x5a4030, { at: [T[0] + Math.cos(i * 1.3) * 0.7, T[1] + 3, T[2] + Math.sin(i * 1.3) * 0.7], rot: [Math.cos(i) * 0.08, 0, Math.sin(i) * 0.08], m: 'tree' })
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, d = 2.4 + r() * 2.5; b.add(G.cyl(0.05, 0.07, 5.2, 4), 0x6a4a34, { at: [T[0] + Math.cos(a) * d, T[1] + 2.6, T[2] + Math.sin(a) * d], m: 'tree' }) }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; b.add(jitter(G.ico(2.6, 1), 0.5, 40 + i), [0x3a5a2c, 0x2f4e26, 0x446a34][i % 3], { at: [T[0] + Math.cos(a) * 3.2, T[1] + 6.2 + r() * 1.2, T[2] + Math.sin(a) * 3.2], scale: [1.3, 0.75, 1.3], m: 'leaf', grad: 0.4 }) }
    world.solid(T[0], T[2], 1.6)
    for (const s of [-1, 1]) F.pole(b, P(g, s * 4.5, -4.5), 0, 4.6, 0.9, 0.55, 0xe8b820, { trim: 0xc8282a })
    lamp(g, -2.5, 5); lamp(g, 2.5, 5)
    npc(g, 'rg_priest', 'murugan', 1.4, -0.6, Math.PI, 'pray', CHAT.shrine, { label: 'the shrine keeper' })
  }

  /* ---------- Hermit's Ledge: a hut on the cliff, prayer flags, a meditation seat ---------- */
  { const g = R.hermit
    const h = hut(g, -2, -2, 0.6, { w: 3.4, d: 3.0, porch: false })
    b.add(G.cyl(1.2, 1.3, 0.25, 10), PAL.stone, { at: P(g, 3, 2, 0.12), m: 'stone' })
    world.floor({ disc: true, x: g.x + 3, z: g.z + 2, r: 1.25, y: gy(g.x + 3, g.z + 2) + 0.25 })
    b.add(G.box(1.1, 0.04, 0.8), 0x8a3a1a, { at: P(g, 3, 2, 0.27), m: 'cloth' })
    b.add(G.cyl(0.05, 0.05, 3.2, 5), PAL.woodDark, { at: P(g, 6, -3, 1.6), m: 'wood' }); b.add(G.cyl(0.05, 0.05, 3.2, 5), PAL.woodDark, { at: P(g, -6, 4, 1.6), m: 'wood' })
    F.string(b, P(g, 6, -3, 3.1), P(g, -6, 4, 3.1), { sag: 0.6 }); F.string(b, P(g, 6, -3, 3.0), [h.x, gy(h.x, h.z) + 2.9, h.z], { sag: 0.4 })
    for (let i = 0; i < 4; i++) b.add(rock(0.35 - i * 0.06, 950 + i, 0.6, 0), 0x8a8478, { at: P(g, -5, -4, 0.25 + i * 0.36), m: 'stone' })
    lamp(g, 1.5, 4.2, 'stone')
    npc(g, 'rg_hermit', 'guru', 3, 2, -2.2, null, CHAT.hermit, { label: 'the hermit', sustain: 'meditate', robe: 0xb8661d, cloth: 0xb8661d })
  }

  /* ---------- Lotus Pond: still water, lotus pads, stone ghat steps, a pavilion ---------- */
  { const g = R.lotus, pr = 8.5
    const water = new THREE.Mesh(new THREE.CircleGeometry(pr, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e5a62, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.88 }))
    water.position.set(g.x, gy(g.x, g.z) + 0.06, g.z); water.receiveShadow = true; world.scene.add(water)
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; b.add(G.chamfer(1.4, 0.35, 0.7, 0.04), [0x9a9284, 0x8a8478][i % 2], { at: [g.x + Math.cos(a) * (pr + 0.35), gy(g.x, g.z) + 0.1, g.z + Math.sin(a) * (pr + 0.35)], rot: [0, -a, 0], m: 'stone' }) }
    for (let i = 0; i < 30; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * (pr - 1); const pad = G.cyl(0.35 + r() * 0.25, 0.35, 0.02, 9); b.add(pad, [0x3a6a2a, 0x4a7a32][i % 2], { at: [g.x + Math.cos(a) * d, gy(g.x, g.z) + 0.08, g.z + Math.sin(a) * d], m: 'leaf' }); if (i % 3 === 0) { for (let k = 0; k < 6; k++) b.add(G.oct(0.09), k % 2 ? 0xf2a8c0 : 0xe888a8, { at: [g.x + Math.cos(a) * d + Math.cos(k) * 0.08, gy(g.x, g.z) + 0.18, g.z + Math.sin(a) * d + Math.sin(k) * 0.08], scale: [0.6, 1.4, 0.6], rot: [0.5, k, 0] }) } }
    world.solid(g.x, g.z, pr - 0.6)
    // pavilion on the east bank (4 posts, tiled roof)
    const pv = P(g, pr + 4.5, 0)
    b.push(pv, [0, -Math.PI / 2, 0])
    b.add(G.chamfer(4.4, 0.4, 4.4, 0.05), PAL.stone, { at: [0, 0.2, 0], m: 'stone' })
    for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) b.add(G.cyl(0.14, 0.17, 2.9, 8), 0x8a2a1a, { at: [x, 1.85, z], m: 'wood' })
    b.push([0, 3.3, 0], [0, 0, 0]); tileRoof(b, 4.8, 2.5, 2.5, 0, 0.5); b.pop()
    K.bench(b, [0, 0.4, 1.2], 0, 2.2)
    b.pop()
    world.floor({ x0: pv[0] - 2.2, x1: pv[0] + 2.2, z0: pv[2] - 2.2, z1: pv[2] + 2.2, y: pv[1] + 0.4 })
    lamp(g, -pr - 2, 3, 'stone'); lamp(g, 0, pr + 2.5)
    npc(g, 'rg_lotus', 'thamaraiOld', pr + 3.2, 2.6, -Math.PI / 2, 'sitchat', CHAT.lotus, { label: 'a woman by the water', cloth: 0x7a2f4f })
  }

  /* ---------- Kovil Hamlet: 8 houses around a square, well, stalls, bunting ---------- */
  { const g = R.kovil
    const houses = []
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2, d = 15 + (i % 2) * 2.5; houses.push(hut(g, Math.cos(a) * d, Math.sin(a) * d, Math.atan2(-Math.cos(a), -Math.sin(a)), { w: 4.2 + (i % 3) * 0.4, d: 3.6 + (i % 2) * 0.4 })) }
    // well
    const W = P(g, 0, 0)
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.add(G.chamfer(0.55, 0.85, 0.3, 0.04), PAL.stone, { at: [W[0] + Math.cos(a) * 0.95, W[1] + 0.42, W[2] + Math.sin(a) * 0.95], rot: [0, -a + Math.PI / 2, 0], m: 'stone' }) }
    for (const s of [-1, 1]) b.add(G.chamfer(0.18, 2.6, 0.18, 0.03), PAL.woodDark, { at: [W[0] + s * 1.25, W[1] + 1.3, W[2]], m: 'wood' })
    b.add(G.cone(1.9, 0.9, 4), 0xb04a2e, { at: [W[0], W[1] + 3.0, W[2]], rot: [0, Math.PI / 4, 0], m: 'tile' })
    world.solid(W[0], W[2], 1.3)
    K.stall(b, P(g, 6, 5), -2.4, 0x2a6ab0); K.stall(b, P(g, -6, 6), 2.4, 0xd8a020); K.stall(b, P(g, 6.5, -5.5), -0.8, 0xc0302a)
    world.solid(g.x + 6, g.z + 5, 1.4); world.solid(g.x - 6, g.z + 6, 1.4); world.solid(g.x + 6.5, g.z - 5.5, 1.4)
    for (let i = 0; i < 8; i++) { const A = houses[i], B = houses[(i + 3) % 8]; if (i % 2 === 0) F.string(b, [A.x, gy(A.x, A.z) + 3.2, A.z], [B.x, gy(B.x, B.z) + 3.2, B.z], { colors: [0xe8b820, 0xc8282a, 0x2a6ab0, 0x2f8a3a, 0xd9822b], size: [0.3, 0.38], sag: 1.1 }) }
    K.clothLine(b, P(g, -10, -9, 1.9), P(g, -6, -12, 1.9)); K.barrel(b, P(g, 3, -2)); K.crate(b, P(g, -3.4, 2.4), 0.4)
    K.ganeshaShrine(b, P(g, 0, -11), 0)
    F.pole(b, P(g, 0, -8), 0, 6, 1.4, 0.8, 0xd9822b, { trim: 0x8a2a1a, emblem: 0xf2d080 })
    lamp(g, 2.6, -9); lamp(g, -2.6, -9); lamp(g, 0, 10)
    const V = [['rg_k1', 'villager', 4, 4.6, 'chat'], ['rg_k2', 'villager', 5.2, 3.4, 'listen'], ['rg_k3', 'villager', -1.6, -1.2, 'draw'], ['rg_k4', 'villager', -6.6, 4.8, 'sitchat'], ['rg_k5', 'villager', 6.8, -4.2, 'chat'], ['rg_k6', 'villager', -9, -9.6, 'sweep']]
    V.forEach(([id, pre, dx, dz, act]) => npc(g, id, pre, dx, dz, faceTo(g, dx, dz), act, CHAT.kovil, { label: 'a villager of Kovil', long: r() < 0.5 }, act === 'sweep' ? 'broom' : null))
    npc(g, 'rg_kkid1', 'ilan', 2, 8, 0, null, ['Race you to the well!', 'Are you the king? You look like a monk.'], { label: 'a child', cloth: 0x4a8ac9 })
    world.herds.push({ kind: 'chicken', x: g.x + 3, z: g.z + 9, n: 5 })
  }

  /* ---------- River Ghats: a long river reach, stone steps down to it, lamps and a shrine ---------- */
  { const g = R.ghats
    const water = new THREE.Mesh(new THREE.PlaneGeometry(70, 9, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a5a66, roughness: 0.1, metalness: 0.25, transparent: true, opacity: 0.9 }))
    water.position.set(g.x - 6, gy(g.x, g.z) - 1.15, g.z + 9.5); water.receiveShadow = true; world.scene.add(water)
    for (let s = 0; s < 6; s++) b.add(G.chamfer(20, 0.25, 0.9, 0.04), [0x9a9284, 0x8a8478][s % 2], { at: [g.x, gy(g.x, g.z) - 0.2 - s * 0.2, g.z + 3 + s * 0.85], m: 'stone' })
    for (let s = 0; s < 6; s++) world.floor({ x0: g.x - 10, x1: g.x + 10, z0: g.z + 2.55 + s * 0.85, z1: g.z + 3.45 + s * 0.85, y: gy(g.x, g.z) - 0.08 - s * 0.2 })
    for (let i = 0; i < 7; i++) b.add(G.cyl(0.25, 0.3, 3.4, 8), 0xd8c9a8, { at: P(g, -9 + i * 3, 1, 1.7), m: 'plaster' })
    b.add(G.chamfer(20, 0.5, 1.2, 0.05), 0xd8c9a8, { at: P(g, 0, 1, 3.6), m: 'plaster' })
    K.ganeshaShrine(b, P(g, -12, -3), Math.PI / 4)
    for (let i = 0; i < 5; i++) F.string(b, P(g, -9 + i * 4.5, 1, 3.8), P(g, -9 + (i + 1) * 4.5 - 1.5, 1, 3.8), { colors: [0xe8b820, 0xd9822b], size: [0.24, 0.3], sag: 0.35 })
    lamp(g, -6, -1); lamp(g, 6, -1)
    npc(g, 'rg_ghat1', 'villager', 2, 4.2, Math.PI, 'pray', CHAT.ghats, { label: 'a pilgrim', cloth: 0xd9822b })
    npc(g, 'rg_ghat2', 'villager', -4, 0.6, 0.4, 'carry', CHAT.ghats, { label: 'a woman with lamps', long: true }, 'pot')
  }

  /* ---------- Shepherd's Meadow: the shepherd's house, goat pens, wool and feed ---------- */
  { const g = R.meadow
    hut(g, -4, -5, 0.3, { w: 5.0, d: 4.2 })
    const pen = [[2, 1], [11, 1], [11, 9], [2, 9]]
    for (let i = 0; i < 4; i++) { const [ax, az] = pen[i], [bx, bz] = pen[(i + 1) % 4]; if (i === 3) continue; K.fence(b, P(g, ax, az), P(g, bx, bz), 1.1) }
    K.woolBundle(b, P(g, 1, -1)); K.woolBundle(b, P(g, 1.8, -1.6)); K.bucket(b, P(g, 3, -1)); K.basket(b, P(g, -1, 1), 1.1, 'herbs')
    b.add(G.chamfer(2.4, 0.5, 0.6, 0.04), 0x6a4a2a, { at: P(g, 6.5, 5, 0.25), m: 'wood' })
    world.herds.push({ kind: 'goat', x: g.x + 6.5, z: g.z + 5, n: 6 }, { kind: 'goat', x: g.x - 12, z: g.z + 12, n: 3 })
    F.pole(b, P(g, -9, -1), 0.3, 5, 1.0, 0.6, 0x3a7a5a, { trim: 0xe8dcc0 })
    lamp(g, -1, -2.6)
    npc(g, 'rg_shep', 'murugan', 1.5, 2, 0.8, 'chat', CHAT.shepherd, { label: 'the shepherd' })
  }

  /* ---------- Watchtower Ridge: the old army tower, ruined wall, lookout ---------- */
  { const g = R.ridge
    const t = P(g, 0, 0)
    watchtower(b, t, 9)
    world.solid(g.x, g.z, 1.6)
    for (let i = 0; i < 9; i++) { const x = -9 + i * 1.7, h = 1 + ((i * 7) % 5) * 0.35; for (let y = 0; y < h; y += 0.6) b.add(G.chamfer(1.6, 0.58, 1.2, 0.05), [0x6a6460, 0x5a5450][(i + y * 2) % 2 | 0], { at: P(g, x, -5, y + 0.3), m: 'stone' }) }
    for (let i = 0; i < 9; i++) world.solid(g.x - 9 + i * 1.7, g.z - 5, 0.75)
    for (let i = 0; i < 6; i++) b.add(G.chamfer(0.9, 0.5, 0.7, 0.05), 0x6a6460, { at: P(g, 4 + r() * 4, 3 + r() * 3, 0.25), rot: [r(), r(), r()], m: 'stone' })
    F.add([t[0], t[1] + 11.2, t[2]], 0.6, 2.2, 1.2, 0x7a0a0a, 0, { emblem: 0xc9a24a })
    b.add(G.cyl(0.05, 0.05, 2.4, 5), PAL.woodDark, { at: [t[0], t[1] + 10.4, t[2]], m: 'wood' })
    K.bench(b, P(g, 5, -2), 0.5, 1.8)
    lamp(g, -3, 3, 'stone')
    npc(g, 'rg_scout', 'senthilBuilder', 3, 1, 0.5, 'chat', CHAT.ridge, { label: 'a former scout' })
  }

  /* ---------- Tea Terraces: stepped hillside rows of tea bushes, a farmhouse ---------- */
  { const g = R.terraces
    for (let t = 0; t < 5; t++) {
      const z0 = g.z - 12 + t * 5, y = gy(g.x, g.z) + (2 - t) * 0.45
      b.add(G.chamfer(30, 0.6, 0.5, 0.04), 0x8a7a64, { at: [g.x, y - 0.25, z0 + 2.4], m: 'stone' })
      for (let i = 0; i < 18; i++) b.add(jitter(G.ico(0.55, 1), 0.12, t * 40 + i), [0x2f6a2a, 0x3a7a32, 0x2a5e26][(i + t) % 3], { at: [g.x - 13.5 + i * 1.6, y + 0.35, z0], scale: [1.4, 0.75, 1.0], m: 'leaf', grad: 0.4 })
    }
    hut(g, -18, 4, Math.PI / 2, { w: 5.2, d: 4.2 })
    K.basket(b, P(g, -12, 2), 1.2, 'herbs'); K.basket(b, P(g, -12.8, 3.2), 1, 'herbs')
    F.pole(b, P(g, 15, -14), 0, 5, 1.2, 0.7, 0x2f8a3a, { trim: 0xe8b820 })
    lamp(g, -14, -2)
    for (const [i, dx, dz] of [[1, -6, -10], [2, 2, -5], [3, 8, 0]]) npc(g, 'rg_tea' + i, 'villager', dx, dz, Math.PI, 'carry', CHAT.terrace, { label: 'a tea picker', long: true, cloth: [0xc94a4a, 0x2a6ab0, 0xd8a020][i - 1] }, 'basket')
  }

  /* ---------- Circle of Stones: twelve standing stones and an altar ---------- */
  { const g = R.stones
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, h = 2.6 + (i % 3) * 0.7; b.add(jitter(G.chamfer(1.1, h, 0.6, 0.08), 0.06, 960 + i), [0x7a7a7a, 0x6a6a6a, 0x8a8478][i % 3], { at: P(g, Math.cos(a) * 8, Math.sin(a) * 8, h / 2 - 0.2), rot: [0, -a, (i % 2 - 0.5) * 0.08], m: 'stone' }); world.solid(g.x + Math.cos(a) * 8, g.z + Math.sin(a) * 8, 0.6) }
    b.add(G.chamfer(2.6, 0.7, 1.4, 0.06), 0x8a8478, { at: P(g, 0, 0, 0.35), m: 'stone' })
    world.floor({ x0: g.x - 1.3, x1: g.x + 1.3, z0: g.z - 0.7, z1: g.z + 0.7, y: gy(g.x, g.z) + 0.7 })
    K.pot(b, P(g, -0.6, 0, 0.7), 0.6, 0xb0603a, 'flower'); K.pot(b, P(g, 0.6, 0, 0.7), 0.6, 0xb0603a, 'flower')
    lamp(g, 0, 4, 'stone'); lamp(g, 0, -4, 'stone')
    npc(g, 'rg_sage', 'aruvanOld', 3.5, 2.5, -2.2, null, CHAT.stones, { label: 'an old pilgrim', sustain: 'crossSit' })
  }

  /* ---------- Prayer-Flag Pass: cairns, poles and long lines of prayer flags in the snow wind ---------- */
  { const g = R.pass
    const poles = [[-8, -6], [8, -6], [10, 6], [-9, 7], [0, -11], [0, 10]]
    for (const [x, z] of poles) { const p = P(g, x, z); b.add(G.cyl(0.07, 0.09, 5.5, 6), PAL.woodDark, { at: [p[0], p[1] + 2.75, p[2]], m: 'wood' }); world.solid(p[0], p[2], 0.3) }
    for (let i = 0; i < poles.length; i++) for (let j = i + 1; j < poles.length; j++) if ((i + j) % 2 === 1) { const A = P(g, ...poles[i]), C = P(g, ...poles[j]); F.string(b, [A[0], A[1] + 5.2, A[2]], [C[0], C[1] + 5.2, C[2]], { sag: 1.6 }) }
    for (let c = 0; c < 5; c++) { const a = c * 1.25, d = 4 + c; for (let i = 0; i < 5; i++) b.add(rock(0.42 - i * 0.07, 980 + c * 9 + i, 0.55, 0), [0x8a8478, 0x9a948a][i % 2], { at: P(g, Math.cos(a) * d, Math.sin(a) * d, 0.2 + i * 0.32), m: 'stone' }); world.solid(g.x + Math.cos(a) * d, g.z + Math.sin(a) * d, 0.5) }
    // a small whitewashed chorten-like shrine
    b.add(G.chamfer(2.4, 1.2, 2.4, 0.05), 0xeee8dc, { at: P(g, 0, 0, 0.6), m: 'plaster' })
    b.add(G.cyl(0.7, 1.05, 1.6, 10), 0xeee8dc, { at: P(g, 0, 0, 2.0), m: 'plaster' })
    b.add(G.cone(0.42, 1.6, 10), 0xc9a24a, { at: P(g, 0, 0, 3.6), m: 'gold' })
    world.solid(g.x, g.z, 1.5)
    lamp(g, 2.8, 2.8); lamp(g, -2.8, -2.8, 'stone')
    npc(g, 'rg_pass', 'rudhraOld', 3, -2.5, -0.8, 'pray', CHAT.pass, { label: 'an old soldier' })
  }

  world.addMesh(b)
  return world
}
