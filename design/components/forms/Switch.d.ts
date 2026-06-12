import * as React from 'react';

/** Binary toggle switch. Clay when on. */
export interface SwitchProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Optional trailing label; renders the switch + text as one clickable row. */
  label?: React.ReactNode;
  id?: string;
}

export function Switch(props: SwitchProps): React.JSX.Element;
