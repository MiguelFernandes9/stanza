import * as React from 'react';

/** Paper surface container with optional header + padded body.
 *  @startingPoint section="Surfaces" subtitle="Paper card with header & actions" viewport="360x200" */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Header action nodes (right-aligned). */
  actions?: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  elevation?: 'flat' | 'card' | 'raised' | 'pop';
  /** Style overrides for the inner body. */
  bodyStyle?: React.CSSProperties;
}

export function Card(props: CardProps): React.JSX.Element;
