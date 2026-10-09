import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, OrthographicCamera } from '@react-three/drei'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
} from 'three'
import type { Group, Mesh, OrthographicCamera as OrthographicCameraImpl, PerspectiveCamera } from 'three'
import type { RefObject } from 'react'
import type { CarState } from '../lib/carModel'
import { cellSpanX, cellSpanZ, world } from '../lib/colliders'
import { FRAME_ORDER } from '../lib/frame'

/** Metres of world shown top to bottom. */
const VIEW_HEIGHT = 140

/**
 * The view stays put while the car crosses it, then pages — in x or z,
 * whichever edge the car is heading for. Following the car smoothly would pin
 * it to the middle of the screen and look exactly like the old treadmill; a
 * fixed frame shows it actually travelling.
 */
const PAGE = 100

const HEIGHT = 150

/** One trail point per half metre; the oldest half is dropped when full. */
const TRAIL_STEP = 0.5
const TRAIL_POINTS = 4000

/** Debug-only colours, deliberately outside the game palette. */
const DEBUG_BLUE = '#58A6FF'

const LABEL_EVERY = 20

/** Asked for in red: what the narrow phase is testing this frame. */
const TESTED_RED = '#F85149'
const TESTED_CAP = 128
const CELL_CAP = 64

/**
 * Looking straight down with +Z at the top of the screen. As in the game,
 * world +X falls on the left.
 */
const TOP_DOWN: [number, number, number, 'YXZ'] = [-Math.PI / 2, Math.PI, 0, 'YXZ']

const DEGREES = 180 / Math.PI

export type DebugViewProps = {
  carRef: RefObject<Group | null>
  state: RefObject<CarState>
  cameraRef: RefObject<PerspectiveCamera | null>
  readout: RefObject<HTMLDivElement | null>
}

function pageOf(value: number) {
  return Math.round(value / PAGE)
}

export function DebugView({ carRef, state, cameraRef, readout }: DebugViewProps) {
  const height = useThree((s) => s.size.height)
  const ortho = useRef<OrthographicCameraImpl | null>(null)
  const chaseMarker = useRef<Mesh | null>(null)
  const [page, setPage] = useState({ x: 0, z: 0 })
  const pageRef = useRef({ x: 0, z: 0 })

  const trail = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3))
    geometry.setDrawRange(0, 0)
    // Drawn over the lane markings, which it would otherwise sit inside.
    const line = new Line(geometry, new LineBasicMaterial({ vertexColors: true, depthTest: false }))
    line.renderOrder = 1
    // The bounds are never recomputed as the trail grows.
    line.frustumCulled = false
    return { line, count: 0, lastX: 0, lastZ: -Infinity }
  }, [])

  // Colliders under test, drawn over everything so roofs do not hide them.
  const tested = useMemo(() => {
    const mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ color: TESTED_RED, transparent: true, opacity: 0.6, depthTest: false }),
      TESTED_CAP,
    )
    mesh.renderOrder = 3
    mesh.frustumCulled = false
    mesh.count = 0
    return { mesh, matrix: new Matrix4() }
  }, [])

  // Outlines of the hash cells the queries looked in.
  const cells = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(CELL_CAP * 8 * 3), 3))
    geometry.setDrawRange(0, 0)
    const lines = new LineSegments(geometry, new LineBasicMaterial({ color: DEBUG_BLUE, depthTest: false }))
    lines.renderOrder = 2
    lines.frustumCulled = false
    return lines
  }, [])

  // Blue on tarmac, amber with any wheel off it.
  const colours = useMemo(
    () => ({ on: [0x58 / 255, 0xa6 / 255, 0xff / 255], off: [0xd2 / 255, 0x99 / 255, 0x22 / 255] }),
    [],
  )

  useFrame(() => {
    const car = carRef.current
    if (!car) return
    const model = state.current
    const { x, z } = car.position

    const px = pageOf(x)
    const pz = pageOf(z)
    if (px !== pageRef.current.x || pz !== pageRef.current.z) {
      pageRef.current = { x: px, z: pz }
      setPage(pageRef.current)
    }
    ortho.current?.position.set(px * PAGE, HEIGHT, pz * PAGE)

    if (Math.hypot(x - trail.lastX, z - trail.lastZ) >= TRAIL_STEP) {
      const geometry = trail.line.geometry
      const positions = geometry.getAttribute('position') as BufferAttribute
      const tints = geometry.getAttribute('color') as BufferAttribute
      if (trail.count === TRAIL_POINTS) {
        const half = TRAIL_POINTS / 2
        ;(positions.array as Float32Array).copyWithin(0, half * 3)
        ;(tints.array as Float32Array).copyWithin(0, half * 3)
        trail.count = half
      }
      ;(positions.array as Float32Array).set([x, 0.05, z], trail.count * 3)
      ;(tints.array as Float32Array).set(model.offRoad > 0 ? colours.off : colours.on, trail.count * 3)
      trail.count++
      trail.lastX = x
      trail.lastZ = z
      geometry.setDrawRange(0, trail.count)
      positions.needsUpdate = true
      tints.needsUpdate = true
    }

    const chase = cameraRef.current
    if (chase) chaseMarker.current?.position.set(chase.position.x, 0.1, chase.position.z)

    // What the collision system looked at this frame.
    const counts = { building: 0, prop: 0, hazard: 0 }
    const shown = Math.min(world.tested.length, TESTED_CAP)
    for (let i = 0; i < shown; i++) {
      const c = world.tested[i]
      counts[c.kind]++
      const height = Math.max(c.height, 0.3)
      tested.matrix.makeScale(c.maxX - c.minX, height, c.maxZ - c.minZ)
      tested.matrix.setPosition((c.minX + c.maxX) / 2, height / 2, (c.minZ + c.maxZ) / 2)
      tested.mesh.setMatrixAt(i, tested.matrix)
    }
    tested.mesh.count = shown
    tested.mesh.instanceMatrix.needsUpdate = true

    const cellPositions = cells.geometry.getAttribute('position') as BufferAttribute
    const cellArray = cellPositions.array as Float32Array
    const cellCount = Math.min(world.testedCells.length / 2, CELL_CAP)
    for (let k = 0; k < cellCount; k++) {
      const [x0, w] = cellSpanX(world.testedCells[k * 2])
      const [z0, d] = cellSpanZ(world.testedCells[k * 2 + 1])
      const x1 = x0 + w
      const z1 = z0 + d
      cellArray.set([x0, 0.2, z0, x1, 0.2, z0, x1, 0.2, z0, x1, 0.2, z1, x1, 0.2, z1, x0, 0.2, z1, x0, 0.2, z1, x0, 0.2, z0], k * 24)
    }
    cells.geometry.setDrawRange(0, cellCount * 8)
    cellPositions.needsUpdate = true

    if (readout.current) {
      const fixed = (value: number, digits: number, width: number) => value.toFixed(digits).padStart(width)
      const heading = ((((model.yaw * DEGREES) % 360) + 360) % 360)
      readout.current.textContent =
        `car     x ${fixed(x, 2, 8)}   z ${fixed(z, 1, 8)}\n` +
        (chase ? `camera  x ${fixed(chase.position.x, 2, 8)}   z ${fixed(chase.position.z, 1, 8)}\n` : '') +
        `speed   ${fixed(model.forward, 1, 5)} m/s   slip ${fixed(model.lateral, 2, 6)} m/s\n` +
        `heading ${fixed(heading, 0, 4)}°   wheels ${fixed(model.steer * DEGREES, 1, 6)}°   yaw rate ${fixed(model.yawRate * DEGREES, 0, 4)}°/s\n` +
        `off road ${Math.round(model.offRoad * 4)}/4 wheels${model.scraping ? '   SCRAPING' : ''}   trail ${trail.count} pts (blue on road, amber off)\n` +
        `testing ${world.tested.length} colliders (red): ${counts.building} buildings, ${counts.prop} props, ${counts.hazard} hazards` +
        `   in ${world.testedCells.length / 2} cells (blue)   of ${world.size} town colliders filed`
    }
  }, FRAME_ORDER.debug)

  const centreX = page.x * PAGE
  const centreZ = page.z * PAGE
  const span = Math.floor(VIEW_HEIGHT / LABEL_EVERY) + 1
  const first = (centre: number) => Math.ceil((centre - VIEW_HEIGHT / 2) / LABEL_EVERY) * LABEL_EVERY
  const zLabels = Array.from({ length: span }, (_, i) => first(centreZ) + i * LABEL_EVERY)
  const xLabels = Array.from({ length: span }, (_, i) => first(centreX) + i * LABEL_EVERY)

  return (
    <>
      <OrthographicCamera
        ref={ortho}
        makeDefault
        position={[0, HEIGHT, 0]}
        rotation={TOP_DOWN}
        zoom={height / VIEW_HEIGHT}
        near={1}
        far={HEIGHT * 2}
      />

      {/* World-anchored 10 m grid, re-centred only when the page turns. */}
      <gridHelper args={[400, 40, '#30363D', '#30363D']} position={[centreX, 0.03, centreZ]} />

      {/* z along the screen's left edge (world +X), x along its top. */}
      {zLabels.map((z) => (
        <Html key={`z${z}`} position={[centreX + VIEW_HEIGHT * 0.62, 0, z]} center style={{ pointerEvents: 'none' }}>
          <span className="dh-label-xs" style={{ whiteSpace: 'nowrap' }}>
            z {z}
          </span>
        </Html>
      ))}
      {xLabels.map((x) => (
        <Html key={`x${x}`} position={[x, 0, centreZ + VIEW_HEIGHT * 0.46]} center style={{ pointerEvents: 'none' }}>
          <span className="dh-label-xs" style={{ whiteSpace: 'nowrap' }}>
            x {x}
          </span>
        </Html>
      ))}

      <primitive object={trail.line} />
      <primitive object={cells} />
      <primitive object={tested.mesh} />

      <mesh ref={chaseMarker}>
        <sphereGeometry args={[0.6, 12, 8]} />
        <meshBasicMaterial color={DEBUG_BLUE} />
      </mesh>
    </>
  )
}
