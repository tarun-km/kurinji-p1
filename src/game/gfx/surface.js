import * as THREE from 'three'
import { patchFog } from './chunks'
import { detailLevel } from './detail'

/* ===========================================================================
   Procedural surfaces without UVs.

   Every kit material gets a painterly "texture" computed in the fragment shader
   from the OBJECT-space position (pre-skinning, pre-instance; metres), so skinned
   characters and instanced foliage never swim. Builder geometry is merged in
   world space, so for buildings and props object space == world metres.

   Recipes (material keys): stone, plaster, wood, tile, cloth, metal, iron, gold,
   brass, skin, leaf, tree, grass, std. Every recipe:
     - keeps flat shading (the faceted planes are the style),
     - fades each noise octave out before it gets smaller than ~2 px (no moiré),
     - reads the Builder's `aEdge` attribute (if present) for worn convex edges and
       grimy concave creases,
     - reacts to global wetness (storm) and moss amount.
   detailLevel 0 compiles a cheap path (one noise tap, no edges); 1 two octaves;
   2–3 the full recipe.

   Exports:
     SURF                     shared uniforms ({ uSurfWet, uSurfMoss })
     surfaceHook(key, opts)   onBeforeCompile hook (chains fog; opts.wind = sway)
     applySurface(material, key, opts)   add a recipe to ANY standard material
                                         (chains its existing hook + cache key)
     refreshSurfaces(scene)   recompile after the detail level changed
=========================================================================== */

export const SURF = {
  uSurfWet: { value: 0 },    // 0 dry … 1 soaked (storm)
  uSurfMoss: { value: 1 },   // global moss multiplier
}

/** Recipe table: define name, edge attribute use, porosity (how much water darkens it), lighting model. */
export const RECIPES = {
  std:     { def: 'STD',     edge: true,  porous: 0.30 },
  stone:   { def: 'STONE',   edge: true,  porous: 0.42 },
  plaster: { def: 'PLASTER', edge: true,  porous: 0.36 },
  wood:    { def: 'WOOD',    edge: true,  porous: 0.40, grain: true },
  tile:    { def: 'TILE',    edge: true,  porous: 0.32 },
  cloth:   { def: 'CLOTH',   edge: false, porous: 0.38 },
  metal:   { def: 'METAL',   edge: true,  porous: 0.0 },
  iron:    { def: 'IRON',    edge: true,  porous: 0.0 },
  gold:    { def: 'GOLD',    edge: true,  porous: 0.0 },
  brass:   { def: 'GOLD',    edge: true,  porous: 0.0 },
  skin:    { def: 'SKIN',    edge: false, porous: 0.0, light: 'skin' },
  leaf:    { def: 'FOLIAGE', edge: false, porous: 0.15, light: 'leaf' },
  tree:    { def: 'FOLIAGE', edge: false, porous: 0.15, light: 'leaf' },
  grass:   { def: 'FOLIAGE', edge: false, porous: 0.15, light: 'leaf' },
  bark:    { def: 'WOOD',    edge: true,  porous: 0.40, grain: true },
}
/** Material keys whose Builder geometry carries the aEdge attribute. */
export const EDGE_KEYS = new Set(Object.keys(RECIPES).filter(k => RECIPES[k].edge))

/* ----------------------------- GLSL library ----------------------------- */
const LIB = /* glsl */`
float sHash( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float sNoise( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p ); vec3 u = f * f * ( 3.0 - 2.0 * f );
  float a = sHash( i ), b = sHash( i + vec3( 1.0, 0.0, 0.0 ) ), c = sHash( i + vec3( 0.0, 1.0, 0.0 ) ), d = sHash( i + vec3( 1.0, 1.0, 0.0 ) );
  float e = sHash( i + vec3( 0.0, 0.0, 1.0 ) ), f1 = sHash( i + vec3( 1.0, 0.0, 1.0 ) ), g = sHash( i + vec3( 0.0, 1.0, 1.0 ) ), h = sHash( i + vec3( 1.0, 1.0, 1.0 ) );
  return mix( mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ), mix( mix( e, f1, u.x ), mix( g, h, u.x ), u.y ), u.z );
}
// 1 when a feature of this frequency (cycles per metre) spans >= ~5 px, 0 below ~2 px
float sFade( float fw, float freq ) { return 1.0 - smoothstep( 0.2, 0.5, fw * freq ); }
// LOD-faded fbm, mean 0.5, range ~0..1. fw = metres per pixel, freq = base cycles per metre.
float sFbm( vec3 p, float fw, float freq ) {
  float s = 0.0, a = 0.5, fr = freq, n = 0.0;
  for ( int i = 0; i < SURF_OCT; i ++ ) {
    s += a * mix( 0.5, sNoise( p * fr ), sFade( fw, fr ) ); n += a;
    fr *= 2.07; a *= 0.5; p += 17.31;
  }
  return s / n;
}
// triplanar sampling of a 2D pattern with object-space normal weights
#define S_TRIPLANAR( FN, P, N, K ) ( ( N ).x * FN( ( P ).yz * ( K ) ) + ( N ).y * FN( ( P ).zx * ( K ) ) + ( N ).z * FN( ( P ).xy * ( K ) ) )
vec3 sTriW( vec3 n ) { vec3 w = pow( abs( n ), vec3( 4.0 ) ); return w / max( w.x + w.y + w.z, 1e-4 ); }
float sWeave( vec2 uv ) {
  vec2 s = sin( uv );
  float over = step( 0.0, sin( uv.x * 0.5 ) * sin( uv.y * 0.5 ) );
  return mix( abs( s.x ), abs( s.y ), over );
}
float sLuma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
vec3 sSat( vec3 c, float s ) { return mix( vec3( sLuma( c ) ), c, s ); }
`

/* Fragment body: runs after the material has resolved diffuse / roughness / metalness / normal. */
const FRAG = /* glsl */`
{
  vec3 sP = vSurfP;
  float sFw = max( length( fwidth( sP ) ), 1e-5 );
  vec3 sNw = normalize( inverseTransformDirection( normal, viewMatrix ) );   // world normal (faces the viewer)
  vec3 sAlb = diffuseColor.rgb;
  float sRough = roughnessFactor, sMetal = metalnessFactor;
  float sEdgeC = 0.0, sEdgeK = 0.0;                                         // convex / concave edge masks

  #if defined( SURF_EDGE ) && SURF_LVL > 0
  {
    vec3 ev = vSurfEdge * 16.0;
    float dC = 1e3, dK = 1e3;
    if ( ev.x > 0.004 ) { if ( ev.x < 8.125 ) dC = min( dC, 8.0 - ev.x ); else dK = min( dK, ev.x - 8.25 ); }
    if ( ev.y > 0.004 ) { if ( ev.y < 8.125 ) dC = min( dC, 8.0 - ev.y ); else dK = min( dK, ev.y - 8.25 ); }
    if ( ev.z > 0.004 ) { if ( ev.z < 8.125 ) dC = min( dC, 8.0 - ev.z ); else dK = min( dK, ev.z - 8.25 ); }
    dC = max( dC, 0.0 ); dK = max( dK, 0.0 );
    float fC = max( fwidth( dC ), 1e-5 ), fK = max( fwidth( dK ), 1e-5 );
    // band of SURF_EDGE_W metres, anti-aliased, faded out once it is thinner than ~1 px
    sEdgeC = ( 1.0 - smoothstep( SURF_EDGE_W * 0.25, SURF_EDGE_W + fC, dC ) ) * ( 1.0 - smoothstep( SURF_EDGE_W * 0.6, SURF_EDGE_W * 1.6, fC ) );
    sEdgeK = ( 1.0 - smoothstep( 0.0, SURF_EDGE_W * 1.4 + fK, dK ) ) * ( 1.0 - smoothstep( SURF_EDGE_W * 0.8, SURF_EDGE_W * 2.2, fK ) );
    #if SURF_LVL > 1
      // worn, chipped edges rather than a ruled line
      sEdgeC *= 0.45 + 0.55 * smoothstep( 0.25, 0.65, sNoise( sP * 11.0 ) );
    #endif
  }
  #endif

  #if SURF_LVL == 0
    // cheap path: one broad mottling tap
    sAlb *= 0.92 + 0.16 * sNoise( sP * 0.6 );
  #else

  #ifdef SURF_STD
    float n1 = sFbm( sP, sFw, 1.1 );
    sAlb *= 0.9 + 0.2 * n1;
    sAlb *= 1.0 + ( sNoise( sP * 24.0 ) - 0.5 ) * 0.08 * sFade( sFw, 24.0 );
    sAlb = mix( sAlb, sAlb * 1.2 + 0.008, sEdgeC * 0.5 );
    sAlb *= 1.0 - sEdgeK * 0.25;
  #endif

  #ifdef SURF_STONE
    float n1 = sFbm( sP + 3.7, sFw, 0.7 );                         // broad chisel-plane mottling
    float n2 = sNoise( sP * 6.0 + 3.1 );                            // weathered patches
    sAlb *= 0.84 + 0.32 * n1;
    sAlb *= 1.0 + ( n2 - 0.5 ) * 0.16 * sFade( sFw, 6.0 );
    #if SURF_LVL > 1
      float sp = sNoise( sP * 41.0 );                               // granite grain + dark mica flecks
      float spF = sFade( sFw, 41.0 );
      sAlb *= 1.0 + ( ( sp - 0.5 ) * 0.34 - smoothstep( 0.74, 0.86, sp ) * 0.22 ) * spF;
      sRough += ( sp - 0.5 ) * 0.1 * spF;
    #endif
    // faint moss on upward faces
    float mUp = smoothstep( 0.5, 0.92, sNw.y );
    float mN = smoothstep( 0.52, 0.78, sFbm( sP + 11.0, sFw, 0.45 ) + ( n2 - 0.5 ) * 0.35 );
    float moss = mUp * mN * uSurfMoss * 0.62;
    sAlb = mix( sAlb, vec3( 0.085, 0.13, 0.035 ) * ( 0.75 + 0.5 * n2 ), moss );
    float wear = sEdgeC * ( 1.0 - moss );
    sAlb = mix( sAlb, sSat( sAlb, 0.75 ) * 1.38 + 0.012, wear * 0.8 );
    sAlb *= 1.0 - sEdgeK * 0.38;
    sRough = clamp( sRough - wear * 0.14 + moss * 0.05, 0.3, 1.0 );
  #endif

  #ifdef SURF_PLASTER
    float n1 = sFbm( sP + 1.3, sFw, 0.9 );
    sAlb *= 0.91 + 0.18 * n1;
    sAlb = mix( sAlb, sAlb * vec3( 1.03, 1.0, 0.93 ), smoothstep( 0.45, 0.75, n1 ) * 0.8 );   // warm lime-wash patches
    float st = sNoise( vec3( sP.x * 2.4, sP.y * 0.3, sP.z * 2.4 ) + 5.0 );                       // rain streaks
    sAlb *= 1.0 - smoothstep( 0.58, 0.88, st ) * 0.13 * sFade( sFw, 2.4 ) * ( 1.0 - max( sNw.y, 0.0 ) );
    #if SURF_LVL > 1
      sAlb *= 1.0 + ( sNoise( sP * 34.0 ) - 0.5 ) * 0.07 * sFade( sFw, 34.0 );
    #endif
    sAlb = mix( sAlb, sAlb * 1.1 + 0.015, sEdgeC * 0.6 );
    sAlb *= 1.0 - sEdgeK * 0.3;
  #endif

  #ifdef SURF_WOOD
    vec3 gA = normalize( vSurfAxis );
    float al = dot( sP, gA ); vec3 pp = sP - gA * al;
    float warp = sNoise( sP * 1.4 ) * 0.7;
    float g1 = sNoise( pp * 24.0 + gA * ( al * 0.8 + warp ) );     // grain streaks along the timber
    sAlb *= 1.0 - smoothstep( 0.42, 0.82, g1 ) * 0.24 * sFade( sFw, 24.0 );
    #if SURF_LVL > 1
      float g2 = sNoise( pp * 72.0 + gA * al * 2.2 );
      sAlb *= 1.0 + ( g2 - 0.5 ) * 0.14 * sFade( sFw, 72.0 );
      float kn = sNoise( sP * 2.6 + 9.0 );
      sAlb *= 1.0 - smoothstep( 0.8, 0.9, kn ) * 0.35 * sFade( sFw, 14.0 );   // knots
    #endif
    float n1 = sFbm( sP + 7.7, sFw, 0.8 );
    sAlb *= 0.88 + 0.24 * n1;
    sAlb = mix( sAlb, sAlb * 1.32 + 0.012, sEdgeC * 0.6 );
    sAlb *= 1.0 - sEdgeK * 0.35;
    sRough = clamp( sRough + ( g1 - 0.5 ) * 0.12, 0.4, 1.0 );
  #endif

  #ifdef SURF_TILE
    float n1 = sFbm( sP + 4.2, sFw, 0.8 );
    sAlb *= 0.85 + 0.3 * n1;
    sAlb = mix( sAlb, sAlb * vec3( 1.1, 0.9, 0.78 ), smoothstep( 0.55, 0.82, sNoise( sP * 3.0 + 2.0 ) ) * 0.6 * sFade( sFw, 3.0 ) );  // kiln variation
    float up = smoothstep( 0.15, 0.85, sNw.y );
    sAlb = mix( sAlb, sSat( sAlb, 0.6 ) * 1.14, up * 0.28 * smoothstep( 0.45, 0.72, n1 ) );             // sun-bleached
    #if SURF_LVL > 1
      float li = smoothstep( 0.74, 0.82, sNoise( sP * 7.0 + 4.0 ) ) * sFade( sFw, 7.0 );
      sAlb = mix( sAlb, vec3( 0.36, 0.34, 0.2 ), li * 0.5 * up );                                    // lichen
    #endif
    sAlb = mix( sAlb, sAlb * 1.18 + 0.01, sEdgeC * 0.45 );
    sAlb *= 1.0 - sEdgeK * 0.35;
  #endif

  #ifdef SURF_CLOTH
    float n1 = sFbm( sP + 2.9, sFw, 3.0 );                         // uneven dye
    sAlb *= 0.9 + 0.2 * n1;
    sAlb = mix( sAlb, sSat( sAlb, 1.12 ), smoothstep( 0.5, 0.8, n1 ) * 0.5 );
    #if SURF_LVL > 1
      float wF = sFade( sFw, 150.0 );
      if ( wF > 0.001 ) {
        vec3 sNo = normalize( cross( dFdx( sP ), dFdy( sP ) ) );
        vec3 tw = sTriW( sNo );
        float wv = S_TRIPLANAR( sWeave, sP, tw, 900.0 );
        sAlb *= 1.0 + ( wv - 0.5 ) * 0.2 * wF;
      }
    #endif
    float cNV = abs( dot( normal, normalize( vViewPosition ) ) );
    sAlb *= 1.0 + pow( 1.0 - cNV, 3.0 ) * 0.22;                     // soft cotton sheen at grazing angles
  #endif

  #if defined( SURF_METAL ) || defined( SURF_IRON )
    float h1 = sNoise( sP * 13.0 );
    float dent = 1.0 - abs( 2.0 * h1 - 1.0 );                       // hammered facets
    float hF = sFade( sFw, 13.0 );
    float n1 = sFbm( sP + 5.5, sFw, 1.5 );
    sAlb *= 0.84 + 0.32 * n1;
    sAlb *= 1.0 + ( dent - 0.5 ) * 0.24 * hF;
    sRough = clamp( sRough + ( dent - 0.5 ) * 0.2 * hF + ( n1 - 0.5 ) * 0.16, 0.12, 0.95 );
    #ifdef SURF_IRON
      float rust = smoothstep( 0.62, 0.86, sFbm( sP + 3.0, sFw, 2.3 ) ) * 0.55 + sEdgeK * 0.5;
      sAlb = mix( sAlb, vec3( 0.075, 0.032, 0.014 ), rust * 0.65 );
      sRough = mix( sRough, 0.88, rust ); sMetal = mix( sMetal, 0.25, rust );
    #endif
    // bright bevelled edges (the boards' black plate with steel highlights)
    sAlb = mix( sAlb, max( sAlb * 2.4, vec3( 0.3, 0.29, 0.28 ) ), sEdgeC * 0.85 );
    sRough = mix( sRough, 0.2, sEdgeC ); sMetal = mix( sMetal, 1.0, sEdgeC * 0.8 );
    sAlb *= 1.0 - sEdgeK * 0.4;
  #endif

  #ifdef SURF_GOLD
    float n1 = sFbm( sP + 8.1, sFw, 2.0 );
    float tarn = smoothstep( 0.56, 0.86, n1 ) * 0.55 + sEdgeK * 0.75;
    sAlb = mix( sAlb, sAlb * vec3( 0.5, 0.45, 0.3 ), tarn * 0.7 );   // tarnish in hollows
    sRough = mix( sRough, 0.55, tarn );
    sAlb = mix( sAlb, sAlb * 1.45 + 0.02, sEdgeC * 0.7 );           // polished rims
    sRough = mix( sRough, 0.14, sEdgeC );
  #endif

  #ifdef SURF_SKIN
    sAlb *= 1.0 + ( sNoise( sP * 18.0 ) - 0.5 ) * 0.07 * sFade( sFw, 18.0 );
    sAlb = mix( sAlb, sAlb * vec3( 1.06, 0.94, 0.92 ), smoothstep( 0.5, 0.8, sNoise( sP * 6.0 + 5.0 ) ) * 0.45 );
  #endif

  #ifdef SURF_FOLIAGE
    float v1 = sNoise( sP * 0.11 + 1.7 );                            // stand-scale hue drift
    float v2 = sNoise( sP * 0.55 + 4.4 );
    vec3 warm = sAlb * vec3( 1.12, 1.06, 0.7 ), cool = sAlb * vec3( 0.86, 0.98, 1.08 );
    sAlb = mix( cool, warm, smoothstep( 0.25, 0.75, v1 * 0.7 + v2 * 0.3 ) );
    sAlb *= 0.9 + 0.2 * v2;
  #endif

  #endif // SURF_LVL

  // ---------- wetness (storm) ----------
  #if SURF_POROUS > 0
  if ( uSurfWet > 0.001 ) {
    float wUp = smoothstep( -0.3, 0.75, sNw.y );
    float wet = uSurfWet * mix( 0.4, 1.0, wUp );
    float pud = uSurfWet * smoothstep( 0.86, 0.97, sNw.y ) * smoothstep( 0.5, 0.68, sNoise( sP * 0.8 + 21.0 ) );
    sAlb *= mix( 1.0, 1.0 - float( SURF_POROUS ) * 0.01, wet );
    sRough = mix( sRough, 0.3, wet * 0.8 );
    sRough = mix( sRough, 0.05, pud );
    sAlb *= 1.0 - pud * 0.25;
  }
  #elif defined( SURF_WET_METAL )
  if ( uSurfWet > 0.001 ) sRough = mix( sRough, 0.2, uSurfWet * smoothstep( -0.3, 0.75, sNw.y ) * 0.7 );
  #endif

  diffuseColor.rgb = max( sAlb, vec3( 0.0 ) );
  roughnessFactor = clamp( sRough, 0.04, 1.0 );
  metalnessFactor = clamp( sMetal, 0.0, 1.0 );
}
`

/* Lighting-model tweaks inside RE_Direct_Physical (shadowed direct light only). */
const DIRECT_FROM = 'vec3 irradiance = dotNL * directLight.color;'
const DIRECT_TO = /* glsl */`vec3 irradiance = dotNL * directLight.color;
	#ifdef SURF_LIGHT_SKIN
	{
		// warm wrap / subsurface-like terminator
		float skNL = dot( geometryNormal, directLight.direction );
		float skWrap = saturate( ( skNL + 0.5 ) / 1.5 );
		reflectedLight.directDiffuse += directLight.color * max( skWrap * skWrap - dotNL, 0.0 ) * vec3( 0.55, 0.22, 0.14 ) * BRDF_Lambert( material.diffuseContribution );
	}
	#endif
	#ifdef SURF_LIGHT_LEAF
	{
		// light through thin leaves: from behind the blade and when looking toward the sun
		float lfBack = saturate( - dot( geometryNormal, directLight.direction ) );
		float lfView = pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 4.0 );
		reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseContribution ) * vec3( 1.0, 1.06, 0.62 ) * ( lfBack * 0.4 + lfView * 0.55 );
	}
	#endif`

/* ----------------------------- hook factory ----------------------------- */
const levelFor = () => Math.min(2, detailLevel())
const EDGE_W = { stone: 0.04, plaster: 0.03, wood: 0.025, bark: 0.025, tile: 0.02, metal: 0.018, iron: 0.022, gold: 0.014, brass: 0.014, std: 0.028 }

function recipeOf(key) { return RECIPES[key] ? key : 'std' }
/** Program cache key for a recipe at the current detail level. */
export function surfaceKey(key, extra = '') { return `surf:${recipeOf(key)}:${levelFor()}${extra}` }

function inject(shader, key, { wind = 0, instOnly = false } = {}) {
  const k = recipeOf(key), r = RECIPES[k], lvl = levelFor()
  patchFog(shader)
  Object.assign(shader.uniforms, SURF)
  const defs = [
    `#define SURF_LVL ${lvl}`, `#define SURF_OCT ${[1, 2, 3][lvl]}`, `#define SURF_${r.def}`,
    `#define SURF_POROUS ${Math.round(r.porous * 100)}`,
    r.porous === 0 && (k === 'metal' || k === 'iron' || k === 'gold' || k === 'brass') ? '#define SURF_WET_METAL' : '',
    r.edge && lvl > 0 ? '#define SURF_EDGE' : '',
    r.edge && lvl > 0 ? `#define SURF_EDGE_W ${(EDGE_W[k] ?? 0.028).toFixed(3)}` : '',
    r.light === 'skin' ? '#define SURF_LIGHT_SKIN' : '',
    r.light === 'leaf' && lvl > 0 ? '#define SURF_LIGHT_LEAF' : '',
  ].filter(Boolean).join('\n')
  const grain = r.grain
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
${defs}
varying vec3 vSurfP;
#ifdef SURF_EDGE
  attribute vec4 aEdge;
  varying vec3 vSurfEdge;
#endif
${grain ? `varying vec3 vSurfAxis;
vec3 sOctDecode( vec2 e ) {
  vec3 v = vec3( e, 1.0 - abs( e.x ) - abs( e.y ) );
  if ( v.z < 0.0 ) v.xy = ( 1.0 - abs( v.yx ) ) * vec2( v.x >= 0.0 ? 1.0 : - 1.0, v.y >= 0.0 ? 1.0 : - 1.0 );
  return normalize( v );
}` : ''}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
vSurfP = transformed;
#ifdef USE_INSTANCING
  vSurfP += instanceMatrix[ 3 ].xyz;
#endif
#ifdef SURF_EDGE
  vSurfEdge = aEdge.xyz;
#endif
${grain ? `{
#ifdef SURF_EDGE
  float sCode = floor( aEdge.w * 65535.0 + 0.5 ) - 1.0;
#else
  float sCode = - 1.0;
#endif
  if ( sCode < 0.0 ) vSurfAxis = vec3( 0.0, 1.0, 0.0 );
  else { float su = floor( sCode / 128.0 ); float sv = sCode - su * 128.0; vSurfAxis = sOctDecode( vec2( su, sv ) / 127.0 * 2.0 - 1.0 ); }
}` : ''}`)
  if (wind) {
    shader.uniforms.uTime = WIND_REF.uTime; shader.uniforms.uWind = WIND_REF.uWind
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uWind;`)
      // after our own begin_vertex block so the pattern stays pinned to the blade
      .replace('#include <morphtarget_vertex>', `${instOnly ? '#ifdef USE_INSTANCING' : ''}
      {
        vec4 wWp = modelMatrix * vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          wWp = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
        #endif
        float wH = max( transformed.y, 0.0 );
        float wS = sin( uTime * 1.7 + wWp.x * 0.35 + wWp.z * 0.21 ) + 0.5 * sin( uTime * 3.1 + wWp.z * 0.6 );
        transformed.x += wS * wH * wH * ${wind.toFixed(4)} * uWind;
        transformed.z += cos( uTime * 1.3 + wWp.x * 0.27 ) * wH * wH * ${(wind * 0.6).toFixed(4)} * uWind;
      }
      ${instOnly ? '#endif' : ''}
      #include <morphtarget_vertex>`)
  }
  let frag = shader.fragmentShader
    .replace('#include <common>', `#include <common>
${defs}
uniform float uSurfWet; uniform float uSurfMoss;
varying vec3 vSurfP;
#ifdef SURF_EDGE
  varying vec3 vSurfEdge;
#endif
${grain ? 'varying vec3 vSurfAxis;' : ''}
${LIB}`)
  if (frag.includes('#include <emissivemap_fragment>')) frag = frag.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG)
  if ((r.light) && frag.includes('#include <lights_physical_pars_fragment>')) {
    frag = frag.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(DIRECT_FROM, DIRECT_TO))
  }
  shader.fragmentShader = frag
}

// set by kit.js (avoids an import cycle): the shared wind uniforms
let WIND_REF = { uTime: { value: 0 }, uWind: { value: 1 } }
export function setWindUniforms(w) { WIND_REF = w }

/** onBeforeCompile hook for a kit material key. */
export function surfaceHook(key, opts = {}) {
  return function (shader) { inject(shader, key, opts) }
}

/**
 * Add a surface recipe to any MeshStandardMaterial (e.g. a custom terrain or a cloned kit
 * material). Chains the material's existing onBeforeCompile and cache key.
 */
export function applySurface(material, key, opts = {}) {
  const prevHook = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? material.onBeforeCompile : null
  const prevKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey.bind(material) : null
  material.onBeforeCompile = function (shader, renderer) {
    if (prevHook) prevHook.call(this, shader, renderer)
    else patchFog(shader)
    inject(shader, key, opts)
  }
  material.customProgramCacheKey = () => surfaceKey(key, (opts.wind ? ':w' : '') + (prevKey ? '|' + prevKey() : ''))
  material.userData.surface = recipeOf(key)
  material.needsUpdate = true
  return material
}

let lastLevel = -1
/** Recompile surface materials if the detail level changed (call after settings change). */
export function refreshSurfaces(scene, extra = []) {
  const lvl = levelFor()
  if (lvl === lastLevel) return false
  const first = lastLevel < 0
  lastLevel = lvl
  if (first) return false
  const seen = new Set(extra)
  scene?.traverse(o => { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m?.userData?.surface) seen.add(m) })
  for (const m of seen) m.needsUpdate = true
  return true
}
