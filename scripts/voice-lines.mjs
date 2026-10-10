// Collects every spoken line in src/game/story.js -> public/voice/lines.json
//   g.say(speaker, text) · g.bark(speaker, text|[texts]) · g.whisper(speaker, text)
//   g.caption(text)  -> narrator · g.choose([{ text }]) -> the player's quoted words
// String literals anywhere inside the text argument are collected, so
// `cond ? 'a' : 'b'` and `['a', 'b'][i]` both yield every variant.
import fs from 'node:fs'
import { parse } from '@babel/parser'
import { voiceKey, spokenText, choiceSpeech } from '../src/game/voiceKey.js'

const SRC = new URL('../src/game/story.js', import.meta.url)
const OUT = new URL('../public/voice/lines.json', import.meta.url)
const ast = parse(fs.readFileSync(SRC, 'utf8'), { sourceType: 'module' })

const CHAPTERS = ['prologue', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'explore1', 'explore2', 'ch7', 'epilogue']
const lines = new Map()

function strings(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'StringLiteral') out.push(node.value)
  else if (node.type === 'TemplateLiteral' && node.expressions.length === 0) out.push(node.quasis[0].value.cooked)
  else for (const k in node) if (k !== 'loc' && k !== 'start' && k !== 'end') {
    const v = node[k]
    if (Array.isArray(v)) v.forEach(x => strings(x, out)); else if (v && typeof v.type === 'string') strings(v, out)
  }
  return out
}
function add(speaker, text, chapter, kind) {
  const t = spokenText(text)
  if (!t || t.length < 2) return
  const id = voiceKey(speaker, t)
  if (!lines.has(id)) lines.set(id, { id, speaker, text: t, chapter, kind })
}

function walk(node, fn) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'CallExpression') visit(node, fn)
  for (const k in node) if (k !== 'loc') {
    const v = node[k]
    if (Array.isArray(v)) v.forEach(x => walk(x, fn)); else if (v && typeof v.type === 'string') walk(v, fn)
  }
}
function visit(call, chapter) {
  const c = call.callee
  if (c.type !== 'MemberExpression' || c.object.name !== 'g') return
  const m = c.property.name, [a0, a1] = call.arguments
  const player = chapter === 'prologue' ? 'veeran' : 'aruvan'
  if ((m === 'say' || m === 'bark' || m === 'whisper') && a0?.type === 'StringLiteral') strings(a1).forEach(t => add(a0.value, t, chapter, m))
  if (m === 'caption') strings(a0).forEach(t => add('narrator', t, chapter, 'caption'))
  if (m === 'choose' && a0?.type === 'ArrayExpression')
    for (const o of a0.elements) {
      const tp = o.properties?.find(p => p.key?.name === 'text')
      const said = tp && choiceSpeech(tp.value.value)
      if (said) add(player, said, chapter, 'choice')
    }
}

for (const node of ast.program.body) {
  const fn = node.type === 'FunctionDeclaration' ? node : null
  const name = fn?.id?.name
  // the interlude plays inside the prologue, so its lines load with it
  const PART_OF = { yearsBetween: 'prologue', breaths: 'prologue' }
  if (fn) walk(fn.body, CHAPTERS.includes(name) ? name : PART_OF[name] || 'shared')
}

const list = [...lines.values()]
fs.mkdirSync(new URL('../public/voice/', import.meta.url), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
const by = (k) => list.reduce((m, l) => (m[l[k]] = (m[l[k]] || 0) + l.text.length, m), {})
console.log(`${list.length} lines, ${list.reduce((n, l) => n + l.text.length, 0)} characters`)
console.log('by chapter', by('chapter'))
console.log('by speaker', by('speaker'))
