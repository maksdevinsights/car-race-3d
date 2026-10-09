/**
 * Longest timestep any mover is allowed to integrate in one frame, in seconds.
 *
 * A stalled tab (backgrounded, breakpoint, GC pause) resumes with a delta of
 * whole seconds. Unclamped, the world would leap hundreds of metres between
 * two frames and obstacles would tunnel straight through the car — collision
 * only samples discrete positions, so an overlap that is never rendered is
 * never detected. Clamping trades exact wall-clock distance for a world that
 * can't skip past the player.
 *
 * Every mover must clamp identically, or the road, the scenery and the
 * obstacles would drift out of step with each other.
 */
export const MAX_DELTA = 1 / 30

export function clampDelta(delta: number): number {
  return Math.min(delta, MAX_DELTA)
}

/**
 * useFrame priorities, lowest runs first. All negative: a positive priority
 * tells R3F the subscriber will call render itself.
 *
 * The car moves first; the world then reacts to where it now is (recycling,
 * collision, score); the camera follows the settled car; anything culled to
 * the view runs once the camera has moved; a debug view reads the finished
 * frame last. Left to mount order, collision would test the car
 * where it stood a frame ago.
 */
export const FRAME_ORDER = { car: -4, world: -3, camera: -2, view: -1.5, debug: -1 } as const
