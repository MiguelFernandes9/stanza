import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))

/** Stale build outputs from local fixture compiles (git-ignored, but
 *  present on disk) must never leak into a test copy — a leftover
 *  main.log once made a failing compile look correctly parsed. */
const BUILD_OUTPUT = /\.(log|aux|toc|bbl|blg|synctex\.gz)$/

/** Copy a fixture project into a fresh tmp dir, sources only.
 *  realpath matters: macOS tmpdir is a /var → /private/var symlink,
 *  and tectonic records realpaths in .synctex.gz — synctex queries
 *  through the symlinked form find no tag. */
export function copyFixture(fixture: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `stanza-${fixture}-`)))
  cpSync(join(fixtures, fixture), root, {
    recursive: true,
    filter: (src) => {
      const name = basename(src)
      return name !== 'main.pdf' && !BUILD_OUTPUT.test(name)
    },
  })
  return root
}
