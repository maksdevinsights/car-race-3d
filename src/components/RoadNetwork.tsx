import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Matrix4, PlaneGeometry } from 'three'
import type { Group, InstancedMesh } from 'three'
import type { RefObject } from 'react'
import { FRAME_ORDER } from '../lib/frame'
import {
  BLOCK_TILES,
  ROAD_HALF_WIDTH,
  TILE_LENGTH,
  avenueX,
  nearestAvenue,
  nearestStreet,
  streetZ,
} from '../lib/roadNetwork'
import { useGlbParts } from './useGlbParts'

const URL = '/models/road-segment.glb'

/**
 * Junctions laid in each direction around the car's nearest one. Three reaches
 * at least 196 m, past where the fog closes in, so tiles never pop in view.
 */
const REACH = 3
const JUNCTIONS = (2 * REACH + 1) ** 2

/** Each junction owns the avenue block north of it and the street block east of it. */
const TILES = JUNCTIONS * BLOCK_TILES * 2

/** Plain tarmac, no markings, sized to the gap where two roads cross. */
const JUNCTION_SIZE = 2 * ROAD_HALF_WIDTH

const QUARTER_TURN = new Matrix4().makeRotationY(Math.PI / 2)

/**
 * The road is drawn from the network, not stored as objects: every tile of a
 * kind is one instance, so the whole visible grid is five draw calls — the
 * four parts of road-segment.glb plus the junction squares. Instances are
 * re-laid only when the car's nearest junction changes.
 */
export function RoadNetwork({ carRef }: { carRef: RefObject<Group | null> }) {
  const parts = useGlbParts(URL)

  const surface = parts.find((part) => part.name === 'road_surface') ?? parts[0]
  const junctionGeometry = useMemo(
    () => new PlaneGeometry(JUNCTION_SIZE, JUNCTION_SIZE).rotateX(-Math.PI / 2),
    [],
  )

  const tileMeshes = useRef<(InstancedMesh | null)[]>([])
  const junctionMesh = useRef<InstancedMesh | null>(null)
  const laidAt = useRef<string | null>(null)

  // Scratch, so re-laying allocates nothing.
  const tile = useRef(new Matrix4())
  const instance = useRef(new Matrix4())

  useFrame(() => {
    const car = carRef.current
    if (!car) return
    const ci = nearestAvenue(car.position.x)
    const cj = nearestStreet(car.position.z)
    const key = `${ci},${cj}`
    if (laidAt.current === key) return
    if (!junctionMesh.current || tileMeshes.current.some((mesh) => !mesh)) return
    laidAt.current = key

    let n = 0
    let junction = 0
    const lay = () => {
      parts.forEach((part, k) => {
        instance.current.multiplyMatrices(tile.current, part.matrix)
        tileMeshes.current[k]!.setMatrixAt(n, instance.current)
      })
      n++
    }

    for (let i = ci - REACH; i <= ci + REACH; i++) {
      for (let j = cj - REACH; j <= cj + REACH; j++) {
        const x = avenueX(i)
        const z = streetZ(j)

        tile.current.makeTranslation(x, 0, z)
        junctionMesh.current.setMatrixAt(junction++, tile.current)

        for (let t = 0; t < BLOCK_TILES; t++) {
          const along = ROAD_HALF_WIDTH + TILE_LENGTH / 2 + t * TILE_LENGTH
          // Avenue tile, running north along +Z from this junction.
          tile.current.makeTranslation(x, 0, z + along)
          lay()
          // Street tile, turned a quarter so it runs east along +X.
          tile.current.makeTranslation(x + along, 0, z).multiply(QUARTER_TURN)
          lay()
        }
      }
    }

    for (const mesh of tileMeshes.current) mesh!.instanceMatrix.needsUpdate = true
    junctionMesh.current.instanceMatrix.needsUpdate = true
  }, FRAME_ORDER.world)

  return (
    <group>
      {parts.map((part, k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            tileMeshes.current[k] = el
          }}
          args={[part.geometry, part.material, TILES]}
          // Instances spread over the whole grid; the base geometry's bounds
          // would cull them wrongly.
          frustumCulled={false}
          // Geometry and material belong to the cached GLB, shared across runs.
          dispose={null}
        />
      ))}
      <instancedMesh
        ref={junctionMesh}
        args={[junctionGeometry, surface.material, JUNCTIONS]}
        frustumCulled={false}
        dispose={null}
      />
    </group>
  )
}

useGLTF.preload(URL)
