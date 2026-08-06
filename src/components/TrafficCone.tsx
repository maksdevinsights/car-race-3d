import { Clone, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'

const URL = '/models/traffic-cone.glb'

export function TrafficCone(props: Omit<ThreeElements['group'], 'ref'>) {
  const { scene } = useGLTF(URL)
  return <Clone object={scene} {...props} />
}

useGLTF.preload(URL)
