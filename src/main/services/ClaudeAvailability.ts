import type { ClaudeAvailability } from '../../shared/ipc/claude'
import type { ProcessRunner } from '../infra/ProcessRunner'
import { claudeBin, claudeEnv } from './claudeCli'

// `claude auth status --json` is fast (a local credential read, no model call)
// and prints { loggedIn, authMethod, email, subscriptionType, ... }. Bound it so
// a wedged binary can't hang the probe.
const PROBE_TIMEOUT_MS = 8_000

/** Probe whether the claude CLI is installed and logged in, by running
 *  `claude auth status --json` through the SAME binary + env real ops use
 *  (`claudeCli`), so the flag can't disagree with what an op would actually see.
 *  `cwd` defaults to the process cwd — auth is account-global and needs no
 *  project, so this works before any document is open. Never throws: every
 *  failure maps to an `available: false` shape. */
export async function checkClaudeAvailability(
  runner: ProcessRunner,
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<ClaudeAvailability> {
  let proc
  try {
    proc = await runner.run({
      cmd: claudeBin(),
      args: ['auth', 'status', '--json'],
      cwd: opts.cwd ?? process.cwd(),
      timeoutMs: opts.timeoutMs ?? PROBE_TIMEOUT_MS,
      env: claudeEnv(),
    })
  } catch {
    // The runner only rejects on spawn failure (ENOENT) — the binary isn't there.
    return { available: false, reason: 'not-installed' }
  }
  // Timeout/truncation resolve with code:null (ProcessRunner contract) — we got
  // no usable answer, so treat it as a probe error rather than a logout.
  if (proc.timedOut || proc.truncated) return { available: false, reason: 'error' }
  return classify(proc.stdout, proc.code)
}

/** Map the CLI's stdout to availability. Trusts the parsed `loggedIn` field, not
 *  the exit code, so a future non-zero-but-logged-out shape still classifies
 *  correctly; the exit code only disambiguates non-JSON output. */
function classify(stdout: string, code: number | null): ClaudeAvailability {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    // Not our JSON: an old CLI without `auth status --json` prints a usage error
    // (non-zero); anything else is unexpected noise.
    return { available: false, reason: code === 0 ? 'error' : 'not-installed' }
  }
  if (!parsed || typeof parsed !== 'object' || !('loggedIn' in parsed)) {
    return { available: false, reason: 'error' }
  }
  const p = parsed as { loggedIn?: unknown; email?: unknown; subscriptionType?: unknown }
  if (p.loggedIn !== true) return { available: false, reason: 'logged-out' }
  return {
    available: true,
    ...(typeof p.email === 'string' ? { email: p.email } : {}),
    ...(typeof p.subscriptionType === 'string' ? { subscriptionType: p.subscriptionType } : {}),
  }
}
