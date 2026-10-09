import * as THREE from 'three'
import { SkinBuilder } from './mesh'
import { makeSpec, makeSkeleton, Body, buildSkin, buildHands, buildFeet } from './body'
import { buildHead, buildBeard, buildHair, buildHelmet } from './head'
import { rigPlan, dressCharacter } from './garments'
import { Builder, G, mat } from '../gfx/kit'

/** Assemble the finished cast: one skeleton and one skinned mesh per material. */
export function buildEnhancedCharacter(options) {
  const o = { ...options, old: !!(options.old || options.longBeard && !options.crown), muscle: options.muscle ?? (options.apron ? 0.75 : options.child ? 0.15 : 0.8) }
  const detail = Math.max(0, Math.min(3, o.detail ?? 2))
  const spec = makeSpec(o), rig = rigPlan(o)
  const { root, bones } = makeSkeleton(spec, rig)
  root.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones), S = new SkinBuilder(bones)
  const ctx = { S, spec, rig, o, detail, body: new Body(spec, S), M: { skin: 'skin', cloth: 'cloth', hair: 'std', std: 'std', leather: 'std', wood: 'wood', metal: 'metal', gold: 'gold' } }
  ctx.hide = {
    torso: (angle, low, high) => high < 1.55 && (o.armor != null || o.fullRobe || !o.robe) && !(o.vest && low > 1.42),
    arm: (side, angle, low, high) => o.armor != null && low >= 0 && high < 0.53 || o.fullRobe && low >= 0 && high < 0.28 || o.shortSleeve && low >= 0 && high < 0.16,
    leg: (side, angle, low, high) => !o.barefoot && !o.child && low >= 0.05 && high < 0.79 && !o.robe && !o.skirt && !o.dress || o.shorts && low >= 0.05 && high < 0.23,
  }
  buildSkin(ctx)
  buildHands(ctx, o.armor != null ? { glove: true, color: 0x302b2a, m: ctx.M.leather } : {})
  const H = buildHead(ctx) || ctx.headShape
  if (o.beard != null) buildBeard(ctx, H, { color: o.beard, long: !!o.longBeard })
  if (o.hair != null && o.helmet == null) buildHair(ctx, H, { color: o.hair, style: o.ponytail ? 'ponytail' : o.braid ? 'braid' : o.hairStyle ?? (o.long ? o.child ? 'long' : 'long' : 'short'), len: o.child ? 0.28 : undefined })
  if (o.helmet != null) buildHelmet(ctx, H, { color: o.helmet, trim: o.crown ? 0xc9a24a : 0x88858a, crest: o.plume ? { color: o.plume } : null })
  dressCharacter(ctx)
  // Sandals author straps/soles; the foot and toes must remain visible inside.
  if (o.barefoot || o.child || o.armor == null && !o.boots) buildFeet(ctx, { sole: o.barefoot || o.child ? 0 : 0.014 })
  // All merged skin/garments use the same skeleton and static shared buffers.
  const meshes = S.build(root, skeleton, key => mat(key))
  for (const mesh of meshes) { mesh.geometry.userData.sharedCharacter = true; mesh.frustumCulled = false }
  root.userData.characterSystem = 'enhanced-cast'
  root.userData.clothRig = { skirtChains: rig.skirt?.chains ?? 0, capeCols: rig.cape?.cols ?? 0, capeSegs: rig.cape?.segs ?? 0 }
  root.userData.detail = detail
  if (o.crown) {
    // The crown stays rigid and can transfer to the world without its skeleton.
    const crown = new THREE.Group(), builder = new Builder(25)
    crown.name = 'crown'
    builder.add(G.cyl(0.098 * spec.headS, 0.092 * spec.headS, 0.036, 14, true), 0xd2a543, { m: 'gold', at: [0, 0.115, -0.015] })
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, length = i === 0 ? 0.105 : 0.082
      builder.add(G.cone(0.019, length, 4), 0xe2b755, { m: 'gold', at: [Math.sin(a) * 0.094 * spec.headS, 0.135 + length / 2, -0.015 + Math.cos(a) * 0.094 * spec.headS] })
    }
    crown.add(builder.build()); crown.userData.spikes = 7
    crown.traverse(node => { if (node.isMesh) node.geometry.userData.sharedCharacter = true })
    root.getObjectByName('head').add(crown)
  }
  return root
}
