import * as THREE from 'three'
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect,
  HueSaturationEffect, BrightnessContrastEffect, SMAAEffect, SMAAPreset, DepthOfFieldEffect, NoiseEffect, BlendFunction,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import gsap from 'gsap'
import { settings, isMobile } from '../settings'

/* ---------------------------------------------------------------------------
   Height fog: every built-in material gets distance fog + valley mist that
   pools at low altitude + a warm scatter toward the sun. One shared uniform
   set drives the whole scene.
--------------------------------------------------------------------------- */
export const FOG = {
  uFogH: { value: new THREE.Vector4(20, 0.08, 0.35, 0.6) }, // base height, falloff, amount, sun scatter
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
}
const C = THREE.ShaderChunk
C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth; varying vec3 vFogWorld;
#endif`
C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 fogWp = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    fogWp = batchingMatrix * fogWp;
  #endif
  #ifdef USE_INSTANCING
    fogWp = instanceMatrix * fogWp;
  #endif
  vFogWorld = ( modelMatrix * fogWp ).xyz;
#endif`
C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld;
  uniform vec4 uFogH; uniform vec3 uFogSunDir; uniform vec3 uFogSunCol;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`
C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float fogLow = exp( - max( vFogWorld.y - uFogH.x, 0.0 ) * uFogH.y );
  fogFactor = clamp( fogFactor + uFogH.z * fogLow * ( 1.0 - exp( - vFogDepth * 0.012 ) ), 0.0, 1.0 );
  vec3 fogView = normalize( vFogWorld - cameraPosition );
  float fogSun = pow( max( dot( fogView, uFogSunDir ), 0.0 ), 5.0 ) * uFogH.w;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uFogSunCol, clamp( fogSun, 0.0, 1.0 ) ), fogFactor );
#endif`

/** Attach the shared fog uniforms to a compiled shader (call from custom onBeforeCompile hooks too). */
export function patchFog(shader) {
  if (shader.uniforms.fogColor) Object.assign(shader.uniforms, FOG)
}
const baseHook = THREE.Material.prototype.onBeforeCompile
THREE.Material.prototype.onBeforeCompile = function (shader, r) { patchFog(shader); baseHook.call(this, shader, r) }

/* Colour grade per lighting preset (matches the lighting boards). */
export const GRADES = {
  dawn:   { exposure: 1.05, sat: 0.18, contrast: 0.06, bright: 0.0,  vignette: 0.45, bloom: 0.7, thr: 0.72 },
  day:    { exposure: 1.0,  sat: 0.16, contrast: 0.08, bright: 0.0,  vignette: 0.35, bloom: 0.5, thr: 0.8 },
  dusk:   { exposure: 1.08, sat: 0.22, contrast: 0.08, bright: 0.0,  vignette: 0.5,  bloom: 0.85, thr: 0.68 },
  night:  { exposure: 1.25, sat: 0.05, contrast: 0.1,  bright: 0.02, vignette: 0.6,  bloom: 1.1, thr: 0.55 },
  memory: { exposure: 1.1,  sat: 0.2,  contrast: 0.14, bright: 0.0,  vignette: 0.7,  bloom: 1.1, thr: 0.6 },
  storm:  { exposure: 1.1,  sat: -0.05, contrast: 0.12, bright: 0.0, vignette: 0.6,  bloom: 0.8, thr: 0.62 },
  bloom:  { exposure: 1.06, sat: 0.24, contrast: 0.05, bright: 0.01, vignette: 0.4,  bloom: 0.95, thr: 0.62 },
  white:  { exposure: 1.2,  sat: 0.0,  contrast: 0.0,  bright: 0.05, vignette: 0.2,  bloom: 1.2, thr: 0.6 },
}

const SHADOW = { off: 0, low: 1024, high: 2048, ultra: 4096 }

export class Renderer {
  constructor(container, scene, camera) {
    this.scene = scene; this.camera = camera
    const r = this.gl = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false, stencil: false, depth: false })
    r.setSize(innerWidth, innerHeight)
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap
    r.toneMapping = THREE.NoToneMapping
    r.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(r.domElement)

    const composer = this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType })
    composer.addPass(new RenderPass(scene, camera))
    this.ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight)
    Object.assign(this.ao.configuration, { aoRadius: 2.2, distanceFalloff: 1.2, intensity: 2.6, color: new THREE.Color(0x1a1020), halfRes: true, depthAwareUpsampling: true })
    this.ao.setQualityMode('Medium')
    composer.addPass(this.ao)

    this.dof = new DepthOfFieldEffect(camera, { focusDistance: 8, focusRange: 7, bokehScale: 0, resolutionScale: 0.5 })
    this.dofPass = new EffectPass(camera, this.dof)
    composer.addPass(this.dofPass)

    this.bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.7, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, radius: 0.72 })
    this.hue = new HueSaturationEffect({ saturation: 0.15 })
    this.bc = new BrightnessContrastEffect({ contrast: 0.06 })
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.45 })
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX })
    this.grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true }); this.grain.blendMode.opacity.value = 0.05
    composer.addPass(new EffectPass(camera, this.bloom, this.tone, this.hue, this.bc, this.vignette, this.grain))
    this.smaa = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }))
    composer.addPass(this.smaa)

    this.grade = { ...GRADES.dawn }
    this.dynScale = 1        // adaptive resolution factor
    this.frameTimes = []
    this.fps = 60
    this.cinematicDof = false
    addEventListener('resize', () => this.resize())
    this.apply()
  }

  /** Apply graphics settings (call whenever settings change). */
  apply() {
    const s = settings
    const maxDpr = isMobile ? 2 : 2.5
    this.baseRatio = Math.min(devicePixelRatio * s.renderScale, maxDpr)
    this.gl.shadowMap.enabled = s.shadows !== 'off'
    this.shadowSize = SHADOW[s.shadows] || 0
    this.ao.enabled = s.ao
    this.bloom.blendMode.opacity.value = s.bloom ? 1 : 0
    this.smaa.enabled = s.aa
    this.updateDof()
    this.onShadowSize?.(this.shadowSize)
    this.resize()
  }
  resize() {
    const ratio = Math.max(0.5, this.baseRatio * this.dynScale)
    this.gl.setPixelRatio(ratio)
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix()
    this.gl.setSize(innerWidth, innerHeight)
    this.composer.setSize(innerWidth, innerHeight)
    this.ao.setSize?.(innerWidth * ratio, innerHeight * ratio)
  }

  /** Cinematic depth of field: focus on a world point (or null to disable). */
  focus(target, bokeh = 3) {
    this.cinematicDof = !!target
    if (target) this.dof.target = target
    this.dofBokeh = bokeh
    this.updateDof()
  }
  updateDof() {
    const on = settings.dof && this.cinematicDof
    this.dofPass.enabled = on
    this.dof.bokehScale = on ? (this.dofBokeh ?? 3) : 0
  }

  setGrade(name, dur = 2) {
    const g = GRADES[name] || GRADES.day
    gsap.to(this.grade, { ...g, duration: dur, onUpdate: () => this.pushGrade() })
    if (!dur) { Object.assign(this.grade, g); this.pushGrade() }
  }
  pushGrade() {
    const g = this.grade
    this.gl.toneMappingExposure = g.exposure
    this.hue.saturation = g.sat
    this.bc.contrast = g.contrast; this.bc.brightness = g.bright
    this.vignette.darkness = g.vignette
    this.bloom.intensity = g.bloom * (this.bloomBoost ?? 1)
    this.bloom.luminanceMaterial.threshold = g.thr
  }

  render(dt) {
    this.composer.render(dt)
    // adaptive resolution: keep ~50+ fps by trading pixels
    this.frameTimes.push(dt)
    if (this.frameTimes.length >= 45) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
      this.frameTimes.length = 0
      this.fps = Math.round(1 / Math.max(avg, 1e-3))
      if (settings.adaptive) {
        const prev = this.dynScale
        if (this.fps < 42) this.dynScale = Math.max(0.6, this.dynScale - 0.1)
        else if (this.fps > 57) this.dynScale = Math.min(1, this.dynScale + 0.05)
        if (prev !== this.dynScale) this.resize()
      } else if (this.dynScale !== 1) { this.dynScale = 1; this.resize() }
    }
  }
  /** Compile every material in the scene ahead of time (no hitches when new things appear). */
  async warm() {
    try { await this.gl.compileAsync(this.scene, this.camera) } catch { this.gl.compile(this.scene, this.camera) }
  }
}
