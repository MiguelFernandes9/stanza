import * as React from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

/** Single-line text field on a sunken paper well. */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
  /** Leading adornment (icon node). */
  iconLeft?: React.ReactNode;
  /** Trailing adornment (icon, kbd hint, unit). */
  trailing?: React.ReactNode;
  /** Render value in the mono voice (paths, commands). */
  mono?: boolean;
  /** Error styling. */
  invalid?: boolean;
  /** Style overrides for the outer wrapper. */
  wrapStyle?: React.CSSProperties;
}

export function Input(props: InputProps): React.JSX.Element;
