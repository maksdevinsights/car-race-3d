import { Clone, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'

const URL = '/models/car.glb'

export function Car(props: Omit<ThreeElements['group'], 'ref'>) {
  const { scene } = useGLTF(URL)
  return <Clone object={scene} {...props} />
}

useGLTF.preload(URL)
