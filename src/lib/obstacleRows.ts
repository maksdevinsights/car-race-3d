import { ROAD_HALF_WIDTH } from './roadNetwork'

/** Rows are laid across one road, whose surface runs from -4 to +4. */

/**
 * The player car is 1.8 m wide, so a row that leaves less than this much
 * continuous clear space is an unavoidable hit rather than a challenge.
 */
export const MIN_CLEAR_GAP = 2.5

/** Variant order rendered into each pooled slot. */
export const CONE = 0
export const BARRIER = 1
export const STALLED_CAR = 2

/** Widths in metres, indexed by variant. */
export const WIDTHS = [0.5, 2.6, 1.8]

export const MAX_PER_ROW = 3

const MAX_ATTEMPTS = 60

export type Placement = { type: number; x: number }

/**
 * Widest run of road not covered by any obstacle. Intervals are merged as we
 * sweep, so two overlapping obstacles do not read as two separate walls.
 */
export function widestGap(row: Placement[]): number {
  const spans = row
    .map(({ type, x }): [number, number] => {
      const half = WIDTHS[type] / 2
      return [x - half, x + half]
    })
    .sort((a, b) => a[0] - b[0])

  let widest = 0
  let edge = -ROAD_HALF_WIDTH

  for (const [start, end] of spans) {
    if (start > edge) widest = Math.max(widest, start - edge)
    edge = Math.max(edge, end)
  }

  return Math.max(widest, ROAD_HALF_WIDTH - edge)
}

function randomRow(): Placement[] {
  const count = 1 + Math.floor(Math.random() * MAX_PER_ROW)

  return Array.from({ length: count }, () => {
    const type = Math.floor(Math.random() * WIDTHS.length)
    // Keep the whole obstacle on the tarmac.
    const limit = ROAD_HALF_WIDTH - WIDTHS[type] / 2
    return { type, x: (Math.random() * 2 - 1) * limit }
  })
}

/**
 * Rejection sampling: keep drawing rows until one leaves a drivable gap.
 * Guaranteed to terminate — a run of failures falls back to a single cone
 * against one edge, which always leaves the rest of the road open.
 */
export function generateRow(): Placement[] {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = randomRow()
    if (widestGap(row) >= MIN_CLEAR_GAP) return row
  }

  const edge = ROAD_HALF_WIDTH - WIDTHS[CONE] / 2
  return [{ type: CONE, x: Math.random() < 0.5 ? -edge : edge }]
}
