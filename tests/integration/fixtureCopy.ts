import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))

/** Stale build outputs from local fixture compiles (git-ignored, but
 *  present on disk) must never leak into a test copy — a leftover
 *  main.log once made a failing compile look correctly parsed. */
const BUILD_OUTPUT = /\.(log|aux|toc|bbl|blg|synctex\.gz)$/

/** Copy a fixture project into a fresh tmp dir, sources only. */
export function copyFixture(fixture: string): string {
  const root = mkdtempSync(join(tmpdir(), `stanza-${fixture}-`))
  cpSync(join(fixtures, fixture), root, {
    recursive: true,
    filter: (src) => {
      const name = basename(src)
      return name !== 'main.pdf' && !BUILD_OUTPUT.test(name)
    },
  })
  return root
}
