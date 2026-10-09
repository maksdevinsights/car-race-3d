import type { Rect } from './collision'
import { PALETTE } from './palette'
import { PITCH, ROAD_HALF_WIDTH, avenueX, streetZ } from './roadNetwork'

/**
 * The town filling each block of the road grid, as plain data.
 *
 * Every block is generated from its own seed, so it is identical whenever the
 * car comes back to it, and can be asked about (what is solid here?) without
 * anything having been rendered. Buildings stand on the block's edges, which
 * are the road network's lane boundaries: a street face sits exactly on the
 * kerb line, never in front of it.
 *
 * Shapes are boxes and eight-sided cylinders in the D1 palette, the same
 * vocabulary as the Claude Design GLBs. Windows and markings are flat decals
 * laid on faces. Parked cars, cones and barriers in the lots are the GLBs
 * themselves, placed as props.
 */


/** A footprint the car cannot enter, and how tall it stands. */
export type Solid = Rect & { kind: 'building' | 'prop'; height: number }

/** Centre and full size. */
export type Box = { x: number; y: number; z: number; sx: number; sy: number; sz: number; colour: string }

/** Centre, radius and full height; eight-sided when drawn. */
export type Cylinder = { x: number; y: number; z: number; radius: number; height: number; colour: string }

/** Which way a decal faces. */
export type Face = '+x' | '-x' | '+z' | '-z' | '+y'

/**
 * A flat rectangle on a face, centred at (x, y, z). Width runs along the
 * face's horizontal axis; height is vertical, or along Z for '+y'.
 */
export type Decal = { x: number; y: number; z: number; face: Face; width: number; height: number; colour: string }

export type PropKind = 'stalled-car' | 'cone' | 'barrier'
export type Prop = { kind: PropKind; x: number; z: number; yaw: number }

export type Block = {
  boxes: Box[]
  cylinders: Cylinder[]
  decals: Decal[]
  props: Prop[]
  /** Footprints the car cannot enter: buildings, and props in the lots. */
  solids: Solid[]
}

const BLOCK_SIZE = PITCH - 2 * ROAD_HALF_WIDTH

/** Lit glass is rare and mostly dim; most windows are dark. */
const BODY_COLOURS = [PALETTE.asphalt, PALETTE.asphalt, PALETTE.ground, PALETTE.ground, PALETTE.edge]

// ---------------------------------------------------------------- randomness

type Rand = () => number

/** mulberry32: small, fast, and good enough for scenery. */
function rng(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedOf(i: number, j: number) {
  return (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 0x9e3779b9) >>> 0
}

const range = (r: Rand, min: number, max: number) => min + r() * (max - min)
const int = (r: Rand, min: number, max: number) => Math.floor(range(r, min, max + 1))
const pick = <T,>(r: Rand, items: readonly T[]) => items[Math.floor(r() * items.length)]

// --------------------------------------------------------------- block edges

/**
 * One side of a block, walked from one corner to the next. `s` runs along it,
 * `d` runs inward from the kerb.
 */
type Edge = { ox: number; oz: number; ax: number; az: number; nx: number; nz: number; face: Face }

function rectOf(edge: Edge, s0: number, s1: number, d0: number, d1: number): Rect {
  const xs = [edge.ox + edge.ax * s0 + edge.nx * d0, edge.ox + edge.ax * s1 + edge.nx * d1]
  const zs = [edge.oz + edge.az * s0 + edge.nz * d0, edge.oz + edge.az * s1 + edge.nz * d1]
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

function pointOf(edge: Edge, s: number, d: number): [number, number] {
  return [edge.ox + edge.ax * s + edge.nx * d, edge.oz + edge.az * s + edge.nz * d]
}

function overlaps(a: Rect, b: Rect) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ
}

/** Length of a rect's face, and where along it a decal centred at t sits. */
function faceLength(rect: Rect, face: Face) {
  return face === '+x' || face === '-x' ? rect.maxZ - rect.minZ : rect.maxX - rect.minX
}

function onFace(rect: Rect, face: Face, t: number, y: number, width: number, height: number, colour: string): Decal {
  switch (face) {
    case '-z':
      return { x: rect.minX + t, y, z: rect.minZ, face, width, height, colour }
    case '+z':
      return { x: rect.maxX - t, y, z: rect.maxZ, face, width, height, colour }
    case '+x':
      return { x: rect.maxX, y, z: rect.minZ + t, face, width, height, colour }
    default:
      return { x: rect.minX, y, z: rect.maxZ - t, face, width, height, colour }
  }
}

// ------------------------------------------------------------------ buildings

function floorCount(r: Rand, corner: boolean) {
  if (corner) return int(r, 3, 12)
  const roll = r()
  if (roll < 0.3) return int(r, 2, 3)
  if (roll < 0.72) return int(r, 4, 6)
  if (roll < 0.92) return int(r, 7, 10)
  return int(r, 11, 16)
}

/**
 * Lit glass is mostly dim grey. Off-white is kept for small openings: across
 * a whole shopfront or ribbon it reads as a flat white slab.
 */
function glass(r: Rand, litRate: number, small = true) {
  if (r() >= litRate) return PALETTE.void
  return small && r() < 0.3 ? PALETTE.offWhite : PALETTE.grey
}

/**
 * A run of glass split into panes by thin mullions, so a long window reads as
 * framed glass rather than one flat slab. One colour for the run: a lit shop
 * or office floor is lit end to end.
 */
function panes(out: Block, rect: Rect, face: Face, from: number, to: number, y: number, height: number, colour: string, pane: number) {
  const mullion = 0.14
  const count = Math.max(1, Math.round((to - from + mullion) / (pane + mullion)))
  const width = (to - from - (count - 1) * mullion) / count
  for (let k = 0; k < count; k++) {
    out.decals.push(onFace(rect, face, from + k * (width + mullion) + width / 2, y, width, height, colour))
  }
}

type Facade = {
  style: 'punched' | 'ribbon' | 'slit'
  litRate: number
  bay: number
  windowWidth: number
  windowHeight: number
  sill: number
  /** Every nth bay is a blank pier; 0 for none. */
  pier: number
  ribbonHeight: number
}

function facadeStyle(r: Rand, storey: number): Facade {
  const roll = r()
  const bay = range(r, 1.9, 3.2)
  return {
    style: roll < 0.5 ? 'punched' : roll < 0.75 ? 'ribbon' : 'slit',
    litRate: range(r, 0.08, 0.38),
    bay,
    windowWidth: bay * range(r, 0.38, 0.62),
    windowHeight: storey * range(r, 0.38, 0.55),
    sill: storey * range(r, 0.26, 0.38),
    pier: r() < 0.4 ? int(r, 3, 6) : 0,
    ribbonHeight: storey * range(r, 0.3, 0.42),
  }
}

/** One storey of glass across one face, from height `base`. */
function storeyWindows(r: Rand, out: Block, rect: Rect, face: Face, style: Facade, base: number, storey: number, top: boolean) {
  const span = faceLength(rect, face)
  const margin = 0.7
  if (span < 2 * margin + 0.6) return

  if (style.style === 'punched') {
    const bays = Math.floor((span - 2 * margin) / style.bay)
    const start = (span - bays * style.bay) / 2
    // The top floor is often an attic with shorter openings.
    const height = top && r() < 0.5 ? style.windowHeight * 0.6 : style.windowHeight
    for (let b = 0; b < bays; b++) {
      if (style.pier && b % style.pier === style.pier - 1) continue
      if (r() < 0.05) continue
      const t = start + (b + 0.5) * style.bay
      out.decals.push(onFace(rect, face, t, base + style.sill + height / 2, style.windowWidth, height, glass(r, style.litRate)))
    }
  } else if (style.style === 'ribbon') {
    let t = margin
    while (t < span - margin - 1) {
      const length = Math.min(range(r, 2, 7), span - margin - t)
      const y = base + storey * 0.3 + style.ribbonHeight / 2
      panes(out, rect, face, t, t + length, y, style.ribbonHeight, glass(r, style.litRate, false), range(r, 1.1, 1.7))
      t += length + range(r, 0.3, 0.9)
    }
  } else {
    let t = margin + r() * 0.8
    for (;;) {
      const width = range(r, 0.45, 0.7)
      if (t + width > span - margin) break
      out.decals.push(onFace(rect, face, t + width / 2, base + storey * 0.5, width, storey * 0.62, glass(r, style.litRate)))
      t += width + range(r, 0.5, 2.4)
    }
  }
}

function groundFloor(r: Rand, out: Block, rect: Rect, face: Face, height: number, body: string) {
  const span = faceLength(rect, face)
  if (span < 3) return
  const trim = body === PALETTE.edge ? PALETTE.void : PALETTE.edge

  if (r() < 0.55) {
    // Shopfronts: one to three units, each its own run of framed glass below
    // a fascia. Most are shut for the night; a few are still lit.
    const units = Math.max(1, Math.min(int(r, 1, 3), Math.floor(span / 4)))
    const pier = 0.5
    const unit = (span - 2 * pier - (units - 1) * pier) / units
    const sill = 0.45
    const head = Math.min(2.8, height - 0.9)
    for (let u = 0; u < units; u++) {
      const from = pier + u * (unit + pier)
      const roll = r()
      if (roll < 0.35) {
        // Shutter pulled down for the night: slats to the ground, the wall
        // showing through the gaps between them. Slats sit side by side,
        // never on top of one another, so no two decals share a patch of
        // the same plane and fight over it.
        const slat = range(r, 0.28, 0.4)
        for (let y = 0; y < head - 0.05; y += slat) {
          const height = Math.min(slat - 0.05, head - y)
          out.decals.push(onFace(rect, face, from + unit / 2, y + height / 2, unit, height, trim))
        }
        continue
      }
      const colour = roll < 0.55 ? PALETTE.grey : PALETTE.void
      panes(out, rect, face, from, from + unit, (sill + head) / 2, head - sill, colour, range(r, 1.2, 2))
    }
    // Fascia band over the shops, where the signs would go.
    out.decals.push(onFace(rect, face, span / 2, head + 0.35, span - 0.4, 0.4, trim))
  } else {
    // Doors, and the odd small window, each kept clear of the others: two
    // decals on the same patch of wall would fight over its depth.
    const taken: [number, number][] = []
    const spot = (width: number, margin: number) => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const t = range(r, margin, span - margin)
        if (taken.every(([a, b]) => t + width / 2 + 0.3 < a || t - width / 2 - 0.3 > b)) {
          taken.push([t - width / 2, t + width / 2])
          return t
        }
      }
      return null
    }
    const doors = int(r, 1, 2)
    for (let k = 0; k < doors; k++) {
      const t = spot(1.2, 1.2)
      if (t !== null) out.decals.push(onFace(rect, face, t, 1.2, 1.2, 2.4, PALETTE.void))
    }
    if (r() < 0.5 && span > 6) {
      const t = spot(1.4, 2)
      if (t !== null) out.decals.push(onFace(rect, face, t, height * 0.55, 1.4, 1.1, glass(r, 0.3)))
    }
  }
}

function box(out: Block, rect: Rect, y0: number, y1: number, colour: string) {
  out.boxes.push({
    x: (rect.minX + rect.maxX) / 2,
    y: (y0 + y1) / 2,
    z: (rect.minZ + rect.maxZ) / 2,
    sx: rect.maxX - rect.minX,
    sy: y1 - y0,
    sz: rect.maxZ - rect.minZ,
    colour,
  })
}

function inset(rect: Rect, by: number): Rect {
  return { minX: rect.minX + by, maxX: rect.maxX - by, minZ: rect.minZ + by, maxZ: rect.maxZ - by }
}

function rooftop(r: Rand, out: Block, roof: Rect, y: number, floors: number, body: string) {
  const area = inset(roof, 0.8)
  if (area.maxX - area.minX < 2 || area.maxZ - area.minZ < 2) return
  const placed: Rect[] = []

  const place = (sx: number, sz: number): Rect | null => {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (sx > area.maxX - area.minX || sz > area.maxZ - area.minZ) return null
      const x = range(r, area.minX, area.maxX - sx)
      const z = range(r, area.minZ, area.maxZ - sz)
      const spot = { minX: x, maxX: x + sx, minZ: z, maxZ: z + sz }
      if (placed.some((other) => overlaps(other, inset(spot, -0.4)))) continue
      placed.push(spot)
      return spot
    }
    return null
  }

  if (floors >= 4 && r() < 0.6) {
    const spot = place(range(r, 2.4, 4), range(r, 2.4, 4))
    if (spot) box(out, spot, y, y + range(r, 2.6, 3.2), r() < 0.5 ? body : PALETTE.edge)
  }

  if (floors >= 4 && floors <= 11 && r() < 0.35) {
    const radius = range(r, 1, 1.6)
    const spot = place(radius * 2, radius * 2)
    if (spot) {
      const cx = (spot.minX + spot.maxX) / 2
      const cz = (spot.minZ + spot.maxZ) / 2
      const legs = 1.4
      const leg = radius * 0.65
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        out.boxes.push({ x: cx + lx * leg, y: y + legs / 2, z: cz + lz * leg, sx: 0.18, sy: legs, sz: 0.18, colour: PALETTE.void })
      }
      const tank = range(r, 2, 2.8)
      out.cylinders.push({ x: cx, y: y + legs + tank / 2, z: cz, radius, height: tank, colour: PALETTE.edge })
    }
  }

  const units = int(r, 0, 3)
  for (let k = 0; k < units; k++) {
    const spot = place(range(r, 1, 2.2), range(r, 1, 1.8))
    if (spot) box(out, spot, y, y + range(r, 0.8, 1.3), PALETTE.edge)
  }

  if (floors >= 10 && r() < 0.6) {
    const spot = place(0.5, 0.5)
    if (spot) {
      const mast = range(r, 4, 9)
      out.boxes.push({ x: spot.minX + 0.25, y: y + mast / 2, z: spot.minZ + 0.25, sx: 0.16, sy: mast, sz: 0.16, colour: PALETTE.edge })
    }
  }
}

function parapet(r: Rand, out: Block, roof: Rect, y: number, body: string) {
  if (r() >= 0.7) return
  const t = 0.3
  const h = range(r, 0.6, 1)
  const colour = body === PALETTE.edge ? PALETTE.void : PALETTE.edge
  box(out, { ...roof, maxZ: roof.minZ + t }, y, y + h, colour)
  box(out, { ...roof, minZ: roof.maxZ - t }, y, y + h, colour)
  box(out, { ...roof, minZ: roof.minZ + t, maxZ: roof.maxZ - t, maxX: roof.minX + t }, y, y + h, colour)
  box(out, { ...roof, minZ: roof.minZ + t, maxZ: roof.maxZ - t, minX: roof.maxX - t }, y, y + h, colour)
}

function building(r: Rand, out: Block, rect: Rect, faces: Face[], corner: boolean) {
  const floors = floorCount(r, corner)
  const storey = range(r, 3, 3.5)
  const ground = storey + range(r, 0.5, 1.3)
  const height = ground + (floors - 1) * storey
  const body = pick(r, BODY_COLOURS)
  const style = facadeStyle(r, storey)

  box(out, rect, 0, height, body)
  out.solids.push({ ...rect, kind: 'building', height })

  for (const face of faces) {
    groundFloor(r, out, rect, face, ground, body)
    for (let f = 1; f < floors; f++) {
      // The occasional blank floor: plant, or just an unlet storey.
      if (r() < 0.05) continue
      storeyWindows(r, out, rect, face, style, ground + (f - 1) * storey, storey, f === floors - 1)
    }
  }

  let roof = rect
  let roofY = height

  // Tall buildings may step back for a few more floors.
  const width = rect.maxX - rect.minX
  const depth = rect.maxZ - rect.minZ
  if (floors >= 7 && r() < 0.55) {
    const by = range(r, 1.5, 3)
    if (width > 2 * by + 4 && depth > 2 * by + 4) {
      const tier = inset(rect, by)
      const extra = int(r, 1, floors >= 10 ? 5 : 3)
      box(out, tier, roofY, roofY + extra * storey, body)
      for (const face of faces) {
        for (let f = 0; f < extra; f++) storeyWindows(r, out, tier, face, style, roofY + f * storey, storey, f === extra - 1)
      }
      roof = tier
      roofY += extra * storey
    }
  }

  parapet(r, out, roof, roofY, body)
  rooftop(r, out, roof, roofY, floors, body)
}

// ----------------------------------------------------------------------- lots

const CAR_LENGTH = 4.2
const CAR_WIDTH = 1.8
const BAY = 2.7
const KERB_GAP = 1

function lot(r: Rand, out: Block, edge: Edge, s0: number, s1: number, depth: number) {
  const rect = rectOf(edge, s0, s1, 0, depth)
  // Paved, its top level with the road so the two meet without a step.
  box(out, rect, -0.05, 0, PALETTE.asphalt)

  const along = Math.abs(edge.ax) > 0
  const inward = Math.atan2(edge.nx, edge.nz)
  const length = s1 - s0

  // One row of bays, cars nose-in or nose-out at random.
  if (depth >= KERB_GAP + CAR_LENGTH + 1.5) {
    const bays = Math.floor((length - 1.2) / BAY)
    const start = s0 + (length - bays * BAY) / 2
    const centre = KERB_GAP + 0.3 + CAR_LENGTH / 2
    for (let b = 0; b <= bays; b++) {
      const [lx, lz] = pointOf(edge, start + b * BAY, centre)
      // Bay lines run inward from the kerb: worn paint, dimmer than the
      // lane markings, which are lit rather than drawn flat.
      out.decals.push({ x: lx, y: 0, z: lz, face: '+y', width: along ? 0.12 : 4.8, height: along ? 4.8 : 0.12, colour: PALETTE.grey })
      if (b === bays || r() >= 0.55) continue
      const [cx, cz] = pointOf(edge, start + (b + 0.5) * BAY, centre)
      out.props.push({ kind: 'stalled-car', x: cx, z: cz, yaw: inward + (r() < 0.5 ? 0 : Math.PI) })
      out.solids.push({
        ...rectOf(edge, start + (b + 0.5) * BAY - CAR_WIDTH / 2, start + (b + 0.5) * BAY + CAR_WIDTH / 2, centre - CAR_LENGTH / 2, centre + CAR_LENGTH / 2),
        kind: 'prop',
        height: 1.4,
      })
    }
  }

  // A barrier closing off the back, set along the kerb.
  if (r() < 0.6 && length > 4) {
    const s = range(r, s0 + 1.5, s1 - 1.5)
    const d = depth - 0.6
    const [bx, bz] = pointOf(edge, s, d)
    out.props.push({ kind: 'barrier', x: bx, z: bz, yaw: Math.atan2(-edge.az, edge.ax) })
    out.solids.push({ ...rectOf(edge, s - 1.3, s + 1.3, d - 0.35, d + 0.35), kind: 'prop', height: 0.89 })
  }

  // Cones at the mouth of the lot.
  const cones = int(r, 0, 2)
  for (let k = 0; k < cones; k++) {
    const s = k === 0 ? s0 + 0.5 : s1 - 0.5
    const d = range(r, 0.4, 0.7)
    const [qx, qz] = pointOf(edge, s, d)
    out.props.push({ kind: 'cone', x: qx, z: qz, yaw: r() * Math.PI * 2 })
    out.solids.push({ ...rectOf(edge, s - 0.25, s + 0.25, d - 0.25, d + 0.25), kind: 'prop', height: 0.72 })
  }
}

// ---------------------------------------------------------------------- block

function generate(i: number, j: number): Block {
  const r = rng(seedOf(i, j))
  const out: Block = { boxes: [], cylinders: [], decals: [], props: [], solids: [] }

  const x0 = avenueX(i) + ROAD_HALF_WIDTH
  const x1 = avenueX(i + 1) - ROAD_HALF_WIDTH
  const z0 = streetZ(j - 1) + ROAD_HALF_WIDTH
  const z1 = streetZ(j) - ROAD_HALF_WIDTH

  // Walked anticlockwise from the south-west corner (seen from above, +X
  // left as the camera sees it does not matter here). Each edge's outward
  // face looks onto its road.
  const edges: Edge[] = [
    { ox: x0, oz: z0, ax: 1, az: 0, nx: 0, nz: 1, face: '-z' },
    { ox: x1, oz: z0, ax: 0, az: 1, nx: -1, nz: 0, face: '+x' },
    { ox: x1, oz: z1, ax: -1, az: 0, nx: 0, nz: -1, face: '+z' },
    { ox: x0, oz: z1, ax: 0, az: -1, nx: 1, nz: 0, face: '-x' },
  ]

  // Corner buildings first: each looks onto two roads.
  const corners = edges.map(() => range(r, 13, 22))
  const taken: Rect[] = []
  edges.forEach((edge, k) => {
    const rect = rectOf(edge, 0, corners[k], 0, corners[k])
    taken.push(rect)
    building(r, out, rect, [edge.face, edges[(k + 3) % 4].face], true)
  })

  // Then plots of uneven width along each side, between the corners.
  edges.forEach((edge, k) => {
    let s = corners[k]
    const end = BLOCK_SIZE - corners[(k + 1) % 4]
    while (end - s > 0.5) {
      let width = range(r, 7, 18)
      // Never leave a sliver too narrow to build on.
      if (end - s - width < 7) width = end - s

      // As deep as wanted, but no deeper than whatever already stands behind.
      let depth = range(r, 9, 24)
      for (const other of taken) {
        if (!overlaps(other, rectOf(edge, s, s + width, 0, depth))) continue
        const [px, pz] = [other.minX - edge.ox, other.minZ - edge.oz]
        const [qx, qz] = [other.maxX - edge.ox, other.maxZ - edge.oz]
        // Distance from the kerb to the near side of the other footprint.
        const near = Math.min(px * edge.nx + pz * edge.nz, qx * edge.nx + qz * edge.nz)
        depth = Math.min(depth, near)
      }

      if (depth >= 4) {
        const rect = rectOf(edge, s, s + width, 0, depth)
        taken.push(rect)
        if (width >= 11 && r() < 0.18) lot(r, out, edge, s, s + width, Math.min(depth, 16))
        else building(r, out, rect, [edge.face], false)
      }
      s += width
    }
  })

  return out
}

// ---------------------------------------------------------------------- query

const cache = new Map<string, Block>()
const CACHE_LIMIT = 400

export function blockAt(i: number, j: number): Block {
  const key = `${i},${j}`
  let block = cache.get(key)
  if (!block) {
    block = generate(i, j)
    cache.set(key, block)
    // Map keeps insertion order, so the first key is the oldest.
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  }
  return block
}
