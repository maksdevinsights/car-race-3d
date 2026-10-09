import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import type { Group, PerspectiveCamera as PerspectiveCameraImpl } from 'three'
import type { RefObject } from 'react'
import { CHASE_BACK, CHASE_PITCH, CHASE_UP, makeChase, stepChase } from '../lib/chase'
import { pushPointOut } from '../lib/colliders'
import { FRAME_ORDER, clampDelta } from '../lib/frame'

/** Where the car starts: the origin, nose along +Z. */
const START_POSITION: [number, number, number] = [0, CHASE_UP, -CHASE_BACK]

/**
 * A camera looks down its own -Z, so it needs a half turn to face along the
 * car. YXZ order applies the yaw first, keeping the pitch level.
 */
const START_ROTATION: [number, number, number, 'YXZ'] = [CHASE_PITCH, Math.PI, 0, 'YXZ']

export type ChaseCameraProps = {
  carRef: RefObject<Group | null>
  cameraRef: RefObject<PerspectiveCameraImpl | null>
  /** False when another camera (the debug view) is doing the rendering. */
  makeDefault: boolean
}

export function ChaseCamera({ carRef, cameraRef, makeDefault }: ChaseCameraProps) {
  const chase = useRef(makeChase())

  useFrame((_, rawDelta) => {
    const car = carRef.current
    const camera = cameraRef.current
    if (!car || !camera) return

    const { x, z, yaw } = stepChase(
      chase.current,
      car.position.x,
      car.position.z,
      car.rotation.y,
      clampDelta(rawDelta),
    )
    // Trailing round a corner or backing up can swing the camera into a
    // building; step it back out onto the street so the view stays outside.
    const cx = x - CHASE_BACK * Math.sin(yaw)
    const cz = z - CHASE_BACK * Math.cos(yaw)
    const [dx, dz] = pushPointOut(cx, cz)
    camera.position.set(cx + dx, CHASE_UP, cz + dz)
    camera.rotation.set(CHASE_PITCH, yaw + Math.PI, 0, 'YXZ')
  }, FRAME_ORDER.camera)

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault={makeDefault}
      position={START_POSITION}
      rotation={START_ROTATION}
      fov={55}
      near={0.1}
      far={500}
    />
  )
}
