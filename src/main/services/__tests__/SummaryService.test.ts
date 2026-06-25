import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import { Store } from '../../infra/Store'
import { buildOutline } from '../paperOutline'
import { SummaryService } from '../SummaryService'

const TEX = `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Intro prose here.
\\section{Methodology}
Methodology overview prose.
\\subsection{Setup}
Setup prose.
\\subsection{Architecture}
Architecture prose.
\\end{document}
`

const read =
  (src: string) =>
  (rel: string): string | null =>
    rel === 'main.tex' ? src : null

/** Echoes a deterministic gist per requested section; records each prompt so a
 *  test can assert WHICH sections were summarized. */
class StubRunner implements ProcessRunner {
  prompts: string[] = []
  run(spec: RunSpec): Promise<ProcResult> {
    const prompt = spec.args.at(-1)!
    this.prompts.push(prompt)
    const keys = [...prompt.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!)
    const map = Object.fromEntries(keys.map((k) => [k, `gist of ${k}`]))
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({ type: 'result', result: JSON.stringify(map) }),
      stderr: '',
      timedOut: false,
      truncated: false,
    })
  }
}

let dir: string
let store: Store
const root = '/proj'

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stanza-summary-'))
  store = new Store(join(dir, 'projects.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SummaryService.refresh', () => {
  test('first refresh summarizes every section + subsection and persists gist+hash', async () => {
    const runner = new StubRunner()
    await new SummaryService(runner, store).refresh(root, ['main.tex'], read(TEX))

    const sums = store.getProject(root).summaries!
    expect(Object.keys(sums).sort()).toEqual([
      'Introduction',
      'Methodology',
      'Methodology > Architecture',
      'Methodology > Setup',
    ])
    expect(sums['Introduction']!.gist).toBe('gist of Introduction')
    expect(runner.prompts).toHaveLength(1) // one batched call for all stale nodes
  })

  test('re-summarizes ONLY the node whose own prose changed; others kept', async () => {
    const svc = new SummaryService(new StubRunner(), store)
    await svc.refresh(root, ['main.tex'], read(TEX)) // seed all
    const seeded = store.getProject(root).summaries!

    const runner = new StubRunner()
    const edited = TEX.replace('Setup prose.', 'Setup prose, rewritten.')
    await new SummaryService(runner, store).refresh(root, ['main.tex'], read(edited))

    expect(runner.prompts).toHaveLength(1)
    expect(runner.prompts[0]).toContain('[Methodology > Setup]')
    expect(runner.prompts[0]).not.toContain('[Introduction]') // unchanged → not re-summarized

    const sums = store.getProject(root).summaries!
    expect(sums['Methodology > Setup']!.hash).not.toBe(seeded['Methodology > Setup']!.hash) // updated
    expect(sums['Introduction']).toEqual(seeded['Introduction']) // untouched gist+hash
    expect(sums['Methodology > Architecture']).toEqual(seeded['Methodology > Architecture'])
  })

  test('prunes the gist of a section that no longer exists', async () => {
    const svc = new SummaryService(new StubRunner(), store)
    await svc.refresh(root, ['main.tex'], read(TEX)) // seed all (incl Architecture)

    const removed = TEX.replace('\\subsection{Architecture}\nArchitecture prose.\n', '')
    await new SummaryService(new StubRunner(), store).refresh(root, ['main.tex'], read(removed))

    const sums = store.getProject(root).summaries!
    expect(sums['Methodology > Architecture']).toBeUndefined() // pruned
    expect(sums['Introduction']).toBeDefined() // kept
  })
})

describe('SummaryService.contextFor', () => {
  test('renders the outline with cached gists and a pending marker for the rest', async () => {
    const outline = buildOutline(['main.tex'], read(TEX))
    const intro = outline.find((s) => s.key === 'Introduction')!
    store.setProject(root, { summaries: { Introduction: { gist: 'the intro gist', hash: intro.hash } } })

    const ctx = new SummaryService(new StubRunner(), store).contextFor(root, ['main.tex'], read(TEX))

    expect(ctx).toContain('Paper outline')
    expect(ctx).toContain('do NOT act on this')
    expect(ctx).toContain('Introduction — the intro gist')
    expect(ctx).toContain('Setup — (summary pending)') // uncached node
    expect(ctx).toContain('  Setup') // indented under Methodology (level 2)
    expect(ctx).toContain('still being generated') // banner: something is provisional

    await new Promise((r) => setTimeout(r, 20)) // let the scheduled background refresh settle
  })

  test('marks a section whose content drifted as "(updating…)", not stale-as-current', async () => {
    const outline = buildOutline(['main.tex'], read(TEX))
    // Seed EVERY node so nothing is pending — then the only provisional signal is drift.
    const summaries = Object.fromEntries(
      outline.map((s) => [s.key, { gist: `gist of ${s.key}`, hash: s.hash }]),
    )
    // Introduction's content changes → its cached hash no longer matches.
    const edited = TEX.replace('Intro prose here.', 'Intro prose, rewritten.')
    store.setProject(root, { summaries })

    const ctx = new SummaryService(new StubRunner(), store).contextFor(root, ['main.tex'], read(edited))

    expect(ctx).toContain('Introduction — gist of Introduction (updating…)') // drifted, flagged
    expect(ctx).toContain('Methodology — gist of Methodology') // unchanged → no marker
    expect(ctx).not.toContain('Methodology — gist of Methodology (updating…)')
    expect(ctx).toContain('still being generated') // banner present

    await new Promise((r) => setTimeout(r, 20))
  })

  test('renders a container parent (no own prose) as a bare title and adds no banner', () => {
    // Methodology here has only sub-sections, no own prose → ownText === ''.
    const tex = `\\documentclass{article}
\\begin{document}
\\section{Methodology}
\\subsection{Setup}
Setup prose.
\\end{document}
`
    const outline = buildOutline(['main.tex'], read(tex))
    const setup = outline.find((s) => s.key === 'Methodology > Setup')!
    store.setProject(root, { summaries: { 'Methodology > Setup': { gist: 'the setup gist', hash: setup.hash } } })

    const ctx = new SummaryService(new StubRunner(), store).contextFor(root, ['main.tex'], read(tex))

    expect(ctx).toContain('Methodology\n') // bare title, no " — " gist
    expect(ctx).not.toContain('Methodology — ')
    expect(ctx).not.toContain('still being generated') // nothing provisional → no banner
  })

  test('signals onBusy(true) when a refresh is scheduled and onBusy(false) when it ends', async () => {
    const events: [string, boolean][] = []
    const svc = new SummaryService(new StubRunner(), store, (r, busy) => events.push([r, busy]))

    svc.contextFor(root, ['main.tex'], read(TEX)) // no cache → drift → schedules a refresh
    expect(events[0]).toEqual([root, true]) // emitted synchronously at schedule time

    await new Promise((r) => setTimeout(r, 30)) // let the background refresh settle
    expect(events.at(-1)).toEqual([root, false]) // cleared when the refresh finishes
  })

  test('returns empty string for a document with no titled sections', () => {
    const ctx = new SummaryService(new StubRunner(), store).contextFor(root, ['main.tex'], () => '\\documentclass{article}\n\\begin{document}\nhi\n\\end{document}\n')
    expect(ctx).toBe('')
  })
})
