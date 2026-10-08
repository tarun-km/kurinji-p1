import nipplejs from 'nipplejs'
import { state } from './store'

export class Input {
  constructor(el) {
    this.el = el
    this.keys = new Set()
    this.pressed = new Set()
    this.look = { x: 0, y: 0 }
    this.stick = { x: 0, y: 0 }
    this.locked = false
    addEventListener('keydown', e => {
      if (e.repeat) return
      this.keys.add(e.code)
      const map = { KeyJ: 'attack', KeyK: 'heavy', Space: 'dodge', KeyE: 'interact', KeyF: 'special', KeyQ: 'special', Enter: 'interact', KeyR: 'retry' }
      if (map[e.code]) this.pressed.add(map[e.code])
      if (e.code === 'Space') e.preventDefault()
    })
    addEventListener('keyup', e => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())
    el.addEventListener('mousedown', e => {
      if (state.dialogue || state.choices) return
      if (!this.locked && !state.mobile && !this.noLock) { try { const r = el.requestPointerLock?.(); r?.catch?.(() => { this.noLock = true }) } catch { this.noLock = true } return }
      if (e.button === 0) this.pressed.add('attack')
      if (e.button === 2) this.pressed.add('heavy')
    })
    el.addEventListener('contextmenu', e => e.preventDefault())
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el })
    addEventListener('mousemove', e => { if (this.locked) { this.look.x += e.movementX; this.look.y += e.movementY } })
    // touch-drag camera on the right half
    let tid = null, lx = 0, ly = 0
    el.addEventListener('touchstart', e => { for (const t of e.changedTouches) if (t.clientX > innerWidth * 0.45 && tid == null) { tid = t.identifier; lx = t.clientX; ly = t.clientY } }, { passive: true })
    el.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === tid) { this.look.x += (t.clientX - lx) * 1.6; this.look.y += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY } }, { passive: true })
    el.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === tid) tid = null })
  }
  initJoystick(zone) {
    this.joy = nipplejs.create({ zone, mode: 'static', position: { left: '80px', bottom: '90px' }, color: '#e8b46a', size: 120 })
    this.joy.on('move', (_, d) => { const f = Math.min(1, d.force); this.stick.x = Math.cos(d.angle.radian) * f; this.stick.y = Math.sin(d.angle.radian) * f })
    this.joy.on('end', () => { this.stick.x = this.stick.y = 0 })
  }
  press(a) { this.pressed.add(a) }
  take(a) { const h = this.pressed.has(a); this.pressed.delete(a); return h }
  clear() { this.pressed.clear() }
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
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') }
  consumeLook() { const l = { ...this.look }; this.look.x = this.look.y = 0; return l }
}
