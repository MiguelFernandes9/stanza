import * as React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * The primary action control. Clay-filled `primary` for the main action in a
 * view; `secondary` for adjacent neutral actions; `ghost` for toolbar/inline
 * actions; `subtle` for tinted low-emphasis; `danger` for destructive
 * (reject / discard).
 *
 * @startingPoint section="Forms" subtitle="Action button — 5 variants, 3 sizes" viewport="420x120"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon node placed before the label (e.g. a Lucide <svg>). */
  iconLeft?: React.ReactNode;
  /** Icon node placed after the label. */
  iconRight?: React.ReactNode;
  /** Show a spinner and block interaction. */
  loading?: boolean;
  /** Stretch to fill the container width. */
  full?: boolean;
  disabled?: boolean;
}

export function Button(props: ButtonProps): React.JSX.Element;
