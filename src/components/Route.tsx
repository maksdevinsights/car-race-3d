import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { RefObject } from 'react'
import { FRAME_ORDER, clampDelta } from '../lib/frame'
import { PALETTE } from '../lib/palette'
import { ROAD_HALF_WIDTH } from '../lib/roadNetwork'
import { allowance, arrived, junctionNear, junctionPoint, legMetres, pickTarget } from '../lib/route'
import type { Junction } from '../lib/route'
import { deliver, grantTime, navigate, tick } from '../game/store'

/** Tall enough to stand over any roof, thin enough to read as a marker. */
const BEAM_HEIGHT = 90
const BEAM_WIDTH = 0.5

/** The square painted round the junction, just inside the kerbs. */
const SQUARE = 2 * ROAD_HALF_WIDTH - 1
const LINE = 0.25

/** HUD readouts change only in these steps, so the HUD is not re-rendered every frame. */
const DISTANCE_STEP = 5
const BEARING_STEP = 5

export type RouteProps = {
  carRef: RefObject<Group | null>
  playing: boolean
  /** Where the current delivery is, for the dev hook; null between runs. */
  targetRef?: RefObject<[number, number] | null>
}

/**
 * The delivery run: picks each junction to drive to, notices arrival, banks
 * the leg and grants time for the next one, and runs the clock. The beacon
 * marks the current target — the off-white of the lane markings, unlit and
 * unfogged, so it shows over the rooftops from anywhere in range.
 */
export function Route({ carRef, playing, targetRef }: RouteProps) {
  const marker = useRef<Group | null>(null)
  const from = useRef<Junction | null>(null)
  const target = useRef<Junction | null>(null)

  useFrame((_, rawDelta) => {
    const car = carRef.current
    const beacon = marker.current
    if (!car || !beacon) return
    beacon.visible = playing && target.current !== null
    if (!playing) return

    tick(clampDelta(rawDelta))

    const { x, z } = car.position
    if (!target.current) {
      // First leg of the run: from the junction the car is nearest, up the avenue.
      from.current = junctionNear(x, z)
      target.current = pickTarget(from.current, true)
      grantTime(allowance(legMetres(from.current, target.current)))
    } else if (arrived(x, z, target.current)) {
      deliver(legMetres(from.current!, target.current))
      from.current = target.current
      target.current = pickTarget(from.current)
      grantTime(allowance(legMetres(from.current, target.current)))
    }

    const [tx, tz] = junctionPoint(target.current)
    if (targetRef) targetRef.current = [tx, tz]
    beacon.position.set(tx, 0, tz)
    beacon.visible = true

    const dx = tx - x
    const dz = tz - z
    const bearing = Math.atan2(dx, dz) - car.rotation.y
    const degrees = (Math.atan2(Math.sin(bearing), Math.cos(bearing)) * 180) / Math.PI
    navigate(
      Math.round(Math.hypot(dx, dz) / DISTANCE_STEP) * DISTANCE_STEP,
      Math.round(degrees / BEARING_STEP) * BEARING_STEP,
    )
  }, FRAME_ORDER.world)

  const half = SQUARE / 2
  return (
    <group ref={marker} visible={false}>
      <mesh position={[0, BEAM_HEIGHT / 2, 0]}>
        <boxGeometry args={[BEAM_WIDTH, BEAM_HEIGHT, BEAM_WIDTH]} />
        <meshBasicMaterial color={PALETTE.offWhite} fog={false} toneMapped={false} />
      </mesh>
      {/* Four thin strips just proud of the tarmac: nothing coplanar to fight it. */}
      {[
        [0, half, SQUARE, LINE],
        [0, -half, SQUARE, LINE],
        [half, 0, LINE, SQUARE],
        [-half, 0, LINE, SQUARE],
      ].map(([px, pz, sx, sz]) => (
        <mesh key={`${px},${pz}`} position={[px, 0.015, pz]}>
          <boxGeometry args={[sx, 0.03, sz]} />
          <meshBasicMaterial color={PALETTE.offWhite} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
