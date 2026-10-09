import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Object3D } from 'three'
import type { RefObject } from 'react'
import { Car } from './Car'
import { FRAME_ORDER, clampDelta } from '../lib/frame'
import { GRIP, stepCar } from '../lib/carModel'
import { world } from '../lib/colliders'
import type { CarInput, CarState } from '../lib/carModel'

/**
 * Blink period of the hit flash, in seconds. How *long* it flashes is the
 * invulnerability window, set by whoever registers the hit.
 */
const FLASH_INTERVAL = 0.075

/** Peak lean, in radians (~7°), reached at the tyres' grip limit. */
const MAX_ROLL = 0.12

/** How quickly the body catches up to the lean it should be at, per second. */
const ROLL_RESPONSE = 8

/** Body shake with all four wheels on the verge, in metres and radians. */
const RUMBLE_HEIGHT = 0.04
const RUMBLE_ROLL = 0.02

/** The front pair in car.glb; the rear pair never steer. */
const FRONT_WHEELS = ['wheel_1', 'wheel_2']

const LEFT_KEYS = ['ArrowLeft', 'KeyA']
const RIGHT_KEYS = ['ArrowRight', 'KeyD']
const THROTTLE_KEYS = ['ArrowUp', 'KeyW']
const BRAKE_KEYS = ['ArrowDown', 'KeyS']
const DRIVE_KEYS = [...LEFT_KEYS, ...RIGHT_KEYS, ...THROTTLE_KEYS, ...BRAKE_KEYS]

export type PlayerCarProps = {
  /** Shared with the collision test, which needs the car's live position. */
  carRef: RefObject<Group | null>
  /** The driving model's state; the group above only mirrors it. */
  state: RefObject<CarState>
  /** Seconds of flash remaining; set on a hit, counted down here. */
  flash: RefObject<number>
  /** False freezes the car where it stands, as on the game-over card. */
  driving: boolean
  /** Controls are dead on the start and game-over screens; the car cruises. */
  steerable: boolean
}

export function PlayerCar({ carRef, state, flash, driving, steerable }: PlayerCarProps) {
  const pressed = useRef(new Set<string>())
  const input = useRef<CarInput>({ steer: 0, throttle: false, brake: false })
  const roll = useRef(0)
  const frontWheels = useRef<Object3D[]>([])

  useEffect(() => {
    const keys = pressed.current

    const onKeyDown = (e: KeyboardEvent) => {
      if (!DRIVE_KEYS.includes(e.code)) return
      // Stop the arrow keys scrolling the page under the canvas.
      e.preventDefault()
      keys.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    // Keys released while the tab is in the background never fire keyup.
    const onBlur = () => keys.clear()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // The wheels are named nodes inside the cloned GLB, found once it mounts.
  useEffect(() => {
    const car = carRef.current
    if (!car) return
    frontWheels.current = FRONT_WHEELS.flatMap((name) => car.getObjectByName(name) ?? [])
  }, [carRef])

  useFrame((_, rawDelta) => {
    const delta = clampDelta(rawDelta)
    const car = carRef.current
    if (!car) return

    const keys = pressed.current
    const held = (codes: string[]) => steerable && codes.some((code) => keys.has(code))
    // Positive steer turns toward +X, which is the driver's left.
    input.current.steer = (held(LEFT_KEYS) ? 1 : 0) - (held(RIGHT_KEYS) ? 1 : 0)
    input.current.throttle = held(THROTTLE_KEYS)
    input.current.brake = held(BRAKE_KEYS)

    const model = state.current
    // The car is the first thing to collide each frame; start the debug
    // tally of what gets tested here.
    world.beginFrame()
    if (driving) stepCar(model, input.current, delta)

    // Lean with the sideways load, full lean at the grip limit.
    const sideways = model.forward * model.yawRate
    const targetRoll = -Math.max(-1, Math.min(1, sideways / GRIP)) * MAX_ROLL
    roll.current += (targetRoll - roll.current) * Math.min(1, ROLL_RESPONSE * delta)

    // Wheels on the verge, or the body against a wall, shake the car: the
    // slowdown should be felt, not just read off the score.
    const moving = driving && Math.abs(model.forward) > 0.5
    const rumble = moving ? Math.max(model.offRoad, model.scraping ? 1 : 0) : 0
    const shake = () => (Math.random() * 2 - 1) * rumble

    car.position.set(model.x, Math.abs(shake()) * RUMBLE_HEIGHT, model.z)
    // Default XYZ order with no pitch: the lean is about the car's own nose
    // axis, then the whole body is yawed.
    car.rotation.set(0, model.yaw, roll.current + shake() * RUMBLE_ROLL)

    for (const wheel of frontWheels.current) wheel.rotation.y = model.steer

    if (flash.current > 0) {
      flash.current = Math.max(0, flash.current - delta)
      const blink = Math.floor(flash.current / FLASH_INTERVAL) % 2 === 1
      car.visible = !blink
    } else {
      // Always land back on visible, whatever phase the blink stopped in.
      car.visible = true
    }
  }, FRAME_ORDER.car)

  return (
    <group ref={carRef}>
      <Car />
    </group>
  )
}
