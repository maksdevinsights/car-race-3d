import { useSyncExternalStore } from 'react'

export type Phase = 'start' | 'playing' | 'over'

export const STARTING_LIVES = 3

/**
 * Grace period after a hit, in seconds. Must stay longer than the time an
 * obstacle takes to pass through the car (~0.5 s at the current speed), or one
 * stalled car would cost several lives.
 */
export const INVULNERABLE_SECONDS = 1

export type GameState = {
  phase: Phase
  lives: number
  /** Metres travelled this run. */
  score: number
  /** Bumped on each new run; used to remount the scene so a retry starts clean. */
  run: number
}

const initial: GameState = { phase: 'start', lives: STARTING_LIVES, score: 0, run: 0 }

let state: GameState = initial
let distance = 0

const listeners = new Set<() => void>()

function publish(next: Partial<GameState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function getGameState(): GameState {
  return state
}

export function subscribeGame(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function startRun() {
  distance = 0
  publish({ phase: 'playing', lives: STARTING_LIVES, score: 0, run: state.run + 1 })
}

export function returnToMenu() {
  distance = 0
  publish({ phase: 'start', lives: STARTING_LIVES, score: 0, run: state.run + 1 })
}

/** Called every frame with the distance the world moved. */
export function travel(metres: number) {
  if (state.phase !== 'playing') return
  distance += metres
  const score = Math.floor(distance)
  // Only wake the HUD when the whole-metre readout actually changes.
  if (score !== state.score) publish({ score })
}

export function registerHit() {
  if (state.phase !== 'playing') return
  const lives = state.lives - 1
  publish(lives > 0 ? { lives } : { lives: 0, phase: 'over' })
}

/** Full state — for the HUD, which is cheap to re-render. */
export function useGame(): GameState {
  return useSyncExternalStore(subscribeGame, getGameState)
}

/**
 * Primitive selectors for anything wrapping the 3D tree: a changing score must
 * not re-render the scene, so these only fire when their own value changes.
 */
export function usePhase(): Phase {
  return useSyncExternalStore(subscribeGame, () => state.phase)
}

export function useRun(): number {
  return useSyncExternalStore(subscribeGame, () => state.run)
}
