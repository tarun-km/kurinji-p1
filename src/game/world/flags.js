import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WIND, tf, rng } from '../gfx/kit'
import { patchFog } from '../gfx/Renderer'

/* ===========================================================================
   Cloth that moves: pole flags, hanging banners, prayer-flag strings and
   bunting. Every flag in the world is merged into ONE mesh; each vertex
   carries (kind, phase, distance-from-anchor) so a single vertex shader
   ripples them in the shared wind (WIND.uTime / uWind, gusting).
     kind 0 = flag on a pole (anchored along its left edge)
     kind 1 = hanging banner (anchored along its top edge, heavy)
     kind 2 = light flag on a string (anchored at the top, flutters)
=========================================================================== */
const PRAYER = [0x2a5ad0, 0xf2efe6, 0xc8282a, 0x2f8a3a, 0xe8b820]

export class Flags {
  constructor(scene) { this.scene = scene; this.parts = []; this.r = rng(77) }

  /** One flag. at = anchor point (pole top / bar centre), rotY = facing, w × h metres. */
  add(at, rotY, w, h, color, kind = 0, { emblem = null, trim = null } = {}) {
    const g = new THREE.PlaneGeometry(w, h, Math.max(2, Math.round(w * 7)), Math.max(1, Math.round(h * 3)))
    if (kind === 0) g.translate(w / 2, -h / 2, 0); else g.translate(0, -h / 2, 0)
    const n = g.attributes.position.count, uv = g.attributes.uv, col = new Float32Array(n * 3), F = new Float32Array(n * 3)
    const base = new THREE.Color(color), em = emblem != null ? new THREE.Color(emblem) : null, tr = trim != null ? new THREE.Color(trim) : null
    const ph = this.r() * 6.28, c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      const u = uv.getX(i), v = uv.getY(i)
      c.copy(base).multiplyScalar(0.92 + 0.08 * v)
      if (tr && (v < 0.08 || (kind !== 0 && (u < 0.06 || u > 0.94)))) c.copy(tr)
      if (em) { const du = (u - 0.5) * w, dv = (v - (kind === 1 ? 0.62 : 0.5)) * h, rr = Math.min(w, h) * 0.22; if (du * du + dv * dv < rr * rr) c.copy(em) }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
      F[i * 3] = kind; F[i * 3 + 1] = ph; F[i * 3 + 2] = kind === 0 ? u * w : (1 - v) * h
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aFlag', new THREE.BufferAttribute(F, 3))
    g.applyMatrix4(tf(at, [0, rotY, 0], 1))
    this.parts.push(g)
    return this
  }
  /** A pole with a flag on top (the pole itself is drawn by the caller's Builder). */
  pole(b, at, rotY, height, w, h, color, opts) {
    b.add(new THREE.CylinderGeometry(0.045, 0.06, height, 6), 0x4a3424, { at: [at[0], at[1] + height / 2, at[2]], m: 'wood' })
    b.add(new THREE.SphereGeometry(0.08, 6, 4), 0xc9a24a, { at: [at[0], at[1] + height + 0.05, at[2]], m: 'gold' })
    return this.add([at[0], at[1] + height - 0.05, at[2]], rotY, w, h, color, 0, opts)
  }
  /** A string of small flags sagging between two points (prayer flags / festival bunting). */
  string(b, a, c, { n = null, colors = PRAYER, size = [0.34, 0.42], sag = 0.5 } = {}) {
    const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c), L = A.distanceTo(C)
    const count = n ?? Math.max(3, Math.floor(L / (size[0] + 0.1)))
    const rot = Math.atan2(C.x - A.x, C.z - A.z) - Math.PI / 2
    const pts = []
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(A.clone().lerp(C, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0))) }
    // the cord: thin segments
    for (let i = 0; i < 16; i++) { const p = pts[i], q = pts[i + 1], m = p.clone().add(q).multiplyScalar(0.5), len = p.distanceTo(q); const geo = new THREE.CylinderGeometry(0.008, 0.008, len, 3); const qt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize()); b.add(geo, 0xd8ccb0, { matrix: new THREE.Matrix4().compose(m, qt, new THREE.Vector3(1, 1, 1)) }) }
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count, p = A.clone().lerp(C, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t) - 0.02, 0))
      this.add(p.toArray(), rot, size[0], size[1], colors[i % colors.length], 2)
    }
    return this
  }
  build() {
    if (!this.parts.length) return null
    const geo = mergeGeometries(this.parts, false); this.parts = []
    geo.computeVertexNormals()
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.88 })
    m.onBeforeCompile = shader => {
      patchFog(shader)
      Object.assign(shader.uniforms, WIND)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aFlag; uniform float uTime; uniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float kind = aFlag.x, ph = aFlag.y, d = aFlag.z;
          float spd = kind < 0.5 ? 3.4 : kind < 1.5 ? 1.7 : 5.2;
          float amp = (kind < 0.5 ? 0.16 : kind < 1.5 ? 0.06 : 0.09) * d / (1.0 + d * 0.25);
          float gust = 0.75 + 0.25 * sin(uTime * 0.37 + ph);
          float w = sin(uTime * spd - d * 2.4 + ph) * amp * gust * uWind;
          transformed += objectNormal * w;
          if (kind > 0.5) transformed.y += sin(uTime * spd * 0.7 + ph + d) * 0.012 * d;`)
    }
    m.customProgramCacheKey = () => 'flags'
    const mesh = new THREE.Mesh(geo, m)
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'flags'
    mesh.frustumCulled = false
    this.scene.add(mesh)
    return mesh
  }
}
