import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './components/Scene'
import { useRun } from './game/store'
import { Hud } from './ui/Hud'
import { PALETTE } from './lib/palette'
import { FOG_FAR, FOG_NEAR } from './lib/view'
import './design/styles.css'
import './App.css'

/** No router: /debug is the only other page, and only swaps the camera. */
const DEBUG = window.location.pathname.replace(/\/+$/, '') === '/debug'

const READOUT: React.CSSProperties = {
  position: 'absolute',
  left: 'var(--hud-gutter)',
  bottom: 'var(--hud-gutter)',
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--size-label-sm)',
  color: 'var(--text-primary)',
  whiteSpace: 'pre',
  pointerEvents: 'none',
}

function App() {
  // Remounting on a new run resets every position and ref in the scene at once.
  const run = useRun()
  const readout = useRef<HTMLDivElement | null>(null)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas>
        {/* The chase camera lives in the scene, beside the car it follows. */}
        {/*
          Night closes in at the horizon in the sky colour, past the ~200 m
          of town laid round the car. Not on /debug, whose camera hangs high
          enough above the town to be fogged out itself.
        */}
        {!DEBUG && <fog attach="fog" args={[PALETTE.void, FOG_NEAR, FOG_FAR]} />}
        <ambientLight intensity={0.6} />
        <directionalLight position={[12, 18, 8]} intensity={1.4} />
        <Suspense fallback={null}>
          <Scene key={run} debugReadout={DEBUG ? readout : undefined} />
        </Suspense>
      </Canvas>
      <Hud />
      {DEBUG && <div ref={readout} style={READOUT} />}
    </div>
  )
}

export default App
