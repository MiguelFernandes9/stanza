import type {
  ClaudeStatus,
  CommitInfo,
  CompileStatus,
  DocumentInfo,
  PrimeStep,
  RecentProject,
  ReviewProposal
} from '../../shared/ipc'
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
  documentBlocks: async () => [],
  compileRun: async () => {
    compileEmitter.emit('running')
    await sleep(900)
    compileEmitter.emit('ok')
    return { ok: true, pdfPath: `${MOCK_DOC.root}/main.pdf`, synctexPath: `${MOCK_DOC.root}/main.synctex.gz`, errors: [] }
  },
  synctexInverse: async () => null,
  synctexForward: async () => [],
  claudeRun: async () => {
    const opId = `mock-${Math.random().toString(36).slice(2, 8)}`
    claudeEmitter.emit({ opId, state: 'running' })
    await sleep(1600)
    claudeEmitter.emit({ opId, state: 'done' })
    return { opId, note: 'Mocked: tightened the paragraph and fixed two awkward phrasings.', proposal: null }
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
