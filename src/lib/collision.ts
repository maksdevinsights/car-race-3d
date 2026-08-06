/**
 * Hardcoded real-world sizes in metres, never measured off the meshes.
 *
 * Stored explicitly as x/y/z because the supplied figures were not written in
 * a consistent axis order: the car reads 4.2 x 1.8 x 1.4 (length, width,
 * height) while the barrier reads 2.6 x 0.7 x 0.89 (width, depth, height).
 * These match the extents of the shipped GLBs — the road barrier is the wide,
 * shallow one that spans a lane, and both cars are 4.2 m nose to tail.
 */
export type Size = { x: number; y: number; z: number }

export const CAR_SIZE: Size = { x: 1.8, y: 1.4, z: 4.2 }

/** Indexed by the obstacle variant order: cone, barrier, stalled car. */
export const OBSTACLE_SIZES: Size[] = [
  { x: 0.5, y: 0.72, z: 0.5 },
  { x: 2.6, y: 0.89, z: 0.7 },
  { x: 1.8, y: 1.4, z: 4.2 },
]

/** Near misses should read as near misses, so the car's box is forgiving. */
export const CAR_HITBOX_SCALE = 0.8

export type Box = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export function makeBox(): Box {
  return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }
}

/**
 * Writes the axis-aligned box for a model standing at (x, z). Every model has
 * its origin on the ground, so the box runs from y = 0 upward, and any scaling
 * shrinks it about its own centre rather than sinking it into the road.
 */
export function boxAt(target: Box, size: Size, x: number, z: number, scale = 1): Box {
  const halfX = (size.x * scale) / 2
  const halfY = (size.y * scale) / 2
  const halfZ = (size.z * scale) / 2
  const centreY = size.y / 2

  target.minX = x - halfX
  target.maxX = x + halfX
  target.minY = centreY - halfY
  target.maxY = centreY + halfY
  target.minZ = z - halfZ
  target.maxZ = z + halfZ
  return target
}

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  )
}

/** Broad phase: obstacles further ahead than this are not worth testing. */
export const TEST_RANGE_AHEAD = 20

/**
 * How far behind the car an obstacle can still be touching it: half the car's
 * shrunken length plus half the longest obstacle. The margin keeps the broad
 * phase off the exact contact boundary, where rounding could drop a real hit.
 */
export const TEST_RANGE_BEHIND =
  (CAR_SIZE.z * CAR_HITBOX_SCALE) / 2 + Math.max(...OBSTACLE_SIZES.map((s) => s.z)) / 2 + 0.5
