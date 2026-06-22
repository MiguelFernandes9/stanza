import type { ClaudeRequest } from '../../shared/ipc/claude'
import type { DocumentInfo } from '../../shared/ipc/document'

// `root` is the dir the op CLI actually runs in (cwd + the sole --add-dir grant).
// Under the worktree-op model (#123) that is the doc's op WORKTREE, not d.root —
// stating d.root here made Claude resolve span paths under the user's checkout,
// which isn't granted → "Permission denied on read". Default keeps d.root for any
// caller still running there.
export const primePrompt = (d: DocumentInfo, root: string = d.root) =>
  `You are the editing engine inside Stanza, a LaTeX editor. Project root: ${root}.
Main file: ${d.mainFile}. Files: ${d.texFiles.join(', ')}.
You will receive editing instructions scoped to line spans. Edit ONLY within the
given spans unless the instruction explicitly requires updating cross-references,
labels, or the bibliography. Never run git. Never compile. Reply with a one-paragraph
summary of what you changed.`

export const opPrompt = (req: ClaudeRequest, imagePath?: string) =>
  `Instruction: ${req.instruction}
${
  req.spans.length === 0
    ? 'Scope: whole document.'
    : 'Scope (edit only inside these spans):\n' +
      req.spans.map((s) => `- ${s.file} lines ${s.startLine}-${s.endLine}`).join('\n')
}${
  imagePath
    ? `\nA screenshot of the selected block as it renders in the PDF is at ${imagePath} — Read it to see the rendered output before editing.`
    : ''
}
Apply the edits directly to the files. Reply with a one-paragraph summary.`
