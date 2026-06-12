import type { CompileError } from '../ipc/compile'

/** Parse TeX/tectonic log text into structured errors.
 *  Tracks the open-file stack via `(path` / `)` nesting so each
 *  `!` error line is attributed to the file being read at that point.
 *  Warning lines (Overfull, LaTeX Warning, ...) are not errors. */
export function parseCompileLog(log: string, mainFile: string): CompileError[] {
  const errors: CompileError[] = []
  const stack: string[] = []
  let pending: CompileError | null = null

  for (const line of log.split('\n')) {
    const errorMatch = /^!\s*(.+)$/.exec(line)
    if (errorMatch) {
      pending = {
        file: normalize(stack[stack.length - 1] ?? mainFile),
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

/** Walk a log line updating the open-file paren stack.
 *  Only tokens that look like file paths are pushed; bare prose
 *  parens still pop, which mirrors TeX's own bracket accounting
 *  closely enough for error attribution. */
function scanParens(line: string, stack: string[]): void {
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '(') {
      let j = i + 1
      while (j < line.length && !' ()'.includes(line[j]!)) j++
      const token = line.slice(i + 1, j)
      if (looksLikeFile(token)) {
        stack.push(token)
        i = j
        continue
      }
    } else if (ch === ')') {
      stack.pop()
    }
    i++
  }
}

function looksLikeFile(token: string): boolean {
  if (token.startsWith('./') || token.startsWith('../') || token.startsWith('/')) return true
  return /^[^\s()]+\.[A-Za-z][A-Za-z0-9]*$/.test(token)
}

function normalize(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path
}
