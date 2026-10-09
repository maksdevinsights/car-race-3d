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

/** An axis-aligned footprint on the ground. Every collider in the world is one. */
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number }

/** The car's footprint: centre, heading (rotation.y) and half extents. */
export type Body = { x: number; z: number; yaw: number; halfWidth: number; halfLength: number }

/** Which way to move the body out of a collider, and how far. */
export type Contact = { nx: number; nz: number; depth: number }

export function carBody(x: number, z: number, yaw: number, scale = 1, out?: Body): Body {
  const body = out ?? { x: 0, z: 0, yaw: 0, halfWidth: 0, halfLength: 0 }
  body.x = x
  body.z = z
  body.yaw = yaw
  body.halfWidth = (CAR_SIZE.x * scale) / 2
  body.halfLength = (CAR_SIZE.z * scale) / 2
  return body
}

/** Ground-plane bounds of a turned body, for the broad phase. */
export function bodyBounds(body: Body, margin: number, out: Rect): Rect {
  const sin = Math.abs(Math.sin(body.yaw))
  const cos = Math.abs(Math.cos(body.yaw))
  const ex = body.halfWidth * cos + body.halfLength * sin + margin
  const ez = body.halfWidth * sin + body.halfLength * cos + margin
  out.minX = body.x - ex
  out.maxX = body.x + ex
  out.minZ = body.z - ez
  out.maxZ = body.z + ez
  return out
}

/**
 * Narrow phase: the same box-against-box test as the original, with one
 * change — the car's box turns with the car. Two boxes on the ground are
 * apart if they are apart along any of four axes (world X and Z, the car's
 * side and nose); otherwise they touch, and the axis with the least overlap
 * is the shortest way out. Height is not tested: everything stands on the
 * road, and the car is shorter than nothing it can hit.
 *
 * Writes the push that would move the body clear into `out` and returns
 * true, or returns false if the two do not touch.
 */
export function boxContact(body: Body, rect: Rect, out: Contact): boolean {
  const sin = Math.sin(body.yaw)
  const cos = Math.cos(body.yaw)
  // The car's side (+X at yaw 0) and nose (+Z at yaw 0) in world space.
  const sideX = cos
  const sideZ = -sin
  const noseX = sin
  const noseZ = cos

  const ex = (rect.maxX - rect.minX) / 2
  const ez = (rect.maxZ - rect.minZ) / 2
  // From the collider's centre to the car's.
  const dx = body.x - (rect.minX + rect.maxX) / 2
  const dz = body.z - (rect.minZ + rect.maxZ) / 2

  let best = Infinity
  const consider = (ax: number, az: number, carRadius: number, rectRadius: number) => {
    const distance = dx * ax + dz * az
    const overlap = carRadius + rectRadius - Math.abs(distance)
    if (overlap <= 0) return false
    if (overlap < best) {
      best = overlap
      const sign = distance < 0 ? -1 : 1
      out.nx = ax * sign
      out.nz = az * sign
      out.depth = overlap
    }
    return true
  }

  const w = body.halfWidth
  const l = body.halfLength
  return (
    consider(1, 0, w * Math.abs(sideX) + l * Math.abs(noseX), ex) &&
    consider(0, 1, w * Math.abs(sideZ) + l * Math.abs(noseZ), ez) &&
    consider(sideX, sideZ, w, ex * Math.abs(sideX) + ez * Math.abs(sideZ)) &&
    consider(noseX, noseZ, l, ex * Math.abs(noseX) + ez * Math.abs(noseZ))
  )
}
