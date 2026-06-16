import type { JSX } from 'react'
import { DiffHunk } from '@renderer/components'
import { splitDiffByFile } from './wordDiff'

/** Shared source-diff body: a unified diff split per file, each file rendered
 *  as a DiffHunk card. Extracted from ReviewOverlay so the review flow and the
 *  HISTORY diff viewer (and any future diff surface) render diffs identically.
 *  `files[0]` seeds the single-file fallback when the diff has no git headers. */
export function DiffView({ diff, files }: { diff: string; files: string[] }): JSX.Element {
  const chunks = splitDiffByFile(diff, files[0])
  return (
    <div data-testid="diff-view" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {chunks.map((c) => (
        <DiffHunk key={c.file} file={c.file} diff={c.diff} />
      ))}
    </div>
  )
}
