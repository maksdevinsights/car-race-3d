import type { CSSProperties, ReactNode } from 'react'

export type StatSize = 'sm' | 'md' | 'lg'
export type StatAlign = 'left' | 'center' | 'right'

const sizes: Record<StatSize, string> = {
  sm: 'var(--size-display-4)',
  md: 'var(--size-display-3)',
  lg: 'var(--size-display-2)',
}

export type StatProps = {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  size?: StatSize
  align?: StatAlign
  hazard?: boolean
  style?: CSSProperties
}

export function Stat({
  label,
  value,
  unit,
  size = 'md',
  align = 'left',
  hazard,
  style,
}: StatProps) {
  return (
    <div style={{ textAlign: align, ...style }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--size-label-xs)',
          letterSpacing: 'var(--track-label)',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: sizes[size],
          lineHeight: 1,
          letterSpacing: 'var(--track-display)',
          fontVariantNumeric: 'tabular-nums',
          color: hazard ? 'var(--red)' : 'var(--text-primary)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
          gap: 'var(--space-2)',
        }}
      >
        {value}
        {unit ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--size-label-xs)',
              letterSpacing: 'var(--track-label)',
              color: 'var(--text-secondary)',
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  )
}
