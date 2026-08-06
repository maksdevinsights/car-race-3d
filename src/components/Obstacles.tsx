import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { RefObject } from 'react'
import { clampDelta } from '../lib/frame'
import { BARRIER, CONE, MAX_PER_ROW, STALLED_CAR, generateRow } from '../lib/obstacleRows'
import {
  CAR_HITBOX_SCALE,
  CAR_SIZE,
  OBSTACLE_SIZES,
  TEST_RANGE_AHEAD,
  TEST_RANGE_BEHIND,
  boxAt,
  makeBox,
  overlaps,
} from '../lib/collision'
import { RoadBarrier } from './RoadBarrier'
import { StalledCar } from './StalledCar'
import { TrafficCone } from './TrafficCone'

/** Fixed spawn interval along the road, in metres. */
const ROW_SPACING = 25

/** Enough rows to cover the road ahead; also the recycle stride. */
const ROW_COUNT = 5
const ROW_SPAN = ROW_COUNT * ROW_SPACING

/** Matches the camera in App.tsx, plus clearance for the longest obstacle. */
const CAMERA_Z = -6
const RECYCLE_Z = CAMERA_Z - 3

type Slot = {
  group: Group | null
  variants: (Group | null)[]
  /** Which variant is currently showing, so collision need not go looking. */
  type: number
}

export type ObstaclesProps = {
  /** Metres per second, matching the road. */
  speed: number
  carRef: RefObject<Group | null>
  /** Called once per contact, not once per overlapping frame. */
  onHit: () => void
}

/**
 * A fixed pool: every slot owns one of each obstacle type up front, and a row
 * is dressed by moving slots and toggling which variant is visible. Nothing is
 * constructed or disposed once the pool is mounted.
 */
export function Obstacles({ speed, carRef, onHit }: ObstaclesProps) {
  const rows = useRef<(Group | null)[]>([])
  const slots = useRef<Slot[]>([])
  // Reused every frame so the collision pass allocates nothing.
  const carBox = useRef(makeBox())
  const obstacleBox = useRef(makeBox())

  const slotAt = (index: number): Slot => {
    slots.current[index] ??= { group: null, variants: [], type: CONE }
    return slots.current[index]
  }

  const dressRow = (row: number) => {
    const layout = generateRow()

    for (let j = 0; j < MAX_PER_ROW; j++) {
      const slot = slotAt(row * MAX_PER_ROW + j)
      if (!slot.group) continue

      const placement = layout[j]
      slot.group.visible = placement !== undefined
      if (!placement) continue

      slot.group.position.x = placement.x
      slot.type = placement.type
      slot.variants.forEach((variant, type) => {
        if (variant) variant.visible = type === placement.type
      })
    }
  }

  useEffect(() => {
    for (let row = 0; row < ROW_COUNT; row++) dressRow(row)
    // The pool is fixed for the lifetime of the component; dress it once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, rawDelta) => {
    const delta = clampDelta(rawDelta)
    const travel = speed * delta

    rows.current.forEach((row, i) => {
      if (!row) return
      row.position.z -= travel
      // Recycled behind the camera and re-dressed with a fresh layout.
      while (row.position.z < RECYCLE_Z) {
        row.position.z += ROW_SPAN
        dressRow(i)
      }
    })

    const car = carRef.current
    if (!car) return

    const player = boxAt(carBox.current, CAR_SIZE, car.position.x, car.position.z, CAR_HITBOX_SCALE)

    for (let i = 0; i < ROW_COUNT; i++) {
      const row = rows.current[i]
      if (!row) continue

      // Broad phase on the row, since every slot in it shares a z.
      const ahead = row.position.z - car.position.z
      if (ahead > TEST_RANGE_AHEAD || ahead < -TEST_RANGE_BEHIND) continue

      for (let j = 0; j < MAX_PER_ROW; j++) {
        const slot = slotAt(i * MAX_PER_ROW + j)
        if (!slot.group?.visible) continue

        const box = boxAt(
          obstacleBox.current,
          OBSTACLE_SIZES[slot.type],
          slot.group.position.x,
          row.position.z,
        )
        if (overlaps(player, box)) {
          onHit()
          return
        }
      }
    }
  })

  return (
    <group>
      {Array.from({ length: ROW_COUNT }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            rows.current[i] = el
          }}
          position={[0, 0, RECYCLE_Z + (i + 1) * ROW_SPACING]}
        >
          {Array.from({ length: MAX_PER_ROW }, (_, j) => {
            const slot = slotAt(i * MAX_PER_ROW + j)
            return (
              <group
                key={j}
                visible={false}
                ref={(el) => {
                  slot.group = el
                }}
              >
                <group
                  ref={(el) => {
                    slot.variants[CONE] = el
                  }}
                >
                  <TrafficCone />
                </group>
                <group
                  ref={(el) => {
                    slot.variants[BARRIER] = el
                  }}
                >
                  <RoadBarrier />
                </group>
                <group
                  ref={(el) => {
                    slot.variants[STALLED_CAR] = el
                  }}
                >
                  <StalledCar />
                </group>
              </group>
            )
          })}
        </group>
      ))}
    </group>
  )
}
