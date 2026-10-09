import assert from 'node:assert/strict'
import { build } from 'esbuild'
import * as THREE from 'three'

// Keep geometry/rig verification independent of the browser-only renderer.
const bundle = await build({
  entryPoints: ['src/game/Characters.js'], bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'geometry-only-fog', setup(api) {
    api.onResolve({ filter: /\/Renderer$/ }, () => ({ path: 'fog', namespace: 'geometry-test' }))
    api.onLoad({ filter: /.*/, namespace: 'geometry-test' }, () => ({ contents: 'export function patchFog() {}' }))
    api.onResolve({ filter: /\/settings$/ }, () => ({ path: 'settings', namespace: 'settings-test' }))
    api.onLoad({ filter: /.*/, namespace: 'settings-test' }, () => ({ contents: 'export const settings = { preset: "high", renderScale: 1, foliage: 1, shadows: "high" }; export const isMobile = false;' }))
  } }],
})
const { makeCharacter, CHARACTER_PRESET_NAMES, warmCharacterPresets } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))

const poses = ['meditate', 'kneel', 'sit', 'bow', 'lie', 'hold', 'raise', 'refuse', 'throne', 'dead']
const actions = ['attack1', 'attack2', 'attack3', 'heavy', 'special', 'dodge', 'hit', 'die', 'slam', 'lunge', 'bell']
let maximumMeshes = 0, maximumTriangles = 0
for (const name of CHARACTER_PRESET_NAMES) {
  const character = makeCharacter(name)
  assert.equal(character.root.userData.characterSystem, 'enhanced-cast', name + ' uses the enhanced runtime')
  let meshCount = 0, triangles = 0
  character.root.traverse(node => {
    if (!node.isMesh) return
    meshCount++
    const position = node.geometry.attributes.position
    triangles += position.count / 3
    assert(node.geometry.attributes.color, name + ' has face colors')
    assert.equal(position.count % 3, 0)
    for (const coordinate of position.array) assert(Number.isFinite(coordinate), name + ' has finite vertices')
    if (node.isSkinnedMesh) {
      assert.equal(node.skeleton, character.skeleton, 'material meshes share one actor skeleton')
      const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight
      for (let vertex = 0; vertex < weights.count; vertex++) {
        let sum = 0
        for (let influence = 0; influence < 4; influence++) {
          const weight = weights.array[vertex * 4 + influence], joint = indices.array[vertex * 4 + influence]
          assert(Number.isFinite(weight) && weight >= 0)
          assert(joint >= 0 && joint < character.skeleton.bones.length)
          sum += weight
        }
        assert(Math.abs(sum - 1) < 0.00001, 'skin weights are normalized')
      }
    }
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
const firstMesh = first.root.getObjectByProperty('isSkinnedMesh', true), secondMesh = second.root.getObjectByProperty('isSkinnedMesh', true)
assert.equal(firstMesh.geometry, secondMesh.geometry, 'soldiers share template geometry')
assert.notEqual(first.skeleton, second.skeleton, 'each soldier owns independent joints')
const staticPositions = Float32Array.from(firstMesh.geometry.attributes.position.array)
first.root.updateMatrixWorld(true); first.skeleton.update()
const sampleBefore = firstMesh.getVertexPosition(0, new THREE.Vector3()).clone()
first.update(0.2, 1)
first.root.updateMatrixWorld(true); first.skeleton.update()
const sampleAfter = firstMesh.getVertexPosition(0, new THREE.Vector3())
assert(sampleBefore.distanceTo(sampleAfter) > 0.00001, 'vertices deform when the rig moves')
assert.deepEqual(firstMesh.geometry.attributes.position.array, staticPositions, 'animation never rewrites shared vertex buffers')
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
assert.equal(crown.userData.spikes, 7)
assert.equal(crownMesh.geometry.attributes.position.count / 3, 84, 'gold band and exactly seven four-sided spikes')
king.dispose()
assert.equal(crown.parent, scene, 'fallen crown survives defeated actor cleanup')
crown.userData.dispose()
assert.equal(crown.parent, null)

await warmCharacterPresets(scene, { warm: async () => { assert(scene.getObjectByName('characterShaderWarmup')) } })
assert.equal(scene.children.length, 0, 'warmup leaves no actors in the live scene')
await assert.rejects(warmCharacterPresets(scene, { warm: async () => { throw Error('warmup failure') } }))
assert.equal(scene.children.length, 0, 'failed warmup still removes temporary actors')
for (const name of ['aruvan', 'veeran', 'dunkan', 'thamarai', 'guru', 'malli']) {
  const low = makeCharacter(name, { detail: 0 }), high = makeCharacter(name, { detail: 2 })
  const triangles = character => { let total = 0; character.root.traverse(node => { if (node.isMesh) total += node.geometry.attributes.position.count / 3 }); return total }
  assert(triangles(low) < triangles(high), name + ' low-detail preset reduces geometry')
  assert(triangles(high) < 14000, name + ' stays within the high-detail budget')
  const clothMesh = high.root.getObjectByName('cloth')
  if (high.skirt && clothMesh) {
    const ys = clothMesh.geometry.attributes.position
    let below = false
    for (let i = 0; i < ys.count; i++) if (ys.getY(i) < 0.8) { below = true; break }
    assert(below, name + ' hanging garment extends below the hips')
  }
  low.dispose(); high.dispose()
}
console.log(JSON.stringify({ presets: CHARACTER_PRESET_NAMES.length, maximumMeshes, maximumTriangles, checks: 'geometry, normalized skin weights, shared skeleton palette, pose deformation, static cached buffers, all poses/actions, low-detail budget, resource lifetime, weapon swaps, crown transfer, warmup cleanup' }))
