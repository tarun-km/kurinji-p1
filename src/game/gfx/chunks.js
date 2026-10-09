import * as THREE from 'three'

/* ---------------------------------------------------------------------------
   Global shader-chunk patches shared by every built-in material.

   1. Height fog: distance fog + valley mist pooling at low altitude + a warm
      scatter toward the sun. One shared uniform set drives the whole scene.
   2. Shadow receiver fixes (the "moiré" on cloth):
      - the normal offset always points TOWARD the light, so double-sided cloth,
        leaves and flipped faces no longer sample their own depth (acne);
      - PCF uses a smooth 3x3 tent of hardware-filtered taps instead of the
        per-pixel IGN-rotated Vogel disk, whose diagonal dither read as stripes.
--------------------------------------------------------------------------- */
export const FOG = {
  uFogH: { value: new THREE.Vector4(20, 0.08, 0.35, 0.6) }, // base height, falloff, amount, sun scatter
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },        // world direction TOWARD the sun
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

/* ---------- shadow receiver: normal offset toward the light ---------- */
{
  const from = 'shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );'
  // Row 2 of the shadow matrix is the depth gradient: it points AWAY from the light.
  const to = `{
			vec3 shDepthDir = vec3( directionalShadowMatrix[ i ][ 0 ][ 2 ], directionalShadowMatrix[ i ][ 1 ][ 2 ], directionalShadowMatrix[ i ][ 2 ][ 2 ] );
			float shSide = dot( shadowWorldNormal, shDepthDir ) > 0.0 ? - 1.0 : 1.0;
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * ( shSide * directionalLightShadows[ i ].shadowNormalBias ), 0 );
			}`
  if (C.shadowmap_vertex.includes(from)) C.shadowmap_vertex = C.shadowmap_vertex.replace(from, to)
  else console.warn('[gfx] shadowmap_vertex layout changed; normal-offset fix skipped')
}

/* ---------- shadow receiver: smooth 3x3 tent PCF (directional + spot) ---------- */
{
  const src = C.shadowmap_pars_fragment
  const start = src.indexOf('// Use IGN to rotate sampling pattern per pixel')
  const end = start < 0 ? -1 : src.indexOf(') * 0.2;', start)
  if (start >= 0 && end > start && src.lastIndexOf('getShadow( sampler2DShadow', start) >= 0 && src.indexOf('getPointShadow', 0) > end) {
    const tent = `// smooth 3x3 tent of hardware-filtered taps (no per-pixel dither)
				vec2 shR = texelSize * max( shadowRadius, 1.0 );
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vec2( - 1.0, - 1.0 ) * shR, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vec2( 1.0, - 1.0 ) * shR, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vec2( - 1.0, 1.0 ) * shR, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vec2( 1.0, 1.0 ) * shR, shadowCoord.z ) ) +
					2.0 * (
						texture( shadowMap, vec3( shadowCoord.xy + vec2( 0.0, - 1.0 ) * shR, shadowCoord.z ) ) +
						texture( shadowMap, vec3( shadowCoord.xy + vec2( 0.0, 1.0 ) * shR, shadowCoord.z ) ) +
						texture( shadowMap, vec3( shadowCoord.xy + vec2( - 1.0, 0.0 ) * shR, shadowCoord.z ) ) +
						texture( shadowMap, vec3( shadowCoord.xy + vec2( 1.0, 0.0 ) * shR, shadowCoord.z ) )
					) +
					4.0 * texture( shadowMap, vec3( shadowCoord.xy, shadowCoord.z ) )
				) * ( 1.0 / 16.0 );
				radius += 0.0;`
    C.shadowmap_pars_fragment = src.slice(0, start) + tent + src.slice(end + ') * 0.2;'.length)
  } else console.warn('[gfx] shadowmap_pars_fragment layout changed; PCF tent filter skipped')
}
