import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Matrix4 } from 'three'
import type { Group } from 'three'
import type { RefObject } from 'react'
import { CHASE_BACK } from '../lib/chase'
import { FRAME_ORDER } from '../lib/frame'
import { CONE, MAX_PER_ROW, generateRow } from '../lib/obstacleRows'
import { ROAD_HALF_WIDTH, streetOffset } from '../lib/roadNetwork'
import { OBSTACLE_SIZES, carBody } from '../lib/collision'
import { hazardHit, world } from '../lib/colliders'
import type { Collider } from '../lib/colliders'
import { OBSTACLE_KINDS, PROP_MODELS } from './models'
import { useGlbParts } from './useGlbParts'

/** Fixed spawn interval along the road, in metres. */
const ROW_SPACING = 25

/** Enough rows to cover the road ahead; also the recycle stride. */
const ROW_COUNT = 5
const ROW_SPAN = ROW_COUNT * ROW_SPACING

/**
 * Behind the car, past the camera trailing it, plus clearance for the longest
 * obstacle. Measured along avenue 0 in the direction the car is heading.
 */
const RECYCLE_OFFSET = -CHASE_BACK - 3

/**
 * Rows only live on avenue 0 for now, and are laid ahead of whichever way the
 * car points along it. Pointing across it (on a street) the last direction
 * holds, so a car wiggling along a street does not make rows jump about.
 */
const HEADING_SWITCH = 0.3

/** Road either side of a junction kept clear, so turning is never blocked. */
const JUNCTION_CLEARANCE = 6

type Slot = {
  /** Lateral position across avenue 0. */
  x: number
  /** Which obstacle stands here: an index into OBSTACLE_KINDS. */
  type: number
  showing: boolean
  /** Filed in the collision world while the slot is showing. */
  collider: Collider
}

export type ObstaclesProps = {
  carRef: RefObject<Group | null>
  /** Called once per contact, not once per overlapping frame. */
  onHit: () => void
}

/**
 * A fixed pool of rows and slots. A row is dressed by giving each slot a
 * type and a lateral position; nothing is constructed or disposed once the
 * pool is mounted.
 *
 * Drawing is instanced: one instanced mesh per part of each obstacle GLB,
 * refilled only when a row is re-dressed. Before, every slot owned a clone of
 * all three models, and each visible obstacle cost one draw call per part.
 */
export function Obstacles({ carRef, onHit }: ObstaclesProps) {
  const rows = useRef(Array.from({ length: ROW_COUNT }, (_, i) => RECYCLE_OFFSET + (i + 1) * ROW_SPACING))
  const slots = useRef<Slot[]>(
    Array.from({ length: ROW_COUNT * MAX_PER_ROW }, () => ({
      x: 0,
      type: CONE,
      showing: false,
      collider: world.make('hazard', 0),
    })),
  )
  // Reused every frame so the collision pass allocates nothing.
  const body = useRef(carBody(0, 0, 0))

  const cone = useGlbParts(PROP_MODELS.cone)
  const barrier = useGlbParts(PROP_MODELS.barrier)
  const stalled = useGlbParts(PROP_MODELS['stalled-car'])
  const meshes = useMemo(() => {
    const byKind = { cone, barrier, 'stalled-car': stalled }
    return OBSTACLE_KINDS.map((kind) =>
      byKind[kind].map((part) => {
        const mesh = new InstancedMesh(part.geometry, part.material, ROW_COUNT * MAX_PER_ROW)
        mesh.count = 0
        // Instances sit wherever their rows are; the base bounds would cull them.
        mesh.frustumCulled = false
        return { mesh, part: part.matrix }
      }),
    )
  }, [cone, barrier, stalled])
  useEffect(() => () => meshes.flat().forEach(({ mesh }) => mesh.dispose()), [meshes])

  const place = useRef(new Matrix4())
  const instance = useRef(new Matrix4())

  /** Rewrites every obstacle instance from the pool; only after a re-dress. */
  const redraw = () => {
    const counts = OBSTACLE_KINDS.map(() => 0)
    slots.current.forEach((slot, index) => {
      if (!slot.showing) return
      const z = rows.current[Math.floor(index / MAX_PER_ROW)]
      place.current.makeTranslation(slot.x, 0, z)
      for (const { mesh, part } of meshes[slot.type]) {
        instance.current.multiplyMatrices(place.current, part)
        mesh.setMatrixAt(counts[slot.type], instance.current)
      }
      counts[slot.type]++
    })
    meshes.forEach((parts, type) =>
      parts.forEach(({ mesh }) => {
        mesh.count = counts[type]
        mesh.instanceMatrix.needsUpdate = true
      }),
    )
  }

  /** Re-files a slot's collider wherever it now stands, or takes it out if hidden. */
  const file = (slot: Slot, rowZ: number) => {
    const { collider } = slot
    world.remove(collider)
    if (!slot.showing) return
    const size = OBSTACLE_SIZES[slot.type]
    collider.minX = slot.x - size.x / 2
    collider.maxX = slot.x + size.x / 2
    collider.minZ = rowZ - size.z / 2
    collider.maxZ = rowZ + size.z / 2
    collider.height = size.y
    world.insert(collider)
  }

  const towardPlusZ = useRef(true)

  const dressRow = (row: number) => {
    const z = rows.current[row]
    const inJunction = streetOffset(z) < ROAD_HALF_WIDTH + JUNCTION_CLEARANCE
    const layout = inJunction ? [] : generateRow()

    for (let j = 0; j < MAX_PER_ROW; j++) {
      const slot = slots.current[row * MAX_PER_ROW + j]
      const placement = layout[j]
      slot.showing = placement !== undefined
      if (placement) {
        slot.x = placement.x
        slot.type = placement.type
      }
      file(slot, z)
    }
  }

  useEffect(() => {
    for (let row = 0; row < ROW_COUNT; row++) dressRow(row)
    redraw()
    // The world outlives this component (a new run remounts the scene), so
    // take every obstacle back out of it on the way out.
    const pool = slots.current
    return () => {
      for (const slot of pool) world.remove(slot.collider)
    }
    // The pool is fixed for the lifetime of the component; dress it once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame(() => {
    const car = carRef.current
    if (!car) return

    const along = Math.cos(car.rotation.y)
    if (Math.abs(along) > HEADING_SWITCH) towardPlusZ.current = along > 0

    // Rows stand still; once the car has carried the camera past one, it is
    // moved to the far end of the queue and re-dressed with a fresh layout.
    const start = towardPlusZ.current
      ? car.position.z + RECYCLE_OFFSET
      : car.position.z - RECYCLE_OFFSET - ROW_SPAN
    let moved = false
    rows.current.forEach((_, i) => {
      while (rows.current[i] < start) {
        rows.current[i] += ROW_SPAN
        dressRow(i)
        moved = true
      }
      while (rows.current[i] >= start + ROW_SPAN) {
        rows.current[i] -= ROW_SPAN
        dressRow(i)
        moved = true
      }
    })
    if (moved) redraw()

    // Whichever side it comes from: the spatial hash hands over the hazards
    // filed in the cells round the car, and the turned hitbox tests each.
    if (hazardHit(carBody(car.position.x, car.position.z, car.rotation.y, 1, body.current))) onHit()
  }, FRAME_ORDER.world)

  return (
    <group>
      {meshes.flat().map(({ mesh }, k) => (
        // Geometry and material belong to the cached GLBs.
        <primitive key={k} object={mesh} dispose={null} />
      ))}
    </group>
  )
}
