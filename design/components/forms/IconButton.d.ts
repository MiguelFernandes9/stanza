import * as React from 'react';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'ghost' | 'solid';

/** Icon-only square button for toolbars & pane chrome. Always pass `label`
 *  for accessibility (also used as the native tooltip). */
export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The icon node (a Lucide <svg>, etc). */
  children: React.ReactNode;
  /** Accessible label / tooltip text. */
  label: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  /** Held / toggled-on state (clay tint). */
  active?: boolean;
  disabled?: boolean;
}

export function IconButton(props: IconButtonProps): React.JSX.Element;
