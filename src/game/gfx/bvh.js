import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'

/* ===========================================================================
   three-mesh-bvh accelerated raycasts for static world meshes (occluders used by
   the camera clear-shot / line-of-sight tests). 'indirect' BVHs never touch the
   render geometry (no index is added, triangle order is unchanged), so merged
   kit geometry renders exactly as before.

     accelerateRaycasts(roots)   build BVHs for every static mesh under roots
                                 (idempotent; skips skinned / instanced / morphed)
     disposeRaycasts(roots)      free them again
   A Raycaster with `firstHitOnly = true` gets the nearest hit per mesh only.
=========================================================================== */
export const BVH_STATS = { meshes: 0, tris: 0, ms: 0 }

function eligible(o) {
  const g = o.geometry
  return o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !o.isBatchedMesh && g?.attributes?.position &&
    !Object.keys(g.morphAttributes || {}).length && g.attributes.position.count >= 3
}

export function accelerateRaycasts(roots) {
  const t0 = performance.now()
  for (const root of [].concat(roots || [])) root?.traverse?.(o => {
    if (!eligible(o)) return
    const g = o.geometry
    if (!g.boundsTree) {
      try { computeBoundsTree.call(g, { indirect: true, maxLeafSize: 8 }) } catch (e) { console.warn('[bvh] skipped', o.name, e); return }
      BVH_STATS.meshes++; BVH_STATS.tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    }
    if (o.raycast !== acceleratedRaycast) o.raycast = acceleratedRaycast
  })
  BVH_STATS.ms += performance.now() - t0
  return BVH_STATS
}

export function disposeRaycasts(roots) {
  for (const root of [].concat(roots || [])) root?.traverse?.(o => { if (o.geometry?.boundsTree) disposeBoundsTree.call(o.geometry) })
}
