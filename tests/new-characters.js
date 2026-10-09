// The studio's new-cast route uses the same fully dressed rigs as gameplay.
import { PRESETS, makeCharacter } from '/src/game/Characters.js'

export const NEW_PRESETS = PRESETS

export function buildNewCharacter(id, detail = 2) {
  const character = makeCharacter(id, { detail })
  character.root.userData.previewCharacter = character
  return character.root
}
