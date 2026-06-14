import { describe, expect, test } from 'vitest'
import { DefaultProcessRunner } from '../ProcessRunner'

const runner = new DefaultProcessRunner()
const cwd = process.cwd()

describe('DefaultProcessRunner', () => {
  test('captures stdout of a successful command', async () => {
    const result = await runner.run({ cmd: 'echo', args: ['hello'], cwd })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('hello\n')
    expect(result.timedOut).toBe(false)
  })

  test('captures stderr and nonzero exit code', async () => {
    const result = await runner.run({
      cmd: 'node',
      args: ['-e', 'process.stderr.write("boom"); process.exit(3)'],
      cwd,
    })
    expect(result.code).toBe(3)
    expect(result.stderr).toBe('boom')
  })

  test('kills the process on timeout and reports timedOut', async () => {
    const started = Date.now()
    const result = await runner.run({
      cmd: 'sleep',
      args: ['5'],
      cwd,
      timeoutMs: 100,
    })
    expect(result.timedOut).toBe(true)
    expect(result.code).toBe(null)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  test('abort signal kills the child', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    const started = Date.now()
    const result = await runner.run({
      cmd: 'sleep',
      args: ['5'],
      cwd,
      signal: controller.signal,
    })
    expect(result.timedOut).toBe(false)
    expect(result.code).toBe(null)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  test('does not hang on a command that reads stdin — stdin is /dev/null (BUG-28)', async () => {
    // `cat` with no args reads stdin to EOF. With stdin redirected from
    // /dev/null it gets an immediate EOF and exits 0; an open, unwritten stdin
    // pipe (the old default) would block until the timeout — which is exactly
    // what made the claude CLI wait 3s and exit 1.
    const result = await runner.run({ cmd: 'cat', args: [], cwd, timeoutMs: 1000 })
    expect(result.timedOut).toBe(false)
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('')
  })

  test('runs the child with the supplied env, omitting scrubbed vars (BUG-29)', async () => {
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    env.STANZA_TEST_VAR = 'present'
    const result = await runner.run({
      cmd: 'node',
      args: [
        '-e',
        'process.stdout.write((process.env.ANTHROPIC_API_KEY ?? "UNSET") + ":" + (process.env.STANZA_TEST_VAR ?? "none"))',
      ],
      cwd,
      env,
    })
    expect(result.stdout).toBe('UNSET:present')
  })

  test('rejects when the binary does not exist', async () => {
    await expect(
      runner.run({ cmd: 'definitely-not-a-real-binary-xyz', args: [], cwd }),
    ).rejects.toThrow()
  })
})
