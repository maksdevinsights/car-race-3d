/** 6 m behind the car, 3 m above it, angled down onto the roof line. */
export const CHASE_BACK = 6
export const CHASE_UP = 3
const AIM_HEIGHT = 0.7

export const CHASE_PITCH = -Math.atan2(CHASE_UP - AIM_HEIGHT, CHASE_BACK)

/** How quickly the camera closes a sideways gap to the car, per second. */
const LATERAL_RESPONSE = 4

/** How quickly the camera swings round to a new heading, per second. */
const HEADING_RESPONSE = 3

/**
 * The point on the ground the camera trails, and the heading it looks along.
 * Heading follows the car's rotation.y: 0 faces +Z.
 */
export type Chase = { x: number; z: number; yaw: number }

export function makeChase(x = 0, z = 0, yaw = 0): Chase {
  return { x, z, yaw }
}

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/**
 * Advances the chase toward the car. Only the sideways gap and the heading
 * lag; travel along the car's nose is tracked rigidly, so on a straight the
 * camera sits exactly CHASE_BACK behind at any speed instead of drifting
 * further back the faster the car goes.
 */
export function stepChase(chase: Chase, carX: number, carZ: number, carYaw: number, delta: number): Chase {
  chase.yaw += wrapAngle(carYaw - chase.yaw) * (1 - Math.exp(-HEADING_RESPONSE * delta))

  // Split the gap to the car into along-the-nose and across-it, and keep a
  // decaying share of the across part only.
  const sideX = Math.cos(carYaw)
  const sideZ = -Math.sin(carYaw)
  const lateral = (carX - chase.x) * sideX + (carZ - chase.z) * sideZ
  const kept = lateral * Math.exp(-LATERAL_RESPONSE * delta)

  chase.x = carX - sideX * kept
  chase.z = carZ - sideZ * kept
  return chase
}
