import { Clone, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'

const URL = '/models/road-barrier.glb'

export function RoadBarrier(props: Omit<ThreeElements['group'], 'ref'>) {
  const { scene } = useGLTF(URL)
  return <Clone object={scene} {...props} />
}

useGLTF.preload(URL)
