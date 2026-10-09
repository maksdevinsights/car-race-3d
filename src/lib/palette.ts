/**
 * The D1 design system palette, and nothing else. Every colour in the scene
 * comes from here or from the GLBs, which use the same values.
 *
 * Red is not listed: it belongs to the player car and the hazard stripes
 * baked into the GLBs, and nothing generated in code may use it.
 */
export const PALETTE = {
  /** Sky, far horizon, window bands, unlit glass. */
  void: '#0D1117',
  /** Ground either side of the road. */
  ground: '#161B22',
  /** Road surface. */
  asphalt: '#1C2128',
  /** Edges, kerbs, hills, wheels. */
  edge: '#30363D',
  /** Lane markings, hazard bodies. */
  offWhite: '#E6EDF3',
  /** Secondary HUD text; in the world, dimly lit glass. */
  grey: '#8B949E',
} as const
