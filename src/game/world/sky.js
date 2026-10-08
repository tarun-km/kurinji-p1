import * as THREE from 'three'
import { Builder, rng, jitter, mat } from '../gfx/kit'
import { fbm } from './terrain'

/* ===========================================================================
   Sky dome, sun/moon, stars, faceted clouds, the distant snow-capped ring
   (26 peaks, 90–210 m, #5A6680, snow only on the highest ridges) and the
   sea of valley mist from the weather board.
=========================================================================== */

export class Sky {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group(); scene.add(this.group)
    this.U = {
      top: { value: new THREE.Color(0x5b7fb8) }, bottom: { value: new THREE.Color(0xf3b98a) }, sunDir: { value: new THREE.Vector3(0.6, 0.25, -0.4).normalize() },
      sunCol: { value: new THREE.Color(0xffc48a) }, sunSize: { value: 1 }, night: { value: 0 }, time: { value: 0 }, haze: { value: new THREE.Color(0xe8c3a8) },
    }
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.U,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top,bottom,sunCol,sunDir,haze; uniform float sunSize, night, time; varying vec3 vP;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
        void main(){
          float y = vP.y;
          float h = clamp(y * 1.25 + 0.12, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(h, 0.65));
          c = mix(c, haze, smoothstep(0.18, -0.02, y) * 0.65);           // horizon haze band
          vec3 sd = normalize(sunDir);
          float s = max(dot(vP, sd), 0.0);
          c += sunCol * (pow(s, 2400.0 / sunSize) * 6.0 + pow(s, 48.0) * 0.35 + pow(s, 6.0) * 0.18) * (1.0 - night * 0.6);
          // stars
          vec2 g = floor(vP.xz / max(vP.y, 0.05) * 160.0);
          float st = step(0.9965, h21(g)) * smoothstep(0.05, 0.3, y) * night * (0.6 + 0.4 * sin(time * 2.0 + h21(g + 7.0) * 30.0));
          c += vec3(st);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }))
    this.dome.frustumCulled = false; this.dome.renderOrder = -10
    this.group.add(this.dome)
    // moon
    this.moon = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 1), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false, toneMapped: false }))
    this.moon.visible = false; this.group.add(this.moon)
    this.buildMountains()
    this.buildClouds()
    this.buildMist()
  }

  /* ---------- distant faceted mountain ranges ---------- */
  buildMountains() {
    const b = new Builder(7), r = rng(11)
    const peak = (cx, cz, rad, h, snowLine, seed, base = -30) => {
      const g = new THREE.ConeGeometry(rad, h - base, 9, 5)
      g.translate(0, (h - base) / 2 + base, 0)
      const j = jitter(g, rad * 0.22, seed, true)
      const p = j.attributes.position
      for (let i = 0; i < p.count; i++) { // ridges: pull alternate verts in, sharpen
        const y = p.getY(i), x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x)
        const k = 1 + 0.18 * Math.sin(a * 3 + seed) + (fbm(x * 0.02 + seed, z * 0.02) - 0.5) * 0.3
        p.setXYZ(i, x * k, y, z * k)
      }
      b.add(j, (f, cy, pos, idx) => {
        const yy = (pos.getY(idx) + pos.getY(idx + 1) + pos.getY(idx + 2)) / 3
        const t = (yy - base) / (h - base)
        const c = new THREE.Color(0x4a5878).lerp(new THREE.Color(0x5a6680), t)
        if (yy > snowLine) c.lerp(new THREE.Color(0xf2f5fa), Math.min(1, (yy - snowLine) / 20 + 0.55))
        else if (t < 0.32) c.lerp(new THREE.Color(0x2f4a3a), 0.6 * (1 - t / 0.32))
        return c
      }, { at: [cx, 0, cz], grad: 0.15, jit: 0.1, m: 'far' })
    }
    // far ring: 26 grand peaks
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + r() * 0.12, R = 1080 + r() * 260
      const h = 260 + r() * 260, rad = 190 + r() * 150
      peak(Math.cos(a) * R, Math.sin(a) * R + 40, rad, h, h - 38 - r() * 26, i + 1)
    }
    // middle ridges (forested, snow only on a few)
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2 + r() * 0.1, R = 720 + r() * 160
      const h = 90 + r() * 110, rad = 90 + r() * 70
      peak(Math.cos(a) * R, Math.sin(a) * R + 40, rad, h, h > 170 ? h - 25 : 999, 100 + i)
    }
    const grp = b.build({ shadows: false, receive: false })
    // mountains fade into the sky colour with distance (aerial perspective)
    for (const m of grp.children) {
      const mtl = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false })
      mtl.onBeforeCompile = s => {
        s.uniforms.uHaze = this.U.haze; s.uniforms.uHazeAmt = this.hazeAmt ||= { value: 0.3 }
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDist;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvDist = length((modelMatrix * vec4(transformed,1.0)).xz);')
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHaze; uniform float uHazeAmt; varying float vDist;')
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(uHazeAmt * smoothstep(650.0, 1450.0, vDist) + uHazeAmt * 0.15, 0.0, 0.85));')
      }
      m.material = mtl
    }
    this.mountains = grp; this.group.add(grp)
  }

  /* ---------- faceted clouds ---------- */
  buildClouds() {
    const b = new Builder(5), r = rng(23)
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, R = 520 + r() * 600, y = 170 + r() * 150
      const cx = Math.cos(a) * R, cz = Math.sin(a) * R + 40, w = 26 + r() * 46
      const n = 4 + (r() * 5 | 0)
      for (let k = 0; k < n; k++) {
        const s = w * (0.35 + r() * 0.45)
        const g = jitter(new THREE.IcosahedronGeometry(s, 1), s * 0.25, i * 13 + k)
        g.scale(1.7, 0.38, 1)
        b.add(g, 0xffffff, { at: [cx + (r() - 0.5) * w * 1.6, y + (r() - 0.3) * s * 0.4, cz + (r() - 0.5) * w * 0.6], rot: [0, a, 0], jit: 0.05, grad: 0.35, m: 'cloud' })
      }
    }
    const grp = b.build({ shadows: false, receive: false })
    this.cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false, emissive: 0xffffff, emissiveIntensity: 0.35, transparent: true, opacity: 0.96 })
    for (const m of grp.children) m.material = this.cloudMat
    this.clouds = grp; this.group.add(grp)
  }

  /* ---------- sea of valley mist (layered, animated) ---------- */
  buildMist() {
    this.mistU = { time: { value: 0 }, col: { value: new THREE.Color(0xe8c3a8) }, amount: { value: 0.75 }, sun: { value: new THREE.Color(0xffc48a) }, sunDir: this.U.sunDir }
    const mk = (size, y, seed, alpha) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false,
        uniforms: { ...this.mistU, seed: { value: seed }, a: { value: alpha } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float time, seed, a, amount; uniform vec3 col, sun, sunDir; varying vec3 vW;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          float fb(vec2 p){ float s = 0., w = .5; for (int i = 0; i < 5; i++) { s += n(p) * w; p *= 2.1; w *= .5; } return s; }
          void main(){
            vec2 p = vW.xz * 0.012 + vec2(time * 0.012, time * 0.006) + seed;
            float m = fb(p) * 0.75 + fb(p * 2.7 - time * 0.02) * 0.4;
            m = smoothstep(0.45, 0.95, m) * (0.55 + 0.45 * fb(p * 0.35 + 7.0));
            float edge = 1.0 - smoothstep(500.0, 760.0, length(vW.xz - vec2(0.0, 40.0)));
            vec3 v = normalize(vW - cameraPosition);
            float sc = pow(max(dot(v, normalize(sunDir)), 0.0), 4.0);
            gl_FragColor = vec4(mix(col, sun, sc * 0.55) * (0.92 + m * 0.12), m * a * amount * edge);
          }`,
      }))
      m.rotation.x = -Math.PI / 2; m.position.set(0, y, 40); m.renderOrder = 2
      return m
    }
    this.mist = new THREE.Group()
    this.mist.add(mk(1600, 4, 0, 0.6), mk(1600, 11, 3.7, 0.38), mk(1600, 19, 8.1, 0.2))
    this.group.add(this.mist)
  }

  setPreset(P, dur, gsap) {
    const tw = (col, h) => { const t = new THREE.Color(h); dur ? gsap.to(col, { r: t.r, g: t.g, b: t.b, duration: dur }) : col.copy(t) }
    tw(this.U.top.value, P.top); tw(this.U.bottom.value, P.bottom); tw(this.U.sunCol.value, P.sun); tw(this.U.haze.value, P.haze ?? P.fog)
    tw(this.mistU.col.value, P.mist ?? P.fog); tw(this.mistU.sun.value, P.sun)
    tw(this.cloudMat.emissive, P.cloud ?? P.fog); tw(this.cloudMat.color, P.cloudLit ?? 0xffffff)
    const set = (o, k, v) => dur ? gsap.to(o, { [k]: v, duration: dur }) : (o[k] = v)
    set(this.U.night, 'value', P.night ? 1 : 0)
    set(this.U.sunSize, 'value', P.sunSize ?? 1)
    set(this.mistU.amount, 'value', P.mistAmt ?? 0.6)
    set(this.cloudMat, 'emissiveIntensity', P.cloudGlow ?? 0.35)
    if (this.hazeAmt) set(this.hazeAmt, 'value', P.hazeAmt ?? 0.3)
    this.moon.visible = !!P.night
  }
  update(dt, t, camPos) {
    this.U.time.value = t; this.mistU.time.value = t
    this.group.position.set(camPos.x * 0.0, 0, camPos.z * 0.0)
    this.dome.position.copy(camPos)
    this.clouds.rotation.y = t * 0.002
    if (this.moon.visible) this.moon.position.copy(camPos).addScaledVector(this.U.sunDir.value, 1200)
  }
}
