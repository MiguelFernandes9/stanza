import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { type EditorState, type Extension, type Range, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { ensureSpeller, isMisspelled, onReload } from './spell/engine'

/** LaTeX-aware spellcheck: check the prose, never the markup.
 *
 *  The lezer-latex grammar tags actual text runs as `Normal`; everything else —
 *  control sequences, math, comments, and key-like arguments (\label, \cite,
 *  file paths) — is markup. We walk the syntax tree for `Normal` ranges only,
 *  spell-check the words in them with our own engine, and underline the misses.
 *  One rule off the tree, no per-command list — it scales to every construct the
 *  grammar knows (tables, new environments, custom macros).
 *
 *  We draw our OWN underline (not the OS squiggle) because only we know which
 *  ranges are prose; the native checker would squiggle commands and math too. */

/** A misspelled word and its document range. */
export interface SpellMiss {
  from: number
  to: number
  word: string
}

// Letters (+ in-word apostrophes) only — `\p{L}` excludes digits and symbols, so
// `\section`'s backslash/braces never tokenise into a word.
const WORD_RE = /[\p{L}][\p{L}'’]*/gu

// The grammar tags some NON-prose as `Normal` too: a \documentclass/\usepackage
// name, every [..] option (utf8, colorlinks=true,…), a \label/\ref/\cite key, a
// file path, a url, \texttt inline code, and verbatim/listing/literal bodies.
// These are identifiers, options, and code — never natural language — so a
// `Normal` inside one is skipped. Mapped to the grammar's own node names (a
// bounded category), not a per-package list, so EVERY \usepackage[..]{..} is
// covered with no list to maintain; new prose stays checked.
const NON_PROSE = new Set([
  'OptionalArgument', 'ShortOptionalArg', // every [..] — package/class options, key=val
  'DocumentClassArgument', 'PackageArgument',
  'LabelArgument', 'RefArgument', 'BibKeyArgument',
  'UrlArgument', 'FilePathArgument', 'BareFilePathArgument',
  'IncludeGraphicsArgument', 'IncludeSvgArgument',
  'InputArgument', 'IncludeArgument', 'SubfileArgument',
  'BibliographyArgument', 'BibliographyStyleArgument',
  'DefinitionArgument', 'ColumnArgument', 'SpanArgument',
  'TextTeletypeCommand', // \texttt{...} — inline code, not prose
  'VerbContent', 'VerbatimContent', 'LstInlineContent',
  'LiteralArgContent', 'SpaceDelimitedLiteralArgContent'
])

function inNonProse(node: SyntaxNode): boolean {
  for (let p = node.parent; p; p = p.parent) if (NON_PROSE.has(p.name)) return true
  return false
}

/** Prose words (in `Normal` ranges) that `isBad` rejects. Pure over the state +
 *  injected checker, so it unit-tests without loading the dictionary. Bounded to
 *  [from,to] (a viewport); the parser's unparsed tail is skipped, never flagged. */
export function findMisspelledRanges(
  state: EditorState,
  isBad: (word: string) => boolean,
  from = 0,
  to = state.doc.length
): SpellMiss[] {
  const tree = syntaxTree(state)
  const limit = Math.min(to, tree.length)
  if (limit <= from) return []
  const misses: SpellMiss[] = []
  tree.iterate({
    from,
    to: limit,
    enter: (node) => {
      if (node.name !== 'Normal' || inNonProse(node.node)) return
      const text = state.doc.sliceString(node.from, node.to)
      for (const m of text.matchAll(WORD_RE)) {
        const word = m[0]
        // Skip single letters and all-caps tokens (acronyms — too many false hits).
        if (word.length < 2 || word === word.toUpperCase()) continue
        if (isBad(word)) misses.push({ from: node.from + m.index, to: node.from + m.index + word.length, word })
      }
    }
  })
  return misses
}

const setSpellErrors = StateEffect.define<DecorationSet>()
const MARK = Decoration.mark({ class: 'cm-spell-error' })

const spellField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes) // keep underlines aligned through edits until the next recompute
    for (const e of tr.effects) if (e.is(setSpellErrors)) deco = e.value
    return deco
  },
  provide: (f) => EditorView.decorations.from(f)
})

function computeDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    for (const miss of findMisspelledRanges(view.state, isMisspelled, from, to)) ranges.push(MARK.range(miss.from, miss.to))
  }
  return Decoration.set(ranges, true)
}

/** The misspelled word under `pos` (a right-click target), or null. Reads the
 *  live underline set, so it matches exactly what's shown — the seam the editor's
 *  context menu uses to offer corrections. */
export function spellMissAt(state: EditorState, pos: number): SpellMiss | null {
  const set = state.field(spellField, false)
  if (!set) return null
  let hit: SpellMiss | null = null
  set.between(pos, pos, (from, to) => {
    if (from <= pos && pos <= to) {
      hit = { from, to, word: state.doc.sliceString(from, to) }
      return false
    }
  })
  return hit
}

/** Recompute underlines now — for Add to Dictionary, which changes results
 *  without changing the document (so no edit would otherwise retrigger). */
export function refreshSpellErrors(view: EditorView): void {
  view.dispatch({ effects: setSpellErrors.of(computeDecorations(view)) })
}

/** Editor extension: underline misspelled prose. Recompute is debounced and waits
 *  for the dictionary chunk; the effect-only dispatch can't retrigger itself. */
export function latexSpellcheck(): Extension {
  let timer = 0
  const recompute = (view: EditorView): void => {
    void ensureSpeller().then(() => {
      if (!view.dom.isConnected) return
      view.dispatch({ effects: setSpellErrors.of(computeDecorations(view)) })
    })
  }
  return [
    spellField,
    // Our own underline replaces the OS squiggle — turn native checking off so a
    // command never gets a second, indiscriminate squiggle under it.
    EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
    ViewPlugin.fromClass(
      class {
        private readonly unsubscribe: () => void
        constructor(view: EditorView) {
          recompute(view)
          // Recompute when the dictionary (re)loads: language switch or on/off toggle.
          this.unsubscribe = onReload(() => recompute(view))
        }
        update(u: ViewUpdate): void {
          if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) {
            clearTimeout(timer)
            timer = window.setTimeout(() => recompute(u.view), 250)
          }
        }
        destroy(): void {
          this.unsubscribe()
          clearTimeout(timer)
        }
      }
    )
  ]
}
