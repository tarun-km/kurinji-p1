import * as THREE from 'three'
import { heightAt } from './world/terrain'

/** Bullet3 (ammo.js) world for props: crates, barrels, falling boulders. */
export class Physics {
  async init(scene) {
    this.scene = scene
    this.bodies = []
    this.fixed = []; this.resources = []; this.propKit = {}
    try {
      const { default: AmmoInit } = await import('ammojs-typed')
      const A = this.A = await AmmoInit.call(globalThis)
      const cfg = new A.btDefaultCollisionConfiguration(), dispatcher = new A.btCollisionDispatcher(cfg), broadphase = new A.btDbvtBroadphase(), solver = new A.btSequentialImpulseConstraintSolver()
      this.resources.push(cfg, dispatcher, broadphase, solver)
      this.world = new A.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, cfg)
      const gravity = new A.btVector3(0, -14, 0); this.world.setGravity(gravity); A.destroy(gravity)
      this.tmpT = new A.btTransform(); this.tmpV = new A.btVector3(0, 0, 0); this.ok = true
    } catch (e) { console.warn('Physics unavailable', e); this.ok = false }
    return this
  }
  /** Triangle-mesh ground patch around a centre (cheap: only where props live). */
  addGroundPatch(cx, cz, size = 50, step = 2) {
    if (!this.ok) return
    const A = this.A, mesh = new A.btTriangleMesh(), v = (x, z) => new A.btVector3(x, heightAt(x, z), z)
    for (let x = cx - size; x < cx + size; x += step) for (let z = cz - size; z < cz + size; z += step) {
      const a = v(x, z), b = v(x + step, z), c = v(x, z + step), d = v(x + step, z + step)
      mesh.addTriangle(a, c, b, false); mesh.addTriangle(b, c, d, false)
      for (const vertex of [a, b, c, d]) A.destroy(vertex)
    }
    const shape = new A.btBvhTriangleMeshShape(mesh, true, true)
    const t = new A.btTransform(); t.setIdentity()
    const motion = new A.btDefaultMotionState(t), inertia = new A.btVector3(0, 0, 0), info = new A.btRigidBodyConstructionInfo(0, motion, shape, inertia), body = new A.btRigidBody(info)
    A.destroy(info); A.destroy(inertia); A.destroy(t)
    body.setFriction(0.9); this.world.addRigidBody(body)
    this.fixed.push({ body, shape, motion, mesh })
  }
  addProp(kind, x, z, y0 = 0.6) {
    let kit = this.propKit[kind]
    const col = kind === 'barrel' ? 0x7a4a26 : kind === 'boulder' ? 0x6a6560 : 0x9a7a4a
    if (!kit) kit = this.propKit[kind] = { geometry: kind === 'barrel' ? new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10) : kind === 'boulder' ? new THREE.DodecahedronGeometry(0.8, 0) : new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, flatShading: true }) }
    const mesh = new THREE.Mesh(kit.geometry, kit.material)
    mesh.castShadow = mesh.receiveShadow = true
    mesh.position.set(x, heightAt(x, z) + y0, z); this.scene.add(mesh)
    const rec = { mesh, kind, body: null }
    if (this.ok) {
      const A = this.A
      const size = new A.btVector3(kind === 'barrel' ? 0.45 : 0.5, kind === 'barrel' ? 0.55 : 0.5, kind === 'barrel' ? 0.45 : 0.5)
      const shape = kind === 'barrel' ? new A.btCylinderShape(size) : kind === 'boulder' ? new A.btSphereShape(0.75) : new A.btBoxShape(size)
      A.destroy(size)
      const mass = kind === 'boulder' ? 8 : 2
      const t = new A.btTransform(); t.setIdentity(); this.tmpV.setValue(mesh.position.x, mesh.position.y, mesh.position.z); t.setOrigin(this.tmpV)
      const inertia = new A.btVector3(0, 0, 0); shape.calculateLocalInertia(mass, inertia)
      const motion = new A.btDefaultMotionState(t), info = new A.btRigidBodyConstructionInfo(mass, motion, shape, inertia), body = new A.btRigidBody(info)
      A.destroy(info); A.destroy(inertia); A.destroy(t)
      body.setFriction(0.7); body.setRestitution(0.2); body.setDamping(0.05, 0.3)
      this.world.addRigidBody(body); Object.assign(rec, { body, shape, motion })
    }
    this.bodies.push(rec)
    return rec
  }
  /** Kinematic sphere that follows the player so they shove props around. */
  addKinematicSphere(r = 0.55) {
    if (!this.ok) return null
    const A = this.A, shape = new A.btSphereShape(r)
    const t = new A.btTransform(); t.setIdentity()
    const motion = new A.btDefaultMotionState(t), inertia = new A.btVector3(0, 0, 0), info = new A.btRigidBodyConstructionInfo(0, motion, shape, inertia), body = new A.btRigidBody(info)
    A.destroy(info); A.destroy(inertia); A.destroy(t)
    body.setCollisionFlags(body.getCollisionFlags() | 2) // CF_KINEMATIC_OBJECT
    body.setActivationState(4)                             // DISABLE_DEACTIVATION
    this.world.addRigidBody(body)
    this.fixed.push({ body, shape, motion })
    return body
  }
  moveKinematic(body, p) {
    if (!body) return
    const t = this.tmpT; t.setIdentity(); this.tmpV.setValue(p.x, p.y, p.z); t.setOrigin(this.tmpV)
    body.getMotionState().setWorldTransform(t)
  }
  /** Radial impulse from point (attacks, shockwaves). */
  blast(p, radius, power) {
    if (!this.ok) return
    for (const b of this.bodies) {
      const d = b.mesh.position.distanceTo(p); if (d > radius || !b.body) continue
      const dir = b.mesh.position.clone().sub(p).setY(0).normalize().multiplyScalar(power * (1 - d / radius))
      b.body.activate(); this.tmpV.setValue(dir.x, power * 0.5 * (1 - d / radius), dir.z); b.body.applyCentralImpulse(this.tmpV)
    }
  }
  dropBoulder(x, z) {
    const rec = this.addProp('boulder', x, z, 14)
    rec.ttl = 9; return rec
  }
  step(dt) {
    if (this.ok && dt > 0) this.world.stepSimulation(dt, 3, 1 / 60)
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i]
      if (b.ttl != null && (b.ttl -= dt) <= 0) { this.removeBody(b); this.bodies.splice(i, 1); continue }
      if (!b.body) continue
      b.body.getMotionState().getWorldTransform(this.tmpT)
      const o = this.tmpT.getOrigin(), q = this.tmpT.getRotation()
      b.mesh.position.set(o.x(), o.y(), o.z()); b.mesh.quaternion.set(q.x(), q.y(), q.z(), q.w())
    }
  }
  velocityOf(rec) { if (!rec.body) return 0; const v = rec.body.getLinearVelocity(); return Math.hypot(v.x(), v.y(), v.z()) }
  removeBody(rec) {
    if (rec.mesh?.isObject3D) this.scene.remove(rec.mesh)
    if (!rec.body || !this.ok) return
    this.world.removeRigidBody(rec.body)
    for (const object of [rec.body, rec.motion, rec.shape, rec.mesh?.isObject3D ? null : rec.mesh]) if (object) this.A.destroy(object)
    rec.body = null
  }
  destroy() {
    for (const rec of [...this.bodies, ...this.fixed]) this.removeBody(rec)
    for (const kit of Object.values(this.propKit)) { kit.geometry.dispose(); kit.material.dispose() }
    if (this.ok) { this.A.destroy(this.tmpT); this.A.destroy(this.tmpV); this.A.destroy(this.world); for (const resource of [...this.resources].reverse()) this.A.destroy(resource) }
    this.ok = false; this.bodies = []; this.fixed = []
  }
}
