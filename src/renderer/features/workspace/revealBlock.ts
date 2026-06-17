/** The block to reveal, resolved by the caller (id → file:line). */
export interface RevealTarget {
  id: string
  /** Source file the block lives in (root-relative). */
  file: string
  /** First content line — `contentStartLine ?? span.startLine` (M2-7). */
  line: number
}

/** Side effects the reveal drives. Navigation only — there is NO select and NO
 *  view-switching action in the surface, so a reveal can never create/select a
 *  block, nor flip read mode into select (the BUG-48 root cause). */
export interface RevealActions {
  /** Signal the paper pane to scroll to the block's geometry box. */
  scrollPdf: (id: string) => void
  /** Open the block's file in the editor (adds the tab, reveals the pane). */
  openFile: (file: string) => void
  /** Scroll the editor to the block's line. */
  jumpTo: (file: string, line: number) => void
}

/** Outline reveal: pure jump-to-location. ALWAYS scrolls the PDF to the block
 *  and jumps the source, in EVERY mode — never selects a block, never switches
 *  the view. One path, no per-mode special-casing. */
export function revealBlock(target: RevealTarget, actions: RevealActions): void {
  actions.scrollPdf(target.id)
  actions.openFile(target.file)
  actions.jumpTo(target.file, target.line)
}
