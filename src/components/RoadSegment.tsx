import { Clone, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'

const URL = '/models/road-segment.glb'

/** 8 m wide, 9 m long. Origin is the centre of the segment, surface at y = 0. */
export const SEGMENT_LENGTH = 9

export function RoadSegment(props: Omit<ThreeElements['group'], 'ref'>) {
  const { scene } = useGLTF(URL)
  return <Clone object={scene} {...props} />
}

useGLTF.preload(URL)
