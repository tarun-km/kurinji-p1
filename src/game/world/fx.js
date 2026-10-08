import * as THREE from 'three'
import gsap from 'gsap'
import { heightAt } from './terrain'
import { settings } from '../settings'

/* ===========================================================================
   Effects — fire/embers/smoke, hit sparks, Kurinji Breath, quake ring,
   ground warnings, petals, fireflies, rain + lightning, objective diamond.
=========================================================================== */

export function dotTexture(soft = 0.3) {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(soft, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c); return t
}
const add = THREE.AdditiveBlending
const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: add, toneMapped: false })

export class FX {
  constructor(scene, world) {
    this.scene = scene; this.world = world
    this.tex = dotTexture()
    this.fireSets = {}        // name -> [{p: Vector3, s}]
    this.activeFires = []
    this.buildFire(); this.buildBurst(); this.buildPetals(); this.buildFireflies(); this.buildRain(); this.buildCrystals(); this.buildMarker()
  }

  /* ---------------- fire ---------------- */
  buildFire() {
    // faceted flame sheets: elongated diamonds, bright core + outer tongue
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.32, 1, 0.12); g.translate(0, 0.8, 0)
    const N = 420
    this.flameOuter = new THREE.InstancedMesh(g, glowMat(new THREE.Color(1.45, 0.42, 0.08)), N)
    this.flameInner = new THREE.InstancedMesh(g, glowMat(new THREE.Color(1.9, 1.15, 0.35)), N)
    for (const m of [this.flameOuter, this.flameInner]) { m.count = 0; m.frustumCulled = false; this.scene.add(m) }
    const pts = (n, color, size, blending, opacity) => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: this.tex, color, transparent: true, opacity, depthWrite: false, blending, sizeAttenuation: true }))
      p.frustumCulled = false; p.userData.seed = Float32Array.from({ length: n }, Math.random); this.scene.add(p); return p
    }
    this.embers = pts(700, new THREE.Color(2.5, 1.1, 0.35), 0.22, add, 1)
    this.smoke = pts(520, 0x1e1a18, 5.5, THREE.NormalBlending, 0.42)
  }
  /** Register / toggle a named set of fire points: [[x,y,z,scale], ...] */
  setFires(name, points, on = true) {
    if (points) this.fireSets[name] = points.map(([x, y, z, s = 1]) => ({ p: new THREE.Vector3(x, y, z), s, on }))
    for (const f of this.fireSets[name] || []) f.on = on
    this.activeFires = Object.values(this.fireSets).flat().filter(f => f.on)
  }
  fireOn(name) { return (this.fireSets[name] || []).some(f => f.on) }

  /* ---------------- bursts: sparks, dust ---------------- */
  buildBurst() {
    const N = 900, g = new THREE.BufferGeometry()
    this.B = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), col: new Float32Array(N * 3), life: new Float32Array(N), i: 0, N }
    g.setAttribute('position', new THREE.BufferAttribute(this.B.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.B.col, 3))
    this.burstPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.24, map: this.tex, vertexColors: true, transparent: true, depthWrite: false, blending: add }))
    this.burstPts.frustumCulled = false; this.scene.add(this.burstPts)
  }
  burst(p, n = 20, color = 0xf2c15b, speed = 6, gravity = 12) {
    const B = this.B, c = new THREE.Color(color).multiplyScalar(2)
    n = Math.round(n * settings.particles)
    for (let k = 0; k < n; k++) {
      const i = B.i = (B.i + 1) % B.N
      B.pos[i * 3] = p.x; B.pos[i * 3 + 1] = p.y; B.pos[i * 3 + 2] = p.z
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6), q = Math.sqrt(1 - u * u)
      B.vel[i * 3] = Math.cos(a) * q * s; B.vel[i * 3 + 1] = Math.abs(u) * s * 0.8 + 1; B.vel[i * 3 + 2] = Math.sin(a) * q * s
      B.col[i * 3] = c.r; B.col[i * 3 + 1] = c.g; B.col[i * 3 + 2] = c.b
      B.life[i] = 0.45 + Math.random() * 0.45
    }
    this.gravity = gravity
  }

  /* ---------------- Kurinji Breath crystals ---------------- */
  buildCrystals() {
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.35, 1, 0.35)
    this.crystals = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x8a7cf0, emissive: 0x6a54ff, emissiveIntensity: 2.2, flatShading: true, transparent: true, opacity: 0.9 }), 60)
    this.crystals.count = 0; this.crystals.frustumCulled = false; this.scene.add(this.crystals)
    this.crys = []
  }
  kurinjiBreath(pos) {
    // burst: core columns + petals + expanding ring (fx_kurinji_breath board)
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * 6.28 + Math.random() * 0.3, d = 0.4 + Math.random() * 1.6
      this.crys.push({ p: new THREE.Vector3(pos.x + Math.cos(a) * d, pos.y, pos.z + Math.sin(a) * d), h: 1.2 + Math.random() * 2.2, t: 0, life: 1.1, tilt: (Math.random() - 0.5) * 0.6, a })
    }
    this.burst(new THREE.Vector3(pos.x, pos.y + 1, pos.z), 140, 0xa494ff, 11, 2)
    this.ring(pos, 8, 0xa494ff, 0.9)
    this.petalBurst(pos)
  }
  ring(pos, radius, color, dur = 0.7, thick = 0.1) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, thick, 4, 64), glowMat(new THREE.Color(color).multiplyScalar(2.2)))
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, pos.y + 0.25, pos.z); this.scene.add(m)
    gsap.to(m.scale, { x: radius, y: radius, z: 1, duration: dur, ease: 'power2.out' })
    gsap.to(m.material, { opacity: 0, duration: dur, ease: 'power1.in', onComplete: () => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose() } })
  }
  quake(pos) {
    this.ring(pos, 9, 0xff5a2a, 0.8, 0.16)
    this.ring(pos, 6, 0xffa040, 0.55, 0.08)
    for (let i = 0; i < 3; i++) this.burst(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 6, pos.y + 0.2, pos.z + (Math.random() - 0.5) * 6), 25, 0x9a8060, 5, 9)
  }
  /** Heavy-attack ground warning: red fill that brightens, crisp rim. */
  warn(pos, radius, dur, { dir = 0, cone = false, line = 0 } = {}) {
    const geo = line ? new THREE.PlaneGeometry(1.4, line) : new THREE.CircleGeometry(radius, 40, cone ? -0.7 : 0, cone ? 1.4 : Math.PI * 2)
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false, uniforms: { t: { value: 0 }, line: { value: line ? 1 : 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform float t, line; varying vec2 vUv; varying vec3 vP;
        void main(){ float r = line > .5 ? abs(vUv.x - .5) * 2. : length(vUv - .5) * 2.;
          float rim = smoothstep(.86, .97, r) * (1. - smoothstep(.97, 1., r));
          float fill = smoothstep(1., 0., r) * .35 + step(r, t) * .25;
          gl_FragColor = vec4(vec3(1.7, .25, .08), (fill + rim) * (.3 + t * .7)); }`,
    }))
    m.rotation.x = -Math.PI / 2
    if (line) { m.rotation.z = -dir; m.position.set(pos.x + Math.sin(dir) * line / 2, pos.y + 0.1, pos.z + Math.cos(dir) * line / 2) }
    else { m.rotation.z = cone ? -dir + Math.PI / 2 : 0; m.position.set(pos.x, heightAt(pos.x, pos.z) + 0.08, pos.z) }
    this.scene.add(m)
    gsap.to(m.material.uniforms.t, { value: 1, duration: dur, ease: 'power1.in', onComplete: () => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose() } })
  }

  /* ---------------- petals ---------------- */
  buildPetals() {
    const g = new THREE.OctahedronGeometry(0.06, 0); g.scale(0.6, 0.15, 1.2)
    this.petals = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xa494ff, emissive: 0x5a44d0, emissiveIntensity: 0.9, flatShading: true, side: THREE.DoubleSide }), 500)
    this.petals.frustumCulled = false; this.petals.count = 0; this.scene.add(this.petals)
    this.petalAmount = 0
    this.petalSeed = Array.from({ length: 500 }, () => ({ x: (Math.random() - 0.5) * 50, y: Math.random() * 16, z: (Math.random() - 0.5) * 50, r: Math.random() * 6, s: 0.6 + Math.random() * 0.8 }))
    this.petalBursts = []
  }
  setPetals(amount) { gsap.to(this, { petalAmount: amount, duration: 3 }) }
  petalBurst(pos) { for (let i = 0; i < 40; i++) this.petalBursts.push({ p: new THREE.Vector3(pos.x, pos.y + 1, pos.z), v: new THREE.Vector3((Math.random() - 0.5) * 8, 3 + Math.random() * 5, (Math.random() - 0.5) * 8), r: Math.random() * 6, t: 0 }) }

  /* ---------------- fireflies ---------------- */
  buildFireflies() {
    const N = 220, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3)
    this.ffBase = []
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 80, z = -95 + Math.random() * 140
      this.ffBase.push([x, heightAt(x, z) + 0.4 + Math.random() * 2.6, z])
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: this.tex, color: new THREE.Color(1.6, 2.0, 0.6), transparent: true, depthWrite: false, blending: add }))
    this.fireflies.visible = false; this.scene.add(this.fireflies)
  }

  /* ---------------- rain + lightning ---------------- */
  buildRain() {
    const N = 2600, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 6)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c4d8, transparent: true, opacity: 0.35, depthWrite: false }))
    this.rain.frustumCulled = false; this.rain.visible = false; this.scene.add(this.rain)
    this.rainSeed = Array.from({ length: N }, () => [Math.random() * 60 - 30, Math.random() * 30, Math.random() * 60 - 30, 0.7 + Math.random() * 0.6])
    this.rainOn = 0
  }
  setRain(on) { this.rain.visible = true; gsap.to(this, { rainOn: on ? 1 : 0, duration: 2, onComplete: () => { if (!on) this.rain.visible = false } }) }

  /* ---------------- objective diamond ---------------- */
  buildMarker() {
    const g = new THREE.Group()
    const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: 0xe8b46a, emissive: 0xe8a040, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.3, flatShading: true }))
    d.scale.y = 1.55; g.add(d)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 60, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.5), transparent: true, opacity: 0.14, depthWrite: false, blending: add, toneMapped: false }))
    beam.position.y = 30; g.add(beam)
    g.visible = false; this.scene.add(g); this.marker = g; this.markerGem = d
  }

  update(dt, t, cam) {
    const Pm = settings.particles
    // ---- fire tongues
    const fires = this.activeFires, O = this.flameOuter, I = this.flameInner, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3()
    let n = 0
    for (let f = 0; f < fires.length && n < O.instanceMatrix.count - 4; f++) {
      const F = fires[f]
      if (F.p.distanceToSquared(cam) > 160 * 160) continue
      for (let k = 0; k < 4; k++, n++) {
        const ph = t * (7 + k * 1.3) + f * 3.1 + k * 1.7, s = F.s * (0.75 + 0.25 * Math.sin(ph) + 0.12 * Math.sin(ph * 2.3))
        e.set(Math.sin(ph * 0.7) * 0.18, k * 0.8 + f, Math.cos(ph * 0.9) * 0.15)
        pv.set(F.p.x + Math.cos(k * 1.6 + f) * 0.35 * F.s, F.p.y, F.p.z + Math.sin(k * 1.6 + f) * 0.35 * F.s)
        O.setMatrixAt(n, m.compose(pv, q.setFromEuler(e), sv.set(s, s * (1.1 + 0.3 * Math.sin(ph * 1.7)), s)))
        I.setMatrixAt(n, m.compose(pv, q, sv.set(s * 0.55, s * 0.7, s * 0.55)))
      }
    }
    O.count = I.count = n; O.instanceMatrix.needsUpdate = I.instanceMatrix.needsUpdate = true
    // ---- embers & smoke ride the active fires
    for (const [pts, speed, rise, spread] of [[this.embers, 0.5, 5.5, 1.4], [this.smoke, 0.07, 16, 4.5]]) {
      const P = pts.geometry.attributes.position, S = pts.userData.seed, N = Math.floor(P.count * Math.min(1, Pm))
      for (let i = 0; i < P.count; i++) {
        const F = fires[i % (fires.length || 1)]
        if (!F || i >= N) { P.setXYZ(i, 0, -999, 0); continue }
        const k = S[i], life = (t * (speed + k * speed) + k * 7) % 1
        P.setXYZ(i, F.p.x + Math.sin(k * 50 + t * 0.7) * spread * life * F.s, F.p.y + 0.6 + life * rise * F.s, F.p.z + Math.cos(k * 31 + t * 0.6) * spread * life * F.s)
      }
      P.needsUpdate = true
    }
    // ---- bursts
    const B = this.B, g = this.gravity ?? 12
    for (let i = 0; i < B.N; i++) {
      if (B.life[i] <= 0) { B.pos[i * 3 + 1] = -999; continue }
      B.life[i] -= dt; B.vel[i * 3 + 1] -= g * dt
      B.pos[i * 3] += B.vel[i * 3] * dt; B.pos[i * 3 + 1] += B.vel[i * 3 + 1] * dt; B.pos[i * 3 + 2] += B.vel[i * 3 + 2] * dt
      const f = Math.min(1, B.life[i] * 2.5); B.col[i * 3] *= 0.995; B.col[i * 3 + 1] *= 0.99
      if (f < 1) { B.col[i * 3] *= f; B.col[i * 3 + 1] *= f; B.col[i * 3 + 2] *= f }
    }
    this.burstPts.geometry.attributes.position.needsUpdate = true; this.burstPts.geometry.attributes.color.needsUpdate = true
    // ---- crystals
    let c = 0
    for (let i = this.crys.length - 1; i >= 0; i--) {
      const C = this.crys[i]; C.t += dt
      if (C.t > C.life) { this.crys.splice(i, 1); continue }
      const k = C.t / C.life, grow = Math.min(1, k * 5), fade = 1 - Math.max(0, (k - 0.6) / 0.4)
      e.set(C.tilt, C.a, 0); this.crystals.setMatrixAt(c++, m.compose(pv.copy(C.p).setY(C.p.y + C.h * 0.5 * grow), q.setFromEuler(e), sv.set(fade, C.h * grow * fade, fade)))
    }
    this.crystals.count = c; this.crystals.instanceMatrix.needsUpdate = true
    // ---- petals around the camera (+ bursts)
    const PA = this.petalAmount
    let pc = 0
    if (PA > 0.01) {
      const count = Math.floor(400 * PA * Pm)
      for (let i = 0; i < count; i++) {
        const s = this.petalSeed[i]
        s.y -= dt * (0.5 + s.s * 0.4); s.x += Math.sin(t * 0.6 + i) * dt * 0.7 + dt * 0.4; s.z += Math.cos(t * 0.5 + i * 1.3) * dt * 0.5
        if (s.y < -2) { s.y = 16; s.x = (Math.random() - 0.5) * 50; s.z = (Math.random() - 0.5) * 50 }
        e.set(t * s.s + i, t * 0.7 * s.s + i, 0)
        this.petals.setMatrixAt(pc++, m.compose(pv.set(cam.x + s.x, cam.y - 6 + s.y, cam.z + s.z), q.setFromEuler(e), sv.setScalar(s.s)))
      }
    }
    for (let i = this.petalBursts.length - 1; i >= 0; i--) {
      const s = this.petalBursts[i]; s.t += dt; s.v.y -= 4 * dt; s.v.multiplyScalar(0.985); s.p.addScaledVector(s.v, dt)
      if (s.t > 2.6 || pc >= 499) { this.petalBursts.splice(i, 1); continue }
      e.set(t * 3 + i, t * 2 + i, 0); this.petals.setMatrixAt(pc++, m.compose(s.p, q.setFromEuler(e), sv.setScalar(1.2 * (1 - s.t / 2.6))))
    }
    this.petals.count = pc; this.petals.instanceMatrix.needsUpdate = true
    // ---- fireflies
    if (this.fireflies.visible) {
      const a = this.fireflies.geometry.attributes.position
      for (let i = 0; i < a.count; i++) { const b = this.ffBase[i]; a.setXYZ(i, b[0] + Math.sin(t * 0.7 + i) * 0.9, b[1] + Math.sin(t * 1.3 + i * 2) * 0.45, b[2] + Math.cos(t * 0.5 + i) * 0.9) }
      a.needsUpdate = true
      this.fireflies.material.opacity = 0.6 + 0.4 * Math.sin(t * 3)
    }
    // ---- rain
    if (this.rain.visible) {
      const P = this.rain.geometry.attributes.position, R = this.rainSeed, N = Math.floor(R.length * this.rainOn * Math.min(1, Pm))
      for (let i = 0; i < R.length; i++) {
        if (i >= N) { P.setXYZ(i * 2, 0, -999, 0); P.setXYZ(i * 2 + 1, 0, -999, 0); continue }
        const r = R[i]; r[1] -= dt * 26 * r[3]; if (r[1] < -4) r[1] += 30
        const x = cam.x + r[0], y = cam.y - 6 + r[1], z = cam.z + r[2]
        P.setXYZ(i * 2, x, y, z); P.setXYZ(i * 2 + 1, x - 0.12, y - 0.85 * r[3], z + 0.05)
      }
      P.needsUpdate = true
    }
    this.markerGem.rotation.y += dt * 1.8
  }
}
