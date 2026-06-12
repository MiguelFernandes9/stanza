import * as React from 'react';

export type BlockKind = 'section' | 'paragraph' | 'equation' | 'figure' | 'table' | 'itemize' | 'citation';

/**
 * A reference chip to an addressable block selected in the rendered PDF — the
 * unit Claude operations scope to. Carries a structural glyph (§ ¶ ∑ …), a
 * label, and an optional source span (file:line).
 *
 * @startingPoint section="Stanza" subtitle="Selected-block reference chip" viewport="320x80"
 */
export interface BlockTagProps {
  /** Human label, e.g. "Introduction" or "eq:energy". */
  label: React.ReactNode;
  /** Source span, e.g. "intro.tex:24–31". */
  span?: React.ReactNode;
  kind?: BlockKind;
  /** Selected/highlighted state (clay ring). */
  active?: boolean;
  /** Show a remove "×"; called on click. */
  onRemove?: () => void;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function BlockTag(props: BlockTagProps): React.JSX.Element;
