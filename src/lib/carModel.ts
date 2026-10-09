import { carBody, boxContact } from './collision'
import type { Body, Contact, Rect } from './collision'
import { solidsNear } from './colliders'
import { isOnRoad } from './roadNetwork'

/**
 * A kinematic bicycle model with a grip limit — no physics engine.
 *
 * The driver turns the front wheels; the wheels ask for a yaw rate; the body
 * catches up to it; the tyres then drag the velocity round to follow the body,
 * but only as hard as grip allows. Ask for more than grip and the car runs
 * wide. Heading follows rotation.y: 0 faces +Z, positive turns toward +X,
 * which is the driver's left.
 */

/** Axle positions and half track, from the wheel nodes in car.glb. */
export const FRONT_AXLE = 1.35
export const REAR_AXLE = -1.4
export const HALF_TRACK = 0.77
const WHEELBASE = FRONT_AXLE - REAR_AXLE

/** Wheel contact points in the car's own frame, [x, z]. */
const WHEELS: [number, number][] = [
  [HALF_TRACK, FRONT_AXLE],
  [-HALF_TRACK, FRONT_AXLE],
  [HALF_TRACK, REAR_AXLE],
  [-HALF_TRACK, REAR_AXLE],
]

/** The speed the car settles at with no pedal pressed, in m/s. */
export const CRUISE_SPEED = 16
export const MAX_SPEED = 30
/** Holding the brake at a standstill backs the car out of trouble. */
export const MAX_REVERSE = 5
const REVERSE = 4

/**
 * Speed lost per second while scraping along a wall, in m/s². Hitting one
 * head-on stops the car; glancing off one keeps some pace but costs plenty.
 */
const WALL_FRICTION = 9

/** Longitudinal accelerations, in m/s². */
const ENGINE = 4
const THROTTLE = 6
const BRAKE = 14
const COAST = 1.5

/** Full lock, in radians (~34°), and how fast the wheels get there. */
export const MAX_STEER = 0.6
const STEER_RATE = 1.8
/** Wheels return to centre faster than they are wound on. */
const CENTRE_RATE = 4

/**
 * Sideways acceleration the tyres can hold, in m/s². This is what makes speed
 * matter: the tightest radius is v² / grip, so 16 m/s needs about 26 m of road
 * to turn on, and 8 m/s about 6.4 m.
 */
export const GRIP = 10
const OFFROAD_GRIP = 5

/**
 * The body may yaw a touch faster than the tyres can follow, so a car pushed
 * to the limit slides a little instead of running on rails. The extra fades
 * out as the slide builds, settling at OVERSTEER_FADE · (OVERSTEER - 1) m/s of
 * slip (1 m/s) rather than spinning the car round.
 */
const OVERSTEER = 1.1
const OVERSTEER_FADE = 10

/** Speed lost per second per m/s of sideways slide: a slide costs pace. */
const SLIDE_SCRUB = 1

/** How quickly the body's yaw rate catches up to what the wheels ask, per second. */
const YAW_RESPONSE = 8

/**
 * Drag per second per wheel fraction off the tarmac, applied to the current
 * speed. With all four wheels on the verge, a car doing 16 m/s loses about
 * 13 m/s² and full throttle only holds ~7 m/s.
 */
const OFFROAD_DRAG = 0.85

export type CarInput = {
  /** -1 full right … +1 full left. */
  steer: number
  throttle: boolean
  brake: boolean
}

export type CarState = {
  x: number
  z: number
  yaw: number
  /** Speed along the nose, m/s; negative when reversing. */
  forward: number
  /** Sideways slip toward the car's left, m/s. */
  lateral: number
  yawRate: number
  /** Front wheel angle, radians, positive to the left. */
  steer: number
  /** Share of the four wheels off the tarmac, 0 … 1. */
  offRoad: number
  /** True on any frame the body was pushed back out of a wall. */
  scraping: boolean
}

export function makeCar(x = 0, z = 0, yaw = 0, forward = CRUISE_SPEED): CarState {
  return { x, z, yaw, forward, lateral: 0, yawRate: 0, steer: 0, offRoad: 0, scraping: false }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Moves value toward target by at most step. */
function approach(value: number, target: number, step: number) {
  return value + clamp(target - value, -step, step)
}

/** Answers whether a ground point is tarmac; the road network by default. */
export type Surface = (x: number, z: number) => boolean

/**
 * Broad phase for the walls: the solid footprints worth testing against this
 * body. The spatial hash over the town by default.
 */
export type Walls = (body: Body) => readonly Rect[]

export function wheelsOffRoad(car: CarState, onRoad: Surface = isOnRoad): number {
  const sin = Math.sin(car.yaw)
  const cos = Math.cos(car.yaw)
  let off = 0
  for (const [lx, lz] of WHEELS) {
    if (!onRoad(car.x + lx * cos + lz * sin, car.z - lx * sin + lz * cos)) off++
  }
  return off / WHEELS.length
}

export function stepCar(
  car: CarState,
  input: CarInput,
  delta: number,
  onRoad: Surface = isOnRoad,
  walls: Walls = solidsNear,
): CarState {
  // R3F's first frame can report no time at all.
  if (delta <= 0) return car

  // Wheels: wound toward the demanded lock, or allowed back toward centre.
  const target = clamp(input.steer, -1, 1) * MAX_STEER
  const unwinding = Math.abs(target) < Math.abs(car.steer) || target * car.steer < 0
  car.steer = approach(car.steer, target, (unwinding ? CENTRE_RATE : STEER_RATE) * delta)

  car.offRoad = wheelsOffRoad(car, onRoad)
  const grip = GRIP + (OFFROAD_GRIP - GRIP) * car.offRoad

  // Along the nose. With no pedal pressed the engine settles at cruise; the
  // brake stops the car, then backs it up.
  if (input.brake) car.forward -= (car.forward > 0 ? BRAKE : REVERSE) * delta
  else if (input.throttle) car.forward += THROTTLE * delta
  else {
    const rate = car.forward < CRUISE_SPEED ? ENGINE : COAST
    car.forward = approach(car.forward, CRUISE_SPEED, rate * delta)
  }
  const drag = OFFROAD_DRAG * car.offRoad * Math.abs(car.forward) + SLIDE_SCRUB * Math.abs(car.lateral)
  car.forward = clamp(approach(car.forward, 0, drag * delta), -MAX_REVERSE, MAX_SPEED)

  // The wheels ask for a yaw rate from geometry alone; grip caps it, and the
  // cap shrinks as speed grows, which is what widens the line. Reversing
  // turns the other way, as it does in a real car.
  const u = car.forward
  const asked = (u * Math.tan(car.steer)) / WHEELBASE
  const oversteer = Math.max(1, OVERSTEER - Math.abs(car.lateral) / OVERSTEER_FADE)
  const limit = (grip * oversteer) / Math.max(Math.abs(u), 1)
  const wanted = clamp(asked, -limit, limit)
  car.yawRate += (wanted - car.yawRate) * (1 - Math.exp(-YAW_RESPONSE * delta))

  // Turning the body leaves the old velocity partly sideways in the new
  // frame; the tyres pull that slip back out, no harder than grip allows.
  const turn = car.yawRate * delta
  const cosT = Math.cos(turn)
  const sinT = Math.sin(turn)
  const forward = car.forward * cosT + car.lateral * sinT
  const lateral = car.lateral * cosT - car.forward * sinT
  car.yaw += turn
  car.forward = clamp(forward, -MAX_REVERSE, MAX_SPEED)
  car.lateral = approach(lateral, 0, grip * delta)

  const sin = Math.sin(car.yaw)
  const cos = Math.cos(car.yaw)
  car.x += (car.forward * sin + car.lateral * cos) * delta
  car.z += (car.forward * cos - car.lateral * sin) * delta

  hitWalls(car, walls, delta)
  return car
}

const body: Body = carBody(0, 0, 0)
const contact: Contact = { nx: 0, nz: 0, depth: 0 }

/**
 * Walls are solid. The broad phase hands over the few footprints near the
 * car; each one the turned body overlaps pushes it back out the shortest way,
 * the part of the velocity driving into it is dropped, and what is left
 * scrapes off speed. Buildings stand on the kerb line, so this is also what
 * keeps the car out of them.
 */
function hitWalls(car: CarState, walls: Walls, delta: number) {
  const sin = Math.sin(car.yaw)
  const cos = Math.cos(car.yaw)
  let vx = car.forward * sin + car.lateral * cos
  let vz = car.forward * cos - car.lateral * sin

  carBody(car.x, car.z, car.yaw, 1, body)
  car.scraping = false
  for (const rect of walls(body)) {
    if (!boxContact(body, rect, contact)) continue
    car.scraping = true
    body.x += contact.nx * contact.depth
    body.z += contact.nz * contact.depth
    // Drop whatever part of the velocity drives into this face.
    const into = vx * contact.nx + vz * contact.nz
    if (into < 0) {
      vx -= into * contact.nx
      vz -= into * contact.nz
    }
  }
  if (!car.scraping) return

  car.x = body.x
  car.z = body.z

  const speed = Math.hypot(vx, vz)
  const kept = speed > 0 ? Math.max(0, speed - WALL_FRICTION * delta) / speed : 0
  vx *= kept
  vz *= kept

  car.forward = vx * sin + vz * cos
  car.lateral = vx * cos - vz * sin
}
