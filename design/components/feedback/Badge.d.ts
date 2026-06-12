import * as React from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'add' | 'del' | 'warn' | 'info';

/** Compact status/label pill. `add`/`del` reuse diff colors. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: 'soft' | 'solid';
  size?: 'sm' | 'md';
  /** Leading status dot. */
  dot?: boolean;
}

export function Badge(props: BadgeProps): React.JSX.Element;
