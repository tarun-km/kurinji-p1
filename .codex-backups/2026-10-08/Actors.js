import * as THREE from 'three'
import { makeCharacter } from './Characters'
import { heightAt, BOUNDS } from './world/terrain'
import { state } from './store'

const tmp = new THREE.Vector3()
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d }

function collide(pos, r, colliders) {
  for (const c of colliders) {
    if (!c.r) continue
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r
    if (d < m && d > 0.0001) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m }
  }
  pos.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, pos.x)); pos.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, pos.z))
}

/* ======================================================================= */
export class NPC {
  constructor(game, id, preset, name, extra) {
    this.game = game; this.id = id; this.name = name
    this.char = makeCharacter(preset, extra)
    this.root = this.char.root
    this.pos = this.root.position
    this.facing = 0; this.target = null; this.speed = 0; this.walkSpeed = 2.4; this.lookAtPlayer = true
    game.scene.add(this.root)
  }
  setPos(x, z, face) { this.pos.set(x, heightAt(x, z), z); if (face != null) this.facing = this.root.rotation.y = face; this.target = null }
  walkTo(x, z, speed = 2.4) { this.target = new THREE.Vector3(x, 0, z); this.walkSpeed = speed; return new Promise(r => this._arrive = r) }
  face(p) { this.facing = Math.atan2(p.x - this.pos.x, p.z - this.pos.z) }
  head() { return tmp.copy(this.pos).setY(this.pos.y + 2.2 * (this.char.o.child ? 0.65 : 1) * this.char.o.scale) }
  update(dt) {
    let sp = 0
    if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz)
      if (d < 0.15) { this.target = null; this._arrive?.(); this._arrive = null }
      else { const s = Math.min(d, this.walkSpeed * dt); this.pos.x += dx / d * s; this.pos.z += dz / d * s; this.facing = Math.atan2(dx, dz); sp = this.walkSpeed / 5 }
    } else if (this.lookAtPlayer && !this.char.sustain && this.game.player && this.pos.distanceTo(this.game.player.pos) < 6) this.face(this.game.player.pos)
    if (!this.char.sustain || this.char.sustain === 'bow') this.pos.y = heightAt(this.pos.x, this.pos.z)
    this.root.rotation.y += angDiff(this.root.rotation.y, this.facing) * Math.min(1, dt * 6)
    this.char.update(dt, sp)
  }
  remove() { this.game.scene.remove(this.root) }
}

/* ======================================================================= */
const ATTACKS = {
  attack1: { dur: 0.42, dmg: 12, range: 2.6, arc: 1.3, breath: 4 },
  attack2: { dur: 0.42, dmg: 14, range: 2.6, arc: 1.4, breath: 4 },
  attack3: { dur: 0.6, dmg: 22, range: 2.9, arc: 2.0, breath: 7, kb: 5 },
  heavy: { dur: 0.85, dmg: 34, range: 3.0, arc: 1.8, breath: 9, kb: 9, hitAt: 0.5 },
}

export class Player {
  constructor(game) {
    this.game = game
    this.setLook('aruvan')
    this.vel = new THREE.Vector3()
    this.facing = Math.PI; this.combo = 0; this.comboTimer = 0
    this.iframes = 0; this.dodgeT = 0; this.dodgeDir = new THREE.Vector3()
    this.hurtCd = 0; this.speedMul = 1; this.canFight = true; this.lastHit = 0
    this.perfectWindow = 0
  }
  setLook(preset, extra) {
    const old = this.char
    if (old) this.game.scene.remove(old.root)
    this.char = makeCharacter(preset, extra)
    const p = old ? old.root.position.clone() : new THREE.Vector3()
    this.root = this.char.root; this.root.position.copy(p); this.pos = this.root.position
    this.game.scene.add(this.root)
  }
  setPos(x, z, face) { this.pos.set(x, heightAt(x, z), z); if (face != null) this.facing = this.root.rotation.y = face; this.vel.set(0, 0, 0) }

  update(dt, input, camYaw, controllable) {
    const ch = this.char
    let speed01 = 0
    this.iframes -= dt; this.hurtCd -= dt; this.comboTimer -= dt; this.perfectWindow -= dt
    if (this.comboTimer <= 0) { this.combo = 0; state.combo = 0 }

    if (controllable && state.hp > 0) {
      const m = input.move()
      const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x)
      const dir = fwd.multiplyScalar(m.y).add(right.multiplyScalar(m.x))
      const mag = Math.min(1, dir.length())
      const fighting = ch.busy && ch.action.name !== 'dodge'
      const max = (input.sprint && !state.inCombat ? 7.5 : 5) * this.speedMul * (fighting ? 0.25 : 1)
      if (mag > 0.05) { dir.normalize(); if (!fighting) this.facing = Math.atan2(dir.x, dir.z) }
      this.vel.lerp(dir.multiplyScalar(max * mag), Math.min(1, dt * 10))
      speed01 = this.vel.length() / 7

      if (this.canFight) {
        if (input.take('dodge') && this.dodgeT <= 0) this.dodge(mag > 0.05 ? new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)) : new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing)))
        if (input.take('special') && state.breath >= 100) this.special()
        if (input.take('attack')) this.attack(false)
        if (input.take('heavy')) this.attack(true)
      } else { input.take('attack'); input.take('heavy'); input.take('dodge'); input.take('special') }
    } else this.vel.multiplyScalar(Math.max(0, 1 - dt * 8))

    if (this.dodgeT > 0) { this.dodgeT -= dt; this.vel.copy(this.dodgeDir).multiplyScalar(11 * Math.max(0.3, this.dodgeT / 0.45)) }
    // soft auto-aim: turn toward nearest enemy while attacking
    if (ch.busy && ch.action.name.startsWith('attack') || ch.action?.name === 'heavy') {
      const e = this.game.nearestEnemy(this.pos, 4)
      if (e) this.facing += angDiff(this.facing, Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z)) * Math.min(1, dt * 10)
    }
    this.pos.addScaledVector(this.vel, dt)
    collide(this.pos, 0.45, this.game.world.colliders)
    for (const e of this.game.enemies) if (e.alive) { tmp.subVectors(this.pos, e.pos).setY(0); const d = tmp.length(), m = 0.5 + e.radius; if (d < m && d > 0.001) this.pos.addScaledVector(tmp.normalize(), m - d) }
    if (!ch.sustain) this.pos.y += (heightAt(this.pos.x, this.pos.z) - this.pos.y) * Math.min(1, dt * 20)
    this.root.rotation.y += angDiff(this.root.rotation.y, this.facing) * Math.min(1, dt * 14)
    ch.update(dt, Math.min(1, speed01))
    this.game.physics.moveKinematic(this.kBody, tmp.copy(this.pos).setY(this.pos.y + 0.6))
  }

  attack(heavy) {
    const ch = this.char
    if (this.dodgeT > 0) return
    if (ch.busy) { if (!heavy && ch.action.t > ch.action.dur * 0.55 && ch.action.name !== 'heavy') this.queued = true; else return }
    const name = heavy ? 'heavy' : ['attack1', 'attack2', 'attack3'][this.combo % 3]
    const A = ATTACKS[name]
    ch.play(name, A.dur, () => this.resolveHit(A, name))
    if (A.hitAt) ch.action.hitAt = A.hitAt
    this.game.audio.play('swing', { rate: heavy ? 0.7 : 0.9 + Math.random() * 0.3 })
    if (!heavy) this.combo++
  }
  resolveHit(A, name) {
    let hits = 0
    const fwd = this.facing
    for (const e of this.game.enemies) {
      if (!e.alive) continue
      tmp.subVectors(e.pos, this.pos); const d = tmp.length()
      if (d > A.range + e.radius) continue
      if (Math.abs(angDiff(fwd, Math.atan2(tmp.x, tmp.z))) > A.arc) continue
      e.takeHit(A.dmg * (1 + Math.min(state.combo, 20) * 0.02), tmp.normalize(), A.kb || 2, name === 'heavy')
      hits++
    }
    const p = tmp.set(this.pos.x + Math.sin(fwd) * 1.8, this.pos.y + 1, this.pos.z + Math.cos(fwd) * 1.8)
    this.game.physics.blast(p, 2.5, name === 'heavy' ? 14 : 6)
    if (hits) {
      this.comboTimer = 2.2; state.combo += hits
      state.breath = Math.min(100, state.breath + A.breath * hits)
      this.game.audio.play(name === 'heavy' ? 'heavy' : 'hit', { rate: 0.9 + Math.random() * 0.25 })
      this.game.hitStop(name === 'heavy' || name === 'attack3' ? 0.09 : 0.045)
      this.game.shake(name === 'heavy' ? 0.35 : 0.15)
      this.game.world.spawnBurst(p, name === 'heavy' ? 30 : 14, 0xffc070)
    }
    if (this.queued) { this.queued = false; setTimeout(() => this.attack(false), 10) }
  }
  dodge(dir) {
    this.dodgeT = 0.45; this.iframes = 0.38; this.dodgeDir.copy(dir)
    this.char.action = null; this.char.play('dodge', 0.45)
    this.game.audio.play('dodge')
    // perfect dodge: an enemy strike landing within the window
    if (this.game.enemies.some(e => e.alive && e.state === 'windup' && e.stateT > e.windup - 0.28 && e.pos.distanceTo(this.pos) < e.range + 1.5)) {
      this.game.slowMo(0.25, 0.9); state.breath = Math.min(100, state.breath + 18); this.game.toast('Still Mind — perfect evade')
    }
  }
  special() {
    state.breath = 0
    this.char.play('special', 1.0, () => {
      this.game.audio.play('special')
      this.game.world.spawnBurst(tmp.copy(this.pos).setY(this.pos.y + 1), 120, 0xa090ff, 12)
      this.game.shockRing(this.pos, 7, 0xa090ff)
      this.game.physics.blast(this.pos, 9, 25)
      for (const e of this.game.enemies) if (e.alive && e.pos.distanceTo(this.pos) < 7.5) e.takeHit(45, tmp.subVectors(e.pos, this.pos).normalize(), 10, true)
      this.game.shake(0.5)
    })
    this.char.action.hitAt = 0.55
    this.iframes = 1.1
    this.game.slowMo(0.4, 1.1)
  }
  takeHit(dmg, from) {
    if (this.iframes > 0 || this.hurtCd > 0 || state.hp <= 0) return false
    state.hp = Math.max(0, state.hp - dmg); this.hurtCd = 0.35
    this.char.hitFlash(0xaa1111, 0.15)
    if (!this.char.busy || this.char.action.name !== 'heavy') this.char.play('hit', 0.3)
    this.vel.add(tmp.subVectors(this.pos, from).setY(0).normalize().multiplyScalar(6))
    this.game.audio.play('hurt'); this.game.shake(0.3); this.game.damageFlash()
    if (state.hp <= 0) { this.char.action = null; this.char.play('die', 1.2); this.game.onPlayerDeath() }
    return true
  }
}

/* ======================================================================= */
const ENEMY = {
  dummy: { hp: 40, speed: 0, dmg: 0, range: 0, windup: 99, recover: 1, radius: 0.45, preset: 'dummy', passive: true },
  soldier: { hp: 48, speed: 3.3, dmg: 9, range: 2.2, windup: 0.6, recover: 0.9, radius: 0.45, preset: 'soldier', attack: 'attack1' },
  captain: { hp: 80, speed: 3.6, dmg: 12, range: 2.3, windup: 0.5, recover: 0.7, radius: 0.5, preset: 'soldier', extra: { plume: 0xd4a017, cape: 0x6b0f0f }, attack: 'attack2' },
  brute: { hp: 130, speed: 2.4, dmg: 20, range: 2.8, windup: 1.0, recover: 1.3, radius: 0.75, preset: 'brute', attack: 'slam', poise: 40 },
  rudhra: { hp: 420, speed: 4.6, dmg: 13, range: 2.4, windup: 0.42, recover: 0.5, radius: 0.5, preset: 'rudhra', attack: 'attack1', boss: true, poise: 60 },
  dunkan: { hp: 700, speed: 3.2, dmg: 22, range: 3.4, windup: 0.8, recover: 0.9, radius: 0.8, preset: 'dunkan', attack: 'slam', boss: true, poise: 90 },
}

export class Enemy {
  constructor(game, type, x, z, opts = {}) {
    this.game = game; this.type = type
    const D = this.def = { ...ENEMY[type], ...opts }
    this.char = makeCharacter(D.preset, D.extra)
    this.root = this.char.root; this.pos = this.root.position
    this.pos.set(x, heightAt(x, z), z); game.scene.add(this.root)
    this.hp = this.maxHp = D.hp; this.radius = D.radius; this.range = D.range; this.windup = D.windup
    this.state = 'idle'; this.stateT = 0; this.facing = Math.atan2(-x, -z); this.alive = true
    this.vel = new THREE.Vector3(); this.poise = D.poise || 0; this.cool = Math.random() * 1.5
    this.nonLethal = opts.nonLethal; this.phase = 1
    this.strafe = Math.random() < 0.5 ? -1 : 1
    if (D.boss) state.boss = { name: opts.title || type, hp: this.hp, max: this.maxHp }
  }
  set(s) { this.state = s; this.stateT = 0 }
  update(dt) {
    const ch = this.char, P = this.game.player, D = this.def
    this.stateT += dt; this.cool -= dt
    if (!this.alive) { ch.update(dt, 0); this.deadT = (this.deadT || 0) + dt; return }
    tmp.subVectors(P.pos, this.pos).setY(0); const dist = tmp.length(), toP = Math.atan2(tmp.x, tmp.z)
    let sp = 0
    const playerDown = state.hp <= 0
    if (D.passive) { ch.update(dt, 0); return }
    switch (this.state) {
      case 'idle': if (dist < 30 && !this.game.cinematic) this.set('chase'); break
      case 'chase': {
        this.facing = toP
        const crowd = this.game.enemies.filter(e => e.alive && e !== this && (e.state === 'windup' || e.state === 'strike')).length
        const want = crowd >= 2 && !D.boss ? this.range + 2.5 : this.range * 0.85
        if (dist > want) { const s = D.speed * (dist > 8 ? 1.2 : 1); this.vel.set(Math.sin(toP) * s, 0, Math.cos(toP) * s); sp = s / 5 }
        else { // circle the player while waiting
          this.vel.set(Math.cos(toP) * this.strafe * 1.4, 0, -Math.sin(toP) * this.strafe * 1.4); sp = 0.3
          if (this.cool <= 0 && dist <= this.range + 0.3 && !playerDown && !this.game.cinematic) this.beginAttack(dist)
        }
        if (D.boss && this.cool <= 0 && !playerDown && !this.game.cinematic) this.bossThink(dist)
        break
      }
      case 'windup': {
        this.vel.multiplyScalar(0.8); this.facing += angDiff(this.facing, toP) * Math.min(1, dt * (this.lunge ? 2 : 5))
        ch.setTint(Math.sin(this.stateT * 30) > 0 ? 0x661a00 : 0)
        if (this.stateT >= this.windup) { ch.setTint(0); this.set('strike'); this.doStrike() }
        break
      }
      case 'strike': if (this.lunge) { this.vel.set(Math.sin(this.facing) * 14, 0, Math.cos(this.facing) * 14); if (this.stateT > 0.32) { this.lunge = false; this.checkHit(2.0, 1.0, this.def.dmg * 1.2) } } else this.vel.multiplyScalar(0.85)
        if (this.stateT > 0.35) this.set('recover'); break
      case 'recover': this.vel.multiplyScalar(0.85); if (this.stateT > D.recover) { this.cool = 0.4 + Math.random() * (D.boss ? 0.6 : 1.6); this.set('chase') } break
      case 'stagger': this.vel.multiplyScalar(0.9); if (this.stateT > 0.6) this.set('chase'); break
    }
    this.pos.addScaledVector(this.vel, dt)
    collide(this.pos, this.radius, this.game.world.colliders)
    for (const e of this.game.enemies) if (e !== this && e.alive) { tmp.subVectors(this.pos, e.pos).setY(0); const d = tmp.length(), m = this.radius + e.radius; if (d < m && d > 0.001) this.pos.addScaledVector(tmp.normalize(), (m - d) * 0.5) }
    this.pos.y = heightAt(this.pos.x, this.pos.z)
    this.root.rotation.y += angDiff(this.root.rotation.y, this.facing) * Math.min(1, dt * 10)
    ch.update(dt, Math.min(1, sp))
  }
  beginAttack(dist) {
    this.set('windup'); this.attackName = this.def.attack
    if (this.attackName === 'slam') this.game.telegraph(this.pos, this.facing, this.range + 0.8, this.windup)
  }
  bossThink(dist) {
    const D = this.def
    if (this.type === 'rudhra') {
      if (dist > 5 && dist < 12 && Math.random() < 0.02) { this.set('windup'); this.windup = 0.55; this.lunge = true; this.attackName = 'lunge'; this.game.telegraphLine(this.pos, this.facing, 9, 0.55) }
      else this.windup = D.windup
      if (this.phase === 2) { this.def.speed = 5.4; this.def.recover = 0.35 }
    }
    if (this.type === 'dunkan') {
      if (this.phase === 2 && Math.random() < 0.012) { this.set('windup'); this.windup = 1.2; this.attackName = 'quake'; this.game.telegraph(this.pos, 0, 8, 1.2, true) }
      else if (dist > 6 && Math.random() < 0.015) { this.set('windup'); this.windup = 0.7; this.lunge = true; this.attackName = 'lunge'; this.game.telegraphLine(this.pos, this.facing, 10, 0.7) }
      else this.windup = D.windup
    }
  }
  doStrike() {
    const ch = this.char, D = this.def, n = this.attackName
    this.game.audio.play('swing', { rate: 0.7 })
    if (n === 'lunge') { ch.play('lunge', 0.5); return }
    if (n === 'quake') {
      ch.play('slam', 0.7, () => {
        this.game.audio.play('heavy', { rate: 0.6 }); this.game.shake(0.7); this.game.shockRing(this.pos, 8, 0xff5a2a)
        this.checkHit(8, Math.PI, D.dmg * 1.3)
        for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28, r = 4 + Math.random() * 6; this.game.physics.dropBoulder(this.pos.x + Math.cos(a) * r, this.pos.z + Math.sin(a) * r) }
      }); ch.action.hitAt = 0.4; return
    }
    ch.play(n === 'slam' ? 'slam' : n, n === 'slam' ? 0.6 : 0.45, () => {
      if (n === 'slam') { this.game.shake(0.35); this.game.audio.play('heavy', { rate: 0.8 }); this.game.world.spawnBurst(tmp.set(this.pos.x + Math.sin(this.facing) * 2, this.pos.y + 0.2, this.pos.z + Math.cos(this.facing) * 2), 25, 0xb0a080); this.game.physics.blast(this.pos, 5, 10) }
      this.checkHit(this.range + 0.5, 1.0, D.dmg)
    })
    ch.action.hitAt = 0.3
  }
  checkHit(range, arc, dmg) {
    const P = this.game.player
    tmp.subVectors(P.pos, this.pos).setY(0)
    if (tmp.length() > range) return
    if (Math.abs(angDiff(this.facing, Math.atan2(tmp.x, tmp.z))) > arc) return
    P.takeHit(dmg, this.pos)
  }
  takeHit(dmg, dir, kb, heavy) {
    if (!this.alive || this.state === 'defeated' || this.state === 'leaving') return
    this.hp -= dmg
    this.char.hitFlash(0xffffff, 0.08)
    this.vel.addScaledVector(dir.setY(0), kb * (this.def.boss ? 0.3 : 1))
    if (this.def.boss) {
      if (state.boss) state.boss.hp = Math.max(0, this.hp)
      this.poise -= dmg
      if (this.poise <= 0) { this.poise = this.def.poise; this.set('stagger'); this.char.play('hit', 0.4); this.lunge = false }
      if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; this.game.onBossPhase?.(this) }
    } else if (heavy || this.state !== 'windup' || this.def.passive) {
      this.flinch = (this.flinch || 0) + 1
      if (heavy || (this.type !== 'brute' && this.flinch % 3 === 0)) { this.set('stagger'); this.char.play('hit', 0.3); this.lunge = false }
    }
    if (this.def.passive) this.game.world.spawnBurst(tmp.copy(this.pos).setY(this.pos.y + 1.2), 10, 0xd8c08a, 4)
    if (this.hp <= 0) this.die()
  }
  die() {
    this.alive = false; this.state = 'dead'; this.char.action = null; this.char.setTint(0)
    if (this.def.boss) { this.hp = 1; this.alive = true; this.state = 'defeated'; this.char.sustain = 'kneel'; this.game.onBossDefeated?.(this); return }
    if (this.nonLethal) { this.char.sustain = 'kneel' } else this.char.play('die', 0.9)
    this.game.onEnemyDown(this)
  }
  remove() { this.game.scene.remove(this.root) }
}
