import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { RefObject } from 'react'
import { Car } from './Car'
import { clampDelta } from '../lib/frame'

/** Furthest the car may sit from the centre line, in metres. */
export const MAX_OFFSET = 3

/**
 * Blink period of the hit flash, in seconds. How *long* it flashes is the
 * invulnerability window, set by whoever registers the hit.
 */
const FLASH_INTERVAL = 0.075

/** Top lateral speed, in metres per second. */
const STEER_SPEED = 6

/** How hard the car builds up to and sheds that speed, in m/s². */
const STEER_ACCELERATION = 24

/** Peak lean, in radians (~7°). */
const MAX_ROLL = 0.12

/** How quickly the body catches up to the lean it should be at, per second. */
const ROLL_RESPONSE = 8

const LEFT_KEYS = ['ArrowLeft', 'KeyA']
const RIGHT_KEYS = ['ArrowRight', 'KeyD']
const STEER_KEYS = [...LEFT_KEYS, ...RIGHT_KEYS]

function clamp(value: number, limit: number) {
  return Math.min(limit, Math.max(-limit, value))
}

export type PlayerCarProps = {
  /** Shared with the collision test, which needs the car's live position. */
  carRef: RefObject<Group | null>
  /** Seconds of flash remaining; set on a hit, counted down here. */
  flash: RefObject<number>
  /** Steering is dead on the start and game-over screens. */
  steerable: boolean
}

export function PlayerCar({ carRef, flash, steerable }: PlayerCarProps) {
  const pressed = useRef(new Set<string>())
  const offset = useRef(0)
  const velocity = useRef(0)
  const roll = useRef(0)

  useEffect(() => {
    const keys = pressed.current

    const onKeyDown = (e: KeyboardEvent) => {
      if (!STEER_KEYS.includes(e.code)) return
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

  useFrame((_, rawDelta) => {
    const delta = clampDelta(rawDelta)
    const car = carRef.current
    if (!car) return

    const keys = pressed.current
    const left = steerable && LEFT_KEYS.some((key) => keys.has(key))
    const right = steerable && RIGHT_KEYS.some((key) => keys.has(key))
    // The camera faces +Z, so world +X falls on the player's left. Pressing
    // right has to drive the car toward -X to move right on screen.
    const direction = (left ? 1 : 0) - (right ? 1 : 0)

    // Ease toward the demanded speed — zero when nothing is held, which makes
    // the same constant serve as both acceleration and braking.
    const target = direction * STEER_SPEED
    velocity.current += clamp(target - velocity.current, STEER_ACCELERATION * delta)

    offset.current += velocity.current * delta
    if (Math.abs(offset.current) > MAX_OFFSET) {
      offset.current = Math.sign(offset.current) * MAX_OFFSET
      velocity.current = 0
    }

    // Lean into the direction of travel, and only as far as the current
    // sideways speed earns.
    const targetRoll = -(velocity.current / STEER_SPEED) * MAX_ROLL
    roll.current += (targetRoll - roll.current) * Math.min(1, ROLL_RESPONSE * delta)

    car.position.x = offset.current
    car.rotation.z = roll.current

    if (flash.current > 0) {
      flash.current = Math.max(0, flash.current - delta)
      const blink = Math.floor(flash.current / FLASH_INTERVAL) % 2 === 1
      car.visible = !blink
    } else {
      // Always land back on visible, whatever phase the blink stopped in.
      car.visible = true
    }
  })

  return (
    <group ref={carRef}>
      <Car />
    </group>
  )
}
