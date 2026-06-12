import * as React from 'react';

/** Checkbox with paper-well styling and clay check. */
export interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  id?: string;
}

export function Checkbox(props: CheckboxProps): React.JSX.Element;
