import gsap from 'gsap'
import * as THREE from 'three'
import { PLACES, heightAt, pathX, REGIONS } from './world/terrain'
import { state, ui, markComplete } from './store'
import { storyFrame, storyCutscene } from './cinematics'

/* ============================================================================
   KURINJI — THE LAST BLOOM
   A story in a prologue, seven chapters and an epilogue.

   ARUVAN    — the monk. Once VEERAN, "the Ash-Hound", King Dunkan's champion.
   MALLI     — a child of Thennur. Her last wish shapes his whole life.
   NILAKANTHA— the blind abbot of the mountain temple. Aruvan's teacher.
   THAMARAI  — village healer; sharp tongue, soft hands. The heart of Kurinji.
   ILAN      — orphan boy who carves wooden birds. Aruvan's shadow.
   KAALI     — blacksmith. Her father was hanged for refusing to forge Dunkan's swords.
   RUDHRA    — Dunkan's commander, Veeran's brother-in-arms. Still obeying.
   DUNKAN    — the Iron King. He wants the iron under the flowers.
   ========================================================================== */

export const SPEAKERS = {
  aruvan: { name: 'Aruvan', color: '#f0a54a', voice: { pitch: 0.8, rate: 0.88 } },
  kovilElder: { name: 'Elder of Kovil', color: '#c8b89a', voice: { pitch: 0.7, rate: 0.9 } },
  shepherd: { name: 'The Shepherd', color: '#a8c08a', voice: { pitch: 0.9, rate: 1.0 } },
  veeran: { name: 'Veeran', color: '#d65a4a', voice: { pitch: 0.75, rate: 0.95 } },
  guru: { name: 'Guru Nilakantha', color: '#e8dcc0', voice: { pitch: 0.6, rate: 0.8 } },
  thamarai: { name: 'Thamarai', color: '#6fd0a4', voice: { pitch: 1.15, rate: 1.0, female: true } },
  ilan: { name: 'Ilan', color: '#f2d36b', voice: { pitch: 1.6, rate: 1.08 } },
  ilanAdult: { name: 'Ilan', color: '#f2d36b', voice: { pitch: 1.0, rate: 1.0 } },
  soldier: { name: 'Soldier', color: '#c0a0a0', voice: { pitch: 0.8, rate: 1.1 } },
  kaali: { name: 'Kaali', color: '#e07a5a', voice: { pitch: 0.9, rate: 1.0, female: true } },
  rudhra: { name: 'Commander Rudhra', color: '#b48ae0', voice: { pitch: 0.7, rate: 1.0 } },
  dunkan: { name: 'King Dunkan', color: '#ff4a3a', voice: { pitch: 0.45, rate: 0.82 } },
  malli: { name: 'Malli', color: '#b9b0ff', voice: { pitch: 1.7, rate: 0.85, female: true } },
  senthil: { name: 'Young Soldier', color: '#a0b0c0', voice: { pitch: 1.2, rate: 1.1 } },
  villager: { name: 'Villager', color: '#c8b89a', voice: { pitch: 1.0, rate: 1.0 } },
  villagerF: { name: 'Villager', color: '#d8c0a0', voice: { pitch: 1.2, rate: 1.0, female: true } },
  kid: { name: 'Child', color: '#f2d36b', voice: { pitch: 1.6, rate: 1.1 } },
  narrator: { name: '', color: '#ffffff', voice: { pitch: 0.7, rate: 0.85 } },
}

// Twelve glowing petals hidden across the mountain — each a memory of Aruvan's past.
export const PETALS = [
  { x: -12, z: -78, memory: { title: 'The Boy from the Salt Villages', text: 'Veeran was born where the sea dries into white fields. His father said a boy with fast hands should hold a net, not a sword. His father was right, and died before Veeran could tell him so.' } },
  { x: 24, z: -84, memory: { title: 'Grain for Sons', text: 'In the drought year, Dunkan\'s recruiters traded sacks of grain for boys. His mother took the grain. She never forgave herself. He never once blamed her.' } },
  { x: 5, z: -2, memory: { title: 'Bread Split in Two', text: 'In the barracks, a skinny boy named Rudhra shared his bread with him on the first night. "Hounds eat together," he said. For ten years, they did.' } },
  { x: -18, z: 12, memory: { title: 'Kaali\'s Father', text: 'The old smith of Kurinji refused to forge swords for Dunkan. They hanged him from his own forge beam. Kaali kept the beam. She hangs her hammer on it every night.' } },
  { x: 20, z: 16, memory: { title: 'The Ash-Hound', text: 'They named him for what he left behind. Seven villages. He told himself he only followed orders. The ash did not care who gave them.' } },
  { x: -26, z: -6, memory: { title: 'The Flood Girl', text: 'Thamarai came down the flooded river clinging to a rice basket, a girl of nine. Aruvan waded in to his chest to catch her. She says she was never scared. She was. She likes the story anyway.' } },
  { x: 14, z: 36, memory: { title: 'Ilan\'s Birds', text: 'Ilan\'s father caught songbirds for the king\'s gardens. Each night he set one free and told the king it escaped. Ilan carves the birds his father saved.' } },
  { x: -20, z: 64, memory: { title: 'The Climb', text: 'After Thennur he climbed until his sandals tore, then barefoot until his feet bled. He collapsed on the temple steps. A blind old man gave him water and did not ask his name.' } },
  { x: 8, z: 80, memory: { title: 'A River\'s Name', text: '"Aruvan," the Guru named him. In the old tongue, aru is a river. "A river does not carry its stones forever. It wears them smooth, and sets them down."' } },
  { x: 6, z: 108, memory: { title: 'Malli\'s Mother', text: 'Thennur\'s healer taught every child the same thing: the Kurinji blooms once in twelve years, and whoever waits for it becomes a little gentler with each winter.' } },
  { x: -16, z: 132, memory: { title: 'The Frightened Prince', text: 'When Dunkan was eight, his father left him in the snow for crying. He learned not to cry. He learned, too, that warmth is something you take.' } },
  { x: 17, z: 172, memory: { title: 'The Iron Under the Flowers', text: 'The surveyors told Dunkan the richest iron in the Nine Valleys lay under the Kurinji slopes. To reach it, every root would have to burn.' } },
]

/* ----------------------------------------------------------------------------
   helpers
---------------------------------------------------------------------------- */
const P = PLACES
const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z)
// Restore each chapter independently: Continue must show the same world as a
// continuous playthrough, and the title-screen bloom must not leak into the story.
function prepareWorld(g, chapter) {
  g.world.setBloom(0); g.world.setPetals(0)
  g.world.setThennur(chapter === 0 ? 'burning' : chapter >= 7 ? 'rebuilt' : 'ruined')
  g.world.setTemple('peaceful')
  g.world.setForge(chapter >= 7 ? 'peaceful' : 'working')
  g.world.setFortress(chapter >= 7 ? 'healing' : 'iron')
  g.world.setGate(chapter >= 5, 0, chapter === 5 || chapter === 6)
  g.world.malliBush.visible = false
  g.player.speedMul = 1; g.player.canFight = true
}
function crowd(g, n, cx, cz, r, prefix = 'v') {
  const out = []
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.random() * 0.4, rr = r * (0.6 + Math.random() * 0.4)
    const v = g.npc(prefix + i, 'villager', cx + Math.cos(a) * rr, cz + Math.sin(a) * rr)
    v.face({ x: cx, z: cz }); out.push(v)
  }
  return out
}
/* ---------------- village life: people going about their morning ---------------- */
function maleChat(g) { g.bark('villager', ['Good morning, swami. The bell rang sweet today.', 'Riders on the ridge again... I do not like it.', 'The Kurinji buds are fat this year. Twelve years, soon.', 'Ilan carved me a sparrow. It sits on my window now.', 'Kaali has been hammering since before the bell.']) }
function femaleChat(g) { g.bark('villagerF', ['Vanakkam, Aruvan. Stay for tea?', 'Mind the chickens. They think they own the square.', 'My grandmother saw the last bloom. She said the whole mountain sang.', 'The well water is cold and sweet today.', 'Thamarai is looking for you. She has that look again.']) }
function kidChat(g) { g.bark('kid', ['Swami! Watch me spin like you!', 'Is it true you can catch a falling leaf with your eyes closed?']) }
/** Where Kaali stands to work: the anvil's long side, facing it (forge shelter is rotated 0.5 rad). */
function forgeSpot() {
  const F = P.forge, a = 0.5, ax = 0.9 * Math.cos(a) + 0.2 * Math.sin(a), az = -0.9 * Math.sin(a) + 0.2 * Math.cos(a)
  const r = a + 0.4, x = F.x + ax + Math.sin(r) * 0.78, z = F.z + az + Math.cos(r) * 0.78
  return { x, z, face: Math.atan2(F.x + ax - x, F.z + az - z) }
}
function villageLife(g, { morning = true } = {}) {
  const V = (id, preset, x, z, face, extra) => g.npc(id, preset, x, z, face, extra)
  const people = []
  const add = (n, label, talk) => { people.push(n); g.addTalker(n, label, talk); return n }
  // sweeping the tea-house steps
  add(V('lifeSweep', 'villager', -5.2, 15.6, 0.4, { cloth: 0x8a3a5a, long: true }).act('sweep', 'broom'), 'the sweeper', femaleChat)
  // two neighbours gossiping by the well
  add(V('lifeChatA', 'villager', 5.6, -0.6, -1.9, { cloth: 0x3a6f8a }).act('chat'), 'a neighbour', maleChat)
  add(V('lifeChatB', 'villager', 4.4, 0.9, 1.2, { cloth: 0xa0522d, long: true }).act('listen'), 'a neighbour', femaleChat)
  // drawing water
  add(V('lifeWell', 'villager', 3.6, -4.05, 0, { cloth: 0x5a7a3a, long: true }).act('draw'), 'the water-bearer', femaleChat)
  // old Murugan on his porch, praying at the shrine house
  add(V('lifeMurugan', 'murugan', -6.6, -12.4, 0.35).act('sitchat'), 'Old Murugan', maleChat)
  add(V('lifePray', 'villager', 21.4, -13.6, -2.1, { cloth: 0x8a6f3a, long: true }).act('pray'), 'a devotee', femaleChat)
  // a woman carrying a basket across the square, and children at play
  const carrier = add(V('lifeCarry', 'villager', -10, -3, 1.2, { cloth: 0xa0522d, long: true }).act('carry', 'basket'), 'a market woman', femaleChat)
  const kids = [add(V('lifeKid1', 'ilan', -3, 5, 0, { cloth: 0xc94a4a }), 'a child', kidChat), add(V('lifeKid2', 'malli', -1.5, 6.5, 0, { cloth: 0x4a8ac9 }), 'a child', kidChat)]
  let alive = true
  const loop = async () => {
    let k = 0
    while (alive && !g.disposed) {
      k++
      const a = k * 1.3
      kids.forEach((c, i) => { if (!g.talkers.find(t => t.npc === c && t.cool > g.t)) c.walkTo(-2 + Math.cos(a + i * 3) * 3.4, 6 + Math.sin(a + i * 3) * 2.6, 2.6) })
      if (k % 3 === 1) carrier.walkTo(k % 6 === 1 ? 9 : -10, k % 6 === 1 ? 7 : -3, 1.1)
      await g.wait(2.2)
    }
  }
  loop()
  return () => { alive = false; for (const n of people) g.dropNpc(n.id) }
}
function wanderVillagers(g, list, cx, cz, r) {
  let alive = true
  const step = () => { if (!alive) return; const v = list[Math.random() * list.length | 0]; if (v && !v.char.sustain) { const a = Math.random() * 6.28; v.walkTo(cx + Math.cos(a) * r * Math.random(), cz + Math.sin(a) * r * Math.random(), 1.3) } setTimeout(step, 1800) }
  step(); return () => { alive = false }
}
/** Shouts when a wave of Dunkan's soldiers arrives. */
function soldierBark(g) {
  return () => g.bark('soldier', ['For the Iron King!', 'Take the monk!', 'He is only one man! Surround him!', 'Burn it! Burn all of it!', 'Hold the line!'])
}
async function controlsHint(g) {
  const m = state.mobile
  g.toast(m ? 'Left stick: move · drag right side: look' : 'WASD: move · Shift: run · Click the screen to look with the mouse')
}

/* ============================================================================
   PROLOGUE — ASH
============================================================================ */
async function prologue(g) {
  const p = g.player
  prepareWorld(g, 0)
  g.time('memory', 0); g.audio.ambience('fire', true); g.music('ash'); g.audio.preload(['lullaby', 'main_theme'])
  p.setLook('veeran'); p.canFight = false
  const T0 = P.thennur, yT = h => heightAt(T0.x, T0.z) + h
  g.movePlayer(-4.4, 101, Math.PI)
  const dk = g.npc('dunkan', 'dunkan', -2.6, 96.4, -0.6)
  const rd = g.npc('rudhra', 'rudhraYoung', -11.2, 94.2, 0.9)
  await g.fade(1, 0)
  g.cine(true)
  // 1. aerial over the burning village, the fortress on its cliff beyond (story frame 1 mood)
  g.shot([-30, yT(24), 66], [-4, yT(3), 132], 0, 'none', { fov: 46, hand: 0.3 })
  g.shot([-19, yT(10), 79], [-6, yT(2.5), 118], 11, 'sine.inOut', { fov: 42, hand: 0.4 })
  await g.fade(0, 3)
  await storyCutscene(g, 1)
  await g.caption('Before the monk, there was a soldier.', 3)
  await g.caption('They called him Veeran. The Ash-Hound of King Dunkan.', 3.5)
  await g.caption('Twenty-four years before the bloom.', 3)
  // 2. low tracking shot: Veeran strides out of the fire toward the lens, flames flanking him
  p.walkTo(-4.8, 93.4, 1.25)
  g.shot([-7.1, yT(0.95), 89.4], [-4.6, yT(1.8), 100], 0, 'none', { fov: 34, hand: 0.9 })
  gsap.to(g.cinePos, { x: -7.0, z: 87.4, y: yT(1.15), duration: 7, ease: 'none' })
  await g.caption('The village of Thennur.', 3.2)
  await g.wait(1.6)
  // 3. the king: low angle, crown against the red sky
  dk.face(p.pos); rd.face(p.pos)
  g.shot([dk.pos.x - 1.5, dk.pos.y + 0.75, dk.pos.z - 3.3], [dk.pos.x, dk.pos.y + 1.85, dk.pos.z], 0, 'none', { fov: 34, roll: -0.03 })
  await g.say('dunkan', 'Every roof, Veeran. A village that feeds rebels is a village of rebels.')
  await g.say('veeran', 'There are children in those houses, my king.')
  await g.say('dunkan', 'Then they will learn early what defiance costs. That is a gift, Hound. I learned it late.')
  await g.say('rudhra', 'Come on, brother. Fire doesn\'t ask questions. Neither should we.')
  dk.walkTo(-4.5, 70, 2); rd.walkTo(-20, 92, 3)
  // 4. Veeran alone among the flames, turning toward a sound
  g.shot([p.pos.x - 3.4, p.pos.y + 1.4, p.pos.z - 2.2], [p.pos.x, p.pos.y + 1.6, p.pos.z + 1], 0, 'none', { fov: 38 })
  g.shot([p.pos.x - 2.4, p.pos.y + 1.55, p.pos.z - 1.4], [p.pos.x, p.pos.y + 1.65, p.pos.z + 1], 4, 'sine.inOut', { fov: 34 })
  await g.caption('...a child is crying somewhere in the smoke.', 3)
  g.cine(false); g.dropNpc('dunkan')
  const malli = g.npc('malli', 'malli', P.malliSpot.x - 0.8, P.malliSpot.z + 0.4, 0)
  malli.char.sustain = 'lie'; malli.lookAtPlayer = false
  g.toast(state.mobile ? 'Use the left stick to move' : 'WASD to move · Click the screen to control the camera')
  await g.goTo(P.malliSpot, 2.6, 'Follow the crying')
  g.dropNpc('rudhra')
  g.cine(true); p.vel.set(0, 0, 0)
  // kneel on the far side of Malli so the low two-shot sees both faces
  p.setPos(malli.pos.x - 0.75, malli.pos.z - 0.4, 0)
  p.facing = Math.atan2(malli.pos.x - p.pos.x, malli.pos.z - p.pos.z); p.root.rotation.y = p.facing
  p.char.sustain = 'hold'
  storyFrame(g, 2, malli.pos)
  g.shotAt(malli.pos, [2.2, 1.1, 2.7], 0.6, 8)
  await g.say('malli', 'Are you... the soldier who lit the fire?')
  const c = await g.choose([{ text: '"...Yes."', karma: 1 }, { text: '"Don\'t speak. I\'ll carry you out."', karma: 0 }])
  if (c === 0) await g.say('malli', 'You\'re crying. Soldiers don\'t cry. Amma said so.')
  else await g.say('malli', 'My legs don\'t hurt anymore. That\'s bad... isn\'t it?')
  await g.say('malli', 'Amma says... on the mountain, there\'s a flower. The Kurinji. It blooms only once in twelve years.')
  await g.say('malli', 'She says if you wait for it... you become a little gentler, every winter.')
  malli.char.setWeapon('flower')
  await storyCutscene(g, 2)
  await g.say('malli', 'Here. Will you wait for it? For me? I don\'t think I can wait anymore.')
  await g.say('veeran', 'I will wait. I promise you, I will wait.')
  g.music('lullaby')
  g.audio.play('heartbeat', { rate: 0.8 })
  malli.char.setWeapon(null); p.char.setWeapon('flower')
  g.shotAt(p.pos, [0.5, 4, 3.5], 1, 5)
  await g.wait(2)
  await g.caption('Malli of Thennur. Seven years old.', 3.5)
  p.char.sustain = 'kneel'
  g.audio.play('swing', { rate: 0.4 })
  await g.caption('That night, the Ash-Hound of King Dunkan laid down his sword...', 4)
  await g.caption('...and walked up the mountain until the clouds were below him.', 4)
  await g.fade(1, 3, '#fff')
  g.world.setThennur('ruined'); g.audio.ambience('fire', false)
  g.dropNpc('malli'); p.char.sustain = null; p.canFight = true
  g.cine(false)
  await yearsBetween(g)
}

/* ============================================================================
   INTERLUDE — THE YEARS BETWEEN (how Veeran became Aruvan)
============================================================================ */
async function breaths(g, n) {
  state.breathingPrompt = true
  for (let i = 0; i < n; i++) {
    await new Promise(r => { ui.breathe = () => { ui.breathe = null; r() } })
    g.audio.play('heartbeat', { rate: 0.75, volume: 0.35 })
    await g.wait(2.2)
  }
  state.breathingPrompt = false
}
async function yearsBetween(g) {
  const p = g.player, T = P.temple, rock = g.world.rockTop
  p.setLook('veeran'); p.char.setWeapon(null); p.canFight = false; p.speedMul = 0.55
  g.time('storm', 0); g.music('sorrow')
  // the climb: soaked, alone, barefoot on the pilgrim path below the temple
  g.movePlayer(T.x + 1.2, T.z + 24, Math.PI)
  g.cine(true)
  g.shotAt(p.pos, [2.6, 0.9, -4.2], 1.3, 0, 'none', { fov: 36, hand: 0.9 })
  await g.fade(0, 2.5, '#fff')
  await g.chapterCard('Interlude', 'The Years Between', 'After Thennur')
  await g.caption('He climbed for nine days. He did not know what he was climbing toward.', 4)
  g.cine(false)
  await g.goTo({ x: T.x, z: T.z + 8.5 }, 2.2, 'Climb to the temple')
  // he falls on the top step; a blind old man brings water
  p.vel.set(0, 0, 0); p.char.sustain = 'defeated'
  const guru = g.npc('guru', 'guru', T.x - 1.6, T.z + 5.2, 0)
  guru.char.setHeadProp?.(null)
  g.cine(true)
  g.shotAt(p.pos, [-3.2, 1.0, 2.6], 0.9, 0, 'none', { fov: 38 })
  guru.walkTo(p.pos.x - 0.8, p.pos.z - 0.6, 0.8)
  await g.wait(3)
  guru.face(p.pos); guru.char.sustain = 'kneel'
  await g.say('guru', 'Drink. Slowly. The mountain is not going anywhere.')
  await g.say('veeran', 'Do you know who I am?')
  await g.say('guru', 'I am blind, child. I know only that you are thirsty.')
  await g.choose([{ text: '"I burned a village."', karma: 1 }, { text: '"I am no one."', karma: 0 }])
  await g.say('guru', 'Then rest here tonight. Tomorrow you can begin to be someone smaller.')
  await g.fade(1, 2)
  // the first winter: he cannot sit still for one breath
  guru.char.sustain = null; p.char.sustain = null
  g.time('dawn', 0); g.music('mountain')
  p.setPos(rock.x, rock.z, 1.28); p.pos.y = rock.y; p.char.sustain = 'meditate'
  guru.setPos(rock.x - 1.8, rock.z + 1.6, 1.0); guru.char.sustain = 'meditate'; guru.lookAtPlayer = false
  storyFrame(g, 3)
  await g.fade(0, 2.5)
  await g.caption('The first winter, he could not sit still for the length of one breath.', 4)
  g.shotAt(p.pos, [2.4, 1.2, -2.2], 1.2, 0, 'none', { fov: 34 })
  await g.say('guru', 'Breathe in. Hold nothing. Breathe out, and let the fire leave with it.', { face: false })
  await breaths(g, 3)
  await g.fade(1, 1.6)
  // the second year: the hundred steps
  p.char.sustain = null; guru.char.sustain = null
  g.time('day', 0)
  g.movePlayer(T.x + 1.4, T.z + 11, Math.PI)
  guru.setPos(T.x - 1.2, T.z + 7.4, 0)
  await g.fade(0, 1.6)
  await g.caption('The second year, he swept the same hundred steps every morning.', 3.5)
  await g.interact({ x: T.x + 0.6, z: T.z + 9.2 }, 'Sweep the temple steps', '[E] Sweep')
  p.char.setWeapon('broom'); p.char.activity = 'sweep'
  g.cine(true)
  g.shotAt(p.pos, [3.0, 1.3, 2.4], 1.0, 0, 'none', { fov: 36 })
  await g.wait(3.5)
  await g.say('guru', 'You sweep like a soldier, attacking the leaves. Sweep as if each one matters.')
  await g.say('veeran', 'They are only leaves.')
  await g.say('guru', 'So were the roofs of Thennur, to someone.')
  p.char.activity = null; p.char.setWeapon(null)
  await g.fade(1, 1.6)
  // the fifth year: a new name at the bell
  g.time('dusk', 0)
  g.movePlayer(P.bell.x + 1.6, P.bell.z + 1.2, 0)
  guru.setPos(P.bell.x - 0.6, P.bell.z + 1.6, 0); guru.face(p.pos); p.facing = Math.atan2(guru.pos.x - p.pos.x, guru.pos.z - p.pos.z); p.root.rotation.y = p.facing
  await g.fade(0, 1.6)
  await g.caption('In the fifth year, the old man gave him a new name.', 3.5)
  await g.say('guru', 'A man cannot carry two names up a mountain. From today, you are Aruvan.')
  await g.say('guru', 'In the old tongue, a river. It wears its stones smooth, and sets them down.')
  await g.say('veeran', 'Aruvan...')
  await g.fade(1, 0.8, '#fff')
  p.setLook('aruvan')
  g.audio.play('bell', { volume: 0.45 })
  await g.fade(0, 1.4, '#fff')
  g.shotAt(p.pos, [-1.6, 1.4, 2.6], 1.5, 6, 'sine.inOut', { fov: 34 })
  await g.caption('Twelve years. Every dawn, he waited for the flower.', 4)
  await g.fade(1, 3, '#fff')
  g.dropNpc('guru'); p.speedMul = 1; p.canFight = true; p.char.sustain = null
  g.cine(false)
}

/* ============================================================================
   CHAPTER I — THE QUIET MOUNTAIN
============================================================================ */
async function ch1(g) {
  const p = g.player
  prepareWorld(g, 1)
  g.time('dawn', 0); g.audio.preload(['main_theme', 'mountain'])
  p.setLook('aruvan')
  p.setPos(g.world.rockTop.x, g.world.rockTop.z, 1.28); p.pos.y = g.world.rockTop.y; p.char.sustain = 'meditate'
  const guru = g.npc('guru', 'guru', 12, -82, 0)
  g.cine(true)
  storyFrame(g, 3)
  await g.fade(1, 0, '#fff')
  await g.chapterCard('Chapter I', 'The Quiet Mountain', 'Twelve years later')
  g.music('main_theme')
  await g.fade(0, 3, '#fff')
  await storyCutscene(g, 3)
  await g.shot([P.rock.x - 5, P.rock.y + 3, P.rock.z - 6.5], [P.rock.x, P.rock.y + 1, P.rock.z], 7)
  g.audio.play('bell', { volume: 0.4 })
  await g.caption('Kurinji Mountain. The temple above the clouds.', 3)
  guru.walkTo(17.5, -88, 1.2)
  g.shotAt(p.pos, [-3, 1.2, 3], 0.8, 3)
  await g.wait(2.5)
  await g.say('guru', 'You breathe like a man holding a door shut, Aruvan.', { shot: true })
  await g.say('aruvan', 'Twelve winters, Guru. Every dawn I still smell the smoke.')
  await g.say('guru', 'Then let the smoke be your teacher. It rises. It does not cling to the fire that made it.')
  await g.say('guru', 'Come. The bell. The village will not start its day without it — and Ilan will blame me, again.')
  p.char.sustain = null; p.pos.y = heightAt(p.pos.x, p.pos.z)
  g.cine(false)
  await controlsHint(g)
  guru.walkTo(4, -62, 1.5)
  await g.interact(P.bell, 'Ring the temple bell', '[E] Ring the bell')
  p.facing = face(p.pos, P.bell); p.char.play('bell', 1.0)
  await g.wait(0.45)
  g.audio.play('bell'); gsap.fromTo(g.world.bell.rotation, { z: 0.35 }, { z: 0, duration: 3, ease: 'elastic.out(1, 0.2)' })
  g.world.spawnBurst(g.world.bell.getWorldPosition(p.pos.clone()), 20, 0xffe0a0, 2)
  await g.wait(1.6)
  g.time('day', 8)
  guru.setPos(4, -62, 0)
  await g.say('guru', 'Go down to Kurinji. Thamarai has been asking for you. Something about her herbs and your "lazy monk knees."')
  g.toast('Glowing petals hold Aruvan\'s memories. Find all twelve. (Tab: journal)')

  // the village
  g.music('mountain')
  const stopLife = villageLife(g)
  const stop = () => stopLife()
  const th = g.npc('thamarai', 'thamarai', -4, -5, 0)
  const il = g.npc('ilan', 'ilan', 4.5, -0.5, 0)
  const ka = (() => { const f = forgeSpot(); return g.npc('kaali', 'kaali', f.x, f.z, f.face).act('hammer') })()
  await g.goTo({ x: 0, z: -14 }, 6, 'Descend to Kurinji village')
  g.cine(true)
  await storyFrame(g, 4, undefined, 3.5)
  await storyCutscene(g, 4)
  g.cine(false)
  await g.talkTo('thamarai', 'Speak with Thamarai')
  await g.say('thamarai', 'There you are. Hold this basket. No — with both hands, you\'re not ringing a bell.', { shot: true })
  await g.say('aruvan', 'Good morning to you too, Thamarai.')
  await g.say('thamarai', 'Neem, tulsi, a little ashwagandha for old Murugan\'s cough. He\'ll say it\'s bitter. Everything good is bitter first.')
  await g.say('thamarai', 'Aruvan... the shepherds saw riders on the eastern ridge. Banners. Black and red.')
  await g.say('thamarai', 'You were somewhere, once, before the mountain. Do you ever miss who you were?')
  const c1 = await g.choose([{ text: '"Every day, I am grateful he is gone."', karma: 1 }, { text: '"Sometimes he still wakes up angry."', karma: -1 }, { text: '"Who I was doesn\'t make a good morning story."', karma: 0 }])
  if (c1 === 1) await g.say('thamarai', 'Then let him sleep. Some people should stay asleep.')
  else await g.say('thamarai', 'Hm. You always do that. Answer a question with a closed door.')
  g.cine(false)
  await g.talkTo('ilan', 'Find Ilan by the well')
  await g.say('ilan', 'Aruvan! Look — a kingfisher. I carved the beak three times.', { shot: true })
  await g.say('aruvan', 'It looks ready to fly away.')
  await g.say('ilan', 'Can monks fly? Guru says if you meditate long enough you get light as a feather.')
  await g.say('aruvan', 'Guru also says the moon is a lamp he forgot to blow out.')
  await g.say('ilan', 'Kaali wants you at the forge. She says it\'s "important" in her scary voice. Can I watch? Please?')
  await g.talkTo('kaali', 'Go to Kaali\'s forge')
  ka.char.activity = null; ka.char.onActivityHit = null
  await g.say('kaali', 'Monk. Those riders the shepherds saw — they\'re Dunkan\'s. Iron-eaters. They burned three villages in the south valley this spring.', { shot: true })
  await g.say('kaali', 'If they come here, I want the young ones to know how to hold a staff. You\'ll show them.')
  await g.say('aruvan', 'The staff is for balance, Kaali. Not for blood.')
  await g.say('kaali', 'Then teach them balance. Hard. Use my practice dummies — they\'ve survived worse than a monk.')
  g.cine(false)

  // training
  g.objective('Train at the practice ground')
  await g.goTo(P.training, 5)
  g.npc('ilan', 'ilan', P.training.x - 5, P.training.z - 3)
  g.toast(state.mobile ? 'Tap STRIKE three times for a combo, HEAVY for a crushing blow' : 'Left click / J: strike (chain 3) · Right click / K: heavy blow')
  setTimeout(() => g.toast(state.mobile ? 'EVADE dodges, JUMP leaps · fill the Breath ring, then tap BREATH' : 'F: evade · Space: jump · Fill the Breath ring, then press Q for the Kurinji Breath'), 7000)
  state.breath = 60
  await g.battle([[0, 1, 2, 3].map(i => ({ type: 'dummy', x: P.training.x - 3 + i * 2, z: P.training.z + 3 + (i % 2) }))], { music: 'main_theme', after: 'main_theme' })
  g.toast('Training complete')
  stop()
  await g.say('ilan', 'Whoa! You hit like a falling tree!')
  ka.setPos(P.training.x - 3, P.training.z - 2)
  await g.say('kaali', 'You move like someone who has done this before, monk.')
  await g.say('aruvan', 'Everyone has done something before.')
  g.audio.play('horn'); g.shake(0.15)
  await g.wait(1.5)
  await g.say('ilan', '...What was that?')
  await g.say('kaali', 'War horn. From the gate.')
  stop(); g.clearNPCs()
}

/* ============================================================================
   CHAPTER II — THE IRON ENVOY
============================================================================ */
async function ch2(g) {
  const p = g.player
  prepareWorld(g, 2)
  g.time('dusk', 0); g.music('iron_banners'); g.audio.preload(['battle'])
  p.setLook('aruvan'); g.movePlayer(2, 6, Math.PI)
  const th = g.npc('thamarai', 'thamarai', -2.5, 8, Math.PI)
  const il = g.npc('ilan', 'ilan', 4, 9, Math.PI)
  const ka = g.npc('kaali', 'kaali', -5, 7, Math.PI)
  const vill = crowd(g, 8, 0, 6, 8)
  const rd = g.npc('rudhra', 'rudhra', 0, 30, Math.PI)
  const escorts = [-2, 2, -4, 4].map((x, i) => { const s = g.npc('esc' + i, 'soldier', x, 33, Math.PI); return s })
  g.cine(true)
  await g.fade(1, 0)
  g.shot([0, P.village.y + 3, 50], [0, P.village.y + 2, 20])
  await g.chapterCard('Chapter II', 'The Iron Envoy', 'Dusk, the same day')
  await g.fade(0, 2)
  rd.walkTo(0, 14, 2.2); escorts.forEach((s, i) => s.walkTo([-2, 2, -4, 4][i], 17, 2.2))
  await storyFrame(g, 5, { x: 0, y: heightAt(0, 14), z: 14 }, 5)
  await storyCutscene(g, 5)
  await g.say('rudhra', 'People of Kurinji! By decree of Dunkan, King of the Nine Valleys, this mountain belongs to the crown.', { shot: false })
  await g.say('rudhra', 'There is iron beneath your flowers. In three days, the slopes will burn and the mines will open. Be grateful. You will have work.')
  g.shotAt(th.pos, [2, 1.8, -3], 1.5, 1)
  await g.say('thamarai', 'Those slopes bloomed before your king\'s grandfather learned to lie! You\'ll burn a thousand years for a cartload of nails?')
  rd.walkTo(-1.5, 10, 2.5)
  g.shotAt(rd.pos, [3, 1.8, -2], 1.6, 1)
  await g.say('rudhra', 'A healer with teeth. Hold her.')
  // Aruvan steps between them
  p.setPos(-1.6, 8.4, 0)
  g.shot([3.5, P.village.y + 1.8, 12], [-1.5, P.village.y + 1.6, 9], 1.5)
  await g.wait(1)
  await g.say('aruvan', 'She is not yours to hold.')
  await g.say('rudhra', 'Out of the way, holy man, or I\'ll — ...')
  g.shot([-4, P.village.y + 1.8, 11], [-1.5, P.village.y + 1.7, 10], 3)
  await g.say('rudhra', '...Veeran? The Ash-Hound — in a beggar\'s orange rags?')
  await g.say('ilan', 'His name is Aruvan!')
  await g.say('rudhra', 'Do they know, monk? Did you tell them about Thennur? About the houses we lit, side by side?')
  const c = await g.choose([
    { text: '"They know who I am now. That is enough."', karma: 1 },
    { text: '"Leave, Rudhra. Before I remember who I was."', karma: -1 },
    { text: '(Say nothing. Hold his gaze.)', karma: 0 },
  ])
  if (c === 0) await g.say('rudhra', 'Who you are now. Ha. Water poured into a bloodstained cup is still red, brother.')
  if (c === 1) await g.say('rudhra', 'There he is. There\'s the Hound. I knew he was under there.')
  if (c === 2) await g.say('rudhra', 'Still the same silence. You used to go quiet like that right before the screaming started.')
  await g.say('rudhra', 'The king would weep to see his finest blade dulled to a walking stick. Men — remind him what he is.')
  await g.say('aruvan', 'I will not kill you. But I will not move.')
  g.clearNPCs(['thamarai', 'ilan', 'kaali', 'rudhra'])
  th.setPos(-8, 2); il.setPos(-9, 3); ka.setPos(-6, 1)
  rd.walkTo(0, 24, 3)
  g.cine(false)
  g.toast('Aruvan refuses to kill. Defeated soldiers yield.')
  await g.battle([
    [{ type: 'soldier', x: -3, z: 14 }, { type: 'soldier', x: 3, z: 14 }, { type: 'soldier', x: 0, z: 17 }],
    [{ type: 'captain', x: 0, z: 18 }, { type: 'soldier', x: -5, z: 16 }, { type: 'soldier', x: 5, z: 16 }],
  ], { nonLethal: true, anchor: [-1, 6, 0], after: 'iron_banners', onWave: soldierBark(g) })
  g.cine(true)
  g.shotAt(rd.pos, [4, 2, -5], 1.6, 1.5)
  await g.say('rudhra', 'You still fight like him. You just stop at the end. That will get you killed, brother.')
  await g.say('rudhra', 'Dawn after next, the king comes himself. Kurinji will burn, Hound — and this time you\'ll watch.')
  rd.walkTo(0, 60, 4)
  await g.wait(2.5); g.dropNpc('rudhra'); g.clearEnemies()
  th.setPos(-2, 4.5, 0); ka.setPos(1.6, 5, 0); il.setPos(-3, 7)
  p.setPos(0, 7.5, Math.PI)
  g.shot([5, P.village.y + 2, 1], [0, P.village.y + 1.6, 6], 2)
  g.music('sorrow')
  await g.say('kaali', 'Thennur. The Ash-Hound. That was you.')
  await g.say('thamarai', 'Twelve years you taught us patience. Twelve years! And you never thought to tell us you burned a village?')
  const c2 = await g.choose([
    { text: '"I thought if I said it aloud, the mountain would stop forgiving me."', karma: 1 },
    { text: '"What would it have changed?"', karma: -1 },
  ])
  if (c2 === 0) await g.say('thamarai', 'The mountain isn\'t the one you need forgiveness from, Aruvan. ...Go to the Guru. I can\'t look at you right now.')
  else await g.say('thamarai', 'Everything! It would have changed — no. Go to your Guru. I can\'t look at you right now.')
  await g.say('ilan', 'I don\'t care what you were. You\'re still Aruvan.')
  g.cine(false); g.clearNPCs()
}

/* ============================================================================
   CHAPTER III — THE GURU'S LAST LESSON
============================================================================ */
async function ch3(g) {
  const p = g.player
  prepareWorld(g, 3)
  g.time('night', 0); g.music('mountain'); g.audio.preload(['battle'])
  g.movePlayer(0, -40, Math.PI)
  const guru = g.npc('guru', 'guru', 0, -60.5, 0); guru.char.sustain = 'meditate'; guru.lookAtPlayer = false
  await g.fade(1, 0)
  g.cine(true); g.shot([10, P.temple.y + 9, -45], [0, P.temple.y + 3, -66])
  await g.chapterCard('Chapter III', 'The Guru\'s Last Lesson', 'That night')
  await g.fade(0, 2)
  g.cine(false)
  await g.talkTo('guru', 'Climb to the temple. Find the Guru.')
  guru.char.sustain = 'meditate'
  g.cine(true)
  p.setPos(0, -58.4, Math.PI); p.char.sustain = 'meditate'
  g.shot([4.5, guru.pos.y + 1.6, -57.5], [0, guru.pos.y + 1, -59.5], 2)
  await g.say('guru', 'So. The past has come up the mountain on horseback.', { face: false })
  await g.say('aruvan', 'Tell me what to do, Guru. Fight, and become the Hound again — or stand still and watch them burn everything you taught me to love.')
  await g.say('guru', 'Today, when you lifted the staff. Was it anger that lifted it?', { face: false })
  const c = await g.choose([{ text: '"No. It was them. Ilan. Thamarai. All of them."', karma: 1 }, { text: '"Yes. And it felt like coming home."', karma: -1 }])
  if (c === 1) await g.say('guru', 'Honest. Good. Anger is a guest, Aruvan. Let it in, give it tea — but do not give it the keys.', { face: false })
  else await g.say('guru', 'Then you already know the answer, and you climbed all this way to hear an old man say it.', { face: false })
  await g.say('guru', 'A blade is only a question. Who holds it is the answer.', { face: false })
  await g.say('guru', 'Twelve years ago you held it for a king. Hold it now for a flower that blooms once in twelve years — and you will not be the Hound. You will be a gardener with a sharp tool.', { face: false })
  await g.say('guru', '...The crickets have stopped singing.', { face: false })
  // raid
  g.audio.play('horn', { rate: 1.3 }); g.world.setTemple('burning')
  g.audio.ambience('fire', true)
  g.shot([0, P.temple.y + 4, -50], [0, P.temple.y + 4, -70], 1.2)
  await g.say('aruvan', 'Fire arrows. Guru — inside!')
  p.char.sustain = null; p.pos.y = heightAt(p.pos.x, p.pos.z)
  guru.char.sustain = null; guru.setPos(0, -66.5, 0)
  g.cine(false)
  await g.battle([
    [{ type: 'soldier', x: -6, z: -52 }, { type: 'soldier', x: 6, z: -52 }, { type: 'soldier', x: 0, z: -48 }, { type: 'soldier', x: 3, z: -46 }],
    [{ type: 'brute', x: 0, z: -48 }, { type: 'soldier', x: -7, z: -50 }, { type: 'captain', x: 7, z: -50 }],
  ], { nonLethal: true, anchor: [0, -58, Math.PI], after: 'iron_banners', onWave: soldierBark(g) })
  // the betrayal — staged in the open hall between the front pillars (x ±1.9, z -68.4) and the
  // sanctum, so every camera looks through the central pillar gap instead of into a column
  g.cine(true)
  const Ty = P.temple.y
  guru.setPos(0, -69.8, 0); guru.char.sustain = null; guru.lookAtPlayer = false
  p.setPos(0, -60.8, Math.PI); p.char.sustain = null
  const rd = g.npc('rudhra', 'rudhra', -3.8, -71.4, 1.1); rd.lookAtPlayer = false
  guru.char.lookAtActor = p
  // 1. from the foot of the steps: the Guru waits in the lamplight; a shadow moves behind him
  g.shot([1.6, Ty + 1.2, -59.6], [0, Ty + 3.4, -69.8], 0, 'none', { fov: 40, hand: 0.6 })
  rd.walkTo(-0.95, -70.4, 1.1)
  await g.wait(2.6)
  rd.face(p.pos); rd.char.lookAtActor = p
  rd.char.play('drawSword', 1.0); g.audio.play('swing', { rate: 0.7 })
  // 2. Rudhra at the Guru's shoulder, low and close
  g.shot([2.2, Ty + 3.3, -67.1], [-0.55, Ty + 3.55, -70.1], 0, 'none', { fov: 34 })
  await g.wait(0.9)
  await g.say('rudhra', 'A message from the king, Hound.', { mood: 'angry', gesture: false })
  // 3. the strike — tight side two-shot inside the hall, slowed down
  g.shot([-2.5, Ty + 3.15, -68.8], [-0.45, Ty + 3.25, -70.0], 0, 'none', { fov: 32, hand: 1.1 })
  rd.char.play('lunge', 0.55); g.audio.play('hit', { rate: 0.6 })
  await g.wait(0.3)
  guru.char.lookAtActor = rd; guru.char.play('clutch', 0.9); g.shake(0.25)
  g.slowMo(0.25, 2); g.audio.play('heartbeat')
  await g.wait(0.75)
  guru.char.play('die', 1.6)
  // 4. Aruvan at the foot of the steps
  p.char.lookAtActor = guru; p.char.play('stagger', 0.8)
  g.shotAt(p.pos, [0.75, 1.45, -1.9], 1.6, 0, 'none', { fov: 32, hand: 1.2 })
  await g.say('aruvan', 'GURU!', { mood: 'angry', gesture: false })
  // 5. Rudhra above him, framed by the pillars, blade still wet
  rd.char.lookAtActor = p
  g.shot([-1.15, Ty + 2.3, -66.3], [-0.9, Ty + 3.6, -70.3], 0, 'none', { fov: 34, roll: 0.03 })
  rd.char.play('flourish', 1.1)
  await g.say('rudhra', '"Nothing you love stays." He wanted me to say it exactly like that.', { mood: 'angry', gesture: false })
  rd.char.lookAtActor = null
  rd.walkTo(-6.6, -71.0, 5)
  // 6. Aruvan runs up the steps to his teacher
  p.walkTo(0.85, -68.9, 4.6)
  g.shot([3.2, Ty + 1.9, -62.6], [0.4, Ty + 2.4, -68.4], 0, 'none', { fov: 42, hand: 0.9 })
  await g.wait(1.6); g.dropNpc('rudhra')
  g.music('sorrow')
  await g.wait(1.2)
  p.setPos(0.85, -69.0, face({ x: 0.85, z: -69.0 }, guru.pos)); p.char.setWeapon(null); p.char.sustain = 'hold'; p.char.lookAtActor = guru
  guru.char.action = null; guru.char.sustain = 'lie'; guru.char.lookAtActor = p
  // 7. the farewell: camera on the far side of the Guru from Aruvan, low, so both faces read —
  //    the dying teacher in the foreground, his student bent over him, the sanctum lamps behind
  await g.wait(0.3)
  const GH = g.headOf(guru), AH = g.headOf(p)
  const away = new THREE.Vector3(GH.x - AH.x, 0, GH.z - AH.z).normalize()
  const side = new THREE.Vector3(-away.z, 0, away.x)
  const mid = GH.clone().lerp(AH, 0.32)
  mid.y -= 0.05
  const eye = GH.clone().addScaledVector(away, 2.15).addScaledVector(side, 0.95).add(new THREE.Vector3(0, 0.78, 0))
  g.shot(eye.toArray(), mid.toArray(), 0, 'none', { fov: 38 })
  g.shot(eye.clone().addScaledVector(away, -0.45).toArray(), mid.toArray(), 12, 'sine.inOut', { fov: 34 })
  await storyCutscene(g, 6)
  p.char.mood = 'sad'
  const hold = { face: false, cover: false }
  await g.say('guru', 'Don\'t... chase him with that face, child.', hold)
  await g.say('guru', 'The Kurinji does not hurry, Aruvan. And it does not hate the winter. It only waits... and then it blooms anyway.', hold)
  await g.say('guru', 'I never asked your name, that first day on the steps. I didn\'t need to. I could hear it in how you drank the water.', hold)
  await g.say('guru', 'Protect what blooms.', hold)
  await g.wait(1.5)
  await g.caption('Guru Nilakantha, the blind abbot of Kurinji, who saw everything.', 4.5)
  const c2 = await g.choose([{ text: 'Chase Rudhra into the dark.', karma: -1 }, { text: 'Stay with him until dawn.', karma: 1 }])
  if (c2 === 0) await g.caption('He ran until his lungs burned, and found only hoofprints. Then he came back, and sat with his teacher until dawn.', 5)
  else await g.caption('He stayed until the temple lamps burned out, and the stars went pale.', 4.5)
  await g.fade(1, 2.5)
  g.world.setTemple('peaceful'); g.audio.ambience('fire', false)
  p.char.sustain = null; g.clearNPCs(); g.cine(false)
}

/* ============================================================================
   CHAPTER IV — THE GATE OF KURINJI
============================================================================ */
async function ch4(g) {
  const p = g.player
  prepareWorld(g, 4)
  g.time('storm', 0); g.music('iron_banners'); g.audio.preload(['battle'])
  p.setLook('aruvan', { ironStaff: true })
  g.movePlayer(0, 30, 0)
  const ka = g.npc('kaali', 'kaali', -2.2, 33, Math.PI)
  const th = g.npc('thamarai', 'thamarai', 2.4, 33.5, Math.PI)
  const il = g.npc('ilan', 'ilan', 1, 27, 0)
  const vill = crowd(g, 8, 0, 26, 6)
  vill.forEach(v => v.char.setWeapon(Math.random() < 0.5 ? 'staff' : 'sword'))
  g.cine(true)
  g.shot([0, P.gate.y + 12, 18], [0, P.gate.y + 3, 46])
  await g.chapterCard('Chapter IV', 'The Gate of Kurinji', 'Two days later')
  await g.fade(0, 2)
  g.shotAt(ka.pos, [2, 1.8, -3], 1.5, 2)
  await g.say('kaali', 'Here. I capped your staff in iron. Melted my father\'s old sword to do it.')
  await g.say('kaali', 'Seemed right. A sword becoming something that doesn\'t want to kill.')
  await g.say('thamarai', 'I was angry at you. I still am. But the Guru would have stood at this gate, so I\'m standing here too.')
  await g.say('thamarai', 'And these — the bitter ones. Chew them if you bleed. Don\'t make a face.')
  state.maxHp += 20; state.hp = state.maxHp; g.toast('Thamarai\'s herbs: +20 vitality')
  g.shot([0, P.gate.y + 3, 22], [0, P.gate.y + 2, 30], 2)
  await g.caption('The village looks to Aruvan.', 2.5)
  const c = await g.choose([
    { text: '"We do not fight to win. We fight so the flowers outlive the fire."', karma: 1 },
    { text: '"Today Dunkan learns what his Hound learned on the mountain."', karma: 0 },
    { text: '"Make them bleed for every step."', karma: -1 },
  ])
  vill.forEach(v => v.char.play('bell', 0.8))
  await g.say('villager', ['For the flowers!', 'For Kurinji!', 'For the Guru!'][c])
  await g.say('ilan', 'I can fight too! I\'ve been practising on the dummies!')
  await g.say('aruvan', 'Ilan. I need you somewhere more important. Run to the temple. If the gate falls — ring the bell, and keep ringing it until everyone is up the mountain.')
  await g.say('ilan', '...Promise you\'ll come up the mountain too.')
  await g.say('aruvan', 'I promise.')
  il.walkTo(0, -20, 4)
  g.audio.play('horn')
  // the ram: hold on the gate from inside, defenders in the foreground, every blow shudders the doors
  const Gy = P.gate.y
  vill.forEach(v => { v.face({ x: 0, z: 46 }); v.char.lookAtActor = null; v.char.combat = true })
  ka.face({ x: 0, z: 46 }); th.face({ x: 0, z: 46 }); p.facing = 0; p.root.rotation.y = 0
  g.shot([-3.6, Gy + 1.55, 36.6], [0, Gy + 2.7, 46], 0, 'none', { fov: 40, hand: 0.8 })
  g.shot([-3.0, Gy + 1.5, 38.0], [0, Gy + 2.7, 46], 4.2, 'none', { fov: 36, hand: 0.8 })
  await g.wait(0.7)
  const doors = g.world.gateDoors || []
  for (let i = 0; i < 3; i++) {
    g.audio.play('heavy', { rate: 0.6 - i * 0.05 }); g.shake(0.35 + i * 0.12)
    doors.forEach(d => gsap.fromTo(d.rotation, { y: d.userData.side * 0.06 * (i + 1) }, { y: 0, duration: 0.5, ease: 'elastic.out(1, 0.35)' }))
    g.world.spawnBurst(new THREE.Vector3((Math.random() - 0.5) * 2, Gy + 1.2 + Math.random(), 45.4), 16 + i * 8, 0x8a6a48, 3)
    vill.forEach((v, j) => { if ((i + j) % 3 === 0) v.char.play('stagger', 0.6) })
    await g.wait(1.0 - i * 0.12)
  }
  // the break: doors burst inward, slow motion, the camera punches in
  g.audio.play('heavy', { rate: 0.45 }); g.shake(1.0); g.slowMo(0.3, 1.4)
  g.world.setGate(true, 0.5, true)
  g.world.spawnBurst(new THREE.Vector3(0, Gy + 1.6, 45), 60, 0x9a7a52, 7)
  const breach = [-1.4, 0.2, 1.6, -0.6].map((x, i) => { const s = g.npc('breach' + i, i === 3 ? 'captain' : 'soldier', x, 51 + i * 0.9, Math.PI); s.lookAtPlayer = false; s.char.combat = true; s.walkTo(x * 1.6, 43.5 - i * 0.4, 4.2); return s })
  g.shot([-2.2, Gy + 1.35, 39.4], [0, Gy + 2.4, 46], 0.9, 'power2.out', { fov: 30, hand: 1.4 })
  await g.wait(1.6)
  // Kaali turns to the village and shouts, the broken gate behind her
  ka.setPos(-2.2, 33, Math.PI); ka.char.lookAtActor = p
  { const K = g.headOf(ka); g.shot([K.x + 0.75, K.y + 0.02, K.z - 2.2], [K.x - 1.1, K.y - 0.12, K.z + 5], 0, 'none', { fov: 38, hand: 1.0 }) }
  await g.say('kaali', 'The ram! The gate\'s broken!', { cover: false, mood: 'angry', gesture: 'gesture' })
  await storyCutscene(g, 7)
  for (let i = 0; i < 4; i++) g.dropNpc('breach' + i)
  g.dropNpc('ilan')
  vill.forEach((v, i) => v.walkTo(-14 + (i % 4) * 9, 22 + (i > 3 ? -4 : 0), 3))
  g.cine(false)
  await g.battle([
    [{ type: 'soldier', x: -2, z: 52 }, { type: 'soldier', x: 2, z: 52 }, { type: 'soldier', x: 0, z: 56 }, { type: 'soldier', x: -4, z: 57 }],
    [{ type: 'brute', x: 0, z: 55 }, { type: 'soldier', x: -3, z: 52 }, { type: 'soldier', x: 3, z: 52 }, { type: 'captain', x: 0, z: 59 }],
    [{ type: 'brute', x: -2, z: 54 }, { type: 'brute', x: 2, z: 56 }, { type: 'captain', x: -4, z: 58 }, { type: 'captain', x: 4, z: 58 }],
  ], { anchor: [0, 38, 0], onWave: soldierBark(g) })
  // the boy soldier
  g.cine(true)
  const s = g.npc('senthil', 'senthil', 0.5, 44, Math.PI); s.char.sustain = 'kneel'; s.lookAtPlayer = false
  p.setPos(0.5, 41.5, 0)
  g.shotAt(s.pos, [2.5, 1.5, -2], 1, 1.5)
  await g.say('senthil', 'Please! Please — I\'m from the river villages. They took me for grain, I never wanted —', { face: false })
  await g.say('aruvan', '(Grain for sons. Like me.)')
  const c2 = await g.choose([{ text: 'Lower the staff. "Go home. Tell them Kurinji let you go."', karma: 2 }, { text: '"Your king made you a weapon. Weapons get broken."', karma: -2 }])
  if (c2 === 0) {
    state.spared = (state.spared || 0) + 1; state.senthil = true
    await g.say('senthil', '...My name is Senthil. I won\'t forget this. I swear on my mother\'s name.')
    s.char.sustain = null; s.walkTo(0, 80, 4)
  } else {
    p.char.play('heavy', 0.85); await g.wait(0.45); g.audio.play('heavy'); s.char.sustain = null; s.char.play('die', 1); await g.wait(1.2)
    await g.say('kaali', '...He was just a boy, Aruvan.')
  }
  await g.say('thamarai', 'They\'ll come back with more. They always come back with more.')
  await g.say('aruvan', 'No. This ends where it began. In Thennur — and then on his throne.')
  await g.say('thamarai', 'Then come back. You promised Ilan. And I\'ll be very annoyed if you make me dig a grave in this rain.')
  g.clearNPCs(); g.cine(false)
}

/* ============================================================================
   CHAPTER V — ASHES OF THENNUR
============================================================================ */
async function ch5(g) {
  const p = g.player
  prepareWorld(g, 5)
  g.time('dusk', 0); g.music('mountain'); g.audio.preload(['lullaby', 'rudhra'])
  p.setLook('aruvan', { ironStaff: true })
  g.movePlayer(0, 52, 0)
  await g.fade(1, 0)
  g.cine(true); g.shot([-30, P.thennur.y + 18, 70], [-8, P.thennur.y, 98])
  await g.chapterCard('Chapter V', 'Ashes of Thennur', 'Where it began')
  await g.fade(0, 2); g.cine(false)
  g.world.malliBush.visible = true
  await g.goTo(P.thennur, 9, 'Walk down to the ruins of Thennur')
  g.toast('Twenty-four years of rain, and the ash is still here.')
  await g.interact({ x: P.malliSpot.x - 0.8, z: P.malliSpot.z + 0.8 }, 'Something glows where the beam fell', '[E] Kneel')
  g.cine(true)
  p.char.sustain = 'kneel'; g.music('lullaby', 4000)
  storyFrame(g, 8, g.world.malliBush.position)
  g.shotAt(g.world.malliBush.position, [2.3, 1, -3.3], 0.6, 8)
  await storyCutscene(g, 8)
  await g.caption('One Kurinji bush. Blooming, out of season, where she lay.', 3.5)
  await g.say('aruvan', 'You waited here too, didn\'t you, little one.')
  await g.say('malli', 'Are you still waiting?', { as: 'Echo of Malli' })
  await g.say('aruvan', 'Almost, Malli. I am almost the man who could deserve that flower.')
  const rd = g.npc('rudhra', 'rudhra', -4, 112, Math.PI)
  g.music('iron_banners')
  p.char.sustain = null
  g.shotAt(rd.pos, [3, 1.7, -4], 1.6, 1.5)
  await g.say('rudhra', 'Sentimental. I burned the east side that night, you know. You took the west. We split it like bread.')
  await g.say('aruvan', 'We were boys who did what we were told.')
  await g.say('rudhra', 'I still am. That\'s the only difference between us, brother. I never stopped.')
  await g.say('rudhra', 'He wants your head on the fortress gate before the bloom. Let\'s give him a good story.')
  g.dropNpc('rudhra'); g.cine(false)
  await g.battle([[{ type: 'rudhra', x: -4, z: 110, opts: { title: 'Rudhra, the Last Hound' } }]], {
    anchor: [-10, 100, 0], music: 'rudhra', after: 'sorrow',
    onPhase: () => { g.bark('rudhra', 'There! Show me the Hound!'); g.audio.play('horn', { rate: 1.4 }) },
  })
  // judgement
  const R = g.defeatedBoss
  g.cine(true)
  g.shotAt(R.pos, [2.5, 1.5, 2.5], 1, 1.5)
  await g.say('rudhra', 'Go on. Finish it. That\'s how this ends. That\'s how it always ends, for dogs like us.')
  const c = await g.choose([{ text: 'Spare him. "Go and plant something, Rudhra."', karma: 2 }, { text: 'End it. "For the Guru."', karma: -2 }])
  if (c === 0) {
    state.rudhraSpared = true
    await g.say('rudhra', '...Why?')
    await g.say('aruvan', 'Because once, someone waited for me.')
    R.char.setWeapon(null); R.char.sustain = null; R.state = 'leaving'
    R.root.visible = true
    await g.say('rudhra', 'He\'s on the throne, in the fortress. He will not kneel like I did, Veeran.')
  } else {
    p.char.play('heavy', 0.85); await g.wait(0.45); g.audio.play('heavy'); g.shake(0.5)
    R.char.sustain = null; R.char.play('die', 1); await g.wait(1.3)
    await g.say('aruvan', 'Forgive me, Guru. I could not wait.')
  }
  g.clearEnemies(); g.dropNpc('rudhra'); g.world.malliBush.visible = false; g.cine(false)
}

/* ============================================================================
   CHAPTER VI — THE IRON THRONE
============================================================================ */
async function ch6(g) {
  const p = g.player
  prepareWorld(g, 6)
  g.time('storm', 0); g.music('iron_banners'); g.audio.preload(['battle', 'dunkan'])
  p.setLook('aruvan', { ironStaff: true })
  g.movePlayer(0, 122, 0)
  await g.fade(1, 0)
  g.cine(true); g.shot([30, P.fortress.y + 25, 120], [0, P.fortress.y + 4, 160])
  await g.chapterCard('Chapter VI', 'The Iron Throne', 'The fortress of Dunkan')
  await g.fade(0, 2); g.cine(false)
  await g.goTo({ x: 0, z: 146 }, 4, 'Storm the fortress')
  await g.battle([
    [{ type: 'soldier', x: -4, z: 156 }, { type: 'soldier', x: 4, z: 156 }, { type: 'captain', x: 0, z: 160 }, { type: 'soldier', x: -8, z: 158 }, { type: 'soldier', x: 8, z: 158 }],
    [{ type: 'brute', x: -5, z: 162 }, { type: 'brute', x: 5, z: 162 }, { type: 'captain', x: 0, z: 164 }],
  ], { anchor: [0, 148, 0], after: 'iron_banners', onWave: soldierBark(g) })
  const dk = g.npc('dunkan', 'dunkan', 0, 170, Math.PI)
  dk.setPos(g.world.throneSeat.x, g.world.throneSeat.z, Math.PI); dk.char.sustain = 'throne'; dk.pos.y = g.world.throneSeat.y; dk.lookAtPlayer = false
  p.setPos(0, 160, 0)
  g.cine(true)
  storyFrame(g, 9)
  g.shot([-4.2, P.throne.y + 2, 163.5], [0, P.throne.y + 2.6, 170], 6)
  await storyCutscene(g, 9)
  await g.say('dunkan', 'My Hound comes home. Look at you. Thinner. Quieter. Did the mountain pull your teeth?', { face: false })
  g.shotAt(p.pos, [1.5, 1.8, 2.5], 1.7, 1)
  await g.say('aruvan', 'It took my anger. I came to see if it left anything for you.')
  await g.say('dunkan', 'You were my finest weapon, Veeran.', { face: false })
  await g.say('aruvan', 'I was your saddest.')
  const c = await g.choose([
    { text: '"Leave the mountain, Dunkan. There is still time to be someone else."', karma: 1 },
    { text: '"You made me a weapon. Now you will feel the edge."', karma: -1 },
  ])
  if (c === 0) await g.say('dunkan', 'Someone else? I was someone else, once. My father left that boy in the snow. Warmth is something you take.', { face: false })
  else await g.say('dunkan', 'Good. Finally, an honest word from that mouth.', { face: false })
  dk.char.sustain = null; dk.pos.y = heightAt(dk.pos.x, dk.pos.z)
  await g.say('dunkan', 'Sad weapons still cut. Come, then. Let us see which of us the mountain loves.')
  g.dropNpc('dunkan'); g.cine(false)
  await g.battle([[{ type: 'dunkan', x: 0, z: 167, opts: { title: 'Dunkan, the Iron King' } }]], {
    anchor: [0, 160, 0], music: 'dunkan', after: 'sorrow',
    onPhase: async (e) => { g.bark('dunkan', 'I am the iron in the mountain! I am the winter your flowers fear!'); g.audio.play('horn', { rate: 0.8 }); g.shake(0.6); g.time('night', 3); g.music('dunkan_rage', 1200) },
  })
  // the final blow
  const D = g.defeatedBoss
  g.time('storm', 2)
  g.cine(true); g.music('sorrow')
  p.setLook('aruvanKing', { ironStaff: true })
  // Match story_10: one fallen crown, an empty throne, a kneeling king.
  D.vel.set(0, 0, 0); D.char.action = null; D.char.sustain = 'kneel'
  D.pos.set(-2.1, heightAt(-2.1, 166.8), 166.8)
  p.setPos(1.6, 166.5, face({ x: 1.6, z: 166.5 }, D.pos))
  D.facing = D.root.rotation.y = face(D.pos, p.pos)
  g.world.fallenCrown?.userData.dispose?.()
  g.world.fallenCrown = D.char.dropCrown(g.scene, { x: P.throne.x + 1.1, y: P.throne.y + 0.8, z: P.throne.z - 2.2 })
  storyFrame(g, 10, undefined, 1.5)
  await g.say('dunkan', 'Then finish it. You know how. I taught you.', { face: false })
  await g.say('aruvan', 'You taught me how. A child in Thennur taught me why not. And a blind man taught me when.')
  await g.say('aruvan', 'I don\'t do this for your throne. I do it so no child ever again has to wait for a soldier to become a person.')
  p.char.sustain = 'refuse'
  await g.wait(1.5)
  await storyCutscene(g, 10)
  // Refusal precedes the final strike: Dunkan makes one last desperate attack.
  D.char.sustain = null; D.char.play('lunge', 0.5)
  g.audio.play('swing', { rate: 0.65 })
  const dx = D.pos.x - p.pos.x, dz = D.pos.z - p.pos.z
  gsap.to(D.pos, { x: p.pos.x + dx * 0.48, z: p.pos.z + dz * 0.48, duration: 0.6, ease: 'power2.in' })
  g.shotAt(p.pos, [-3.5, 1.6, -3.5], 1.25, 0.8)
  g.slowMo(0.5, 1.5)
  await g.wait(0.35)
  p.char.sustain = null; p.char.play('heavy', 0.85)
  await g.wait(0.85)
  g.audio.play('special'); g.audio.play('heavy'); g.shake(0.9)
  await g.fade(1, 0.15, '#fff')
  D.alive = false; D.state = 'dead'; D.vel.set(0, 0, 0)
  D.char.sustain = null; D.char.play('die', 0.8)
  await g.wait(0.8)
  await g.fade(0, 2.5, '#fff')
  g.shotAt(D.pos, [0, 7, 0.01], 0, 6)
  await g.caption('Dunkan, the Iron King, who was once a boy left in the snow.', 4.5)
  // take the throne
  g.clearEnemies()
  g.cine(false); g.music('reign')
  for (let i = 0; i < 6; i++) { const s = g.npc('kneel' + i, 'soldier', -6 + (i % 3) * 6, 160 + (i > 2 ? 4 : 0), 0); s.char.sustain = 'kneel'; s.lookAtPlayer = false }
  g.toast('The soldiers lay down their swords.')
  await g.interact({ x: P.throne.x, z: P.throne.z - 4 }, 'Approach the throne', '[E] Sit upon the throne')
  g.cine(true)
  p.setPos(g.world.throneSeat.x, g.world.throneSeat.z, Math.PI); p.char.sustain = 'throne'; p.pos.y = g.world.throneSeat.y
  p.char.setWeapon(null)
  g.shot([0, P.throne.y + 3.2, 159], [0, P.throne.y + 2.6, 170], 0); g.shot([0, P.throne.y + 3, 164], [0, P.throne.y + 2.6, 170], 6)
  await g.say('aruvan', 'This throne was carved out of fear. From today, it is only a chair.')
  await g.say('aruvan', 'Anyone may sit in it to be heard. Anyone. The crown stays on the floor, where it can\'t look down on anyone.')
  await g.say('aruvan', 'Go home. Plant something. And if you have nothing to plant — come to Kurinji. We have more flowers than hands.')
  await g.fade(1, 3)
  g.clearNPCs(); p.char.sustain = null; g.cine(false)
}

/* ============================================================================
   CHAPTER VII — THE PEACEFUL REIGN  (montage)
============================================================================ */
async function ch7(g) {
  const p = g.player
  prepareWorld(g, 7)
  g.time('day', 0); g.music('reign')
  p.setLook('aruvanKing'); g.movePlayer(0, -50, Math.PI)
  g.cine(true)
  g.shot([40, P.fortress.y + 20, 150], [16, P.fortress.y, 170])
  await g.chapterCard('Chapter IX', 'The Peaceful Reign', 'The years that followed')
  await g.fade(0, 2)
  await g.shot([30, P.fortress.y + 12, 160], [16, P.fortress.y, 170], 6)
  await g.caption('Year One. The mines were sealed. The iron stayed in the mountain, where it belonged.', 4.5)
  // Thennur rebuilt
  g.time('dawn', 0)
  const builders = crowd(g, 6, P.thennur.x, P.thennur.z, 8, 'b')
  if (state.senthil) g.npc('senthil', 'senthilBuilder', P.thennur.x + 2, P.thennur.z, 0)
  g.shot([P.thennur.x + 20, P.thennur.y + 10, P.thennur.z - 18], [P.thennur.x, P.thennur.y, P.thennur.z])
  g.shot([P.thennur.x + 12, P.thennur.y + 5, P.thennur.z - 12], [P.thennur.x, P.thennur.y + 1, P.thennur.z], 6)
  await g.caption(state.senthil ? 'Year Three. Thennur was rebuilt — by soldiers who once burned it. A boy named Senthil laid the first stone.' : 'Year Three. Thennur was rebuilt — by soldiers who once burned it.', 5)
  g.clearNPCs()
  // forge
  g.time('day', 0)
  const ka = (() => { const f = forgeSpot(); return g.npc('kaali', 'kaali', f.x, f.z, f.face).act('hammer') })()
  g.shotAt(ka.pos, [4, 2, 4], 1.2); g.shotAt(ka.pos, [2.5, 1.6, 3], 1.2, 5)
  const hammer = setInterval(() => { ka.char.play('slam', 0.6); setTimeout(() => g.audio.play('hit', { rate: 1.6, volume: 0.3 }), 350) }, 900)
  await g.caption('Year Five. Kaali hammered Dunkan\'s swords into ploughs. She complained the entire time.', 4.5)
  clearInterval(hammer)
  // healer
  const th = g.npc('thamarai', 'thamarai', 0, 162, Math.PI)
  crowd(g, 5, 0, 160, 4, 'h')
  g.shot([10, P.fortress.y + 6, 150], [0, P.fortress.y + 1, 162]); g.shot([6, P.fortress.y + 4, 154], [0, P.fortress.y + 1, 162], 5)
  await g.caption('Year Eight. Thamarai opened a house of healing inside the old fortress. Its doors had no locks.', 4.5)
  g.clearNPCs()
  // Ilan teaching
  // The teaching tableau is in rebuilt Thennur, as in story_11: five children,
  // adult Ilan in yellow, and former soldiers helping rebuild behind them.
  g.time('day', 0)
  const il = g.npc('ilan', 'ilanAdult', P.thennur.x, P.thennur.z - 1.4, 0)
  il.char.sustain = 'sit'; il.lookAtPlayer = false; il.char.setWeapon('bird')
  const kids = []; for (let i = 0; i < 5; i++) { const k = g.npc('kid' + i, 'ilan', P.thennur.x - 3 + i * 1.5, P.thennur.z + 1.6, Math.PI, { cloth: [0xc94a4a, 0x4a8ac9, 0x8ac94a, 0xc9a24a, 0x9a4ac9][i] }); k.char.sustain = 'sit'; k.char.setWeapon('bird'); k.lookAtPlayer = false; kids.push(k) }
  crowd(g, 4, P.thennur.x + 4, P.thennur.z - 5, 3, 'builders')
  if (state.senthil) { const senthil = g.npc('senthil', 'senthilBuilder', P.thennur.x + 3, P.thennur.z - 4, Math.PI); senthil.char.sustain = 'kneel'; senthil.lookAtPlayer = false }
  storyFrame(g, 11)
  storyFrame(g, 11, { x: P.thennur.x + 0.5, y: P.thennur.y, z: P.thennur.z - 0.4 }, 5)
  await storyCutscene(g, 11)
  await g.caption('Year Ten. Ilan, grown tall, taught the children to read — and to carve birds, and to set them free.', 5)
  g.clearNPCs()
  if (state.rudhraSpared) {
    g.time('storm', 0)
    const r = g.npc('rudhra', 'rudhraPenitent', 0, -64, Math.PI)
    r.char.sustain = 'bow'; r.lookAtPlayer = false
    g.shot([5, P.temple.y + 3, -56], [0, P.temple.y + 1, -64]); g.shot([3.5, P.temple.y + 2.5, -58], [0, P.temple.y + 1.2, -64], 5)
    await g.caption('Rudhra came to the temple steps in the rain. He swept them for nine years, and never asked to be forgiven.', 5)
    await g.caption('On the tenth, Aruvan forgave him anyway.', 3.5)
    g.clearNPCs()
  }
  g.time('dawn', 0)
  p.setPos(P.bell.x - 1.2, P.bell.z + 1, face({ x: P.bell.x - 1.2, z: P.bell.z + 1 }, P.bell))
  g.shot([P.bell.x - 6, P.bell.y + 3, P.bell.z + 8], [P.bell.x, P.bell.y + 2, P.bell.z]); g.shot([P.bell.x - 4, P.bell.y + 2.6, P.bell.z + 5], [P.bell.x, P.bell.y + 2, P.bell.z], 6)
  setTimeout(() => { p.char.play('bell', 1); setTimeout(() => { g.audio.play('bell'); gsap.fromTo(g.world.bell.rotation, { z: 0.35 }, { z: 0, duration: 3, ease: 'elastic.out(1,0.2)' }) }, 450) }, 1500)
  await g.caption('And King Aruvan, who never once wore the crown, climbed the mountain every dawn — to ring the bell.', 5.5)
  await g.fade(1, 3, '#fff')
  g.cine(false)
}

/* ============================================================================
   EPILOGUE — WHEN THE KURINJI BLOOMS
============================================================================ */
async function epilogue(g) {
  const p = g.player
  prepareWorld(g, 8)
  g.time('bloom', 0); g.music('bloom'); g.audio.preload(['lullaby', 'last_breath']); g.world.setBloom(0.04)
  p.setLook('aruvanOld'); p.canFight = false; p.speedMul = 0.42
  g.movePlayer(0, -58, Math.PI)
  const th = g.npc('thamarai', 'thamaraiOld', -2, -56, Math.PI)
  const il = g.npc('ilan', 'ilanAdult', 2, -56, Math.PI)
  g.cine(true)
  g.shot([40, 60, -40], [0, 40, -80])
  await g.chapterCard('Epilogue', 'When the Kurinji Blooms', 'Twelve years later')
  await g.fade(0, 3, '#fff')
  g.shot([4, P.temple.y + 2.4, -50], [0, P.temple.y + 1.5, -57], 5)
  await g.say('thamarai', 'You shouldn\'t climb alone anymore. Your knees sound like Kaali\'s bellows.')
  await g.say('aruvan', 'I have climbed alone every morning for twelve years. Today I would like company. But only at the end.')
  await g.say('ilanAdult', 'The end of what?')
  await g.say('aruvan', 'Of the climb, Ilan. Only the climb.')
  g.cine(false)
  g.toast('Walk slowly. There is no hurry anymore.')
  await g.interact(P.bell, 'Ring the bell one last time', '[E] Ring the bell')
  p.char.play('bell', 1.2); await g.wait(0.5)
  g.audio.play('bell'); gsap.fromTo(g.world.bell.rotation, { z: 0.3 }, { z: 0, duration: 3, ease: 'elastic.out(1, 0.2)' })
  await g.wait(1.5)
  // bloom grows as he nears the rock
  g.world.setPetals(0.9)
  let bloom = 0.04
  g.task = () => { const d = p.pos.distanceTo(P.rock); const want = Math.max(0.04, 0.32 * (1 - d / 40)); bloom += (Math.max(bloom, want) - bloom) * 0.02; g.world.setBloom(bloom) }
  const R = P.rock
  await new Promise(res => { const prevTask = g.task; g.markTarget = R.clone().setY(R.y + 2.5); g.objective('Walk to the meditation rock'); g.interactable = { pos: R, r: 3.2, label: '[E] Sit and breathe', done: () => { g.markTarget = null; res() } }; g.task = prevTask })
  g.task = null; g.objective('')
  g.cine(true)
  p.setPos(g.world.rockTop.x, g.world.rockTop.z, 0.15); p.pos.y = g.world.rockTop.y; p.char.sustain = 'meditate'
  p.char.setWeapon(null)
  th.setPos(R.x - 1.7, R.z + 0.9, 0.35); il.setPos(R.x - 2.75, R.z - 0.05, 0.3)
  if (state.rudhraSpared) g.npc('rudhra', 'rudhraOld', R.x - 5.5, R.z + 3, 0)
  th.face(p.pos); il.face(p.pos); th.lookAtPlayer = il.lookAtPlayer = false
  g.shot([R.x + 7, R.y + 2.6, R.z + 6.5], [R.x - 1, R.y + 1.5, R.z], 0, 'none', { fov: 40 })
  g.shot([R.x + 4.2, R.y + 2.1, R.z + 4], [R.x - 1, R.y + 1.5, R.z], 12, 'sine.inOut', { fov: 36 })
  const b = { v: bloom }
  gsap.to(b, { v: 0.55, duration: 40, ease: 'none', onUpdate: () => g.world.setBloom(b.v) })
  await g.say('ilanAdult', 'The whole mountain is turning blue, Aruvan. Like the sky came down to listen.')
  await g.say('aruvan', 'Twenty-four years ago, a little girl asked me to wait for this. I thought she meant the flower.', { face: false })
  await g.say('thamarai', 'What did she mean?')
  await g.say('aruvan', 'Herself. She wanted someone gentle enough to be worth the waiting. I think... I am almost him.', { face: false })
  g.shotAt(il.pos, [1.5, 1.6, -2.2], 1.6, 2)
  await g.say('ilanAdult', 'Don\'t talk like that. Please.')
  g.shot([R.x + 2.2, R.y + 1.8, R.z + 2.7], [R.x, R.y + 1.5, R.z], 3, 'sine.inOut', { fov: 32 })
  await g.say('aruvan', 'Ilan. Ring the bell tomorrow. And the day after. A kingdom is only a habit of kindness, repeated until no one remembers it was ever a choice.', { face: false })
  await g.say('thamarai', 'And the throne? Who will sit on it?')
  await g.say('aruvan', 'No one. Put it in the square and let the children climb it. It is the only thing a throne is good for.', { face: false })
  if (state.rudhraSpared) { await g.say('rudhra', 'I swept your steps, brother. Every one.'); await g.say('aruvan', 'I know. They have never been so clean.', { face: false }) }
  if (state.karma >= 4) await g.say('aruvan', 'Thamarai. Thank you for staying angry at me. It meant you hadn\'t given up.', { face: false })
  else await g.say('aruvan', 'I was not always gentle. Forgive the old Hound for the days he got loose.', { face: false })
  await g.say('thamarai', '...Breathe, you stubborn old man. Just breathe. We\'re here.')
  await g.say('aruvan', 'Yes. Let me breathe now. I have been holding this door shut a very long time.', { face: false })
  // the last breaths — the player breathes for him
  g.music('lullaby', 4000)
  g.shot([R.x + 1.1, R.y + 1.65, R.z + 2.3], [R.x, R.y + 1.55, R.z], 30, 'none', { fov: 30, hand: 0.4 })
  state.breathingPrompt = true
  for (let i = 0; i < 5; i++) {
    await new Promise(r => { ui.breathe = () => { ui.breathe = null; r() } })
    g.audio.play('heartbeat', { rate: 0.8 - i * 0.08, volume: 0.6 - i * 0.1 })
    gsap.to(b, { v: Math.min(1, b.v + 0.12), duration: 4, onUpdate: () => g.world.setBloom(b.v) })
    g.whisper('aruvan', ['', 'The smoke rises. It does not cling.', 'Guru... I set the stones down.', 'Malli...', ''][i])
    await g.wait(2.8 + i * 0.9)
    state.caption = ''
  }
  state.breathingPrompt = false
  g.audio.setMusic(null, 4000)
  await g.wait(2.5)
  gsap.to(p.char.neck.rotation, { x: 0.5, duration: 6 }); gsap.to(p.char.spine.rotation, { x: 0.18, duration: 6 })
  await g.wait(1.5)
  g.whisper('aruvan', '...it bloomed.')
  gsap.to(b, { v: 1, duration: 10, onUpdate: () => g.world.setBloom(b.v) })
  await storyFrame(g, 12, undefined, 4)
  await storyCutscene(g, 12)
  g.shot([R.x + 30, R.y + 25, R.z - 10], [R.x, R.y, R.z + 10], 16, 'power1.inOut')
  await g.wait(4); state.caption = ''
  g.music('last_breath', 3000)
  await g.wait(6)
  await g.fade(1, 6, '#fff')
  await g.caption('Aruvan of Kurinji.', 3)
  await g.caption('Once a soldier. Then a monk. Then a king.', 4)
  await g.caption('At last — a gardener.', 4)
  g.clearNPCs(); g.cine(false)
  markComplete()
  state.screen = 'credits'; g.music('credits')
  await g.fade(0, 2)
}

/* ============================================================================
   FREE ROAM — the peaceful years (unlocked after the ending)
============================================================================ */
function thamaraiChat(g) { g.bark('thamarai', ['The children ask for the story of the throne again. Tell it better this time.', 'Sit for a while, Aruvan. Even kings are allowed to rest.']) }
function ilanChat(g) { g.bark('ilanAdult', ['I carved a whole flock this winter. The square is full of wooden birds.', 'Guru would have liked this. Everybody sweeping their own steps.']) }
function kaaliChat(g) { g.bark('kaali', ['No more swords. Only ploughs and bells. My father would laugh.', 'Bring me your staff. The iron cap needs a new edge, for walking.']) }
export async function freeRoam(g) {
  const p = g.player
  prepareWorld(g, 7)
  g.time('day', 0); g.music('mountain')
  p.setLook('aruvan'); p.canFight = true
  g.movePlayer(0, -16, 0)
  villageLife(g)
  g.enableHorse(3.4, -12.5, 0.4)
  g.addTalker(g.npc('thamarai', 'thamarai', -4, -5, 0).act('chat'), 'Thamarai', thamaraiChat)
  g.addTalker(g.npc('ilan', 'ilanAdult', 4.5, -0.5, 0).act('draw'), 'Ilan', ilanChat)
  { const f = forgeSpot(); g.addTalker(g.npc('kaali', 'kaali', f.x, f.z, f.face).act('hammer'), 'Kaali', kaaliChat) }
  // rebuilt Thennur is alive again: builders, a market, children, elders by the new well
  const T = P.thennur, TL = ['Thennur rises from its ash, swami. Brick by brick.', 'Senthil laid the first stone himself.', 'My mother sold spices here before the fire. Now I do.', 'Ilan teaches our children their letters under the neem tree.']
  const townsfolk = [['tn_b1', 'senthilBuilder', 4, -3, 'hammer', null], ['tn_b2', 'villager', 5.5, -1.5, 'carry', 'basket'], ['tn_m1', 'villager', -5, 3, 'chat', null], ['tn_m2', 'villager', -3.8, 4.4, 'listen', null], ['tn_e1', 'murugan', 2, 5, 'sitchat', null], ['tn_w1', 'villager', -1, -5, 'draw', null], ['tn_s1', 'villager', 7, 4, 'sweep', 'broom'], ['tn_k1', 'ilan', -6, -4, null, null], ['tn_k2', 'malli', -7, -2.6, null, null], ['tn_p1', 'villager', 0.5, 7.5, 'pray', null]]
  for (const [id, preset, dx, dz, act, prop] of townsfolk) {
    const n = g.npc(id, preset, T.x + dx, T.z + dz, Math.atan2(-dx, -dz), preset === 'villager' ? { long: dx < 0 } : preset === 'ilan' || preset === 'malli' ? { cloth: dx < -6.5 ? 0x9a4ac9 : 0xc94a4a } : undefined)
    if (act) n.act(act, prop)
    g.addTalker(n, preset === 'ilan' || preset === 'malli' ? 'a child of Thennur' : 'a builder of Thennur', () => g.toast('“' + TL[(Math.random() * TL.length) | 0] + '”'))
  }
  // the people of the wider land (regions.js)
  for (const d of g.world.regionNpcs || []) {
    const { label, sustain, ...extra } = d.extra || {}
    const n = g.npc(d.id, d.preset, d.x, d.z, d.face, extra)
    if (d.act) n.act(d.act, d.prop)
    if (sustain) { n.char.sustain = sustain; n.lookAtPlayer = false }
    if (d.prop && !d.act) n.char.setWeapon(d.prop)
    g.addTalker(n, label || 'a traveller', () => g.toast(`${(label || 'A traveller').replace(/^./, c => c.toUpperCase())}: “${d.lines[(Math.random() * d.lines.length) | 0]}”`))
  }
  await g.fade(0, 2)
  g.objective(g.exploreLine())
  g.toast(state.mobile ? 'The land is five times wider now. Follow the trails, find the 10 landmarks and light every lamp.' : 'The land is five times wider now. Follow the trails out of the valley, find the 10 landmarks and light every lamp (E).')
  // the day turns slowly; the mountain never ends
  const cycle = ['day', 'dusk', 'night', 'dawn']
  for (let i = 1; !g.disposed; i++) {
    await g.wait(150)
    if (!g.disposed) g.time(cycle[i % cycle.length], 30)
  }
}

/* ============================================================================
   CHAPTER VII — THE KING'S ROAD (exploration)
   Three days after the throne. Aruvan rides out to tell the far villages the
   war is over: Kovil, the river ghats, the shepherds, the old watchtower.
============================================================================ */
const RG = Object.fromEntries(REGIONS.map(r => [r.key, r]))
function seedPod(g, x, z, color = 0xa494ff) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color, toneMapped: false }))
  m.position.set(x, g.world.groundAt(x, z) + 1.1, z); g.scene.add(m)
  const spin = (dt, t) => { m.rotation.y += dt * 1.4; m.position.y = g.world.groundAt(x, z) + 1.1 + Math.sin(t * 2) * 0.15 }
  g.world.anim.push(spin)
  return { mesh: m, done() { g.world.anim = g.world.anim.filter(f => f !== spin); g.world.spawnBurst(m.position, 40, color, 3); m.removeFromParent(); m.geometry.dispose() } }
}
async function explore1(g) {
  const p = g.player
  prepareWorld(g, 7); g.world.setThennur('ruined'); g.world.setForge('working')
  g.time('dawn', 0); g.music('main_theme')
  p.setLook('aruvan', { ironStaff: true })
  g.movePlayer(-1, -7, Math.PI)
  const th = g.npc('thamarai', 'thamarai', 1.6, -9.2, -0.6), il = g.npc('ilan', 'ilan', -1.4, -9.6, 0.4)
  g.enableHorse(3.4, -5.2, -2.0)
  await g.fade(1, 0)
  g.cine(true)
  g.shot([10, P.village.y + 6, 8], [0, P.village.y + 1.5, -6], 0, 'none', { fov: 46 })
  g.shot([7, P.village.y + 3, 2], [0, P.village.y + 1.4, -7], 9, 'sine.inOut', { fov: 40 })
  await g.chapterCard('Chapter VII', "The King's Road", 'Three days after the throne')
  await g.fade(0, 2)
  await g.say('thamarai', 'The whole valley is talking about you. The Hound who would not be king.')
  await g.say('aruvan', 'Let them talk. The villages beyond the ridges still think the war goes on.')
  await g.say('ilan', 'Then go and tell them! And take him. Dunkan\'s stables are empty now. This one followed me home.')
  g.shotAt(g.horse.root.position, [2.6, 1.7, 2.2], 1.7, 0, 'none', { fov: 36 })
  await g.say('thamarai', 'A Marwari. Proud ears, prouder temper. Like someone I know.', { cover: false })
  await g.say('aruvan', 'Does he have a name?')
  await g.say('ilan', 'Not yet. You have to earn it first. That\'s what you always say.')
  g.cine(false)
  g.toast(state.mobile ? 'Tap RIDE to mount · push the stick fully to gallop · the arrow and the map (tap the minimap) show the way' : 'H: mount / dismount · Shift: gallop · follow the arrow · M: map')
  // 1. Kovil
  const elder = g.npc('kovilElder', 'murugan', RG.kovil.x + 2.5, RG.kovil.z + 1.5, 0)
  for (let i = 0; i < 4; i++) g.npc('kovilV' + i, 'villager', RG.kovil.x - 3 + i * 2, RG.kovil.z + 4 + (i % 2), Math.PI, { long: i % 2 === 0 }).act(['chat', 'listen', 'sweep', 'draw'][i], i === 2 ? 'broom' : null)
  await g.talkTo('kovilElder', 'Ride west to Kovil Hamlet and find the elder')
  await g.say('kovilElder', 'A monk on Dunkan\'s horse? Either the world has ended, or it has finally begun.', { shot: true })
  await g.say('aruvan', 'It has begun. The Iron King is gone. No more grain for sons.')
  await g.say('kovilElder', 'Then Kovil plants its fields again. Take the hamlet\'s blessing, king who is not a king.')
  g.grant(2, 'q:kovil', "Kovil's blessing")
  g.cine(false)
  // 2. River ghats — one lamp for each burned village
  await g.interact({ x: RG.ghats.x, z: RG.ghats.z + 6.5 }, 'Ride to the River Ghats and float a lamp for those who fell', '[E] Float the lamps')
  g.cine(true)
  const gp = { x: RG.ghats.x, z: RG.ghats.z + 7 }
  g.shot([gp.x + 5, g.world.groundAt(gp.x, gp.z) + 2.2, gp.z - 4], [gp.x, g.world.groundAt(gp.x, gp.z) - 0.6, gp.z + 4], 0, 'none', { fov: 40 })
  for (let i = 0; i < 7; i++) setTimeout(() => g.world.spawnBurst(new THREE.Vector3(gp.x - 4 + i * 1.3, g.world.groundAt(gp.x, gp.z) - 0.9, gp.z + 3 + (i % 2)), 12, 0xffb050, 0.8), i * 450)
  await g.caption('He floated one lamp for every village that burned. The river carried all seven away.', 5)
  await g.say('aruvan', 'Thennur. Paalur. Vettai... I remember every name. I will remember them until the bloom.')
  g.grant(2, 'q:ghats')
  g.cine(false)
  // 3. the shepherds
  const sh = g.npc('shepherd', 'murugan', RG.meadow.x + 1.5, RG.meadow.z + 2, 0.8, { cloth: 0x5a7a3a })
  await g.talkTo('shepherd', "Ride east across the valley to the Shepherd's Meadow")
  await g.say('shepherd', 'Swami! The soldiers took half my flock in the spring.', { shot: true })
  await g.say('aruvan', 'I am sorry. I will see they are paid back.')
  await g.say('shepherd', 'No need. Look! They came home on their own this morning. Goats know when a war is over.')
  await g.say('aruvan', 'Then the land is healing faster than we are.')
  g.grant(2, 'q:meadow')
  g.cine(false)
  // 4. the old watchtower: the fortress forges are cold
  await g.goTo({ x: RG.ridge.x + 2, z: RG.ridge.z + 3 }, 5, 'Climb to Watchtower Ridge')
  g.cine(true)
  const ry = g.world.groundAt(RG.ridge.x, RG.ridge.z)
  g.shot([RG.ridge.x + 4, ry + 4, RG.ridge.z + 4], [-4, 22, 175], 0, 'none', { fov: 42 })
  g.shot([RG.ridge.x + 1, ry + 6, RG.ridge.z + 7], [-4, 24, 178], 10, 'sine.inOut', { fov: 36 })
  await g.caption('From the old tower he could see the fortress. For the first time in thirty years, no smoke rose from its forges.', 5.5)
  g.shotAt(p.pos, [1.6, 1.6, 2.4], 1.6, 0, 'none', { fov: 34 })
  await g.say('aruvan', 'Ilan was right. You do need a name.')
  await g.say('aruvan', 'Megham. Cloud. Because you carried me above the smoke.')
  g.toast('Your horse is named Megham.')
  g.grant(3, 'q:ridge', 'the road is walked')
  await g.fade(1, 2.5)
  g.cine(false); g.clearNPCs()
}

/* ============================================================================
   CHAPTER VIII — SEEDS OF THE BLOOM (exploration)
   The Guru's notebook: three seeds sleep where the mountain prays.
============================================================================ */
async function explore2(g) {
  const p = g.player
  prepareWorld(g, 7); g.world.setThennur('ruined')
  g.time('day', 0); g.music('mountain')
  p.setLook('aruvan', { ironStaff: true })
  g.movePlayer(1.6, -57.5, Math.PI)
  const th = g.npc('thamarai', 'thamarai', -0.8, -59.2, 0.6)
  g.enableHorse(5.5, -54, -1.6)
  await g.fade(1, 0)
  g.cine(true)
  g.shot([8, P.temple.y + 5, -48], [0, P.temple.y + 3, -66], 0, 'none', { fov: 44 })
  await g.chapterCard('Chapter VIII', 'Seeds of the Bloom', 'Before the monsoon')
  await g.fade(0, 2)
  await g.say('thamarai', 'I found this in the Guru\'s room. Listen. "Three seeds sleep where the mountain prays."')
  await g.say('thamarai', '"Under the great banyan. Inside the ring of stones. Above the clouds, where the flags speak."')
  await g.say('aruvan', 'The Shola grove. The old stone circle. The prayer-flag pass.')
  await g.say('thamarai', 'Bring them to Thennur, to Malli\'s bush. It should not bloom alone.')
  g.cine(false)
  const sites = [
    { g: RG.grove, dx: 8, dz: -5, label: 'Ride to the Shola Grove and find the seed under the banyan', line: '"The banyan does not ask the rain where it has been."' },
    { g: RG.stones, dx: 0, dz: 1.6, label: 'Find the seed inside the Circle of Stones', line: '"Stone remembers. That is why it never hurries."' },
    { g: RG.pass, dx: 2, dz: 4, label: 'Climb to the Prayer-Flag Pass, above the clouds', line: '"Let the wind carry what you can no longer hold."' },
  ]
  let n = 0
  for (const st of sites) {
    const x = st.g.x + st.dx, z = st.g.z + st.dz, pod = seedPod(g, x, z)
    await g.interact({ x, z }, st.label, '[E] Gather the seed')
    pod.done(); n++
    g.audio.play('pickup')
    await g.caption(`The Guru's hand, in the margin: ${st.line}`, 4.5)
    g.toast(`Kurinji seeds: ${n} / 3`)
    g.grant(2, 'q:seed' + n)
  }
  // plant them beside Malli's bush
  const ilan = g.npc('ilan', 'ilan', P.malliSpot.x + 1.8, P.malliSpot.z - 1.5, -0.8)
  const ka = g.npc('kaali', 'kaali', P.malliSpot.x - 2.2, P.malliSpot.z - 1.2, 0.8)
  g.world.malliBush.visible = true
  await g.interact({ x: P.malliSpot.x, z: P.malliSpot.z }, "Ride south to Thennur and plant the seeds beside Malli's bush", '[E] Plant the seeds')
  g.cine(true); g.music('lullaby')
  p.char.sustain = 'kneel'; p.char.setWeapon(null)
  g.shotAt(P.malliSpot, [2.6, 1.1, 2.4], 0.7, 0, 'none', { fov: 36 })
  g.world.spawnBurst(new THREE.Vector3(P.malliSpot.x, P.malliSpot.y + 0.4, P.malliSpot.z), 60, 0xa494ff, 2)
  await g.say('ilan', 'Will they really bloom? All of them?')
  await g.say('aruvan', 'In twelve years. With the rest of the mountain.')
  await g.say('kaali', 'Then we had better still be here to see it, monk.')
  await g.caption('Three seeds from three holy places, planted where a child once gave away her only flower.', 5)
  g.grant(3, 'q:planted', 'the seeds are planted')
  await g.fade(1, 3, '#fff')
  p.char.sustain = null; g.cine(false); g.clearNPCs()
}

export const CHAPTERS = [prologue, ch1, ch2, ch3, ch4, ch5, ch6, explore1, explore2, ch7, epilogue]
export const CHAPTER_NAMES = ['Prologue — Ash', 'I — The Quiet Mountain', 'II — The Iron Envoy', 'III — The Guru\'s Last Lesson', 'IV — The Gate of Kurinji', 'V — Ashes of Thennur', 'VI — The Iron Throne', 'VII — The King\'s Road', 'VIII — Seeds of the Bloom', 'IX — The Peaceful Reign', 'Epilogue — When the Kurinji Blooms']
export { villageLife }
