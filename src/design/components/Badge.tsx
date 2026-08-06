import type { CSSProperties, ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'solid' | 'hazard' | 'outlineHazard'

const tones: Record<BadgeTone, CSSProperties> = {
  neutral: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    borderColor: 'var(--border-hairline)',
  },
  solid: {
    background: 'var(--surface-panel-raised)',
    color: 'var(--text-primary)',
    borderColor: 'transparent',
  },
  hazard: { background: 'var(--red)', color: 'var(--text-inverse)', borderColor: 'transparent' },
  outlineHazard: { background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' },
}

export type BadgeProps = {
  tone?: BadgeTone
  style?: CSSProperties
  children?: ReactNode
}

export function Badge({ tone = 'neutral', style, children }: BadgeProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--size-label-xs)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 'var(--track-label)',
        padding: '4px 8px',
        border: '1px solid transparent',
        borderRadius: 'var(--radius-hair)',
        display: 'inline-block',
        lineHeight: 1.2,
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  )
}
