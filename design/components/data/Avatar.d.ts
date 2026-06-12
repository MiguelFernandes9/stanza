import * as React from 'react';

/** Chat participant avatar. `claude` shows the Stanza-clay glyph. */
export interface AvatarProps {
  /** Display name (initials fallback + title). */
  name?: string;
  /** Render the Claude identity glyph instead of initials. */
  claude?: boolean;
  /** Image source (overrides initials). */
  src?: string | null;
  /** Pixel size. */
  size?: number;
  style?: React.CSSProperties;
}

export function Avatar(props: AvatarProps): React.JSX.Element;
