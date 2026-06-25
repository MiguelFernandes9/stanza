import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import type { EditorState, Extension, Range } from '@codemirror/state'

// \texttt{...} is the typewriter / inline-code command. The lang-latex grammar
// tags only its control word (t.monospace, which the base highlight style leaves
// uncoloured) and parses the argument as plain text — so package names like
// \texttt{booktabs} read flat next to coloured commands (\textsc → className,
// \TeX → keyword). Tint the whole construct so inline code carries a code colour
// too. \verb / \lstinline / verbatim content already get t.meta from the grammar,
// so this fills the one gap and gives every inline-code construct an indicator.
const CODE_NODE = 'TextTeletypeCommand'
const codeMark = Decoration.mark({ class: 'cm-stz-code' })

/** Document ranges of inline-code constructs within [from, to]. Pure — drives
 *  the view plugin and is unit-tested directly against a parsed document. */
export function inlineCodeRanges(
  state: EditorState,
  from: number,
  to: number
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name === CODE_NODE) ranges.push({ from: node.from, to: node.to })
    }
  })
  return ranges
}

function build(view: EditorView): DecorationSet {
  const marks: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    for (const r of inlineCodeRanges(view.state, from, to)) marks.push(codeMark.range(r.from, r.to))
  }
  return Decoration.set(marks, true)
}

const inlineCodePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate): void {
      // Rebuild on edits, scroll (visible-range change), and when the async
      // parser hands back a fresher tree.
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = build(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

/** Tint `\texttt{…}` inline code in the editor — a tree-driven mark plus its
 *  colour (the palette's quiet ink-blue, the established voice for commands/.bib). */
export const inlineCodeHighlight: Extension = [
  inlineCodePlugin,
  EditorView.baseTheme({ '.cm-stz-code': { color: 'var(--blue-700)' } })
]
