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

  test('rejects when the binary does not exist', async () => {
    await expect(
      runner.run({ cmd: 'definitely-not-a-real-binary-xyz', args: [], cwd }),
    ).rejects.toThrow()
  })
})
