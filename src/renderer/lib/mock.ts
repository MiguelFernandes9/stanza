import type {
  ClaudeStatus,
  CommitInfo,
  CompileStatus,
  DocumentInfo,
  PrimeStep,
  RecentProject,
  ReviewProposal
} from '../../shared/ipc'
import type { BlockNode } from '../../shared/blocks/types'
import type { StanzaClient } from './ipc'

/** In-memory stand-in for the IPC client while backend handlers are stubs.
 *  Same typed surface (StanzaClient); swap point lives in lib/client.ts. */

type Listener<T> = (payload: T) => void

class Emitter<T> {
  private subs = new Set<Listener<T>>()
  on = (cb: Listener<T>): (() => void) => {
    this.subs.add(cb)
    return () => this.subs.delete(cb)
  }
  emit(payload: T): void {
    for (const cb of this.subs) cb(payload)
  }
}

const primeEmitter = new Emitter<PrimeStep>()
const compileEmitter = new Emitter<CompileStatus>()
const claudeEmitter = new Emitter<ClaudeStatus>()
const proposalEmitter = new Emitter<ReviewProposal>()

export const MOCK_RECENTS: RecentProject[] = [
  { root: '/Users/you/papers/block-editing', name: 'block-editing', hasSession: true, blockCount: 11 },
  { root: '/Users/you/papers/thesis-ch3', name: 'thesis-ch3', hasSession: true, blockCount: 42 },
  { root: '/Users/you/work/neurips-25', name: 'neurips-submission', hasSession: false }
]

const MOCK_DOC: DocumentInfo = {
  root: '/Users/you/work/neurips-25',
  mainFile: 'main.tex',
  texFiles: ['main.tex', 'preamble.tex', 'chapters/ch1.tex', 'chapters/ch2.tex']
}

const MOCK_HISTORY: CommitInfo[] = [
  { subject: 'claude: tighten the abstract', iso: '2026-06-12T18:02:00Z', kind: 'claude' },
  { subject: 'wip: manual edits', iso: '2026-06-12T17:40:00Z', kind: 'wip' },
  { subject: 'Initial import', iso: '2026-06-11T10:00:00Z', kind: 'other' }
]

const span = (startLine: number, endLine: number): { file: string; startLine: number; endLine: number } => ({
  file: 'main.tex',
  startLine,
  endLine
})

export const MOCK_BLOCKS: BlockNode[] = [
  { id: 'preamble#a1f2', kind: 'preamble', span: span(1, 12), children: [] },
  {
    id: 'sec1#b3c4',
    kind: 'section',
    name: 'Introduction',
    span: span(14, 40),
    children: [
      { id: 'sec1/par1#c5d6', kind: 'paragraph', span: span(16, 23), children: [] },
      { id: 'sec1/par2#d7e8', kind: 'paragraph', span: span(25, 33), children: [] },
      { id: 'sec1/eq1#e9f0', kind: 'environment', name: 'equation', span: span(35, 40), children: [] }
    ]
  },
  {
    id: 'sec2#f1a2',
    kind: 'section',
    name: 'Method',
    span: span(42, 68),
    children: [
      { id: 'sec2/par1#a3b4', kind: 'paragraph', span: span(44, 52), children: [] },
      { id: 'sec2/fig1#b5c6', kind: 'environment', name: 'figure', span: span(54, 60), children: [] },
      { id: 'sec2/par2#c7d8', kind: 'paragraph', span: span(62, 68), children: [] }
    ]
  },
  {
    id: 'sec3#d9e0',
    kind: 'section',
    name: 'Results',
    span: span(70, 92),
    children: [
      { id: 'sec3/par1#e1f2', kind: 'paragraph', span: span(72, 80), children: [] },
      { id: 'sec3/par2#f3a4', kind: 'paragraph', span: span(82, 92), children: [] }
    ]
  }
]

const PRIME_DETAILS: Record<PrimeStep['step'], string> = {
  read: `${MOCK_DOC.texFiles.length} files`,
  parse: '28 blocks',
  git: 'git init',
  session: 'primed'
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function runPrimeSequence(): Promise<void> {
  for (const step of ['read', 'parse', 'git', 'session'] as const) {
    primeEmitter.emit({ step, state: 'running' })
    await sleep(380)
    primeEmitter.emit({ step, state: 'done', detail: PRIME_DETAILS[step] })
  }
}

export const mockClient: StanzaClient = {
  documentOpen: async (req?: { root?: string }) => {
    const known = req?.root ? MOCK_RECENTS.find((r) => r.root === req.root) : undefined
    if (known?.hasSession) {
      await sleep(120)
      return { ...MOCK_DOC, root: known.root }
    }
    await runPrimeSequence()
    return req?.root ? { ...MOCK_DOC, root: req.root } : MOCK_DOC
  },
  documentCreate: async ({ name }) => {
    await runPrimeSequence()
    return { ...MOCK_DOC, root: `/Users/you/papers/${name}`, texFiles: ['main.tex'] }
  },
  documentRecents: async () => MOCK_RECENTS,
  documentHistory: async () => MOCK_HISTORY,
  documentSave: async () => undefined,
  documentFiles: async () => [
    { relPath: 'main.tex', kind: 'tex' as const },
    { relPath: 'preamble.tex', kind: 'tex' as const },
    { relPath: 'chapters/ch1.tex', kind: 'tex' as const },
    { relPath: 'chapters/ch2.tex', kind: 'tex' as const },
    { relPath: 'refs.bib', kind: 'bib' as const },
    { relPath: 'figs/plot.pdf', kind: 'image' as const },
    { relPath: 'style/thesis.sty', kind: 'style' as const }
  ],
  documentBlocks: async () => MOCK_BLOCKS,
  compileRun: async () => {
    compileEmitter.emit('running')
    await sleep(900)
    compileEmitter.emit('ok')
    return { ok: true, pdfPath: `${MOCK_DOC.root}/main.pdf`, synctexPath: `${MOCK_DOC.root}/main.synctex.gz`, errors: [] }
  },
  synctexInverse: async () => null,
  synctexForward: async () => [],
  claudeRun: async (req) => {
    const opId = `mock-${Math.random().toString(36).slice(2, 8)}`
    claudeEmitter.emit({ opId, state: 'running' })
    await sleep(1800)
    claudeEmitter.emit({ opId, state: 'done' })
    const target = req.spans[0] ?? { file: 'main.tex', startLine: 1, endLine: 3 }
    const proposal: ReviewProposal = {
      opId,
      instruction: req.instruction,
      branch: `stanza/op-${opId}`,
      files: [target.file],
      outsideSpan: [],
      diff: [
        `@@ -${target.startLine},3 +${target.startLine},2 @@`,
        '-Block-addressable editing treats a manuscript as a tree of structural units',
        '-rather than a stream of characters, which the prior draft stated twice.',
        '+Block-addressable editing treats a manuscript as a tree of structural units.',
        ' Each unit carries its source span, so an instruction can be scoped precisely.'
      ].join('\n')
    }
    proposalEmitter.emit(proposal)
    return {
      opId,
      note: 'Tightened the passage: merged the duplicated opening, kept the span citation intact.',
      proposal
    }
  },
  claudeHistory: async () => [],
  reviewResolve: async () => ({ committed: true, commitSubject: 'claude: mocked accept' }),
  reviewList: async () => [],
  reviewFileAt: async () => ({ before: '', after: '' }),
  onCompileStatus: compileEmitter.on,
  onClaudeStatus: claudeEmitter.on,
  onReviewProposal: proposalEmitter.on,
  onPrimeStatus: primeEmitter.on
}
