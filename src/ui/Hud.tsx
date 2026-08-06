import { useEffect } from 'react'
import { Badge } from '../design/components/Badge'
import { Button } from '../design/components/Button'
import { Panel } from '../design/components/Panel'
import { Stat } from '../design/components/Stat'
import { STARTING_LIVES, returnToMenu, startRun, useGame } from '../game/store'

/**
 * DOM overlay above the canvas. The layer itself ignores the pointer so it
 * never steals a click from the scene; only the cards below take input.
 */
const LAYER: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
}

const SCRIM: React.CSSProperties = {
  ...LAYER,
  background: 'var(--surface-overlay)',
  pointerEvents: 'auto',
}

export function Hud() {
  const { phase, lives, score } = useGame()

  // The handoff's main menu offers Drive on Enter; carry that to retry too.
  useEffect(() => {
    if (phase === 'playing') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
      e.preventDefault()
      startRun()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase])

  if (phase === 'start') return <StartCard />
  if (phase === 'over') return <GameOverCard score={score} />
  return <RunHud lives={lives} score={score} />
}

function StartCard() {
  return (
    <div style={{ ...SCRIM, display: 'grid', alignItems: 'center', padding: '0 var(--space-20)' }}>
      <div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <Badge tone="solid">Build 0.1.0</Badge>
          <Badge>WebGL</Badge>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--size-hero)',
            lineHeight: 'var(--lh-hero)',
            letterSpacing: 'var(--track-display)',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
          }}
        >
          Night
          <br />
          Highway
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--size-label-sm)',
            letterSpacing: 'var(--track-label)',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            marginTop: 'var(--space-4)',
          }}
        >
          Desert Route 9 &middot; {STARTING_LIVES} lives &middot; night
        </div>
        <p style={{ marginTop: 'var(--space-6)', maxWidth: 380 }} className="dh-body">
          Steer with the arrow keys or A and D. Obstacles cost a life; you get three.
        </p>
        <div
          style={{
            marginTop: 'var(--space-8)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
          }}
        >
          <Button variant="primary" size="lg" onClick={startRun}>
            Drive
          </Button>
          <span className="dh-label-xs">Enter</span>
        </div>
      </div>
    </div>
  )
}

function RunHud({ lives, score }: { lives: number; score: number }) {
  return (
    <div style={LAYER}>
      <div style={{ position: 'absolute', left: 'var(--hud-gutter)', top: 'var(--hud-gutter)' }}>
        <Stat label="Lives" value={lives} hazard={lives === 1} />
      </div>
      <div
        style={{
          position: 'absolute',
          right: 'var(--hud-gutter)',
          top: 'var(--hud-gutter)',
        }}
      >
        <Stat label="Score" value={score} unit="M" align="right" />
      </div>
    </div>
  )
}

function GameOverCard({ score }: { score: number }) {
  return (
    <div style={{ ...SCRIM, display: 'grid', placeItems: 'center' }}>
      <Panel raised style={{ width: 460, padding: 'var(--space-10)' }}>
        <div
          style={{
            borderBottom: '1px solid var(--border-hairline)',
            paddingBottom: 'var(--space-4)',
          }}
        >
          <div className="dh-label-xs">Desert Route 9 &middot; night</div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--size-display-1)',
              lineHeight: 'var(--lh-display-1)',
              letterSpacing: 'var(--track-display)',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
            }}
          >
            Game over
          </div>
        </div>

        <div style={{ padding: 'var(--space-6) 0' }}>
          <Stat label="Final score" value={score} unit="M" size="lg" />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            borderTop: '1px solid var(--border-hairline)',
            paddingTop: 'var(--space-6)',
          }}
        >
          <Button variant="primary" size="lg" style={{ flex: 1 }} onClick={startRun}>
            Race again
          </Button>
          <Button variant="ghost" onClick={returnToMenu}>
            Menu
          </Button>
        </div>
      </Panel>
    </div>
  )
}
