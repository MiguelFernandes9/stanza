import * as React from 'react';

export type CompileState = 'idle' | 'running' | 'ok' | 'failed';

/** Toolbar compile-status pill reflecting the tectonic lifecycle. */
export interface CompilePillProps {
  state?: CompileState;
  /** Error count (shown when > 0; turns the pill red on `failed`). */
  errors?: number;
  /** Warning count (shown when > 0). */
  warnings?: number;
  /** Makes the pill a button (e.g. to open the log). */
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function CompilePill(props: CompilePillProps): React.JSX.Element;
