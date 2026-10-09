import { useGLTF } from '@react-three/drei'
import type { PropKind } from '../lib/town'

/** The Claude Design GLBs that are placed many times, by prop kind. */
export const PROP_MODELS: Record<PropKind, string> = {
  'stalled-car': '/models/stalled-car.glb',
  cone: '/models/traffic-cone.glb',
  barrier: '/models/road-barrier.glb',
}

/** Indexed like OBSTACLE_SIZES and the obstacle variants: cone, barrier, stalled car. */
export const OBSTACLE_KINDS: PropKind[] = ['cone', 'barrier', 'stalled-car']

export const PROP_KINDS = Object.keys(PROP_MODELS) as PropKind[]

for (const url of Object.values(PROP_MODELS)) useGLTF.preload(url)
