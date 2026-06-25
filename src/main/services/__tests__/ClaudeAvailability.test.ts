import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import { checkClaudeAvailability } from '../ClaudeAvailability'

const ok = (stdout: string, code = 0): ProcResult => ({
  code,
  stdout,
  stderr: '',
  timedOut: false,
  truncated: false,
})

class MockRunner implements ProcessRunner {
  calls: RunSpec[] = []
  constructor(private handler: (spec: RunSpec) => Promise<ProcResult> | ProcResult) {}
  run(spec: RunSpec): Promise<ProcResult> {
    this.calls.push(spec)
    return Promise.resolve(this.handler(spec))
  }
}

const loggedIn = JSON.stringify({
  loggedIn: true,
  authMethod: 'claude.ai',
  email: 'a@b.c',
  subscriptionType: 'max',
})

afterEach(() => vi.unstubAllEnvs())

describe('checkClaudeAvailability', () => {
  test('logged in → available with email + subscription', async () => {
    const res = await checkClaudeAvailability(new MockRunner(() => ok(loggedIn)))
    expect(res).toEqual({ available: true, email: 'a@b.c', subscriptionType: 'max' })
  })

  test('loggedIn:false → logged-out (trusts the field, not the exit code)', async () => {
    const out = await checkClaudeAvailability(new MockRunner(() => ok(JSON.stringify({ loggedIn: false }))))
    expect(out).toEqual({ available: false, reason: 'logged-out' })
    // Same verdict even when the CLI exits non-zero while reporting logged-out.
    const nonZero = await checkClaudeAvailability(
      new MockRunner(() => ok(JSON.stringify({ loggedIn: false }), 1)),
    )
    expect(nonZero).toEqual({ available: false, reason: 'logged-out' })
  })

  test('spawn ENOENT → not-installed', async () => {
    const runner = new MockRunner(() => {
      throw Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })
    })
    expect(await checkClaudeAvailability(runner)).toEqual({
      available: false,
      reason: 'not-installed',
    })
  })

  test('old CLI usage error (non-JSON, non-zero) → not-installed', async () => {
    const res = await checkClaudeAvailability(new MockRunner(() => ok("error: unknown command 'auth'", 1)))
    expect(res).toEqual({ available: false, reason: 'not-installed' })
  })

  test('garbage / unexpected JSON / timeout → error', async () => {
    const garbage = await checkClaudeAvailability(new MockRunner(() => ok('not json{')))
    expect(garbage).toEqual({ available: false, reason: 'error' })

    const noField = await checkClaudeAvailability(new MockRunner(() => ok(JSON.stringify({ hi: 1 }))))
    expect(noField).toEqual({ available: false, reason: 'error' })

    const timedOut = await checkClaudeAvailability(
      new MockRunner(() => ({ code: null, stdout: '', stderr: '', timedOut: true, truncated: false })),
    )
    expect(timedOut).toEqual({ available: false, reason: 'error' })
  })

  test('probes via the shared bin + scrubbed env (one-seam guarantee)', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', '/mocks/claude.sh')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-should-be-stripped')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'tok-should-be-stripped')
    const runner = new MockRunner(() => ok(loggedIn))
    await checkClaudeAvailability(runner)
    expect(runner.calls).toHaveLength(1)
    const spec = runner.calls[0]
    expect(spec.cmd).toBe('/mocks/claude.sh')
    expect(spec.args).toEqual(['auth', 'status', '--json'])
    expect(spec.timeoutMs).toBe(8000)
    expect(spec.env?.ANTHROPIC_API_KEY).toBeUndefined()
    expect(spec.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
  })
})
