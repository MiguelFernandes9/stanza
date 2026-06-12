import * as React from 'react';

/** Keyboard key cap for shortcut hints. */
export interface KbdProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Kbd(props: KbdProps): React.JSX.Element;
