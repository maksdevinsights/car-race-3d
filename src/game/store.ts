import { useSyncExternalStore } from 'react'
import { HEAD_START } from '../lib/route'

export type Phase = 'start' | 'playing' | 'over'

/** Why a run ended. */
export type EndReason = 'time' | 'wrecked'

export const STARTING_LIVES = 3

/**
 * Minimum grace period after a hit, in seconds. Scene stretches it when the
 * car is slow, so it always outlasts the time an obstacle takes to pass
 * through the car — or one stalled car would cost several lives.
 */
export const INVULNERABLE_SECONDS = 1

export type GameState = {
  phase: Phase
  lives: number
  /** Metres delivered: the grid length of every leg completed (see lib/route.ts). */
  score: number
  deliveries: number
  /** Whole seconds left on the clock, rounded up. */
  timeLeft: number
  /** Metres actually driven this run; shown at the end, not scored. */
  driven: number
  /** Straight-line metres to the current delivery, rounded to 5 m. */
  nextDistance: number | null
  /** Where the delivery is relative to the car's nose, degrees, positive to the left. */
  nextBearing: number
  reason: EndReason | null
  /** Bumped on each new run; used to remount the scene so a retry starts clean. */
  run: number
}

const fresh = {
  lives: STARTING_LIVES,
  score: 0,
  deliveries: 0,
  timeLeft: HEAD_START,
  driven: 0,
  nextDistance: null,
  nextBearing: 0,
  reason: null,
}

let state: GameState = { phase: 'start', ...fresh, run: 0 }
let distance = 0
let clock = HEAD_START

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
  clock = HEAD_START
  publish({ phase: 'playing', ...fresh, run: state.run + 1 })
}

export function returnToMenu() {
  distance = 0
  clock = HEAD_START
  publish({ phase: 'start', ...fresh, run: state.run + 1 })
}

function end(reason: EndReason) {
  publish({ phase: 'over', reason })
}

/** Called every frame with the distance the car moved. */
export function travel(metres: number) {
  if (state.phase !== 'playing') return
  distance += metres
  const driven = Math.floor(distance)
  // Only wake the HUD when the whole-metre readout actually changes.
  if (driven !== state.driven) publish({ driven })
}

/** Runs the clock down; out of time ends the run. */
export function tick(seconds: number) {
  if (state.phase !== 'playing') return
  clock -= seconds
  if (clock <= 0) {
    publish({ timeLeft: 0 })
    end('time')
    return
  }
  const timeLeft = Math.ceil(clock)
  if (timeLeft !== state.timeLeft) publish({ timeLeft })
}

/** Adds time to the clock: each leg's allowance as it is set. */
export function grantTime(seconds: number) {
  if (state.phase !== 'playing') return
  clock += seconds
  publish({ timeLeft: Math.ceil(clock) })
}

/** A leg completed: bank its metres. */
export function deliver(metres: number) {
  if (state.phase !== 'playing') return
  publish({ score: state.score + metres, deliveries: state.deliveries + 1 })
}

/** Where the next delivery is; published only when the rounded values change. */
export function navigate(nextDistance: number | null, nextBearing: number) {
  if (nextDistance === state.nextDistance && nextBearing === state.nextBearing) return
  publish({ nextDistance, nextBearing })
}

export function registerHit() {
  if (state.phase !== 'playing') return
  const lives = state.lives - 1
  if (lives > 0) publish({ lives })
  else {
    publish({ lives: 0 })
    end('wrecked')
  }
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
