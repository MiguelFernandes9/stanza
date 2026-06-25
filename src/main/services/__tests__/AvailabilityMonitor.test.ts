import { describe, expect, test, vi } from 'vitest'
import type { ClaudeAvailability } from '../../../shared/ipc/claude'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import { AvailabilityMonitor } from '../AvailabilityMonitor'

const okJson = (loggedIn: boolean): ProcResult => ({
  code: 0,
  stdout: JSON.stringify({ loggedIn }),
  stderr: '',
  timedOut: false,
  truncated: false,
})

class MockRunner implements ProcessRunner {
  calls: RunSpec[] = []
  constructor(private handler: () => Promise<ProcResult> | ProcResult) {}
  run(spec: RunSpec): Promise<ProcResult> {
    this.calls.push(spec)
    return Promise.resolve(this.handler())
  }
}

/** A monitor with a controllable clock and a captured broadcast spy. */
function makeMonitor(handler: () => Promise<ProcResult> | ProcResult, startMs = 1000) {
  const runner = new MockRunner(handler)
  const broadcasts: ClaudeAvailability[] = []
  let now = startMs
  const monitor = new AvailabilityMonitor(
    runner,
    (v) => broadcasts.push(v),
    () => now,
  )
  return { monitor, runner, broadcasts, tick: (ms: number) => (now += ms) }
}

describe('AvailabilityMonitor', () => {
  test('caches within the TTL — a second get does not re-probe', async () => {
    const { monitor, runner } = makeMonitor(() => okJson(true))
    await monitor.get()
    await monitor.get()
    expect(runner.calls).toHaveLength(1)
  })

  test('re-probes after the TTL expires', async () => {
    const { monitor, runner, tick } = makeMonitor(() => okJson(true))
    await monitor.get()
    tick(46_000)
    await monitor.get()
    expect(runner.calls).toHaveLength(2)
  })

  test('force bypasses a fresh cache', async () => {
    const { monitor, runner } = makeMonitor(() => okJson(true))
    await monitor.get()
    await monitor.get(true)
    expect(runner.calls).toHaveLength(2)
  })

  test('concurrent gets share one in-flight probe', async () => {
    let resolve!: (p: ProcResult) => void
    const { monitor, runner } = makeMonitor(() => new Promise<ProcResult>((r) => (resolve = r)))
    const a = monitor.get()
    const b = monitor.get()
    resolve(okJson(true))
    await Promise.all([a, b])
    expect(runner.calls).toHaveLength(1)
  })

  test('broadcasts on change, not on an unchanged re-probe', async () => {
    let state = true
    const { monitor, broadcasts } = makeMonitor(() => okJson(state))
    await monitor.get() // first probe → broadcast (available)
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0]).toMatchObject({ available: true })

    state = false
    await monitor.get(true) // forced re-probe, value changed → broadcast
    expect(broadcasts).toHaveLength(2)
    expect(broadcasts[1]).toMatchObject({ available: false, reason: 'logged-out' })

    await monitor.get(false) // cached (fresh) → no probe, no broadcast
    expect(broadcasts).toHaveLength(2)
  })

  test('force always broadcasts even when the value is unchanged', async () => {
    const { monitor, broadcasts } = makeMonitor(() => okJson(true))
    await monitor.get()
    await monitor.get(true)
    expect(broadcasts).toHaveLength(2)
  })
})
