import * as THREE from 'three'
import { heightAt, STREAM, smooth } from './terrain'
import { Builder, rock } from '../gfx/kit'

/* ===========================================================================
   Water: valley stream, the east-cliff waterfall that feeds it, the drop into
   the fortress gorge, the gorge river and distant waterfalls on outer cliffs.
=========================================================================== */

const WATER_VS = `#include <common>
#include <fog_pars_vertex>
varying vec2 vUv; varying vec3 vW;
void main(){
  vec3 transformed = position;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vUv = uv;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`
const FLOW_FS = `#include <common>
#include <fog_pars_fragment>
uniform float time, speed, fall; uniform vec3 deep, shallow, foam, sky;
varying vec2 vUv; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 uv = vUv;
  float flow = n(vec2(uv.x * 6.0, uv.y * (fall > 0.5 ? 1.2 : 3.0) - time * speed)) * 0.6 + n(vec2(uv.x * 14.0, uv.y * 7.0 - time * speed * 1.7)) * 0.4;
  float edge = smoothstep(0.32, 0.0, uv.x) + smoothstep(0.68, 1.0, uv.x);
  vec3 v = normalize(vW - cameraPosition);
  float fres = pow(1.0 - abs(v.y), 3.0) * (1.0 - fall);
  vec3 c = mix(deep, shallow, flow * 0.8 + fall * 0.35);
  c = mix(c, sky, fres * 0.45);
  float streak = smoothstep(0.55, 0.85, flow) * (0.35 + fall * 0.65);
  c = mix(c, foam, clamp(streak + edge * 0.55 + fall * 0.35, 0.0, 1.0));
  float a = mix(0.82, 0.9, fall) * (fall > 0.5 ? smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x) : 1.0);
  gl_FragColor = vec4(c, a);
  #include <fog_fragment>
}`

export class Water {
  constructor(scene, world) {
    this.scene = scene; this.world = world
    this.U = { time: { value: 0 } }
    this.sky = new THREE.Color(0xbfdcf0)
    const flowMat = (speed, fall) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        time: this.U.time, speed: { value: speed }, fall: { value: fall },
        deep: { value: new THREE.Color(0x1f5a6a) }, shallow: { value: new THREE.Color(0x4a9ab0) }, foam: { value: new THREE.Color(0xe8f4f8) }, sky: { value: this.sky },
      }]),
      vertexShader: WATER_VS, fragmentShader: FLOW_FS,
    })
    // shared uniform refs must survive merge (merge clones) — reattach
    const fix = m => { m.uniforms.time = this.U.time; m.uniforms.sky = { value: this.sky }; return m }
    this.streamMat = fix(flowMat(0.9, 0)); this.fallMat = fix(flowMat(2.6, 1))
    this.sprays = []
    this.buildStream()
    this.buildSourceFall()
    this.buildGorge()
    this.buildDistantFalls()
    this.buildSpray()
  }
  ribbon(points, width, mat, yOff = 0) {
    const pos = [], uv = []
    let acc = 0
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[Math.min(points.length - 1, i + 1)], o = points[Math.max(0, i - 1)]
      const dir = new THREE.Vector3().subVectors(q, o).setY(0).normalize()
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width(i / (points.length - 1)) / 2)
      if (i) acc += p.distanceTo(points[i - 1])
      pos.push(p.x - side.x, p.y + yOff, p.z - side.z, p.x + side.x, p.y + yOff, p.z + side.z)
      uv.push(0, acc / 4, 1, acc / 4)
    }
    const idx = []
    for (let i = 0; i < points.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx)
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, mat); m.renderOrder = 3; this.scene.add(m)
    return m
  }
  buildStream() {
    const curve = new THREE.CatmullRomCurve3(STREAM.map(v => new THREE.Vector3(v.x, 0, v.y)))
    const pts = curve.getSpacedPoints(120).map(p => { p.y = heightAt(p.x, p.z) + 0.95; return p })
    // keep the water surface monotonic (never flows uphill)
    for (let i = 1; i < pts.length; i++) pts[i].y = Math.min(pts[i].y, pts[i - 1].y)
    this.stream = this.ribbon(pts, t => 3.2 + Math.sin(t * 20) * 0.4, this.streamMat)
    this.streamEnd = pts[pts.length - 1]
    // river stones along the banks
    const b = new Builder(41)
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i], s = 0.25 + ((i * 7) % 5) * 0.08
      for (const side of [-1, 1]) b.add(rock(s, i + side * 3, 0.6, 0), 0x6e6a64, { at: [p.x + side * (1.8 + (i % 3) * 0.25), heightAt(p.x + side * 1.9, p.z) + 0.05, p.z], jit: 0.12, m: 'stone' })
    }
    this.scene.add(b.build())
  }
  /** Waterfall polyline: lip on the ledge → over the edge → pool. */
  fall(top, dir, width, bottomY, mat = this.fallMat) {
    const pts = [], d = dir.clone().normalize()
    pts.push(top.clone().addScaledVector(d, -1.2))
    pts.push(top.clone())
    const drop = top.y - bottomY
    for (let i = 1; i <= 10; i++) { const t = i / 10; pts.push(top.clone().addScaledVector(d, 0.4 + t * 1.6 + t * t * 0.8).setY(top.y - drop * t)) }
    const m = this.ribbon(pts, () => width, mat)
    // splash pool
    const pool = new THREE.Mesh(new THREE.CircleGeometry(width * 1.1, 10), this.streamMat)
    const end = pts[pts.length - 1]
    pool.rotation.x = -Math.PI / 2; pool.position.set(end.x, bottomY + 0.08, end.z); pool.renderOrder = 3; this.scene.add(pool)
    this.sprays.push({ p: end.clone().setY(bottomY + 0.3), w: width })
    return m
  }
  buildSourceFall() {
    // ledge at x>31 (z≈57) down to the stream head
    const topY = heightAt(34, 57) + 0.6
    const bottom = heightAt(29.4, 57.5) + 0.9
    this.fall(new THREE.Vector3(32.2, topY, 57), new THREE.Vector3(-1, 0, 0.1), 2.6, bottom)
    // short channel on the ledge so the fall has a source
    const pts = []; for (let i = 0; i <= 8; i++) { const x = 32.2 + i * 1.5, z = 57 - i * 0.6; pts.push(new THREE.Vector3(x, Math.max(heightAt(x, z) + 0.45, topY - 0.05), z)) }
    pts.reverse(); this.ribbon(pts, () => 2.4, this.streamMat)
    // cliff rocks framing the fall
    const b = new Builder(43)
    for (let i = 0; i < 14; i++) {
      const z = 49 + i * 1.6, s = 1.1 + (i % 4) * 0.4
      if (Math.abs(z - 57) < 1.8) continue
      b.add(rock(s, 60 + i, 1.2, 1), 0x6e6a64, { at: [30.6 + (i % 2) * 0.6, heightAt(30, z) + s * 0.8 + (i % 3) * 1.6, z], rot: [0, i, 0], jit: 0.14, m: 'stone' })
    }
    this.scene.add(b.build())
  }
  buildGorge() {
    // follow the stream past its end until the land drops away
    const s = this.streamEnd.clone(), dir = new THREE.Vector3(0.75, 0, 0.66).normalize()
    let p = s.clone(), lip = null
    for (let i = 0; i < 80; i++) { p.addScaledVector(dir, 0.5); const h = heightAt(p.x, p.z); if (h < s.y - 6) { lip = p.clone().addScaledVector(dir, -1.5); break } }
    if (!lip) return
    // connect stream end to the lip
    const conn = []; for (let t = 0; t <= 1.001; t += 0.1) { const q = s.clone().lerp(lip, t); q.y = s.y - t * 0.3; conn.push(q) }
    this.ribbon(conn, () => 3.2, this.streamMat)
    lip.y = s.y - 0.3
    let bot = lip.clone(); for (let i = 0; i < 40; i++) { bot.addScaledVector(dir, 0.5); if (heightAt(bot.x, bot.z) < -3) break }
    this.fall(lip, dir, 3.4, heightAt(bot.x, bot.z) + 0.5)
    // gorge river winding out to the south-east
    const pts = []; for (let i = 0; i <= 40; i++) { const x = bot.x + i * 2.2, z = bot.z + i * 2.6 + Math.sin(i * 0.35) * 4; pts.push(new THREE.Vector3(x, Math.min(heightAt(x, z) + 0.5, -4.5), z)) }
    this.ribbon(pts, () => 6, this.streamMat)
  }
  buildDistantFalls() {
    // scan the outer cliffs for big drops facing the valley and pour water over them
    let n = 0
    for (let k = 0; k < 400 && n < 9; k++) {
      const a = k * 2.399, R = 140 + (k % 9) * 22
      const x = Math.cos(a) * R, z = Math.sin(a) * R * 1.15 + 40
      if (Math.abs(x) < 90) continue
      const inward = new THREE.Vector3(-x, 0, 40 - z).normalize()
      const h0 = heightAt(x, z), h1 = heightAt(x + inward.x * 14, z + inward.z * 14)
      if (h0 - h1 < 22 || h0 > 120) continue
      this.fall(new THREE.Vector3(x, h0 + 0.3, z), inward, 3 + (k % 3), h1)
      n++
    }
  }
  buildSpray() {
    const N = 240, pos = new Float32Array(N * 3), seed = new Float32Array(N)
    for (let i = 0; i < N; i++) seed[i] = Math.random()
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.sprayPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, map: this.world.fxTex, color: 0xf2f6fa, transparent: true, opacity: 0.35, depthWrite: false }))
    this.sprayPts.frustumCulled = false; this.sprayPts.userData.seed = seed
    this.scene.add(this.sprayPts)
  }
  update(dt, t) {
    this.U.time.value = t
    const p = this.sprayPts.geometry.attributes.position, seed = this.sprayPts.userData.seed, S = this.sprays
    if (!S.length) return
    for (let i = 0; i < p.count; i++) {
      const s = S[i % S.length], k = seed[i], life = (t * (0.35 + k * 0.3) + k * 9) % 1
      p.setXYZ(i, s.p.x + Math.sin(k * 40 + t * 0.5) * s.w * 0.8 * (0.3 + life), s.p.y + life * 3.2, s.p.z + Math.cos(k * 23 + t * 0.4) * s.w * 0.8 * (0.3 + life))
    }
    p.needsUpdate = true
  }
}
