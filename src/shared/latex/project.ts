import { splitLines } from '../platform'

/** Resolve the \input/\include tree starting at mainFile.
 *  Pure: caller supplies readFile (null = file unreadable/missing).
 *  Returns readable files in inclusion order, each listed once. */
export function resolveProjectFiles(
  mainFile: string,
  readFile: (relPath: string) => string | null,
): string[] {
  const visited = new Set<string>()
  const ordered: string[] = []

  const visit = (relPath: string) => {
    if (visited.has(relPath)) return
    visited.add(relPath)
    const source = readFile(relPath)
    if (source === null) return
    ordered.push(relPath)
    for (const target of inputTargets(source)) {
      visit(target)
    }
  }

  visit(mainFile)
  return ordered
}

const INPUT_RE = /\\(?:input|include)\{([^}]+)\}/g

function inputTargets(source: string): string[] {
  const targets: string[] = []
  for (const line of splitLines(source)) {
    const code = stripComment(line)
    for (const match of code.matchAll(INPUT_RE)) {
      let target = match[1]!.trim()
      if (!/\.[^/]+$/.test(target)) target += '.tex'
      targets.push(target)
    }
  }
  return targets
}

/** Drop everything from the first unescaped % to end of line. */
function stripComment(line: string): string {
  const match = /(?<!\\)%/.exec(line)
  return match ? line.slice(0, match.index) : line
}
