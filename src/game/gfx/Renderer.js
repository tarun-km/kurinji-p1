import * as THREE from 'three'
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect,
  SMAAEffect, SMAAPreset, DepthOfFieldEffect, NoiseEffect, BlendFunction, GodRaysEffect, ChromaticAberrationEffect, KernelSize,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import gsap from 'gsap'
import { settings, isMobile } from '../settings'
import { FOG, patchFog } from './chunks'
import { refreshSurfaces } from './surface'
import { kitMaterials, detailLevel } from './kit'
import { GradeEffect } from './grade'
import { GRADES } from '../world/lighting'

/* ===========================================================================
   Renderer: WebGL + postprocessing stack.

     RenderPass → N8AO ambient occlusion → sun shafts (god rays, high/ultra,
     only while the sun is on screen) → depth of field (cinematics) →
     [chromatic aberration (cinematics), bloom, ACES tone mapping, colour grade,
     vignette, film grain] → SMAA

   Height fog and the shadow fixes live in ./chunks.js (FOG and patchFog are
   re-exported here for older imports). Grades per lighting preset live in
   world/lighting.js.
=========================================================================== */
export { FOG, patchFog, GRADES }

const SHADOW = { off: 0, low: 1024, high: 2048, ultra: 4096 }
const SUN_DIST = 2400
const _dir = new THREE.Vector3(), _fwd = new THREE.Vector3(), _ndc = new THREE.Vector3()

export class Renderer {
  constructor(container, scene, camera) {
    this.scene = scene; this.camera = camera
    const r = this.gl = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false, stencil: false, depth: false })
    r.setSize(innerWidth, innerHeight)
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap
    r.toneMapping = THREE.NoToneMapping
    r.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(r.domElement)

    const composer = this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType })
    composer.addPass(new RenderPass(scene, camera))
    this.ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight)
    Object.assign(this.ao.configuration, { aoRadius: 2.0, distanceFalloff: 1.1, intensity: 2.4, color: new THREE.Color(0x1c1018), halfRes: true, depthAwareUpsampling: true })
    this.ao.setQualityMode('Medium')
    composer.addPass(this.ao)

    this.dof = new DepthOfFieldEffect(camera, { focusDistance: 8, focusRange: 7, bokehScale: 0, resolutionScale: 0.5 })
    this.dofPass = new EffectPass(camera, this.dof)
    composer.addPass(this.dofPass)

    this.smaa = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }))
    // The composer only ever sends the LAST pass in its list to the screen, even when that pass is
    // disabled. Anti-aliasing (the last pass) is off by default on phones, which left the canvas
    // black. We route the output ourselves to the last pass that actually runs.
    composer.autoRenderToScreen = false

    this.grade = { ...GRADES.dawn }
    this.shafts = { value: 0 }        // sun-shaft strength from the lighting preset
    this.ca = { value: 0 }            // chromatic aberration (cinematics only)
    this.dynScale = 1                 // adaptive resolution factor
    this.frameSum = 0; this.frameCount = 0; this.goodWindows = 0
    this.fps = 60
    this.cinematicDof = false
    this.buildMain(detailLevel() > 0)
    composer.addPass(this.smaa)
    this.onResize = () => this.resize(); addEventListener('resize', this.onResize)
    this.onContextLost = e => { e.preventDefault(); this.contextLost = true }
    this.onContextRestored = () => { this.contextLost = false; this.apply(); this.warm().catch(e => console.warn('Shader warmup failed', e)) }
    r.domElement.addEventListener('webglcontextlost', this.onContextLost)
    r.domElement.addEventListener('webglcontextrestored', this.onContextRestored)
    this.apply()
  }

  /** (Re)build the merged grading pass. 'low' skips the cinematic chromatic aberration. */
  buildMain(cinematicFx) {
    const composer = this.composer, old = this.mainPass
    this.bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.7, luminanceThreshold: 0.72, luminanceSmoothing: 0.28, radius: 0.74 })
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    this.gradeFx = new GradeEffect()
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: 0.45 })
    this.grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true }); this.grain.blendMode.opacity.value = 0.045
    this.caFx = cinematicFx ? new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.2 }) : null
    const effects = [this.caFx, this.bloom, this.tone, this.gradeFx, this.vignette, this.grain].filter(Boolean)
    this.mainPass = new EffectPass(this.camera, ...effects)
    this.cinematicFx = cinematicFx
    if (old) {
      const i = composer.passes.indexOf(old)
      composer.removePass(old); old.dispose()
      composer.addPass(this.mainPass, i)
    } else composer.addPass(this.mainPass)
    this.pushGrade?.()
  }

  /** Apply graphics settings (call whenever settings change). */
  apply() {
    const s = settings, lvl = detailLevel()
    const maxDpr = isMobile ? 1.25 : s.preset === 'ultra' ? 2 : 1.5
    const budget = s.preset === 'low' ? 1100000 : s.preset === 'ultra' ? 5000000 : 2600000
    this.baseRatio = Math.min(devicePixelRatio * s.renderScale, maxDpr, Math.sqrt(budget / (innerWidth * innerHeight)))
    this.gl.shadowMap.enabled = s.shadows !== 'off'
    this.shadowSize = SHADOW[s.shadows] || 0
    if ((lvl > 0) !== this.cinematicFx) this.buildMain(lvl > 0)
    this.ao.enabled = s.ao
    if (this.aoFull !== (lvl >= 3)) { this.aoFull = lvl >= 3; this.ao.configuration.halfRes = !this.aoFull }
    this.bloom.blendMode.opacity.value = s.bloom ? 1 : 0
    this.bloom.resolution.scale = s.preset === 'low' ? 0.25 : 0.5
    this.smaa.enabled = s.aa
    this.raysAllowed = lvl >= 2 && s.bloom
    if (this.rays) this.rays.resolution.scale = lvl >= 3 ? 0.6 : 0.45
    this.updateDof()
    refreshSurfaces(this.scene, kitMaterials())
    this.routeOutput()
    this.onShadowSize?.(this.shadowSize)
    this.resize()
  }
  /** Draw to the screen from the last enabled pass (see the note where the passes are added). */
  routeOutput() {
    let last = null
    for (const pass of this.composer.passes) { pass.renderToScreen = false; if (pass.enabled) last = pass }
    if (last) last.renderToScreen = true
  }
  resize() {
    if (this.disposed) return
    const ratio = Math.max(0.35, this.baseRatio * this.dynScale)
    this.gl.setPixelRatio(ratio)
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix()
    this.gl.setSize(innerWidth, innerHeight)
    this.composer.setSize(innerWidth, innerHeight)
    this.ao.setSize?.(innerWidth * ratio, innerHeight * ratio)
  }

  /**
   * Sun shafts: give the renderer a light-source mesh (world/lighting.js createSunDisc).
   * It is kept out of the scene graph and placed on the sun direction (FOG.uFogSunDir)
   * every frame; the shafts only run on high/ultra while the sun is near the frame.
   */
  setSun(mesh) {
    if (this.sunMesh === mesh) return
    mesh?.removeFromParent()
    this.sunMesh = mesh
    if (!mesh) { if (this.raysPass) this.raysPass.enabled = false; return }
    if (!this.rays) {
      this.rays = new GodRaysEffect(this.camera, mesh, {
        blendFunction: BlendFunction.SCREEN, samples: 48, density: 0.95, decay: 0.925, weight: 0.38, exposure: 0.62,
        clampMax: 0.9, resolutionScale: detailLevel() >= 3 ? 0.6 : 0.45, kernelSize: KernelSize.SMALL, blur: true,
      })
      this.raysPass = new EffectPass(this.camera, this.rays)
      this.raysPass.enabled = false
      this.composer.addPass(this.raysPass, this.composer.passes.indexOf(this.ao) + 1)
      this.routeOutput()
    } else this.rays.lightSource = mesh
  }
  /** Sun-shaft strength (0..1) for the current lighting preset. */
  setShafts(v, dur = 2) {
    gsap.killTweensOf(this.shafts)
    if (dur) gsap.to(this.shafts, { value: v, duration: dur }); else this.shafts.value = v
  }
  updateSun() {
    const m = this.sunMesh, pass = this.raysPass
    if (!m || !pass) return
    const cam = this.camera
    cam.updateMatrixWorld()
    _dir.copy(FOG.uFogSunDir.value).normalize()
    m.position.copy(cam.position).addScaledVector(_dir, SUN_DIST)
    m.scale.setScalar(SUN_DIST * 0.03)
    m.updateMatrix(); m.updateMatrixWorld()
    m.material.color.copy(FOG.uFogSunCol.value).multiplyScalar(1.25)
    const facing = _dir.dot(cam.getWorldDirection(_fwd))
    _ndc.copy(m.position).project(cam)
    const onScreen = facing > 0.1 && Math.abs(_ndc.x) < 1.5 && Math.abs(_ndc.y) < 1.5
    const above = THREE.MathUtils.smoothstep(_dir.y, -0.04, 0.08)
    const k = this.shafts.value * above * THREE.MathUtils.smoothstep(facing, 0.3, 0.8)
    this.rays.blendMode.opacity.value = k
    pass.enabled = !!this.raysAllowed && onScreen && k > 0.01
  }

  /** Cinematic depth of field: focus on a world point (or null to disable). */
  focus(target, bokeh = 3) {
    this.cinematicDof = !!target
    if (target) this.dof.target = target
    this.dofBokeh = bokeh
    this.updateDof()
    // a breath of lens fringing on cinematic shots only
    gsap.to(this.ca, { value: target && this.caFx ? (this.grade.ca ?? 0.0012) : 0, duration: target ? 0.8 : 0.4, overwrite: true })
  }
  updateDof() {
    const on = settings.dof && this.cinematicDof
    this.dofPass.enabled = on
    this.dof.bokehScale = on ? (this.dofBokeh ?? 3) : 0
  }

  setGrade(name, dur = 2) {
    const g = GRADES[name] || GRADES.day
    gsap.killTweensOf(this.grade)
    if (!dur) { Object.assign(this.grade, g); this.pushGrade(); return }
    gsap.to(this.grade, { ...g, duration: dur, onUpdate: () => this.pushGrade() })
  }
  pushGrade() {
    const g = this.grade
    if (!this.gradeFx) return
    this.gl.toneMappingExposure = g.exposure
    this.gradeFx.set(g)
    this.vignette.darkness = g.vignette
    this.bloom.intensity = g.bloom * (this.bloomBoost ?? 1)
    this.bloom.luminanceMaterial.threshold = g.thr
  }

  render(dt) {
    if (this.contextLost || this.disposed) return
    this.updateSun()
    if (this.caFx) { const c = this.ca.value; this.caFx.offset.set(c, c * 0.6) }
    this.updateStats()
    const st = this.stats
    st?.begin()
    this.composer.render(dt)
    st?.end(); st?.update()
    // adaptive resolution: keep ~50+ fps by trading pixels
    this.frameSum += Math.min(0.25, dt); this.frameCount++
    if (this.frameCount >= 90) {
      const avg = this.frameSum / this.frameCount
      this.frameSum = 0; this.frameCount = 0
      this.fps = Math.round(1 / Math.max(avg, 1e-3))
      if (settings.adaptive) {
        const prev = this.dynScale
        // phones aim for a steady 30+, desktops for 50+
        const [lo, hi] = isMobile ? [30, 50] : [45, 58]
        if (this.fps < lo) { this.dynScale = Math.max(0.5, this.dynScale - 0.08); this.goodWindows = 0 }
        else if (this.fps > hi) { if (++this.goodWindows >= 3) { this.dynScale = Math.min(1, this.dynScale + 0.04); this.goodWindows = 0 } }
        else this.goodWindows = 0
        if (prev !== this.dynScale) this.resize()
      } else if (this.dynScale !== 1) { this.dynScale = 1; this.resize() }
    }
  }
  /** stats-gl panel (FPS, CPU ms, GPU ms) while settings.showFps is on; loaded on demand. */
  updateStats() {
    if (settings.showFps) {
      if (this.stats || this.statsLoading) return
      this.statsLoading = true
      import('stats-gl').then(({ default: Stats }) => {
        this.statsLoading = false
        if (this.disposed || !settings.showFps || this.stats) return
        const st = new Stats({ trackGPU: true, logsPerSecond: 4, graphsPerSecond: 20, samplesLog: 40, samplesGraph: 10, precision: 1, horizontal: true })
        st.init(this.gl.getContext())
        Object.assign(st.dom.style, { position: 'fixed', left: '8px', top: 'auto', bottom: '8px', zIndex: '9000', pointerEvents: 'none', opacity: '0.92' })
        document.body.appendChild(st.dom)
        this.stats = st
      }).catch(e => { this.statsLoading = false; console.warn('stats-gl unavailable', e) })
    } else if (this.stats) this.disposeStats()
  }
  disposeStats() { this.stats?.dom.remove(); try { this.stats?.dispose?.() } catch {} this.stats = null }

  /** Compile every material in the scene ahead of time (no hitches when new things appear). */
  async warm() {
    if (this.disposed || this.contextLost) return
    const visibility = [], culling = []
    this.scene.traverse(o => { if (!o.visible) { visibility.push(o); o.visible = true } if (o.isMesh || o.isPoints) { culling.push([o, o.frustumCulled]); o.frustumCulled = false } })
    const target = new THREE.WebGLRenderTarget(32, 32)
    const previous = this.gl.getRenderTarget()
    try {
      await this.gl.compileAsync(this.scene, this.camera)
      // Compile alone does not upload vertex buffers or initialize shadow maps.
      this.gl.setRenderTarget(target); this.gl.render(this.scene, this.camera)
    } finally {
      this.gl.setRenderTarget(previous); target.dispose()
      for (const o of visibility) o.visible = false
      for (const [o, enabled] of culling) o.frustumCulled = enabled
    }
    // also compile the passes that only switch on later (sun shafts, cinematic depth of field)
    const later = [[this.raysPass, this.raysAllowed], [this.dofPass, settings.dof]].filter(([p, ok]) => p && ok && !p.enabled).map(([p]) => p)
    for (const p of later) p.enabled = true
    try { this.composer.render(0) } finally { for (const p of later) p.enabled = false }
    this.updateDof()
    this.frameSum = 0; this.frameCount = 0
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; removeEventListener('resize', this.onResize)
    this.disposeStats()
    this.gl.domElement.removeEventListener('webglcontextlost', this.onContextLost)
    this.gl.domElement.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.sunMesh?.geometry.dispose(); this.sunMesh?.material.dispose()
    this.composer.dispose(); this.gl.dispose(); this.gl.forceContextLoss(); this.gl.domElement.remove()
  }
}
