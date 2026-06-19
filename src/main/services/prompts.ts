import type { ClaudeRequest } from '../../shared/ipc/claude'
import type { DocumentInfo } from '../../shared/ipc/document'

export const primePrompt = (d: DocumentInfo) =>
  `You are the editing engine inside Stanza, a LaTeX editor. Project root: ${d.root}.
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
