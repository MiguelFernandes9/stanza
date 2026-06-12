import * as React from 'react';

export type StatusTone = 'neutral' | 'accent' | 'ok' | 'busy' | 'error' | 'info';

/** Status dot with optional pulse + label (compile / session state). */
export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  pulse?: boolean;
  label?: React.ReactNode;
  size?: number;
}

export function StatusDot(props: StatusDotProps): React.JSX.Element;
