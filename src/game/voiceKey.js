// Shared by the game (runtime lookup) and scripts/voice-lines.mjs (generation),
// so a spoken line always maps to the same file: /voice/<speaker>_<hash>.mp3

/** Normalise a line the way it is spoken: trim, drop wrapping quotes, collapse spaces. */
export function spokenText(text) {
  let t = String(text).trim().replace(/\s+/g, ' ')
  if (/^["“].*["”]$/.test(t)) t = t.slice(1, -1).trim()
  return t
}

/** A choice like '"...Yes."' is spoken; 'Spare him. "Go and plant something."' speaks the quoted part; '(Say nothing.)' is silent. */
export function choiceSpeech(text) {
  const t = String(text).trim()
  if (t.startsWith('(')) return ''
  const m = t.match(/["“]([^"”]+)["”]/)
  return m ? m[1].trim() : ''
}

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

export function voiceKey(speaker, text) {
  return `${speaker}_${fnv1a(`${speaker}|${spokenText(text)}`)}`
}
