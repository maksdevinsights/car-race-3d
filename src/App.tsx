import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { Scene } from './components/Scene'
import { useRun } from './game/store'
import { Hud } from './ui/Hud'
import './design/styles.css'
import './App.css'

/** The car steers either side of the centre line, so the camera sits on it. */
const CAR_X = 0
const CAR_Z = 0

/** 6 m behind the car, 3 m above it, angled down onto the roof line. */
const BACK = 6
const UP = 3
const AIM_HEIGHT = 0.7

const CAMERA_POSITION: [number, number, number] = [CAR_X, UP, CAR_Z - BACK]

/**
 * A camera looks down its own -Z, so it needs a half turn to face the car and
 * the road ahead. YXZ order applies the yaw first, keeping the pitch level.
 */
const PITCH = -Math.atan2(UP - AIM_HEIGHT, BACK)
const CAMERA_ROTATION: [number, number, number, 'YXZ'] = [PITCH, Math.PI, 0, 'YXZ']

function App() {
  // Remounting on a new run resets every position and ref in the scene at once.
  const run = useRun()

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas>
        <PerspectiveCamera
          makeDefault
          position={CAMERA_POSITION}
          rotation={CAMERA_ROTATION}
          fov={55}
          near={0.1}
          far={500}
        />
        <ambientLight intensity={0.6} />
        <directionalLight position={[12, 18, 8]} intensity={1.4} />
        <Suspense fallback={null}>
          <Scene key={run} />
        </Suspense>
      </Canvas>
      <Hud />
    </div>
  )
}

export default App
