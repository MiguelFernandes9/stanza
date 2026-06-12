import * as React from 'react';

/**
 * Renders a unified-diff string as a paper-diff card (file header with +/−
 * counts + parsed hunks). The body of a review "proposal".
 *
 * @startingPoint section="Stanza" subtitle="Unified-diff proposal card" viewport="560x240"
 */
export interface DiffHunkProps {
  /** File path shown in the header. */
  file?: string;
  /** A unified-diff string (with @@ hunk headers). */
  diff?: string;
  style?: React.CSSProperties;
}

export function DiffHunk(props: DiffHunkProps): React.JSX.Element;
