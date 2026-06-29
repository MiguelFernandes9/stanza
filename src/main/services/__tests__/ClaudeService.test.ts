import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import type { ClaudeStatus } from '../../../shared/ipc/claude'
import type { DocumentInfo } from '../../../shared/ipc/document'
import { GlobalSettingsStore, Store } from '../../infra/Store'
import { ClaudeService } from '../ClaudeService'
import { ActiveOps } from '../sessionBus'

const doc: DocumentInfo = {
  root: '/proj',
  mainFile: 'main.tex',
  texFiles: ['main.tex', 'chapters/ch1.tex'],
}

// The fork's worktree, passed per call. '/proj' (= doc.root) keeps the prime/op
// argv (cwd, --add-dir, primePrompt root) identical to the pre-fork tests.
const WD = '/proj'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const claudeJson = (result: string): ProcResult => ({
  code: 0,
  stdout: JSON.stringify({ type: 'result', result }),
  stderr: '',
  timedOut: false,
  truncated: false,
})

class MockRunner implements ProcessRunner {
  calls: RunSpec[] = []
  constructor(
    private handler: (spec: RunSpec, call: number) => Promise<ProcResult> | ProcResult,
  ) {}
  run(spec: RunSpec): Promise<ProcResult> {
    this.calls.push(spec)
    return Promise.resolve(this.handler(spec, this.calls.length - 1))
  }
}

let dir: string
let store: Store
let globalSettings: GlobalSettingsStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stanza-claude-'))
  store = new Store(join(dir, 'projects.json'))
  globalSettings = new GlobalSettingsStore(join(dir, 'settings.json'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

/** The op's own argv, after the injected `--model`/`--effort`/`--allowedTools`
 *  prefix that claudeIn prepends — lets position asserts ignore which flags the
 *  current settings inject (web access is on by default). */
const coreArgs = (args: string[]): string[] => args.slice(args.indexOf('-p'))

describe('ClaudeService.runForkTurn', () => {
  test('primes a fresh session in the given workDir, resumes there, returns its id', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc)

    const { note, sessionId } = await service.runForkTurn(WD, 'fork-1', null,
      { instruction: 'tighten the intro', spans: [] },
      () => {},
    )

    expect(runner.calls).toHaveLength(2) // prime + resume
    const prime = runner.calls[0]!
    expect(prime.cwd).toBe(WD)
    expect(coreArgs(prime.args).slice(0, 2)).toEqual(['-p', '--session-id'])
    expect(coreArgs(prime.args).slice(3, 5)).toEqual(['--add-dir', WD])
    // The prime prompt roots Claude at the fork worktree (the only granted dir).
    expect(prime.args.at(-1)).toContain('Project root: /proj')
    const resume = runner.calls[1]!
    expect(resume.cwd).toBe(WD)
    expect(coreArgs(resume.args).slice(0, 3)).toEqual(['-p', '--resume', sessionId])
    expect(sessionId).toBe(coreArgs(prime.args)[2]) // returns the id it primed
    expect(note).toBe('done')
  })

  test('resumes a given session id without priming', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, globalSettings, doc)

    const { sessionId } = await service.runForkTurn(WD, 'fork-1', 'sess-123',
      { instruction: 'next', spans: [] },
      () => {},
    )

    expect(runner.calls).toHaveLength(1) // no prime
    expect(coreArgs(runner.calls[0]!.args).slice(0, 3)).toEqual(['-p', '--resume', 'sess-123'])
    expect(sessionId).toBe('sess-123')
  })

  test('runs in a custom worktree (cwd + --add-dir + prime root), not the user checkout', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn('/tmp/stanza-wt/doc/fork-x', 'fork-1', null, { instruction: 'x', spans: [] }, () => {})

    for (const call of runner.calls) {
      expect(call.cwd).toBe('/tmp/stanza-wt/doc/fork-x')
      const addDir = call.args.indexOf('--add-dir')
      expect(call.args[addDir + 1]).toBe('/tmp/stanza-wt/doc/fork-x')
    }
    expect(runner.calls[0]!.args.at(-1)).toContain('Project root: /tmp/stanza-wt/doc/fork-x')
  })

  test('status sequence priming → running → done; opId consistent', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, globalSettings, doc)
    const statuses: ClaudeStatus[] = []

    const { opId } = await service.runForkTurn(WD, 'fork-1', 'sess', { instruction: 'z', spans: [] }, (s) =>
      statuses.push(s),
    )

    expect(statuses.map((s) => s.state)).toEqual(['priming', 'running', 'done'])
    expect(statuses.every((s) => s.opId === opId)).toBe(true)
    expect(opId).toMatch(UUID_RE)
  })

  test('streams thinking + tool activity from stream-json; note comes from the result line', async () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'Plan: tighten it.' }] } }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/proj/main.tex' } }] },
      }),
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Tightened.' }),
    ]
    const runner = new MockRunner((spec) => {
      lines.forEach((l) => spec.onStdoutLine?.(l)) // drive the live stream
      return { code: 0, stdout: lines.join('\n'), stderr: '', timedOut: false, truncated: false }
    })
    const service = new ClaudeService(runner, globalSettings, doc)
    const statuses: ClaudeStatus[] = []

    const { note } = await service.runForkTurn(WD, 'fork-1', 'sess', { instruction: 'tighten', spans: [] }, (s) =>
      statuses.push(s),
    )

    // The resume call asks the CLI for a streaming format.
    const resume = runner.calls[0]! // sess given → no prime
    expect(resume.args).toContain('stream-json')
    expect(resume.args).toContain('--verbose')
    expect(typeof resume.onStdoutLine).toBe('function')

    const acts = statuses.flatMap((s) => (s.activity ? [s.activity] : []))
    expect(acts).toContainEqual({ kind: 'thinking', text: 'Plan: tighten it.' })
    expect(acts).toContainEqual({ kind: 'tool', label: 'Editing main.tex' })
    expect(note).toBe('Tightened.') // from the result line, not the raw JSONL
  })

  test('an errored result line rejects with the model message', async () => {
    const line = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'API Error: 401' })
    const runner = new MockRunner(() => ({ code: 0, stdout: line, stderr: '', timedOut: false, truncated: false }))
    const service = new ClaudeService(runner, globalSettings, doc)

    await expect(
      service.runForkTurn(WD, 'fork-1', 'sess', { instruction: 'x', spans: [] }, () => {}),
    ).rejects.toThrow(/API Error: 401/)
  })

  test('never persists a session to the project store (ephemeral by default)', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'q', spans: [] }, () => {})

    expect(store.getProject('/proj').sessionId).toBeUndefined()
  })

  test('prepends --model and --effort from global settings to EVERY claude call', async () => {
    globalSettings.set({ claudeModel: 'sonnet', claudeEffort: 'low' })
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'x', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(2) // prime + resume
    for (const call of runner.calls) {
      expect(call.args.slice(0, 4)).toEqual(['--model', 'sonnet', '--effort', 'low'])
      expect(coreArgs(call.args)[0]).toBe('-p') // the original argv follows the injected flags
    }
  })

  test('passes the model alias straight through (region-safe, auto-tracks)', async () => {
    globalSettings.set({ claudeModel: 'haiku' })
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'x', spans: [] }, () => {})

    expect(runner.calls[0]!.args.slice(0, 2)).toEqual(['--model', 'haiku'])
  })

  test('injects no model/effort flags when unset (the CLI default)', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'x', spans: [] }, () => {})

    expect(coreArgs(runner.calls[0]!.args)[0]).toBe('-p')
    expect(runner.calls[0]!.args).not.toContain('--model')
    expect(runner.calls[0]!.args).not.toContain('--effort')
  })

  test('allows the web tools by default (WebFetch + WebSearch) on every call', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'x', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(2) // prime + resume — both pre-approve the web tools
    for (const call of runner.calls) {
      const i = call.args.indexOf('--allowedTools')
      expect(i).toBeGreaterThanOrEqual(0)
      expect(call.args[i + 1]).toBe('WebFetch,WebSearch')
    }
    // The op prompt invites web use only when it's enabled.
    expect(runner.calls[1]!.args.at(-1)).toContain('WebFetch')
  })

  test('omits the web tools (and the prompt hint) when allowWebAccess is off', async () => {
    globalSettings.set({ allowWebAccess: false })
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', 'sess', { instruction: 'x', spans: [] }, () => {})

    const args = runner.calls[0]!.args
    expect(args).not.toContain('--allowedTools')
    expect(args).not.toContain('WebFetch,WebSearch')
    expect(args.at(-1)).not.toContain('WebFetch') // no prompt hint either
    expect(coreArgs(args).slice(0, 3)).toEqual(['-p', '--resume', 'sess'])
  })

  test("injects the document's recent commits into the prompt (bus)", async () => {
    const recentCommits = async () => [
      { hash: 'h1', subject: 'claude: rewrite the intro', iso: '2026-06-24T13:34:00+01:00', kind: 'claude' as const },
    ]
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc, undefined, new ActiveOps(), recentCommits)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'fix typos', spans: [] }, () => {})

    const prompt = runner.calls[1]!.args.at(-1)! // resume call, last arg = prompt
    expect(prompt).toContain('Recently committed')
    expect(prompt).toContain('rewrite the intro')
    expect(prompt).toContain('Instruction: fix typos') // own instruction still present
  })

  test('omits the digest when there are no commits and nothing in flight', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc, undefined)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'next', spans: [] }, () => {})

    expect(runner.calls[1]!.args.at(-1)!).not.toContain('Recently committed')
    expect(runner.calls[1]!.args.at(-1)!).not.toContain('Context only')
  })

  test('injects siblings IN-FLIGHT edits (write-on-prompt) into the prompt', async () => {
    const activeOps = new ActiveOps()
    activeOps.start({ forkId: 'other', root: '/proj', instruction: 'rewriting section 3', startedAt: '2026-06-24T10:05:00.000Z' })
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc, undefined, activeOps)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'fix a typo', spans: [] }, () => {})

    const prompt = runner.calls[1]!.args.at(-1)!
    expect(prompt).toContain('In progress right now')
    expect(prompt).toContain('rewriting section 3')
  })

  test('fetches and shows only busCommitLimit commits', async () => {
    globalSettings.set({ busCommitLimit: 3 })
    let askedFor = -1
    const recentCommits = async (n: number) => {
      askedFor = n
      return Array.from({ length: 10 }, (_, i) => ({ hash: `h${i}`, subject: `claude: edit ${i}`, iso: 't', kind: 'claude' as const }))
    }
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc, undefined, new ActiveOps(), recentCommits)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'x', spans: [] }, () => {})

    expect(askedFor).toBe(3) // fetched exactly the configured limit
    const bullets = runner.calls[1]!.args.at(-1)!.split('\n').filter((l) => l.startsWith('- '))
    expect(bullets).toHaveLength(3) // digest capped at 3
  })

  test('span-scoped prompt lists each span', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', 'sess-1',
      {
        instruction: 'formalize',
        spans: [
          { file: 'chapters/ch1.tex', startLine: 10, endLine: 20 },
          { file: 'chapters/ch1.tex', startLine: 40, endLine: 41 },
        ],
      },
      () => {},
    )

    const prompt = runner.calls[0]!.args.at(-1)!
    expect(prompt).toContain('Scope (edit only inside these spans):')
    expect(prompt).toContain('- chapters/ch1.tex lines 10-20')
    expect(prompt).toContain('- chapters/ch1.tex lines 40-41')
  })

  test('a legacy imageDataUrl snapshot is staged, granted via --add-dir, referenced, then cleaned up', async () => {
    let opArgs: string[] = []
    const runner = new MockRunner((spec) => {
      opArgs = spec.args
      return claudeJson('ok')
    })
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', 'sess-1',
      { instruction: 'fix the label', spans: [], imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      () => {},
    )

    // The shot dir is granted as a SECOND --add-dir (the work dir is first).
    const addDirs = opArgs.filter((_a, i) => opArgs[i - 1] === '--add-dir')
    expect(addDirs).toHaveLength(2)
    expect(addDirs[1]).toContain('stanza-shots')

    const prompt = opArgs.at(-1)!
    const match = prompt.match(/(\S*stanza-shots\S*\.png)/)
    expect(match).not.toBeNull()
    expect(prompt).toMatch(/Read each/)
    expect(prompt).toContain('screenshot of the selected block')

    // The staged dir is removed once the turn returns (never lands in the worktree).
    expect(existsSync(addDirs[1]!)).toBe(false)
  })

  test('multiple attachments (data-URL image + a file by path) are staged, granted, listed, cleaned', async () => {
    let opArgs: string[] = []
    const runner = new MockRunner((spec) => {
      opArgs = spec.args
      return claudeJson('ok')
    })
    const service = new ClaudeService(runner, globalSettings, doc)

    // A real on-disk source the bridge copies in (the OS-picker path, not base64).
    const srcPdf = join(dir, 'refs.pdf')
    writeFileSync(srcPdf, '%PDF-1.4 stub')

    await service.runForkTurn(WD, 'fork-1', 'sess-1',
      {
        instruction: 'mimic these',
        spans: [],
        attachments: [
          { id: 'a', name: 'shot.png', kind: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
          { id: 'b', name: 'refs.pdf', kind: 'pdf', srcPath: srcPdf },
        ],
      },
      () => {},
    )

    const addDirs = opArgs.filter((_a, i) => opArgs[i - 1] === '--add-dir')
    expect(addDirs).toHaveLength(2)
    const shotDir = addDirs[1]!
    expect(shotDir).toContain('stanza-shots')

    const prompt = opArgs.at(-1)!
    // Both files listed by their staged path, with a kind hint; Read instruction present.
    expect(prompt).toMatch(/Read each/)
    expect(prompt).toContain('shot.png (image)')
    expect(prompt).toContain('refs.pdf (PDF)')

    // The whole per-op dir (both files) is removed after the turn.
    expect(existsSync(shotDir)).toBe(false)
  })

  test('no attachment → a single --add-dir (the work dir), no shot dir', async () => {
    let opArgs: string[] = []
    const runner = new MockRunner((spec) => {
      opArgs = spec.args
      return claudeJson('ok')
    })
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', 'sess-1', { instruction: 'x', spans: [] }, () => {})

    const addDirs = opArgs.filter((_a, i) => opArgs[i - 1] === '--add-dir')
    expect(addDirs).toEqual([WD])
    expect(opArgs.at(-1)).not.toContain('stanza-shots')
  })

  test('strips ANTHROPIC_API_KEY / AUTH_TOKEN so claude uses the subscription (BUG-29)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-should-not-reach-claude')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'tok-should-not-reach-claude')
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', null, { instruction: 'x', spans: [] }, () => {})

    expect(runner.calls.length).toBeGreaterThan(0)
    for (const call of runner.calls) {
      expect(call.env).toBeDefined()
      expect(call.env?.ANTHROPIC_API_KEY).toBeUndefined()
      expect(call.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    }
  })

  test('timeout emits failed and rejects', async () => {
    const runner = new MockRunner(() => ({ code: null, stdout: '', stderr: '', timedOut: true, truncated: false }))
    const service = new ClaudeService(runner, globalSettings, doc)
    const statuses: ClaudeStatus[] = []

    await expect(
      service.runForkTurn(WD, 'fork-1', 'sess-1', { instruction: 'x', spans: [] }, (s) => statuses.push(s)),
    ).rejects.toThrow(/timed out/)
    expect(statuses.map((s) => s.state)).toEqual(['priming', 'running', 'failed'])
  })

  test('truncated output emits failed and rejects with a clear message', async () => {
    const runner = new MockRunner(() => ({ code: null, stdout: '', stderr: '', timedOut: false, truncated: true }))
    const service = new ClaudeService(runner, globalSettings, doc)
    const statuses: ClaudeStatus[] = []

    await expect(
      service.runForkTurn(WD, 'fork-1', 'sess-1', { instruction: 'x', spans: [] }, (s) => statuses.push(s)),
    ).rejects.toThrow(/too much output/)
    expect(statuses.map((s) => s.state)).toEqual(['priming', 'running', 'failed'])
  })

  test('STANZA_CLAUDE_BIN overrides the claude binary (T6 mock harness)', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', '/mocks/claude-mock.sh')
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.runForkTurn(WD, 'fork-1', 'sess-1', { instruction: 'x', spans: [] }, () => {})

    expect(runner.calls[0]!.cmd).toBe('/mocks/claude-mock.sh')
  })
})

describe('ClaudeService.primeSession', () => {
  test('primes a fresh session in workDir and returns its id', async () => {
    const runner = new MockRunner(() => claudeJson('primed'))
    const service = new ClaudeService(runner, globalSettings, doc)

    const id = await service.primeSession('/tmp/stanza-wt/doc/fork-c')

    expect(id).toMatch(UUID_RE)
    expect(runner.calls[0]!.cwd).toBe('/tmp/stanza-wt/doc/fork-c')
    expect(coreArgs(runner.calls[0]!.args).slice(0, 2)).toEqual(['-p', '--session-id'])
    expect(coreArgs(runner.calls[0]!.args)[2]).toBe(id)
  })

  test('forwards the abort signal to the runner', async () => {
    const controller = new AbortController()
    const runner = new MockRunner(() => claudeJson('primed'))
    const service = new ClaudeService(runner, globalSettings, doc)

    await service.primeSession(WD, controller.signal)

    expect(runner.calls[0]!.signal).toBe(controller.signal)
  })

  test('injects the paper context (outline + summaries) into the prime prompt', async () => {
    const runner = new MockRunner(() => claudeJson('primed'))
    const service = new ClaudeService(
      runner,
      globalSettings,
      doc,
      undefined,
      undefined,
      undefined,
      () => 'Paper outline (context only):\nIntroduction — the gist',
    )

    await service.primeSession(WD)

    expect(runner.calls[0]!.args.at(-1)).toContain('Paper outline (context only)')
    expect(runner.calls[0]!.args.at(-1)).toContain('Introduction — the gist')
  })
})
