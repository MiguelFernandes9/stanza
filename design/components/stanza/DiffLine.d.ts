import * as React from 'react';

export type DiffLineType = 'add' | 'del' | 'context' | 'meta';

/** One line of a unified diff. */
export interface DiffLineProps {
  type?: DiffLineType;
  /** Old-side line number (blank on additions). */
  oldNo?: number | null;
  /** New-side line number (blank on deletions). */
  newNo?: number | null;
  text?: string;
}

export function DiffLine(props: DiffLineProps): React.JSX.Element;
