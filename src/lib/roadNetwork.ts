/**
 * The road network: an endless grid of two-lane roads, 8 m wide.
 *
 * Avenues run along Z at x = PITCH · i. Streets run along X at
 * z = STREET_OFFSET + PITCH · j. The car starts at the origin, mid-block on
 * avenue 0, with the first junction 40 m ahead.
 *
 * This module is the only definition of where tarmac is. Rendering lays tiles
 * from it and the car asks it what each wheel is standing on; there is no
 * collision mesh.
 */

/** Matches road-segment.glb: 8 m wide, repeating every 9 m. */
export const TILE_LENGTH = 9
export const ROAD_HALF_WIDTH = 4

/** Centre line to centre line. A block side is a whole number of tiles. */
export const PITCH = 80
export const BLOCK_LENGTH = PITCH - 2 * ROAD_HALF_WIDTH
export const BLOCK_TILES = BLOCK_LENGTH / TILE_LENGTH

if (!Number.isInteger(BLOCK_TILES)) {
  throw new Error(`Block length ${BLOCK_LENGTH} m is not a whole number of ${TILE_LENGTH} m tiles`)
}

/** Puts the car's start half a block from the nearest junction. */
export const STREET_OFFSET = PITCH / 2

export function avenueX(i: number): number {
  return PITCH * i
}

export function streetZ(j: number): number {
  return STREET_OFFSET + PITCH * j
}

/** Index of the avenue whose centre line is nearest x. */
export function nearestAvenue(x: number): number {
  return Math.round(x / PITCH)
}

/** Index of the street whose centre line is nearest z. */
export function nearestStreet(z: number): number {
  return Math.round((z - STREET_OFFSET) / PITCH)
}

/** Sideways distance from the nearest avenue / street centre line. */
export function avenueOffset(x: number): number {
  return Math.abs(x - avenueX(nearestAvenue(x)))
}

export function streetOffset(z: number): number {
  return Math.abs(z - streetZ(nearestStreet(z)))
}

/**
 * How far a point is outside the tarmac, in metres; 0 anywhere on a road or
 * in a junction. A point is on the road if it is within half a road width of
 * either kind of centre line.
 */
export function distanceOffRoad(x: number, z: number): number {
  const fromAvenue = avenueOffset(x) - ROAD_HALF_WIDTH
  const fromStreet = streetOffset(z) - ROAD_HALF_WIDTH
  return Math.max(0, Math.min(fromAvenue, fromStreet))
}

export function isOnRoad(x: number, z: number): boolean {
  return distanceOffRoad(x, z) === 0
}

/** True inside the square where an avenue and a street cross. */
export function isInJunction(x: number, z: number): boolean {
  return avenueOffset(x) <= ROAD_HALF_WIDTH && streetOffset(z) <= ROAD_HALF_WIDTH
}
