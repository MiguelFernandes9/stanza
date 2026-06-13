import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const rendererDir = join(repoRoot, 'src', 'renderer')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path))
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

// Guard against the fake-document lorem ever coming back. The filler page
// must show an honest compile status, not invented manuscript prose (BUG-1).
describe('renderer carries no mock document prose', () => {
  it('has no "Block-addressable" lorem in any renderer source', () => {
    const offenders = sourceFiles(rendererDir).filter((f) =>
      readFileSync(f, 'utf8').includes('Block-addressable'),
    )
    expect(offenders).toEqual([])
  })
})
