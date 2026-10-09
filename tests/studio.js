// Dev-only studio: renders one subject in isolation with the game's real renderer,
// post-processing and materials, so it can be compared side by side with the boards in
// docs/art-reference. Driven by URL parameters (see scripts/snap.mjs):
//
//   kind=char  ids=aruvan[,thamarai…]  views=front,left,back,right | face | walk   pose=idle|meditate|…
//   kind=build fn=house|temple|bellTower|…  args={json}  az=deg el=deg dist=m
//   kind=prop  fn=stoneLantern|brassLamp|…  args=[json array after (b, at)]  az el dist
//   time=day|dawn|dusk|night|memory|storm|bloom  bg=board|sky
//
// window.__ready becomes true once the frame has settled.
import * as THREE from 'three'
import { Renderer, FOG } from '/src/game/gfx/Renderer.js'
import { Builder, WIND } from '/src/game/gfx/kit.js'
import { makeCharacter, RIM } from '/src/game/Characters.js'
import * as B from '/src/game/world/buildings.js'
import * as PR from '/src/game/world/props.js'

const q = new URLSearchParams(location.search)
const kind = q.get('kind') || 'char', time = q.get('time') || 'day', bg = q.get('bg') || 'board'
const label = document.getElementById('label')

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 2000)
const renderer = new Renderer(document.getElementById('engine'), scene, camera)
renderer.setGrade(time === 'board' ? 'day' : time, 0)

// lighting close to the game's presets
const LIGHT = {
  day: { sun: 0xfff2dc, si: 3.0, hemiSky: 0xbcd4f0, hemiGround: 0x6a5a40, hemi: 0.75, dir: [-6, 10, 8], bg: 0xd9d2c4 },
  dawn: { sun: 0xffb877, si: 2.8, hemiSky: 0xe8c0b0, hemiGround: 0x5a4a50, hemi: 0.6, dir: [-10, 5, 6], bg: 0xe7c9b0 },
  dusk: { sun: 0xff9a5a, si: 2.6, hemiSky: 0xc89ab8, hemiGround: 0x4a3a40, hemi: 0.55, dir: [10, 4, 6], bg: 0xd8a890 },
  night: { sun: 0x8aa8ff, si: 1.0, hemiSky: 0x3a4a7a, hemiGround: 0x1a1a24, hemi: 0.45, dir: [-4, 9, 5], bg: 0x2a3048 },
  memory: { sun: 0xffa060, si: 3.0, hemiSky: 0xffb070, hemiGround: 0x5a2a20, hemi: 0.5, dir: [-6, 6, 8], bg: 0x8a4a30 },
  storm: { sun: 0xc8ccd8, si: 1.5, hemiSky: 0x8a90a0, hemiGround: 0x3e3e42, hemi: 0.72, dir: [-6, 10, 8], bg: 0x5a5e66 },
  bloom: { sun: 0xffd8b0, si: 2.8, hemiSky: 0xc8b8f0, hemiGround: 0x5a4a6a, hemi: 0.7, dir: [-6, 8, 8], bg: 0xd8d0e8 },
}
const L = LIGHT[time] || LIGHT.day
scene.background = new THREE.Color(bg === 'sky' ? 0x9fc3e6 : L.bg)
const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi); scene.add(hemi)
const sun = new THREE.DirectionalLight(L.sun, L.si); sun.position.set(...L.dir); sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 60 }); scene.add(sun, sun.target)
FOG.uFogH.value.set(-999, 0, 0, 0)

const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: bg === 'sky' ? 0x8a9a5a : 0xcfc7b6, roughness: 1 }))
floor.receiveShadow = true; scene.add(floor)

const deg = d => d * Math.PI / 180
function orbit(target, az, el, dist) {
  camera.position.set(target.x + Math.sin(deg(az)) * Math.cos(deg(el)) * dist, target.y + Math.sin(deg(el)) * dist, target.z + Math.cos(deg(az)) * Math.cos(deg(el)) * dist)
  camera.lookAt(target)
}
const chars = []
function setup() {
  if (kind === 'newchar') {
    const ids = (q.get('ids') || 'veeran,aruvan,aruvanOld,guru,thamarai,kaali,malli,ilan,rudhra,dunkan,soldier').split(',')
    const w = (ids.length - 1) * 1.3
    import('/tests/new-characters.js').then(({ buildNewCharacter }) => {
      ids.forEach((id, i) => { const r = buildNewCharacter(id); r.position.x = -w / 2 + i * 1.3; r.rotation.y = Number(q.get('ry') || 0); scene.add(r) })
      label.textContent = 'NEW system: ' + ids.join(', ')
    }).catch(e => { label.textContent = 'error: ' + e.message; console.error(e) })
    camera.fov = 26; orbit(new THREE.Vector3(0, 1.0, 0), Number(q.get('az') || 0), 4, Number(q.get('dist') || Math.max(7, w * 2.3)))
  } else if (kind === 'char') {
    const ids = (q.get('ids') || 'aruvan').split(',')
    const views = (q.get('views') || 'front,left,back,right').split(',')
    const pose = q.get('pose'), extra = q.get('extra') ? JSON.parse(q.get('extra')) : {}
    const rot = { front: 0, left: Math.PI / 2, back: Math.PI, right: -Math.PI / 2, face: 0, walk: Math.PI / 2, threequarter: 0.6 }
    const items = []
    for (const id of ids) for (const v of views) items.push([id, v])
    const gap = Number(q.get('gap') || 1.25), w = (items.length - 1) * gap
    let maxH = 0
    items.forEach(([id, v], i) => {
      const c = makeCharacter(id, extra)
      c.root.position.set(-w / 2 + i * gap, 0, 0); c.root.rotation.y = rot[v] ?? 0
      if (pose) c.sustain = pose
      c._view = v
      scene.add(c.root); chars.push(c)
      const bb = new THREE.Box3().setFromObject(c.root); maxH = Math.max(maxH, bb.max.y)
    })
    label.textContent = `${ids.join(', ')} · ${views.join(' / ')}${pose ? ' · ' + pose : ''}`
    if (views.length === 1 && views[0] === 'face' && ids.length === 1) {
      camera.fov = 22; const head = chars[0].head.getWorldPosition(new THREE.Vector3())
      orbit(head, Number(q.get('az') || 0), Number(q.get('el') || 2), Number(q.get('dist') || 1.15))
    } else {
      camera.fov = 26
      const dist = Math.max(w * 1.9, maxH * 2.7) + 1.5
      orbit(new THREE.Vector3(0, maxH * 0.5, 0), Number(q.get('az') || 0), Number(q.get('el') || 4), Number(q.get('dist') || dist))
    }
  } else {
    const fn = q.get('fn') || 'house', b = new Builder(7)
    const args = q.get('args') ? JSON.parse(q.get('args')) : (kind === 'prop' ? [] : {})
    if (kind === 'build') (B[fn] || PR[fn])(b, ...(Array.isArray(args) ? args : [args]))
    else (PR[fn] || B[fn])(b, [0, 0, 0], ...args)
    const grp = b.build(); scene.add(grp)
    const bb = new THREE.Box3().setFromObject(grp), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3())
    const r = Math.max(size.x, size.y, size.z)
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: r * 6 + 20 }); sun.shadow.camera.updateProjectionMatrix()
    sun.position.copy(c).add(new THREE.Vector3(...L.dir).normalize().multiplyScalar(r * 2.5 + 10)); sun.target.position.copy(c)
    camera.fov = 30
    orbit(c, Number(q.get('az') || 30), Number(q.get('el') || 14), Number(q.get('dist') || r * 2.3 + 1))
    label.textContent = `${fn} ${q.get('args') || ''} · ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m`
  }
  camera.updateProjectionMatrix()
}
setup()
renderer.resize()

let frames = 0, last = performance.now()
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  WIND.uTime.value += dt
  for (const c of chars) c.update(dt, c._view === 'walk' ? 0.55 : 0)
  renderer.render(dt)
  if (++frames === 40) { window.__ready = true; const info = renderer.gl.info.render; window.__stats = { calls: info.calls, triangles: info.triangles } }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
window.__RIM = RIM
