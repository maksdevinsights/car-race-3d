import { useEffect } from 'react'
import { Badge } from '../design/components/Badge'
import { Button } from '../design/components/Button'
import { Panel } from '../design/components/Panel'
import { Stat } from '../design/components/Stat'
import { STARTING_LIVES, returnToMenu, startRun, useGame } from '../game/store'
import type { GameState } from '../game/store'

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

/** Under this many seconds the clock turns hazard red. */
const LOW_TIME = 10

export function Hud() {
  const game = useGame()
  const { phase } = game

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
  if (phase === 'over') return <GameOverCard game={game} />
  return <RunHud game={game} />
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
          Drive to the beacon before the clock runs out. Every delivery banks its distance and buys
          time for the next. Steer with the arrow keys or A and D, speed up and brake with up and down
          or W and S; hold brake to reverse. Brake for the corners. Obstacles cost a life; you get three.
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

function RunHud({ game }: { game: GameState }) {
  const { lives, score, timeLeft, nextDistance, nextBearing } = game
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
        <Stat label="Delivered" value={score} unit="M" align="right" />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 'var(--hud-gutter)',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-10)',
        }}
      >
        <Stat label="Time" value={timeLeft} unit="S" align="center" hazard={timeLeft <= LOW_TIME} />
        {nextDistance !== null && (
          <Stat
            label="Next"
            align="center"
            unit="M"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                {/* Up is the car's nose; the bearing is positive to the left. */}
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    fontSize: 'var(--size-display-4)',
                    transform: `rotate(${-nextBearing}deg)`,
                    color: 'var(--text-primary)',
                  }}
                >
                  ▲
                </span>
                {nextDistance}
              </span>
            }
          />
        )}
      </div>
    </div>
  )
}

const END_LINE = { time: 'Out of time', wrecked: 'Wrecked' } as const

function GameOverCard({ game }: { game: GameState }) {
  const { score, deliveries, driven, reason } = game
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
            {reason ? END_LINE[reason] : 'Game over'}
          </div>
        </div>

        <div style={{ padding: 'var(--space-6) 0', display: 'flex', alignItems: 'flex-end', gap: 'var(--space-8)' }}>
          <Stat label="Delivered" value={score} unit="M" size="lg" />
          <Stat label="Drops" value={deliveries} />
          <Stat label="Driven" value={driven} unit="M" />
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
