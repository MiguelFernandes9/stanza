// A tiny in-memory ring of the most recent main-process errors. reportMainError
// (index.ts) already logs + surfaces a dialog but kept nothing; a bug report is
// far more actionable with the last few errors attached, so we retain them here.
// In-memory only — these are crash-adjacent breadcrumbs for the current run, not
// durable telemetry.

export interface ErrorEntry {
  ts: string
  label: string
  message: string
}

export interface ErrorLog {
  record(label: string, err: unknown): void
  /** A chronological copy (oldest→newest) of the retained entries. */
  recent(): ErrorEntry[]
}

const DEFAULT_MAX = 20

export function createErrorLog(max: number = DEFAULT_MAX): ErrorLog {
  const ring: ErrorEntry[] = []
  return {
    record(label, err) {
      ring.push({
        ts: new Date().toISOString(),
        label,
        message: err instanceof Error ? err.message : String(err),
      })
      if (ring.length > max) ring.shift()
    },
    recent() {
      return ring.slice()
    },
  }
}

/** Process-wide log shared by reportMainError and the bug reporter. */
export const errorLog = createErrorLog()
