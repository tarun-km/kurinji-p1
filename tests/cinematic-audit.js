// Dev-only cinematic audit. In the dev server console:
//   const m = await import('/tests/cinematic-audit.js'); m.run(2)   // from chapter II to the end
//   m.report()                                                         // lines whose speaker is not well framed
// It fast-forwards the story (auto-walks, auto-talks, picks the first choice, defeats enemies)
// and, for every spoken line, checks the speaker's head is on screen, close and unobstructed.
import gsap from 'gsap'
import { state, ui } from '/src/game/store.js'
import { settings } from '/src/game/settings.js'

export const log = []
export function report(all = false) {
  return log.filter(r => all || r.issue).map(r => `${r.ch}.${r.k} ${r.id} d${r.d ?? '-'} ${r.ndc ?? ''} [${r.issue || 'ok'}] ${r.text}`)
}
export let hold = -1
export function setHold(k) { hold = k }
export async function run(from = 2, speed = 4, choice = 0) {
  const g = window.__game
  g.clearShot([0, 50, 0], [0, 50, 5])
  const keep = { autoAdvance: settings.autoAdvance }
  addEventListener('beforeunload', () => Object.assign(settings, keep))
  // mute in memory only (never touch saved settings): silent lines, no auto-advance
  g.audio.say = (sp, t) => ({ duration: t.length / 14, ended: Promise.resolve(), silent: true })
  settings.autoAdvance = false; g.god = true; gsap.globalTimeline.timeScale(speed)
  log.length = 0; let lines = 0
  const ow = g.wait.bind(g); g.wait = s => ow(s / speed)
  const near = (px, pz, d) => { const pp = g.player.pos, dx = pp.x - px, dz = pp.z - pz, L = Math.hypot(dx, dz) || 1; g.movePlayer(px + dx / L * d, pz + dz / L * d, Math.atan2(-dx, -dz)) }
  const og = g.goTo.bind(g); g.goTo = (p, r, l) => { const pr = og(p, r, l); g.movePlayer(p.x, p.z); return pr }
  const ot = g.talkTo.bind(g); g.talkTo = (id, l) => { const pr = ot(id, l); const n = g.npcs.get(id); near(n.pos.x, n.pos.z, 1.9); setTimeout(() => g.interactable?.done(), 200); return pr }
  const oi = g.interact.bind(g); g.interact = (p, l, pp) => { const pr = oi(p, l, pp); near(p.x, p.z, 1.4); setTimeout(() => g.interactable?.done(), 200); return pr }
  const R = new g.ray.constructor()
  const os = g.say.bind(g)
  g.say = (id, text, opts) => {
    const pr = os(id, text, opts), ch = state.chapterIndex, k = lines++
    // sample once the shot has settled (story cranes run while lines play)
    let waited = 0
    const sample = () => { if (gsap.isTweening(g.cinePos) && (waited += 100) < 2500) return setTimeout(sample, 100); measure() }
    setTimeout(sample, Math.max(450, 1100 / speed))
    const measure = () => {
      const rec = { ch, k, id, text: text.slice(0, 44) }
      try {
        const n = g.actorOf(id), cam = g.camera; cam.updateMatrixWorld()
        if (!n) rec.issue = 'no-actor'
        else {
          const h = g.headOf(n), p = h.clone().project(cam), d = cam.position.distanceTo(h)
          rec.d = +d.toFixed(1); rec.ndc = [+p.x.toFixed(2), +p.y.toFixed(2)]
          const bodies = [g.player, ...g.npcs.values(), ...g.enemies].filter(a => a !== n && a.root?.parent)
          R.set(cam.position, h.clone().sub(cam.position).normalize()); R.near = 0.05; R.far = Math.max(0.1, d - 0.35)
          const visible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }
          const hit = R.intersectObjects([...g.world.occluders.filter(visible), ...bodies.map(a => a.root)], true).find(h => visible(h.object))
          const issues = []
          if (!(Math.abs(p.x) < 0.88 && p.y > -0.85 && p.y < 0.93 && p.z < 1)) issues.push('offframe')
          if (hit) { const who = bodies.find(a => { let q = hit.object; while (q) { if (q === a.root) return true; q = q.parent } return false }); issues.push(`blocked:${who ? who.id || who.type || 'player' : hit.object.name || 'mesh'}@${hit.distance.toFixed(1)}`) }
          if (d > 13) issues.push('far')
          if (!g.cinematic) issues.push('freecam')
          rec.issue = issues.join(' ')
        }
      } catch (e) { rec.issue = 'err ' + e.message }
      log.push(rec); if (rec.k !== hold && !(typeof hold === 'string' && text.includes(hold))) ui.advance?.()
    }
    return pr
  }
  const iv = setInterval(() => {
    if (ui.choose) ui.choose(choice)
    if (ui.breathe) ui.breathe()
    if (state.cutscene) ui.endCutscene?.()
    // prompts a scene sets directly (not through g.interact): walk over and press E
    const it = g.interactable
    if (it && !it._auto) { it._auto = true; const pp = typeof it.pos === 'function' ? it.pos() : it.pos; near(pp.x, pp.z, Math.min(1.4, (it.r || 2) * 0.5)); setTimeout(() => { if (g.interactable === it) { g.interactable = null; it.done() } }, 250) }
    for (const e of g.enemies) if (e.alive) try { e.takeHit(9999, g.player.pos.clone().sub(e.pos).normalize().negate(), 0, true) } catch {}
  }, 350)
  g.dropNpc('titleMonk'); g.cine(false); g.world.setBloom(0); g.world.setPetals(0)
  try { await g.start(from) } finally { clearInterval(iv); Object.assign(settings, keep) }
  return report()
}
