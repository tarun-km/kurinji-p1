import { Effect, BlendFunction } from 'postprocessing'
import { Uniform, Vector3 } from 'three'

/* ===========================================================================
   Cinematic colour grade (runs after tone mapping, in a perceptual gamma space):
   split toning (shadow / highlight tints), lift · gamma · gain, a filmic S-curve
   contrast, brightness, saturation with vibrance (protects already-saturated
   colours such as saffron robes and fire). Every control is a uniform, so the
   lighting presets cross-fade smoothly with no shader recompiles.
=========================================================================== */
const frag = /* glsl */`
uniform vec3 lift;
uniform vec3 gain;
uniform float gammaInv;
uniform vec3 shadowTint;
uniform vec3 highTint;
uniform float balance;
uniform float contrast;
uniform float brightness;
uniform float saturation;
uniform float vibrance;

void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec3 p = pow( max( inputColor.rgb, 0.0 ), vec3( 1.0 / 2.2 ) );
  float l = dot( p, vec3( 0.2126, 0.7152, 0.0722 ) );
  // split toning
  float sh = 1.0 - smoothstep( 0.0, 0.55 + balance, l );
  float hi = smoothstep( 0.4 + balance, 1.0, l );
  p += shadowTint * sh + highTint * hi;
  // lift / gain / gamma
  p = p * gain + lift * ( 1.0 - p );
  p = pow( max( p, 0.0 ), vec3( gammaInv ) );
  // filmic S-curve around mid grey
  vec3 s = clamp( p, 0.0, 1.0 ); s = s * s * ( 3.0 - 2.0 * s );
  p = contrast >= 0.0 ? mix( p, s, contrast ) : mix( p, vec3( 0.5 ), - contrast );
  p += brightness;
  // saturation + vibrance
  l = dot( p, vec3( 0.2126, 0.7152, 0.0722 ) );
  float chroma = max( p.r, max( p.g, p.b ) ) - min( p.r, min( p.g, p.b ) );
  float k = saturation * ( 1.0 + vibrance * ( 1.0 - smoothstep( 0.05, 0.55, chroma ) ) );
  p = mix( vec3( l ), p, k );
  outputColor = vec4( pow( max( p, 0.0 ), vec3( 2.2 ) ), inputColor.a );
}`

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['lift', new Uniform(new Vector3())],
        ['gain', new Uniform(new Vector3(1, 1, 1))],
        ['gammaInv', new Uniform(1)],
        ['shadowTint', new Uniform(new Vector3())],
        ['highTint', new Uniform(new Vector3())],
        ['balance', new Uniform(0)],
        ['contrast', new Uniform(0)],
        ['brightness', new Uniform(0)],
        ['saturation', new Uniform(1)],
        ['vibrance', new Uniform(0)],
      ]),
    })
  }
  /** Apply a flat grade object (see world/lighting.js GRADES). */
  set(g) {
    const u = this.uniforms
    u.get('lift').value.set(g.liftR, g.liftG, g.liftB)
    u.get('gain').value.set(g.gainR, g.gainG, g.gainB)
    u.get('gammaInv').value = 1 / Math.max(0.2, g.gamma)
    u.get('shadowTint').value.set(g.shR, g.shG, g.shB)
    u.get('highTint').value.set(g.hiR, g.hiG, g.hiB)
    u.get('balance').value = g.balance
    u.get('contrast').value = g.contrast
    u.get('brightness').value = g.bright
    u.get('saturation').value = 1 + g.sat
    u.get('vibrance').value = g.vibrance
  }
}
