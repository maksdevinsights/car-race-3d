import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { clampDelta } from '../lib/frame'

const GROUND = '#161B22'
const HILL = '#30363D'

/** Road is 8 m wide, so the verges start at x = ±4. */
const ROAD_HALF_WIDTH = 4
const GROUND_WIDTH = 120
const GROUND_OFFSET = ROAD_HALF_WIDTH + GROUND_WIDTH / 2

/**
 * The verges are flat and a single colour, so scrolling them would not read as
 * motion. They are laid out long enough to cover the whole scrolling range and
 * left in place; the hills carry the movement.
 */
const GROUND_LENGTH = 600
const GROUND_Z = GROUND_LENGTH / 2 - 60

/** Matches the camera in App.tsx. */
const CAMERA_Z = -6

/**
 * Hills recycle on their own, longer stride than the road so the skyline does
 * not repeat in step with the tarmac. The threshold sits well behind the
 * camera so a wide hill is fully off screen before it jumps forward.
 */
const HILL_SPAN = 180
const HILL_RECYCLE_Z = CAMERA_Z - 30

type Hill = {
  x: number
  z: number
  radius: number
  height: number
  segments: number
  rotation: number
}

/** Set well back from the edge so nothing crowds the road. */
const HILLS: Hill[] = [
  { x: -34, z: 4, radius: 11, height: 4.4, segments: 5, rotation: 0.4 },
  { x: -46, z: 30, radius: 14, height: 5.6, segments: 6, rotation: 1.1 },
  { x: -29, z: 63, radius: 9, height: 3.2, segments: 5, rotation: 2.3 },
  { x: -40, z: 96, radius: 12, height: 4.8, segments: 6, rotation: 0.8 },
  { x: -33, z: 140, radius: 10.5, height: 4.1, segments: 5, rotation: 1.9 },
  { x: 31, z: -14, radius: 10, height: 3.6, segments: 5, rotation: 1.7 },
  { x: 44, z: 18, radius: 13, height: 5.2, segments: 6, rotation: 0.2 },
  { x: 28, z: 52, radius: 8.5, height: 3, segments: 5, rotation: 2.9 },
  { x: 42, z: 88, radius: 12.5, height: 5, segments: 6, rotation: 1.4 },
  { x: 30, z: 124, radius: 9.5, height: 3.8, segments: 5, rotation: 0.6 },
]

type RoadsideProps = {
  /** Metres per second, matching the road. */
  speed: number
}

export function Roadside({ speed }: RoadsideProps) {
  const hills = useRef<(Mesh | null)[]>([])

  useFrame((_, rawDelta) => {
    const delta = clampDelta(rawDelta)
    const travel = speed * delta
    for (const hill of hills.current) {
      if (!hill) continue
      hill.position.z -= travel
      while (hill.position.z < HILL_RECYCLE_Z) {
        hill.position.z += HILL_SPAN
      }
    }
  })

  return (
    <group>
      {[-GROUND_OFFSET, GROUND_OFFSET].map((x) => (
        <mesh key={x} position={[x, 0, GROUND_Z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[GROUND_WIDTH, GROUND_LENGTH]} />
          <meshStandardMaterial color={GROUND} roughness={1} />
        </mesh>
      ))}

      {HILLS.map((hill, i) => (
        <mesh
          key={i}
          ref={(el) => {
            hills.current[i] = el
          }}
          position={[hill.x, hill.height / 2, hill.z]}
          rotation={[0, hill.rotation, 0]}
        >
          <coneGeometry args={[hill.radius, hill.height, hill.segments]} />
          <meshStandardMaterial color={HILL} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  )
}
