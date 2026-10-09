import { PITCH, avenueX, nearestAvenue, nearestStreet, streetZ } from './roadNetwork'

/**
 * Deliveries: the run is a chain of legs, each from one junction to another.
 *
 * Score is metres delivered — for every leg completed, the grid distance from
 * where it started to where it ended. Not the odometer: in a corridor every
 * metre driven was a metre survived, but in a town an odometer pays the same
 * for circling one safe block, reversing, or grinding along a wall. Scoring
 * the fair route length of each leg pays for getting somewhere, and a wrong
 * turn earns nothing while it costs time.
 *
 * The clock is the pressure the scrolling corridor used to provide. Each leg
 * adds time in proportion to its length; scraping walls and missing turns
 * spend it.
 */

/** A junction by grid index: avenue i crossing street j. */
export type Junction = { i: number; j: number }

/** Legs are two to four blocks long, counted along the grid. */
export const MIN_LEG_BLOCKS = 2
export const MAX_LEG_BLOCKS = 4

/** Close enough to the middle of the junction to count as there. */
export const ARRIVE_RADIUS = 5

/** Time on the clock when a run starts, before the first leg's allowance. */
export const HEAD_START = 8

/**
 * Time granted per leg: its grid length at this average speed, plus a little
 * for the junctions. 9 m/s is cruise with braking for two corners — enough
 * for a clean leg, not for a leg with a wall in it.
 */
export const ALLOWANCE_SPEED = 9
export const ALLOWANCE_GRACE = 4

export function junctionNear(x: number, z: number): Junction {
  return { i: nearestAvenue(x), j: nearestStreet(z) }
}

export function junctionPoint(junction: Junction): [number, number] {
  return [avenueX(junction.i), streetZ(junction.j)]
}

/** Metres along the grid from one junction to another. */
export function legMetres(from: Junction, to: Junction): number {
  return (Math.abs(to.i - from.i) + Math.abs(to.j - from.j)) * PITCH
}

export function allowance(metres: number): number {
  return metres / ALLOWANCE_SPEED + ALLOWANCE_GRACE
}

/**
 * The next junction to deliver to, two to four blocks from `from`. With
 * `ahead`, it is up the avenue the car starts on, so the first leg never opens
 * with a U-turn.
 */
export function pickTarget(from: Junction, ahead = false, random: () => number = Math.random): Junction {
  for (;;) {
    const di = Math.floor(random() * (2 * MAX_LEG_BLOCKS + 1)) - MAX_LEG_BLOCKS
    const dj = Math.floor(random() * (2 * MAX_LEG_BLOCKS + 1)) - MAX_LEG_BLOCKS
    const blocks = Math.abs(di) + Math.abs(dj)
    if (blocks < MIN_LEG_BLOCKS || blocks > MAX_LEG_BLOCKS) continue
    if (ahead && dj <= 0) continue
    return { i: from.i + di, j: from.j + dj }
  }
}

export function arrived(x: number, z: number, target: Junction): boolean {
  const [tx, tz] = junctionPoint(target)
  return Math.hypot(x - tx, z - tz) <= ARRIVE_RADIUS
}
