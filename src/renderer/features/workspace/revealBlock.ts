import type { PaneView } from '../tasks/taskStore'

/** The block to reveal, resolved by the caller (id → file:line). */
export interface RevealTarget {
  id: string
  /** Source file the block lives in (root-relative). */
  file: string
  /** First content line — `contentStartLine ?? span.startLine` (M2-7). */
  line: number
}

/** Side effects the reveal drives. Deliberately has NO view-switching action,
 *  so a reveal can never flip read mode into select (the BUG-48 root cause). */
export interface RevealActions {
  /** Signal the paper pane to scroll to the block's geometry box. */
  scrollPdf: (id: string) => void
  /** Open the block's file in the editor (adds the tab, reveals the pane). */
  openFile: (file: string) => void
  /** Scroll the editor to the block's line. */
  jumpTo: (file: string, line: number) => void
  /** Select the block (toggle-block) — only called in select mode. */
  selectBlock: (id: string) => void
}

/** Mode-aware outline reveal. ALWAYS scrolls the PDF to the block and jumps the
 *  source; selects the block ONLY in select mode. Never switches the view —
 *  read stays read, select stays select. One path, a single select gate, no
 *  per-mode special-casing (the old handler hardcoded `set-view 'select'` +
 *  always selected). */
export function revealBlock(target: RevealTarget, view: PaneView, actions: RevealActions): void {
  actions.scrollPdf(target.id)
  actions.openFile(target.file)
  actions.jumpTo(target.file, target.line)
  if (view === 'select') actions.selectBlock(target.id)
}
