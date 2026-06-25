import type { ClaudeAvailability } from '../../shared/ipc/claude'
import type { ProcessRunner } from '../infra/ProcessRunner'
import { checkClaudeAvailability } from './ClaudeAvailability'

// The renderer may ask on every window mount / Settings open; a short cache lets
// it ask freely without re-spawning `claude` each time. Long enough to dedupe a
// burst, short enough that a sign-in/sign-out is noticed soon (Recheck forces).
const TTL_MS = 45_000

/** Owns the availability state for the whole app: a TTL cache, a single
 *  in-flight probe shared by concurrent callers, and a broadcast on change.
 *  The probe itself ({@link checkClaudeAvailability}) stays a pure function;
 *  all the state lives here. */
export class AvailabilityMonitor {
  private cached?: { value: ClaudeAvailability; at: number }
  private inFlight?: Promise<ClaudeAvailability>

  /** `now` is injectable so tests can drive the TTL without real timers. */
  constructor(
    private runner: ProcessRunner,
    /** Push a new value to every window (wired to the IPC broadcast in main). */
    private broadcast: (value: ClaudeAvailability) => void,
    private now: () => number = Date.now,
  ) {}

  /** The current availability. Returns the cached value while it's fresh; otherwise
   *  re-probes. `force` skips the cache (the Settings "Recheck" path) and always
   *  broadcasts the result, even if unchanged, so the user gets explicit feedback. */
  async get(force = false): Promise<ClaudeAvailability> {
    if (!force && this.cached && this.now() - this.cached.at < TTL_MS) {
      return this.cached.value
    }
    return this.probe(force)
  }

  /** One shared probe: concurrent callers (startup warm-up racing a renderer
   *  call, two windows both forcing) await the same `claude` spawn. */
  private probe(force: boolean): Promise<ClaudeAvailability> {
    if (this.inFlight) return this.inFlight
    const prev = this.cached?.value
    this.inFlight = checkClaudeAvailability(this.runner)
      .then((value) => {
        this.cached = { value, at: this.now() }
        if (force || !prev || !same(prev, value)) this.broadcast(value)
        return value
      })
      .finally(() => {
        this.inFlight = undefined
      })
    return this.inFlight
  }
}

function same(a: ClaudeAvailability, b: ClaudeAvailability): boolean {
  return a.available === b.available && a.reason === b.reason
}
