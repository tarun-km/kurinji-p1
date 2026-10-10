import nipplejs from 'nipplejs'
import { state } from './store'
import { settings } from './settings'

export class Input {
  constructor(el) {
    this.el = el
    this.keys = new Set()
    this.pressed = new Set()
    this.look = { x: 0, y: 0 }
    this.stick = { x: 0, y: 0 }
    this.locked = false
    this.listeners = []
    const listen = (target, type, fn, options) => { target.addEventListener(type, fn, options); this.listeners.push(() => target.removeEventListener(type, fn, options)) }
    const blocked = () => state.screen !== 'game' || state.paused || state.showJournal || state.loading || state.cutscene
    listen(window, 'keydown', e => {
      if (blocked() || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return
      if (e.repeat) return
      this.keys.add(e.code)
      const map = { KeyJ: 'attack', KeyK: 'heavy', Space: 'jump', KeyF: 'dodge', KeyE: 'interact', KeyQ: 'special', Enter: 'interact', KeyR: 'retry', KeyM: 'map', KeyH: 'mount', KeyG: 'skill' }
      if (map[e.code]) this.pressed.add(map[e.code])
      if (e.code === 'Space') e.preventDefault()
    })
    listen(window, 'keyup', e => this.keys.delete(e.code))
    listen(window, 'blur', () => this.reset())
    listen(el, 'mousedown', e => {
      if (blocked() || state.dialogue || state.choices) return
      if (!this.locked && !state.mobile && !this.noLock) { try { const r = el.requestPointerLock?.(); r?.catch?.(() => { this.noLock = true }) } catch { this.noLock = true } return }
      if (e.button === 0) this.pressed.add('attack')
      if (e.button === 2) this.pressed.add('heavy')
    })
    listen(el, 'contextmenu', e => e.preventDefault())
    listen(document, 'pointerlockchange', () => { const was = this.locked; this.locked = document.pointerLockElement === el; if (was && !this.locked && !blocked() && !state.letterbox) state.paused = true })
    listen(window, 'mousemove', e => { if (this.locked && !blocked()) { this.look.x += e.movementX; this.look.y += e.movementY } })
    // touch-drag camera: any finger on the world that is not on the stick or a button
    let tid = null, lx = 0, ly = 0
    listen(el, 'touchstart', e => { if (blocked()) return; for (const t of e.changedTouches) if (tid == null) { tid = t.identifier; lx = t.clientX; ly = t.clientY } }, { passive: true })
    listen(el, 'touchmove', e => {
      if (blocked()) return
      const k = 1.5 * settings.touchLook
      for (const t of e.changedTouches) if (t.identifier === tid) { this.look.x += (t.clientX - lx) * k; this.look.y += (t.clientY - ly) * k; lx = t.clientX; ly = t.clientY }
    }, { passive: true })
    const endTouch = e => { for (const t of e.changedTouches) if (t.identifier === tid) tid = null }
    listen(el, 'touchend', endTouch); listen(el, 'touchcancel', endTouch)
    // iOS Safari ignores user-scalable=no: block pinch-zoom on the game (double-tap zoom is off via CSS touch-action)
    listen(document, 'gesturestart', e => e.preventDefault())
  }
  /** Virtual stick: appears under the thumb anywhere in the zone, rests at the corner. Full tilt = run. */
  initJoystick(zone) {
    this.joy?.destroy()
    this.joy = nipplejs.create({ zone, mode: 'semi', catchDistance: 140, position: { left: '110px', bottom: '110px' }, color: '#e8b46a', size: 130, restOpacity: 0.55, fadeTime: 120 })
    // nipplejs 1.x passes ONE event object ({ type, target, data }); 0.x passed (event, data).
    this.joy.on('move', (evt, legacy) => {
      const d = legacy ?? evt?.data
      if (!d?.angle) return
      const raw = d.force, f = raw < 0.12 ? 0 : Math.min(1, (raw - 0.12) / 0.78)
      this.stick.x = Math.cos(d.angle.radian) * f; this.stick.y = Math.sin(d.angle.radian) * f
      this.stickRun = raw > 0.95
    })
    this.joy.on('end', () => { this.stick.x = this.stick.y = 0; this.stickRun = false })
  }
  press(a) { this.pressed.add(a); if (state.mobile && settings.haptics) navigator.vibrate?.(a === 'heavy' || a === 'special' ? 18 : 9) }
  take(a) { const h = this.pressed.has(a); this.pressed.delete(a); return h }
  clear() { this.pressed.clear() }
  reset() { this.pressed.clear(); this.keys.clear(); this.look.x = this.look.y = this.stick.x = this.stick.y = 0; this.stickRun = false }
  destroy() { this.reset(); this.joy?.destroy(); for (const remove of this.listeners) remove() }
  /** returns {x: strafe, y: forward} */
  move() {
    let x = 0, y = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    x += this.stick.x; y += this.stick.y
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l }
    return { x, y }
  }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || !!this.stickRun }
  consumeLook() { const l = { ...this.look }; this.look.x = this.look.y = 0; return l }
}
