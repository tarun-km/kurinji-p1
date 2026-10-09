// Preview of the NEW character system (src/game/characters/*) — not yet wired into the game.
// Builds Veeran, Aruvan and old Aruvan from the shared anatomy/head/garment modules.
import * as THREE from 'three'
import { mat } from '/src/game/gfx/kit.js'
import { SkinBuilder } from '/src/game/characters/mesh.js'
import { makeSpec, makeSkeleton, Body, buildSkin, buildHands, buildFeet } from '/src/game/characters/body.js'
import { buildHead, buildBeard, buildHair, buildHelmet } from '/src/game/characters/head.js'
import { rigPlan, skirtShell, sandals, boots, wristBeads, mala } from '/src/game/characters/garments.js'

export const NEW_PRESETS = {
  veeran: { skin: 0x8a5a3c, beard: { color: 0x1a120c }, hair: { color: 0x15100c, style: 'short' }, skirt: 0x6b0f0f, helmet: { color: 0x3a3a40, crest: 0x8b1a1a }, boots: 0x2a1c14, muscle: 0.9 },
  aruvan: { skin: 0x8a5a3c, beard: { color: 0x1a120c }, robe: 0xd9822b, sandals: true, beads: true, muscle: 0.85 },
  aruvanOld: { skin: 0x7d5538, beard: { color: 0xe8e4dc, long: true }, robe: 0xc97a2e, sandals: true, beads: true, old: true, bulk: 0.9 },
}

export function buildNewCharacter(id, detail = 2) {
  const o = NEW_PRESETS[id]
  const spec = makeSpec(o)
  const rig = rigPlan(o), { root, bones } = makeSkeleton(spec, rig)
  root.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  const S = new SkinBuilder(bones)
  const ctx = { S, spec, o, detail, rig, body: new Body(spec, S), M: { skin: 'skin', cloth: 'cloth', hair: 'std', std: 'std', metal: 'metal', gold: 'gold' } }
  buildSkin(ctx); buildHands(ctx)
  const H = buildHead(ctx) || ctx.headShape
  if (o.beard) buildBeard(ctx, H, o.beard)
  if (o.hair) buildHair(ctx, H, o.hair)
  if (o.helmet) buildHelmet(ctx, H, o.helmet)
  if (o.robe || o.skirt) skirtShell(ctx, { color: o.robe ?? o.skirt })
  if (o.sandals) sandals(ctx); else if (o.boots) boots(ctx, { color: o.boots }); else buildFeet(ctx)
  if (o.beads) { wristBeads(ctx); mala(ctx) }
  S.build(root, skeleton, m => { const k = mat(m).clone(); return k })
  return root
}
