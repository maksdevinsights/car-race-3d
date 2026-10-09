import { CAR_HITBOX_SCALE, bodyBounds, boxContact } from './collision'
import type { Body, Contact, Rect } from './collision'
import { BLOCK_TILES, PITCH, ROAD_HALF_WIDTH, STREET_OFFSET, TILE_LENGTH } from './roadNetwork'
import { blockAt } from './town'

/**
 * Broad phase: a spatial hash whose cells are laid on the road network.
 *
 * Along each axis every 80 m pitch splits into nine cells: the 8 m road strip,
 * then the block beside it in eight 9 m cells — one per road tile. A car on a
 * road overlaps two to six cells, and a query only ever looks at colliders
 * filed under those cells, so it tests the handful of buildings at the kerb
 * beside it, not the hundreds in range of the camera.
 *
 * Buildings and lot props are filed lazily, a whole block at a time, the
 * first time a query touches one of its cells. Obstacles on the road are
 * filed and moved by whoever owns them.
 */

export type ColliderKind = 'building' | 'prop' | 'hazard'

export type Collider = Rect & {
  kind: ColliderKind
  height: number
  /** Hash keys this collider is filed under. */
  cells: number[]
  /** Last query that returned it, so one collider spanning cells is returned once. */
  seen: number
  /** Last frame it was tested in, for the debug view. */
  testedIn: number
}

/** Things the car slides along, as opposed to hazards that cost a life. */
export const SOLID = (kind: ColliderKind) => kind !== 'hazard'
export const HAZARD = (kind: ColliderKind) => kind === 'hazard'

const ROAD = 2 * ROAD_HALF_WIDTH
const SLOTS = 1 + BLOCK_TILES

/** Cell index along one axis. `offset` is that axis's first road centre line. */
function axisCell(v: number, offset: number): number {
  const start = offset - ROAD_HALF_WIDTH
  const period = Math.floor((v - start) / PITCH)
  const local = v - start - period * PITCH
  const slot = local < ROAD ? 0 : Math.min(BLOCK_TILES, 1 + Math.floor((local - ROAD) / TILE_LENGTH))
  return period * SLOTS + slot
}

/** Where a cell starts along its axis, and how wide it is. */
export function cellSpan(cell: number, offset: number): [number, number] {
  const period = Math.floor(cell / SLOTS)
  const slot = cell - period * SLOTS
  const start = offset - ROAD_HALF_WIDTH + period * PITCH
  return slot === 0 ? [start, ROAD] : [start + ROAD + (slot - 1) * TILE_LENGTH, TILE_LENGTH]
}

export const cellX = (x: number) => axisCell(x, 0)
export const cellZ = (z: number) => axisCell(z, STREET_OFFSET)
export const cellSpanX = (cell: number) => cellSpan(cell, 0)
export const cellSpanZ = (cell: number) => cellSpan(cell, STREET_OFFSET)

/** One number per cell, exact for any town smaller than half a million cells across. */
const HALF = 2 ** 19
const keyOf = (cx: number, cz: number) => (cx + HALF) * 2 ** 20 + (cz + HALF)

/** Below any real gap, above floating-point noise. */
const EDGE = 1e-6

/** Blocks kept filed; the oldest are taken out again beyond this. */
const BLOCK_LIMIT = 64

export class ColliderWorld {
  private cells = new Map<number, Collider[]>()
  private blocks = new Map<string, Collider[]>()
  private query_ = 0
  private frame = 0

  /** Every collider handed to the narrow phase this frame, for the debug view. */
  readonly tested: Collider[] = []
  /** The cells looked in this frame, as [cx, cz] pairs. */
  readonly testedCells: number[] = []

  make(kind: ColliderKind, height: number): Collider {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, kind, height, cells: [], seen: -1, testedIn: -1 }
  }

  insert(collider: Collider) {
    // Buildings end exactly on cell lines (the kerb, the tile seams); a
    // footprint that only touches the next cell is not filed there.
    const x0 = cellX(collider.minX)
    const x1 = Math.max(x0, cellX(collider.maxX - EDGE))
    const z0 = cellZ(collider.minZ)
    const z1 = Math.max(z0, cellZ(collider.maxZ - EDGE))
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = keyOf(cx, cz)
        let list = this.cells.get(key)
        if (!list) {
          list = []
          this.cells.set(key, list)
        }
        list.push(collider)
        collider.cells.push(key)
      }
    }
  }

  remove(collider: Collider) {
    for (const key of collider.cells) {
      const list = this.cells.get(key)
      if (!list) continue
      const at = list.indexOf(collider)
      if (at >= 0) list.splice(at, 1)
      if (list.length === 0) this.cells.delete(key)
    }
    collider.cells.length = 0
  }

  /** Total colliders filed right now, for the debug readout. */
  get size(): number {
    let n = 0
    for (const list of this.blocks.values()) n += list.length
    return n
  }

  /** Starts a new frame of debug bookkeeping. */
  beginFrame() {
    this.frame++
    this.tested.length = 0
    this.testedCells.length = 0
  }

  /**
   * Colliders filed under any cell the rect touches and passing `accept`,
   * each once. `record` marks them as tested this frame for the debug view;
   * the camera's own queries pass false.
   */
  query(area: Rect, accept: (kind: ColliderKind) => boolean, out: Collider[], record = true): Collider[] {
    out.length = 0
    const stamp = ++this.query_
    const x0 = cellX(area.minX)
    const x1 = cellX(area.maxX)
    const z0 = cellZ(area.minZ)
    const z1 = cellZ(area.maxZ)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        this.ensureBlock(cx, cz)
        if (record) this.testedCells.push(cx, cz)
        const list = this.cells.get(keyOf(cx, cz))
        if (!list) continue
        for (const collider of list) {
          if (collider.seen === stamp || !accept(collider.kind)) continue
          collider.seen = stamp
          out.push(collider)
          if (record && collider.testedIn !== this.frame) {
            collider.testedIn = this.frame
            this.tested.push(collider)
          }
        }
      }
    }
    return out
  }

  /** Files the block owning this cell, if it is a block cell and not yet filed. */
  private ensureBlock(cx: number, cz: number) {
    const px = Math.floor(cx / SLOTS)
    const pz = Math.floor(cz / SLOTS)
    // Slot 0 on either axis is road: no block owns it.
    if (cx - px * SLOTS === 0 || cz - pz * SLOTS === 0) return
    // East of avenue px, north of street pz: town block (px, pz + 1).
    const i = px
    const j = pz + 1
    const id = `${i},${j}`
    if (this.blocks.has(id)) return

    const filed = blockAt(i, j).solids.map((solid) => {
      const collider = this.make(solid.kind, solid.height)
      collider.minX = solid.minX
      collider.maxX = solid.maxX
      collider.minZ = solid.minZ
      collider.maxZ = solid.maxZ
      this.insert(collider)
      return collider
    })
    this.blocks.set(id, filed)

    if (this.blocks.size > BLOCK_LIMIT) {
      const [oldest, colliders] = this.blocks.entries().next().value!
      for (const collider of colliders) this.remove(collider)
      this.blocks.delete(oldest)
    }
  }
}

/** The one world every system files into and queries. */
export const world = new ColliderWorld()

// ------------------------------------------------------------ shared queries

const scratchArea: Rect = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
const scratchList: Collider[] = []
const scratchContact: Contact = { nx: 0, nz: 0, depth: 0 }
const scratchHitbox: Body = { x: 0, z: 0, yaw: 0, halfWidth: 0, halfLength: 0 }

const scratchSolids: Collider[] = []

/** Solids near a body, for the car model's wall response. Valid until the next call. */
export function solidsNear(body: Body): readonly Collider[] {
  return world.query(bodyBounds(body, 0.1, scratchArea), SOLID, scratchSolids)
}

/** The first hazard touching the car's forgiving hitbox, if any. */
export function hazardHit(body: Body): Collider | null {
  const hitbox = Object.assign(scratchHitbox, body)
  hitbox.halfWidth *= CAR_HITBOX_SCALE
  hitbox.halfLength *= CAR_HITBOX_SCALE
  for (const collider of world.query(bodyBounds(hitbox, 0, scratchArea), HAZARD, scratchList)) {
    if (boxContact(hitbox, collider, scratchContact)) return collider
  }
  return null
}

/**
 * The shortest move that takes a ground point out of any solid; [0, 0] if
 * it is clear. Used for the camera, so it is not recorded as tested.
 */
export function pushPointOut(x: number, z: number): [number, number] {
  scratchArea.minX = x
  scratchArea.maxX = x
  scratchArea.minZ = z
  scratchArea.maxZ = z
  for (const rect of world.query(scratchArea, SOLID, scratchList, false)) {
    if (x <= rect.minX || x >= rect.maxX || z <= rect.minZ || z >= rect.maxZ) continue
    const left = x - rect.minX
    const right = rect.maxX - x
    const back = z - rect.minZ
    const front = rect.maxZ - z
    const least = Math.min(left, right, back, front)
    if (least === left) return [-left, 0]
    if (least === right) return [right, 0]
    if (least === back) return [0, -back]
    return [0, front]
  }
  return [0, 0]
}
