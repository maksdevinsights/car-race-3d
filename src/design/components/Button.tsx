import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

const base: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--track-label)',
  fontWeight: 700,
  border: '1px solid transparent',
  borderRadius: 'var(--radius-hair)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  transition: 'var(--transition-ui)',
  whiteSpace: 'nowrap',
}

const sizes: Record<ButtonSize, CSSProperties> = {
  sm: { fontSize: 'var(--size-label-xs)', padding: '7px 12px' },
  md: { fontSize: 'var(--size-label)', padding: '10px 18px' },
  lg: { fontSize: 'var(--size-label-lg)', padding: '14px 26px' },
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  style?: CSSProperties
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  onClick,
  style,
  children,
}: ButtonProps) {
  const [hover, setHover] = useState(false)
  const [press, setPress] = useState(false)

  let skin: CSSProperties
  if (variant === 'primary') {
    skin = {
      background: disabled
        ? 'var(--action-disabled-fill)'
        : press
          ? 'var(--action-fill-press)'
          : hover
            ? 'var(--action-fill-hover)'
            : 'var(--action-fill)',
      color: disabled ? 'var(--action-disabled-text)' : 'var(--action-text-on-fill)',
      borderColor: 'transparent',
    }
  } else if (variant === 'secondary') {
    skin = {
      background: 'transparent',
      color: disabled
        ? 'var(--action-disabled-text)'
        : hover || press
          ? 'var(--text-primary)'
          : 'var(--text-secondary)',
      borderColor: disabled
        ? 'var(--action-disabled-fill)'
        : hover || press
          ? 'var(--border-strong)'
          : 'var(--action-ghost-border)',
    }
  } else {
    skin = {
      background: press ? 'var(--surface-panel-raised)' : 'transparent',
      color: disabled
        ? 'var(--action-disabled-text)'
        : hover
          ? 'var(--text-primary)'
          : 'var(--text-secondary)',
      borderColor: 'transparent',
    }
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setPress(false)
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        ...base,
        ...sizes[size],
        ...skin,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
