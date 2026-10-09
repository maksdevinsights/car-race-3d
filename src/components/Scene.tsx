import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, PerspectiveCamera } from 'three'
import type { RefObject } from 'react'
import { makeCar } from '../lib/carModel'
import { pushPointOut, solidsNear } from '../lib/colliders'
import { CAR_HITBOX_SCALE, CAR_SIZE, OBSTACLE_SIZES, boxContact, carBody } from '../lib/collision'
import { FRAME_ORDER } from '../lib/frame'
import { INVULNERABLE_SECONDS, getGameState, grantTime, registerHit, travel, usePhase } from '../game/store'
import { ChaseCamera } from './ChaseCamera'
import { DebugView } from './DebugView'
import { Obstacles } from './Obstacles'
import { PlayerCar } from './PlayerCar'
import { RoadNetwork } from './RoadNetwork'
import { Roadside } from './Roadside'
import { Route } from './Route'
import { Town } from './Town'

/**
 * Everything is in metres, Y up. The car starts at the origin, nose along +Z,
 * on avenue 0 of the road grid in lib/roadNetwork.ts, and drives through it in
 * world space; the camera trails it. Roads, the town in the blocks between
 * them, and the ground are laid from the grid around wherever the car is.
 */

/** Car length (shrunken) plus the longest obstacle: the most road a contact can span. */
const CONTACT_LENGTH = CAR_SIZE.z * CAR_HITBOX_SCALE + Math.max(...OBSTACLE_SIZES.map((s) => s.z))

/**
 * Below this the flash would run for many seconds; a car crawling through an
 * obstacle is a known gap until collision is rebuilt (MIGRATION.md step 5).
 */
const MIN_CONTACT_SPEED = 2

export type SceneProps = {
  /** Present only on /debug: swaps in the top-down view and feeds this readout. */
  debugReadout?: RefObject<HTMLDivElement | null>
}

export function Scene({ debugReadout }: SceneProps) {
  const car = useRef<Group | null>(null)
  const state = useRef(makeCar())
  const camera = useRef<PerspectiveCamera | null>(null)
  const flash = useRef(0)
  const last = useRef({ x: 0, z: 0 })
  const target = useRef<[number, number] | null>(null)

  const phase = usePhase()

  // Dev builds only: lets scripts/verify.mjs read the car and camera to drive
  // its route. Vite strips this branch from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const contact = { nx: 0, nz: 0, depth: 0 }
    const hook = {
      car: state.current,
      camera,
      game: getGameState,
      /** Lets a scripted route run longer than the delivery clock allows. */
      grantTime,
      /** The current delivery point, [x, z]. */
      target: () => target.current,
      /** Is the chase camera standing inside a building? */
      cameraInside: () => {
        const at = camera.current?.position
        return at ? pushPointOut(at.x, at.z).some((v) => v !== 0) : false
      },
      /** Deepest overlap of the car body with anything solid, in metres. */
      carOverlap: () => {
        const { x, z, yaw } = state.current
        const body = carBody(x, z, yaw)
        let deepest = 0
        for (const rect of solidsNear(body)) {
          if (boxContact(body, rect, contact)) deepest = Math.max(deepest, contact.depth)
        }
        return deepest
      },
    }
    Object.assign(window, { __nightHighway: hook })
    return () => {
      if ((window as { __nightHighway?: unknown }).__nightHighway === hook) {
        Object.assign(window, { __nightHighway: undefined })
      }
    }
  }, [])

  const handleHit = () => {
    // Invulnerable, so this contact costs nothing — and the same window stops
    // one obstacle registering on every frame it overlaps.
    if (flash.current > 0) return
    // Long enough for the obstacle to clear the car at the current speed,
    // which is no longer fixed.
    const contact = CONTACT_LENGTH / Math.max(Math.abs(state.current.forward), MIN_CONTACT_SPEED)
    flash.current = Math.max(INVULNERABLE_SECONDS, contact + 0.1)
    registerHit()
  }

  useFrame(() => {
    const { x, z } = state.current
    // Distance actually driven, whichever way: shown at the end of a run,
    // not scored. travel() ignores anything outside a live run.
    travel(Math.hypot(x - last.current.x, z - last.current.z))
    last.current.x = x
    last.current.z = z
  }, FRAME_ORDER.world)

  return (
    <group>
      <ChaseCamera carRef={car} cameraRef={camera} makeDefault={!debugReadout} />
      {debugReadout && (
        <DebugView carRef={car} state={state} cameraRef={camera} readout={debugReadout} />
      )}

      <Roadside carRef={car} />
      <RoadNetwork carRef={car} />
      <Town carRef={car} />
      <Obstacles carRef={car} onHit={handleHit} />
      <Route carRef={car} playing={phase === 'playing'} targetRef={target} />

      <PlayerCar
        carRef={car}
        state={state}
        flash={flash}
        // The car keeps cruising behind the start screen, and stops dead on
        // the game-over card.
        driving={phase !== 'over'}
        steerable={phase === 'playing'}
      />
    </group>
  )
}
