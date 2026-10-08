import * as THREE from 'three'
import { makeCharacter, CHARACTER_PRESET_NAMES } from '../src/game/Characters'
import { Game } from '../src/game/Game'
import { state } from '../src/game/store'
import { CHAPTER_ASSETS } from '../src/game/assets'

const results = document.querySelector('#results'), preset = document.querySelector('#preset')
for (const name of CHARACTER_PRESET_NAMES) preset.add(new Option(name, name))
const scene = new THREE.Scene(); scene.background = new THREE.Color('#272018')
scene.add(new THREE.HemisphereLight(0xfff1dd, 0x534135, 2.2))
const sun = new THREE.DirectionalLight(0xffe0b8, 3.2); sun.position.set(4, 6, 4); scene.add(sun)
const fill = new THREE.DirectionalLight(0xd0e2ff, 1.8); fill.position.set(-3, 3, -4); scene.add(fill)
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 50); camera.position.set(3.2, 2.5, 6.5); camera.lookAt(0, 1, 0)
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight); renderer.toneMapping = THREE.AgXToneMapping; document.body.appendChild(renderer.domElement)
const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0x443729, roughness: 1 })); floor.position.y = -0.1; scene.add(floor)
let character
function change() { character?.dispose(); character = makeCharacter(preset.value); character.root.rotation.y = 0.1; scene.add(character.root); if (!results.dataset.finished) results.textContent = `Preview: ${preset.value} · base scale ${character.o.scale}\nFaceted rig, shared geometry, local material tint.` }
preset.addEventListener('change', change); change()
document.querySelector('#pose').addEventListener('change', e => { character.sustain = e.target.value === 'idle' ? null : e.target.value })
let previous = performance.now()
function frame(now) { const dt = Math.min(.05, (now - previous) / 1000); previous = now; character.update(dt); renderer.render(scene, camera); requestAnimationFrame(frame) }; requestAnimationFrame(frame)
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight) })

document.querySelector('#check').addEventListener('click', async e => {
  e.target.disabled = true; const lines = []; let game
  const log = text => { lines.push(text); results.textContent = lines.join('\n') }
  try {
    state.loading = { progress: 0, label: '', error: '' }
    game = new Game(document.querySelector('#engine')); await game.init(); game.audio.pause(true)
    log('PASS engine, physics, local fonts, character/world shader warmup')
    for (let i = 0; i < CHAPTER_ASSETS.length; i++) {
      await game.prepareChapter(i)
      const want = new Set(game.audio.lines.filter(l => l.chapter === CHAPTER_ASSETS[i].key || l.chapter === 'shared').map(l => l.id))
      if (game.audio.voice.size !== want.size || [...game.audio.voice.values()].some(h => h.state() !== 'loaded')) throw new Error('Chapter voices not ready')
      log(`PASS ${CHAPTER_ASSETS[i].key}: ${want.size} decoded voices, ${Object.keys(game.audio.fx).length} SFX, cached music, GPU warmup`)
    }
    state.loading = null
    let finished = false; game.wait(.12).then(() => { finished = true })
    game.setPaused(true); await new Promise(r => setTimeout(r, 250)); if (finished) throw new Error('Story advanced while paused')
    game.setPaused(false); game.audio.pause(true); await new Promise(r => setTimeout(r, 300)); if (!finished) throw new Error('Story did not resume')
    log('PASS pause/resume keeps story clock synchronized')
    log(`PASS render: ${game.renderer.gl.info.render.calls} calls in current view, ${game.renderer.gl.info.memory.geometries} GPU geometries`)
    game.destroy(); if (document.querySelector('#engine canvas')) throw new Error('Renderer was not removed')
    log('PASS session teardown; all 9 chapters ready without background audio')
  } catch (error) { log(`FAIL ${error.stack}`) }
  finally { game?.destroy(); state.loading = null; e.target.disabled = false; results.dataset.finished = 'true' }
})
