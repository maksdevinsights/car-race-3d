import { Clone, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'

const URL = '/models/stalled-car.glb'

export function StalledCar(props: Omit<ThreeElements['group'], 'ref'>) {
  const { scene } = useGLTF(URL)
  return <Clone object={scene} {...props} />
}

useGLTF.preload(URL)
