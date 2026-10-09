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
  guru: { scale: 0.94, skin: 0x7a5236, beard: { color: 0xf2f2f2, long: true }, robe: 0xe8d9b5, sandals: true, beads: true, old: true, bulk: 0.86 },
  thamarai: { scale: 0.92, fem: true, skin: 0x9a6644, hair: { color: 0x120c08, style: 'braid' }, skirt: 0x7a2f4f, sandals: true, bulk: 0.92 },
  kaali: { fem: true, skin: 0x6e452c, hair: { color: 0x120c08, style: 'ponytail' }, boots: 0x3a2418, bulk: 1.18, muscle: 0.7 },
  malli: { fem: true, child: true, skin: 0x9a6644, hair: { color: 0x120c08, style: 'messy' } },
  ilan: { child: true, skin: 0x9a6644, hair: { color: 0x120c08, style: 'spiky' } },
  rudhra: { skin: 0x8a5a3c, beard: { color: 0x0a0a0a }, hair: { color: 0x0a0a0a, style: 'long' }, boots: 0x1a1a1a, muscle: 0.9 },
  dunkan: { scale: 1.25, skin: 0xa0785a, beard: { color: 0xbab6ad, long: true }, hair: { color: 0x95908a, style: 'grey' }, boots: 0x1a1414, bulk: 1.38, muscle: 0.8 },
  soldier: { skin: 0x8d5a3b, beard: { color: 0x1a120c }, helmet: { color: 0x45454e, crest: 0x8b1a1a }, boots: 0x1f1f24 },
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
  if (o.helmet) buildHelmet(ctx, H, { trim: 0x8a8a90, ...o.helmet })
  if (o.robe || o.skirt) skirtShell(ctx, { color: o.robe ?? o.skirt })
  if (o.sandals) sandals(ctx); else if (o.boots) boots(ctx, { color: o.boots }); else buildFeet(ctx)
  if (o.beads) { wristBeads(ctx); mala(ctx) }
  S.build(root, skeleton, m => { const k = mat(m).clone(); return k })
  root.scale.setScalar(o.child ? 0.62 : o.scale ?? 1)
  return root
}
