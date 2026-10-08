import assert from 'node:assert/strict'
import { build } from 'esbuild'
import * as THREE from 'three'

// Keep geometry/rig verification independent of the browser-only renderer.
const bundle = await build({
  entryPoints: ['src/game/Characters.js'], bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'geometry-only-fog', setup(api) {
    api.onResolve({ filter: /\/Renderer$/ }, () => ({ path: 'fog', namespace: 'geometry-test' }))
    api.onLoad({ filter: /.*/, namespace: 'geometry-test' }, () => ({ contents: 'export function patchFog() {}' }))
  } }],
})
const { makeCharacter, CHARACTER_PRESET_NAMES, warmCharacterPresets } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))

const poses = ['meditate', 'kneel', 'sit', 'bow', 'lie', 'hold', 'raise', 'refuse', 'throne', 'dead']
const actions = ['attack1', 'attack2', 'attack3', 'heavy', 'special', 'dodge', 'hit', 'die', 'slam', 'lunge', 'bell']
let maximumMeshes = 0, maximumTriangles = 0
for (const name of CHARACTER_PRESET_NAMES) {
  const character = makeCharacter(name)
  let meshCount = 0, triangles = 0
  character.root.traverse(node => {
    if (!node.isMesh) return
    meshCount++
    const position = node.geometry.attributes.position
    triangles += position.count / 3
    assert(node.geometry.attributes.color, name + ' has face colors')
    assert.equal(position.count % 3, 0)
    for (const coordinate of position.array) assert(Number.isFinite(coordinate), name + ' has finite vertices')
  })
  maximumMeshes = Math.max(maximumMeshes, meshCount)
  maximumTriangles = Math.max(maximumTriangles, triangles)
  const poseBuffer = character._pose
  for (const pose of poses) {
    character.sustain = pose
    for (let frame = 0; frame < 30; frame++) character.update(1 / 60, 0)
    character.root.updateMatrixWorld(true)
    character.root.traverse(node => { for (const element of node.matrixWorld.elements) assert(Number.isFinite(element), name + ':' + pose) })
  }
  assert.equal(character._pose, poseBuffer, 'animation reuses its pose buffer')
  for (const action of actions) {
    character.sustain = null
    let hits = 0
    character.play(action, 0.4, () => hits++)
    character.update(1, 0)
    character.update(1, 0)
    assert.equal(hits, 1, name + ':' + action + ' callback runs once across a long frame')
    assert.equal(character.busy, false)
  }
  character.dispose()
  character.dispose()
}

const first = makeCharacter('soldier'), second = makeCharacter('soldier')
const firstMesh = first.root.getObjectByProperty('isMesh', true), secondMesh = second.root.getObjectByProperty('isMesh', true)
assert.equal(firstMesh.geometry, secondMesh.geometry, 'soldiers share template geometry')
assert.notEqual(firstMesh.material, secondMesh.material, 'tint materials are per character')
first.setTint(0xff0000)
assert.equal(second.mats[0].emissive.getHex(), 0, 'hit flash never leaks to a neighboring actor')
let geometryDisposals = 0
secondMesh.geometry.addEventListener('dispose', () => geometryDisposals++)
first.dispose()
assert.equal(geometryDisposals, 0, 'disposing one rig keeps shared geometry alive')
for (const weapon of ['staff', 'sword', 'greatsword', 'hammer', 'flower', 'bird', null]) {
  second.setWeapon(weapon)
  assert.equal(second.o.weapon, weapon, 'setWeapon updates the idle weapon pose')
}
second.dispose()

const scene = new THREE.Scene(), king = makeCharacter('dunkan')
const crown = king.dropCrown(scene, { x: 2, y: 0.8, z: 4 })
assert.equal(king.dropCrown(scene, { x: 5, y: 0, z: 0 }), crown, 'crown drops once')
assert.equal(crown.position.x, 2)
const crownMesh = crown.getObjectByProperty('isMesh', true)
assert.equal(crownMesh.geometry.attributes.position.count / 3, 84, 'gold band and exactly seven four-sided spikes')
king.dispose()
assert.equal(crown.parent, scene, 'fallen crown survives defeated actor cleanup')
crown.userData.dispose()
assert.equal(crown.parent, null)

await warmCharacterPresets(scene, { warm: async () => { assert(scene.getObjectByName('characterShaderWarmup')) } })
assert.equal(scene.children.length, 0, 'warmup leaves no actors in the live scene')
await assert.rejects(warmCharacterPresets(scene, { warm: async () => { throw Error('warmup failure') } }))
assert.equal(scene.children.length, 0, 'failed warmup still removes temporary actors')
console.log(JSON.stringify({ presets: CHARACTER_PRESET_NAMES.length, maximumMeshes, maximumTriangles, checks: 'geometry, poses, actions, shared resource lifetime, weapon swaps, crown transfer, warmup cleanup' }))
