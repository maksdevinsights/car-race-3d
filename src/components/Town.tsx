import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Sphere,
  Vector3,
} from 'three'
import type { BufferGeometry, Group, Material } from 'three'
import type { RefObject } from 'react'
import { FRAME_ORDER } from '../lib/frame'
import { PITCH, ROAD_HALF_WIDTH, STREET_OFFSET, nearestAvenue, nearestStreet } from '../lib/roadNetwork'
import { blockAt } from '../lib/town'
import { FOG_FAR } from '../lib/view'
import type { Block, Decal, PropKind } from '../lib/town'
import { PROP_KINDS, PROP_MODELS } from './models'
import { useGlbParts } from './useGlbParts'
import type { GlbPart } from './useGlbParts'

/** Blocks laid each way from the car's nearest junction; matches the road's reach. */
const REACH = 3
const SLOTS = (2 * REACH) ** 2

/**
 * Per-block instance budgets. The densest block seen in testing used 137
 * boxes, 1135 decals, 7 cylinders and 23 props.
 */
const PER_BLOCK = { boxes: 200, decals: 1600, cylinders: 16 }
const PROP_CAPACITY = 600

/**
 * How much of a town surface's own colour it keeps with no light on it.
 *
 * With only the ambient fill, a face turned from the key light renders below
 * #0D1117 — blacker than the sky, and blacker than anything in the palette —
 * and the glass and doors laid on it, drawn at their exact palette value,
 * float in front of it as lighter slabs. With this floor a wall in shade
 * shows its own palette colour, and the key light brightens it from there.
 */
const SHADE_FLOOR = 1

/**
 * Matte, like the GLB materials (roughness 0.75–1, barely metallic). Lambert
 * rather than the physically based standard material: on near-black matte
 * walls the two look the same, and walls fill most of the screen, so the
 * cheaper shading per pixel is most of what the town costs over the road.
 *
 * Walls never go darker than their own colour; surfaces facing up (roofs,
 * lot paving) get no floor, or a lot would come out lighter than the road it
 * opens onto.
 */
const surface = () => {
  const material = new MeshLambertMaterial()
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUpward;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
          vUpward = abs(normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y);
        #else
          vUpward = abs(normalize(mat3(modelMatrix) * objectNormal).y);
        #endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUpward;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${SHADE_FLOOR.toFixed(2)} * (1.0 - vUpward);`,
      )
  }
  return material
}

/**
 * Windows and markings are flat quads laid exactly on their faces, so the
 * buildings themselves stay flush with the kerb. The polygon offset wins the
 * depth tie with the wall behind. Unlit, so lit glass reads as lit at night,
 * and not tone mapped: the filmic curve lifts #8B949E to near white, and the
 * glass should show the palette value it was given.
 */
const decalMaterial = () =>
  new MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false })

// ------------------------------------------------------------------- packing

type Packed = { matrices: Float32Array; colours: Float32Array; count: number }

/**
 * Per-block instance data, packed once. Matrices are relative to the block's
 * centre, so each block's meshes can sit at that centre: three.js then sorts
 * blocks front to back, and near buildings hide far ones before they shade.
 */
type BlockPack = {
  centre: [number, number]
  /** Tallest thing in the block, for its culling bounds. */
  height: number
  boxes: Packed
  cylinders: Packed
  decals: Packed
  /** World-space matrices per prop kind, one per placement. */
  props: Record<PropKind, Float32Array>
}

const linear = new Map<string, Color>()
function colourOf(hex: string) {
  let colour = linear.get(hex)
  if (!colour) {
    colour = new Color(hex)
    linear.set(hex, colour)
  }
  return colour
}

function packed(count: number): Packed {
  return { matrices: new Float32Array(count * 16), colours: new Float32Array(count * 3), count }
}

/** Column-major scale-then-translate, written straight into the array. */
function writeScaled(out: Float32Array, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  out.set([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1], i * 16)
}

/** A unit quad facing +Z, turned to face the decal's way and sized to it. */
function writeDecal(out: Float32Array, i: number, d: Decal, cx: number, cz: number) {
  const { width: w, height: h } = d
  const x = d.x - cx
  const z = d.z - cz
  const y = d.y
  switch (d.face) {
    case '+z':
      return out.set([w, 0, 0, 0, 0, h, 0, 0, 0, 0, 1, 0, x, y, z, 1], i * 16)
    case '-z':
      return out.set([-w, 0, 0, 0, 0, h, 0, 0, 0, 0, -1, 0, x, y, z, 1], i * 16)
    case '+x':
      return out.set([0, 0, -w, 0, 0, h, 0, 0, 1, 0, 0, 0, x, y, z, 1], i * 16)
    case '-x':
      return out.set([0, 0, w, 0, 0, h, 0, 0, -1, 0, 0, 0, x, y, z, 1], i * 16)
    default:
      return out.set([w, 0, 0, 0, 0, 0, -h, 0, 0, 1, 0, 0, x, y, z, 1], i * 16)
  }
}

function writeColour(out: Float32Array, i: number, hex: string) {
  const c = colourOf(hex)
  out[i * 3] = c.r
  out[i * 3 + 1] = c.g
  out[i * 3 + 2] = c.b
}

/** Ground distance from a point to the nearest edge of a block's footprint. */
function blockDistance(block: BlockPack, x: number, z: number) {
  const half = PITCH / 2 - ROAD_HALF_WIDTH
  const dx = Math.max(0, Math.abs(x - block.centre[0]) - half)
  const dz = Math.max(0, Math.abs(z - block.centre[1]) - half)
  return Math.hypot(dx, dz)
}

/** Block (i, j) lies between avenues i and i + 1, and streets j - 1 and j. */
function centreOf(i: number, j: number): [number, number] {
  return [PITCH * i + PITCH / 2, STREET_OFFSET + PITCH * (j - 1) + PITCH / 2]
}

function pack(i: number, j: number, block: Block): BlockPack {
  const [cx, cz] = centreOf(i, j)
  let height = 1

  const boxes = packed(block.boxes.length)
  block.boxes.forEach((b, k) => {
    writeScaled(boxes.matrices, k, b.x - cx, b.y, b.z - cz, b.sx, b.sy, b.sz)
    writeColour(boxes.colours, k, b.colour)
    height = Math.max(height, b.y + b.sy / 2)
  })

  const cylinders = packed(block.cylinders.length)
  block.cylinders.forEach((c, k) => {
    writeScaled(cylinders.matrices, k, c.x - cx, c.y, c.z - cz, c.radius, c.height, c.radius)
    writeColour(cylinders.colours, k, c.colour)
    height = Math.max(height, c.y + c.height / 2)
  })

  const decals = packed(block.decals.length)
  block.decals.forEach((d, k) => {
    writeDecal(decals.matrices, k, d, cx, cz)
    writeColour(decals.colours, k, d.colour)
  })

  const props = {} as Record<PropKind, Float32Array>
  const place = new Matrix4()
  for (const kind of PROP_KINDS) {
    const placed = block.props.filter((p) => p.kind === kind)
    props[kind] = new Float32Array(placed.length * 16)
    placed.forEach((p, k) => place.makeRotationY(p.yaw).setPosition(p.x, 0, p.z).toArray(props[kind], k * 16))
  }

  return { centre: [cx, cz], height, boxes, cylinders, decals, props }
}

// --------------------------------------------------------------------- slots

/** One block's worth of instanced meshes, reused as blocks come into range. */
type Slot = { id: string | null; meshes: [InstancedMesh, InstancedMesh, InstancedMesh] }

function slotMesh(geometry: BufferGeometry, material: Material, capacity: number) {
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  mesh.count = 0
  mesh.visible = false
  return mesh
}

function fill(mesh: InstancedMesh, data: Packed, capacity: number) {
  const n = Math.min(data.count, capacity)
  ;(mesh.instanceMatrix.array as Float32Array).set(data.matrices.subarray(0, n * 16))
  ;(mesh.instanceColor!.array as Float32Array).set(data.colours.subarray(0, n * 3))
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor!.needsUpdate = true
  return n < data.count
}

/**
 * The town, drawn from lib/town.ts around the car.
 *
 * Every block in range owns a slot: one instanced mesh each for its boxes,
 * decals and cylinders, placed at the block's centre with real bounds. That
 * lets three.js frustum-cull whole blocks — behind the camera, beside it,
 * off the edge of the view — and draw what is left front to back. A block's
 * data is copied in once, when it comes into range, not every frame.
 *
 * The props in the lots are GLBs with up to fourteen parts each; one
 * instanced mesh per part covers every lot, refilled from the blocks in view
 * only when that set changes.
 */
export function Town({ carRef }: { carRef: RefObject<Group | null> }) {
  const stalled = useGlbParts(PROP_MODELS['stalled-car'])
  const cone = useGlbParts(PROP_MODELS.cone)
  const barrier = useGlbParts(PROP_MODELS.barrier)
  const parts = useMemo(
    () => ({ 'stalled-car': stalled, cone, barrier }) as Record<PropKind, GlbPart[]>,
    [stalled, cone, barrier],
  )

  const world = useMemo(() => {
    const geometry = {
      box: new BoxGeometry(1, 1, 1),
      cylinder: new CylinderGeometry(1, 1, 1, 8),
      quad: new PlaneGeometry(1, 1),
    }
    const materials = {
      box: surface(),
      cylinder: Object.assign(surface(), { flatShading: true }),
      decal: decalMaterial(),
    }
    const slots: Slot[] = Array.from({ length: SLOTS }, () => ({
      id: null,
      meshes: [
        slotMesh(geometry.box, materials.box, PER_BLOCK.boxes),
        slotMesh(geometry.quad, materials.decal, PER_BLOCK.decals),
        slotMesh(geometry.cylinder, materials.cylinder, PER_BLOCK.cylinders),
      ],
    }))
    const props = Object.fromEntries(
      PROP_KINDS.map((kind) => [
        kind,
        parts[kind].map((part) => {
          const mesh = new InstancedMesh(part.geometry, part.material, PROP_CAPACITY)
          mesh.count = 0
          // Filled only from blocks in view, so it is never off screen.
          mesh.frustumCulled = false
          return mesh
        }),
      ]),
    ) as Record<PropKind, InstancedMesh[]>
    return { geometry, materials, slots, props }
  }, [parts])

  useEffect(
    () => () => {
      for (const g of Object.values(world.geometry)) g.dispose()
      for (const m of Object.values(world.materials)) m.dispose()
      for (const slot of world.slots) for (const mesh of slot.meshes) mesh.dispose()
      // Prop geometry and materials belong to the cached GLBs; only the
      // instance buffers are ours.
      for (const meshes of Object.values(world.props)) for (const mesh of meshes) mesh.dispose()
    },
    [world],
  )

  const packs = useRef(new Map<string, BlockPack>())
  const laidAt = useRef<string | null>(null)
  const inView = useRef('')
  const warned = useRef(false)
  const scratch = useMemo(
    () => ({ frustum: new Frustum(), matrix: new Matrix4(), sphere: new Sphere(), part: new Matrix4(), place: new Matrix4(), centre: new Vector3() }),
    [],
  )

  const packFor = (i: number, j: number) => {
    const id = `${i},${j}`
    let data = packs.current.get(id)
    if (!data) {
      data = pack(i, j, blockAt(i, j))
      packs.current.set(id, data)
      if (packs.current.size > 200) packs.current.delete(packs.current.keys().next().value!)
    }
    return data
  }

  useFrame(() => {
    const car = carRef.current
    if (!car) return
    const ci = nearestAvenue(car.position.x)
    const cj = nearestStreet(car.position.z)
    const key = `${ci},${cj}`

    // Hand slots to the blocks now in range. A block already in a slot keeps
    // it, so only blocks newly in range are copied.
    if (laidAt.current !== key) {
      laidAt.current = key
      const wanted = new Set<string>()
      for (let i = ci - REACH; i < ci + REACH; i++) {
        for (let j = cj - REACH + 1; j <= cj + REACH; j++) wanted.add(`${i},${j}`)
      }
      const free = world.slots.filter((slot) => !slot.id || !wanted.has(slot.id))
      const held = new Set(world.slots.map((slot) => slot.id))
      for (const id of wanted) {
        if (held.has(id)) continue
        const slot = free.pop()!
        const [i, j] = id.split(',').map(Number)
        const data = packFor(i, j)
        slot.id = id
        let overflow = false
        slot.meshes.forEach((mesh, k) => {
          const source = [data.boxes, data.decals, data.cylinders][k]
          overflow = fill(mesh, source, [PER_BLOCK.boxes, PER_BLOCK.decals, PER_BLOCK.cylinders][k]) || overflow
          mesh.position.set(data.centre[0], 0, data.centre[1])
          mesh.updateMatrixWorld()
          mesh.computeBoundingSphere()
          mesh.visible = true
        })
        if (overflow && !warned.current) {
          warned.current = true
          console.warn(`Town: block ${id} has more instances than its slot holds`)
        }
      }
      for (const slot of free) {
        if (slot.id && !wanted.has(slot.id)) slot.id = null
      }
    }

    // Blocks wholly past the fog render as plain sky: skip them outright.
    for (const slot of world.slots) {
      const near = slot.id !== null && blockDistance(packs.current.get(slot.id)!, car.position.x, car.position.z) < FOG_FAR
      for (const mesh of slot.meshes) mesh.visible = near
    }

  }, FRAME_ORDER.world)

  // Props: refill only from blocks the camera can see, and only when that set
  // changes — turning a corner, or moving on a junction. Runs after the camera
  // has moved this frame, so nothing pops in a frame late at the edge.
  useFrame(({ camera }) => {
    camera.updateMatrixWorld()
    scratch.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    scratch.frustum.setFromProjectionMatrix(scratch.matrix)
    const visible: string[] = []
    for (const slot of world.slots) {
      if (!slot.id || !slot.meshes[0].visible) continue
      const data = packs.current.get(slot.id)!
      scratch.sphere.center.set(data.centre[0], data.height / 2, data.centre[1])
      scratch.sphere.radius = Math.hypot(PITCH / 2 - ROAD_HALF_WIDTH, PITCH / 2 - ROAD_HALF_WIDTH, data.height / 2)
      if (scratch.frustum.intersectsSphere(scratch.sphere)) visible.push(slot.id)
    }
    const signature = visible.sort().join('|')
    if (signature === inView.current) return
    inView.current = signature

    for (const kind of PROP_KINDS) {
      let n = 0
      for (const id of visible) {
        const placed = packs.current.get(id)!.props[kind]
        const count = Math.min(placed.length / 16, PROP_CAPACITY - n)
        world.props[kind].forEach((mesh, p) => {
          const array = mesh.instanceMatrix.array as Float32Array
          for (let k = 0; k < count; k++) {
            scratch.place.fromArray(placed, k * 16)
            scratch.part.multiplyMatrices(scratch.place, parts[kind][p].matrix).toArray(array, (n + k) * 16)
          }
        })
        n += count
      }
      for (const mesh of world.props[kind]) {
        mesh.count = n
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  }, FRAME_ORDER.view)

  return (
    <group>
      {world.slots.map((slot, s) =>
        slot.meshes.map((mesh, k) => <primitive key={`${s}-${k}`} object={mesh} dispose={null} />),
      )}
      {PROP_KINDS.map((kind) =>
        world.props[kind].map((mesh, p) => <primitive key={`${kind}-${p}`} object={mesh} dispose={null} />),
      )}
    </group>
  )
}
