import type { CompileError } from '@shared/ipc'

/** Keep the prompt bounded: a tectonic log can be thousands of lines, but the
 *  tail holds the actual `!` errors and their context. Cap by lines first, then
 *  bytes (a single runaway line — e.g. a dumped token list — can be huge). */
export const LOG_TAIL_MAX_LINES = 150
export const LOG_TAIL_MAX_BYTES = 8000

/** An error's source location as `file:line`, degrading to `file` (no line —
 *  some `!` errors have none) or `''` (no file — tectonic-missing, raw stderr).
 *  Shared by the console's error rows and the fix-instruction list so one rule
 *  governs the format everywhere. */
export function errorLocation(e: CompileError): string {
  return e.file ? (e.line != null ? `${e.file}:${e.line}` : e.file) : ''
}

/** One compile error as a bullet: `file:line — message`. */
function errorLine(e: CompileError): string {
  const where = errorLocation(e)
  return where ? `- ${where} — ${e.message}` : `- ${e.message}`
}

/** Trim a raw log to its tail — last N lines, then clamped to a byte budget. */
function logTail(log: string): string {
  const byLines = log.split('\n').slice(-LOG_TAIL_MAX_LINES).join('\n')
  return byLines.length > LOG_TAIL_MAX_BYTES ? byLines.slice(-LOG_TAIL_MAX_BYTES) : byLines
}

/** Build the whole-document Claude instruction for "Fix with Claude": a
 *  fix-the-cause preamble, the structured error list, and a fenced tail of the
 *  raw tectonic log for context. Pure — unit-tested; the op itself runs through
 *  the existing whole-doc pipeline (spans: []). */
export function formatFixInstruction(errors: CompileError[], log: string): string {
  const parts = [
    'This LaTeX document fails to compile. Fix the root cause of these errors, ' +
      'editing the .tex source directly:',
    '',
    ...errors.map(errorLine)
  ]
  const tail = logTail(log).trim()
  if (tail) {
    parts.push('', 'Raw compiler log (tail):', '```', tail, '```')
  }
  return parts.join('\n')
}
