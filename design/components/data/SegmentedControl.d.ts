import * as React from 'react';

export interface SegmentOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

/** Mutually-exclusive segmented control on a sunken track. */
export interface SegmentedControlProps {
  /** Options as strings or { value, label, icon }. */
  options: Array<string | SegmentOption>;
  value: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export function SegmentedControl(props: SegmentedControlProps): React.JSX.Element;
