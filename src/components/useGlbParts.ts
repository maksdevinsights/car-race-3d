import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { BufferGeometry, Material, Matrix4, Mesh } from 'three'

/** One mesh of a GLB, with its placement relative to the model's origin. */
export type GlbPart = { geometry: BufferGeometry; material: Material; matrix: Matrix4; name: string }

/**
 * Splits a GLB into its meshes so each can be drawn as an InstancedMesh: one
 * draw call per part however many copies of the model are placed. Geometry
 * and materials stay owned by drei's GLTF cache.
 */
export function useGlbParts(url: string): GlbPart[] {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const parts: GlbPart[] = []
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      parts.push({
        geometry: mesh.geometry,
        material: mesh.material as Material,
        matrix: mesh.matrixWorld.clone(),
        name: mesh.name,
      })
    })
    return parts
  }, [scene])
}
