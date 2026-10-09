import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import type { RefObject } from 'react'
import { FRAME_ORDER } from '../lib/frame'
import { PALETTE } from '../lib/palette'
import { avenueX, nearestAvenue, nearestStreet, streetZ } from '../lib/roadNetwork'

/**
 * One plane under the whole grid: block courtyards, and the ground in the
 * lots between buildings. It sits a few centimetres below the tarmac so the
 * two never fight for the same depth, and hops a whole block at a time to
 * stay under the car — being one flat colour, the hop cannot be seen.
 *
 * The town now fills every block, so the desert hills that stood here are
 * gone; the fog on the horizon does their job of closing off the distance.
 */
const GROUND_SIZE = 1200
const GROUND_DROP = -0.05

export function Roadside({ carRef }: { carRef: RefObject<Group | null> }) {
  const ground = useRef<Mesh | null>(null)

  useFrame(() => {
    const car = carRef.current
    if (!car) return
    ground.current?.position.set(
      avenueX(nearestAvenue(car.position.x)),
      GROUND_DROP,
      streetZ(nearestStreet(car.position.z)),
    )
  }, FRAME_ORDER.world)

  return (
    <mesh
      ref={ground}
      position={[0, GROUND_DROP, streetZ(0)]}
      rotation={[-Math.PI / 2, 0, 0]}
      // Drawn after the roads and the town: most of it is hidden under them,
      // and drawn last, the depth test throws those pixels away unshaded.
      renderOrder={1}
    >
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial color={PALETTE.ground} roughness={1} />
    </mesh>
  )
}
