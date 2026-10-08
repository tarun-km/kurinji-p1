import * as THREE from 'three'
import AmmoInit from 'ammojs-typed'
import { heightAt } from './world/terrain'

/** Bullet3 (ammo.js) world for props: crates, barrels, falling boulders. */
export class Physics {
  async init(scene) {
    this.scene = scene
    this.bodies = []
    try {
      const A = this.A = await AmmoInit.call(globalThis)
      const cfg = new A.btDefaultCollisionConfiguration()
      this.world = new A.btDiscreteDynamicsWorld(new A.btCollisionDispatcher(cfg), new A.btDbvtBroadphase(), new A.btSequentialImpulseConstraintSolver(), cfg)
      this.world.setGravity(new A.btVector3(0, -14, 0))
      this.tmpT = new A.btTransform(); this.ok = true
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
    }
    const shape = new A.btBvhTriangleMeshShape(mesh, true, true)
    const t = new A.btTransform(); t.setIdentity()
    const body = new A.btRigidBody(new A.btRigidBodyConstructionInfo(0, new A.btDefaultMotionState(t), shape, new A.btVector3(0, 0, 0)))
    body.setFriction(0.9); this.world.addRigidBody(body)
  }
  addProp(kind, x, z, y0 = 0.6) {
    const geo = kind === 'barrel' ? new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10) : kind === 'boulder' ? new THREE.DodecahedronGeometry(0.8, 0) : new THREE.BoxGeometry(1, 1, 1)
    const col = kind === 'barrel' ? 0x7a4a26 : kind === 'boulder' ? 0x6a6560 : 0x9a7a4a
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, flatShading: true }))
    mesh.castShadow = mesh.receiveShadow = true
    mesh.position.set(x, heightAt(x, z) + y0, z); this.scene.add(mesh)
    const rec = { mesh, kind, body: null }
    if (this.ok) {
      const A = this.A
      const shape = kind === 'barrel' ? new A.btCylinderShape(new A.btVector3(0.45, 0.55, 0.45)) : kind === 'boulder' ? new A.btSphereShape(0.75) : new A.btBoxShape(new A.btVector3(0.5, 0.5, 0.5))
      const mass = kind === 'boulder' ? 8 : 2
      const t = new A.btTransform(); t.setIdentity(); t.setOrigin(new A.btVector3(mesh.position.x, mesh.position.y, mesh.position.z))
      const inertia = new A.btVector3(0, 0, 0); shape.calculateLocalInertia(mass, inertia)
      const body = new A.btRigidBody(new A.btRigidBodyConstructionInfo(mass, new A.btDefaultMotionState(t), shape, inertia))
      body.setFriction(0.7); body.setRestitution(0.2); body.setDamping(0.05, 0.3)
      this.world.addRigidBody(body); rec.body = body
    }
    this.bodies.push(rec)
    return rec
  }
  /** Kinematic sphere that follows the player so they shove props around. */
  addKinematicSphere(r = 0.55) {
    if (!this.ok) return null
    const A = this.A, shape = new A.btSphereShape(r)
    const t = new A.btTransform(); t.setIdentity()
    const body = new A.btRigidBody(new A.btRigidBodyConstructionInfo(0, new A.btDefaultMotionState(t), shape, new A.btVector3(0, 0, 0)))
    body.setCollisionFlags(body.getCollisionFlags() | 2) // CF_KINEMATIC_OBJECT
    body.setActivationState(4)                             // DISABLE_DEACTIVATION
    this.world.addRigidBody(body)
    return body
  }
  moveKinematic(body, p) {
    if (!body) return
    const t = this.tmpT; t.setIdentity(); t.setOrigin(new this.A.btVector3(p.x, p.y, p.z))
    body.getMotionState().setWorldTransform(t)
  }
  /** Radial impulse from point (attacks, shockwaves). */
  blast(p, radius, power) {
    if (!this.ok) return
    for (const b of this.bodies) {
      const d = b.mesh.position.distanceTo(p); if (d > radius || !b.body) continue
      const dir = b.mesh.position.clone().sub(p).setY(0).normalize().multiplyScalar(power * (1 - d / radius))
      b.body.activate(); b.body.applyCentralImpulse(new this.A.btVector3(dir.x, power * 0.5 * (1 - d / radius), dir.z))
    }
  }
  dropBoulder(x, z) {
    const rec = this.addProp('boulder', x, z, 14)
    rec.ttl = 9; return rec
  }
  step(dt) {
    if (!this.ok) return
    this.world.stepSimulation(dt, 3, 1 / 60)
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i]
      if (b.ttl != null && (b.ttl -= dt) <= 0) { this.scene.remove(b.mesh); this.world.removeRigidBody(b.body); this.bodies.splice(i, 1); continue }
      if (!b.body) continue
      b.body.getMotionState().getWorldTransform(this.tmpT)
      const o = this.tmpT.getOrigin(), q = this.tmpT.getRotation()
      b.mesh.position.set(o.x(), o.y(), o.z()); b.mesh.quaternion.set(q.x(), q.y(), q.z(), q.w())
    }
  }
  velocityOf(rec) { if (!rec.body) return 0; const v = rec.body.getLinearVelocity(); return Math.hypot(v.x(), v.y(), v.z()) }
}
