import type { PageBlock } from './paperModel'

/** Placeholder paper copy while the compile pipeline is stubbed — the real
 *  pane renders the compiled PDF (F5); only block GEOMETRY matters to FD4.
 *  Deterministic per block id so the layout is stable. */

const SENTENCES = [
  'Block-addressable editing treats a manuscript as a tree of structural units rather than a stream of characters.',
  'Each unit carries its source span, so an instruction can be scoped precisely to the text it concerns.',
  'The compiled page remains the primary reading surface, while edits happen against the underlying source.',
  'A reviewer sees every proposed change as a diff anchored to the block that produced it.',
  'This arrangement keeps parallel edits legible: each task owns its blocks until a verdict lands.',
  'The margin rail mirrors the version-control model underneath — one branch per pending proposal.',
  'Scoping instructions to spans bounds the blast radius of any single operation.',
  'Cross-references and bibliography updates are the only sanctioned edits outside a span.'
]

const hash = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function mockTextFor(block: PageBlock): string {
  if (block.kind === 'heading') return block.name ?? 'Section'
  if (block.kind === 'environment') {
    if (block.envName === 'equation') return 'ℒ(θ) = 𝔼ₓ[ log pθ(x) ] − β · KL(qθ ∥ p)'
    return `[${block.envName ?? 'environment'}]`
  }
  const start = hash(block.id) % SENTENCES.length
  const count = 3 + (hash(block.id) % 3)
  const parts: string[] = []
  for (let i = 0; i < count; i++) parts.push(SENTENCES[(start + i) % SENTENCES.length])
  return parts.join(' ')
}
