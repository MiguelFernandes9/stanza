import type { JSX } from 'react'

interface Props {
  size?: number
  /** Ink stroke token; the middle line is always clay. */
  stroke?: string
  strokeWidth?: number
}

/** Brand mark — inline so the strokes follow the ink/clay tokens. */
export function StanzaMark({
  size = 40,
  stroke = 'var(--ink-900)',
  strokeWidth = 2.1
}: Props): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="24" height="24" rx="5.5" stroke={stroke} strokeWidth={strokeWidth} />
      <line x1="9.5" y1="11.5" x2="22.5" y2="11.5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <line x1="9.5" y1="16" x2="19" y2="16" stroke="var(--clay-500)" strokeWidth={strokeWidth} strokeLinecap="round" />
      <line x1="9.5" y1="20.5" x2="23" y2="20.5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}
