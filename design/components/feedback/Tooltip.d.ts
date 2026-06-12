import * as React from 'react';

/** Hover/focus tooltip bubble (dark ink on paper). */
export interface TooltipProps {
  /** Tooltip text. */
  label: React.ReactNode;
  /** Optional trailing keyboard hint, mono-styled (e.g. "⌘↵"). */
  hint?: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Hover delay before showing, ms. */
  delay?: number;
  /** The single trigger element. */
  children: React.ReactNode;
}

export function Tooltip(props: TooltipProps): React.JSX.Element;
