import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { CAR_HITBOX_SCALE, CAR_SIZE, OBSTACLE_SIZES } from '../lib/collision'
import { clampDelta } from '../lib/frame'
import { INVULNERABLE_SECONDS, registerHit, travel, usePhase } from '../game/store'
import { Obstacles } from './Obstacles'
import { PlayerCar } from './PlayerCar'
import { RoadSegment, SEGMENT_LENGTH } from './RoadSegment'
import { Roadside } from './Roadside'

/** Scroll speed of the world, in metres per second. */
export const SPEED = 16

/**
 * Everything is in metres, Y up, road running along +Z, and the car nose
 * points at +Z. Edge lines are at x = ±3.72, centre dashes at x = 0.
 *
 * The car holds station at z = 0 and the camera never moves. The world
 * scrolls toward the camera along -Z instead; the car only steers across it.
 */

/** Matches the camera in App.tsx: 6 m behind the car, which sits at z = 0. */
const CAMERA_Z = -6

/**
 * Enough segments to cover the visible distance ahead. Their combined length
 * is also the recycle stride: shifting one segment forward by the full span
 * lands it exactly where the queue ends, so the tiling stays seamless.
 */
const SEGMENT_COUNT = 16
const SEGMENT_SPAN = SEGMENT_COUNT * SEGMENT_LENGTH

/** A segment is spent once its far edge has cleared the camera. */
const SEGMENT_RECYCLE_Z = CAMERA_Z - SEGMENT_LENGTH / 2

const SEGMENT_Z = Array.from(
  { length: SEGMENT_COUNT },
  (_, i) => SEGMENT_RECYCLE_Z + SEGMENT_LENGTH / 2 + i * SEGMENT_LENGTH,
)

/**
 * Longest a single obstacle can stay in contact: the car's shrunken length
 * plus the longest obstacle, at the speed they close on each other. The
 * invulnerability window has to outlast this, or one stalled car would take
 * several lives on the way past.
 */
const LONGEST_CONTACT =
  (CAR_SIZE.z * CAR_HITBOX_SCALE + Math.max(...OBSTACLE_SIZES.map((s) => s.z))) / SPEED

export function Scene() {
  const segments = useRef<(Group | null)[]>([])
  const car = useRef<Group | null>(null)
  const flash = useRef(0)

  const phase = usePhase()
  // The world keeps rolling behind the start screen, and stops dead on the
  // game-over card.
  const speed = phase === 'over' ? 0 : SPEED

  const handleHit = () => {
    // Invulnerable, so this contact costs nothing — and the same window stops
    // one obstacle registering on every frame it overlaps.
    if (flash.current > 0) return
    flash.current = Math.max(INVULNERABLE_SECONDS, LONGEST_CONTACT + 0.1)
    registerHit()
  }

  useFrame((_, rawDelta) => {
    const delta = clampDelta(rawDelta)
    const moved = speed * delta
    for (const segment of segments.current) {
      if (!segment) continue
      segment.position.z -= moved
      // `while` rather than `if`: a long frame (tab regains focus) can carry a
      // segment back further than a single stride.
      while (segment.position.z < SEGMENT_RECYCLE_Z) {
        segment.position.z += SEGMENT_SPAN
      }
    }
    // Score is distance; travel() ignores anything outside a live run.
    travel(moved)
  })

  return (
    <group>
      <Roadside speed={speed} />

      {SEGMENT_Z.map((z, i) => (
        <group
          key={i}
          ref={(el) => {
            segments.current[i] = el
          }}
          position={[0, 0, z]}
        >
          <RoadSegment />
        </group>
      ))}

      <Obstacles speed={speed} carRef={car} onHit={handleHit} />

      <PlayerCar carRef={car} flash={flash} steerable={phase === 'playing'} />
    </group>
  )
}
