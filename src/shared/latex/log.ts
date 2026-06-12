import type { CompileError } from '../ipc/compile'

/** Parse TeX/tectonic log text into structured errors.
 *  Tracks the open-file stack via `(path` / `)` nesting so each
 *  `!` error line is attributed to the file being read at that point.
 *  Warning lines (Overfull, LaTeX Warning, ...) are not errors. */
export function parseCompileLog(log: string, mainFile: string): CompileError[] {
  const errors: CompileError[] = []
  // One entry per open paren: a path for file opens, null for prose
  // parens — so every ')' pops exactly one and files stay aligned.
  const stack: (string | null)[] = []
  let pending: CompileError | null = null

  const currentFile = (): string => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i]
      if (entry !== null && entry !== undefined) return entry
    }
    return mainFile
  }

  for (const line of log.split('\n')) {
    const errorMatch = /^!\s*(.+)$/.exec(line)
    if (errorMatch) {
      pending = {
        file: normalize(currentFile()),
        line: null,
        message: errorMatch[1]!.trim(),
      }
      errors.push(pending)
      continue
    }

    if (pending) {
      const lineMatch = /^l\.(\d+)/.exec(line)
      if (lineMatch) {
        pending.line = Number(lineMatch[1])
        pending = null
        continue
      }
    }

    scanParens(line, stack)
  }

  return errors
}

/** Walk a log line updating the open-file paren stack. Every '(' pushes
 *  (a path when the token looks like a file, null otherwise) and every
 *  ')' pops one entry, so prose parens can't pop real files. */
function scanParens(line: string, stack: (string | null)[]): void {
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '(') {
      let j = i + 1
      while (j < line.length && !' ()'.includes(line[j]!)) j++
      const token = line.slice(i + 1, j)
      stack.push(looksLikeFile(token) ? token : null)
      i = j
      continue
    }
    if (ch === ')') {
      stack.pop()
    }
    i++
  }
}

function looksLikeFile(token: string): boolean {
  if (token.startsWith('./') || token.startsWith('../') || token.startsWith('/')) return true
  if (token.includes('/')) return true // e.g. chapters/ch1 (no extension)
  return /^[^\s()]+\.[A-Za-z][A-Za-z0-9]*$/.test(token)
}

function normalize(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path
}
