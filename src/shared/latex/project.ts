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
const APPENDIX_RE = /\\appendi(?:x|ces)\b/ // \appendix (article) or \appendices (IEEEtran)

/** Locate the appendix boundary in the MAIN file: the `\appendix` / `\appendices` line and the
 *  set of \input/\include targets that follow it (reading order). Everything the main file pulls
 *  in AFTER that macro is appendix content — used to nest those files under one "Appendix" node
 *  even though the template renders no section-style heading for them. Null when there is no
 *  appendix. Pure. */
export function appendixSection(
  mainSource: string,
): { line: number; files: Set<string> } | null {
  const lines = mainSource.split('\n')
  let line = -1
  for (let i = 0; i < lines.length; i++) {
    if (APPENDIX_RE.test(stripComment(lines[i]!))) { line = i + 1; break }
  }
  if (line < 0) return null
  const files = new Set<string>()
  for (let i = line; i < lines.length; i++) {
    for (const match of stripComment(lines[i]!).matchAll(INPUT_RE)) {
      let target = match[1]!.trim()
      if (!/\.[^/]+$/.test(target)) target += '.tex'
      files.add(target)
    }
  }
  return { line, files }
}

function inputTargets(source: string): string[] {
  const targets: string[] = []
  for (const line of source.split('\n')) {
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
