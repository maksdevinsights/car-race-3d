import type { CSSProperties, ReactNode } from 'react'

export type PanelProps = {
  label?: ReactNode
  raised?: boolean
  translucent?: boolean
  flush?: boolean
  style?: CSSProperties
  children?: ReactNode
}

export function Panel({ label, raised, translucent, flush, style, children }: PanelProps) {
  return (
    <div
      style={{
        background: translucent ? 'var(--surface-overlay)' : 'var(--surface-panel)',
        border: '1px solid var(--border-hairline)',
        borderRadius: 'var(--radius-hair)',
        padding: flush ? 0 : 'var(--panel-pad-y) var(--panel-pad-x)',
        boxShadow: raised ? 'var(--shadow-hard)' : 'none',
        ...style,
      }}
    >
      {label ? (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--size-label-xs)',
            letterSpacing: 'var(--track-label)',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            marginBottom: 'var(--space-2)',
          }}
        >
          {label}
        </div>
      ) : null}
      {children}
    </div>
  )
}
