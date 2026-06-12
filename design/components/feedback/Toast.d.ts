import * as React from 'react';

export type ToastTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warn';

/** Toast notification card with a tone stripe. */
export interface ToastProps {
  title: React.ReactNode;
  message?: React.ReactNode;
  tone?: ToastTone;
  /** Leading icon node. */
  icon?: React.ReactNode;
  /** Action node (e.g. an "Undo" Button). */
  action?: React.ReactNode;
  /** Show a dismiss "×"; called on click. */
  onDismiss?: () => void;
}

export function Toast(props: ToastProps): React.JSX.Element;
