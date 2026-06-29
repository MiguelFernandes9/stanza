import type { ClaudeRequest } from '../../shared/ipc/claude'
import type { StagedAttachment } from '../../shared/ipc/attachments'
import type { DocumentInfo } from '../../shared/ipc/document'

/** The "Read this" note per attachment kind — snapshots get the rendered-output
 *  wording the single-image prompt used; user files get a plain type hint. */
const kindNote: Record<StagedAttachment['kind'], string> = {
  snapshot: 'a screenshot of the selected block as it renders in the PDF',
  image: 'image',
  pdf: 'PDF',
  text: 'text file',
}

// `root` is the dir the op CLI actually runs in (cwd + the sole --add-dir grant).
// Under the worktree-op model (#123) that is the doc's op WORKTREE, not d.root —
// stating d.root here made Claude resolve span paths under the user's checkout,
// which isn't granted → "Permission denied on read". Default keeps d.root for any
// caller still running there.
export const primePrompt = (d: DocumentInfo, root: string = d.root, context?: string) =>
  `You are the editing engine inside Stanza, a LaTeX editor. Project root: ${root}.
Main file: ${d.mainFile}. Files: ${d.texFiles.join(', ')}.
You will receive editing instructions scoped to line spans. Edit ONLY within the
given spans unless the instruction explicitly requires updating cross-references,
labels, or the bibliography. Never run git. Never compile. Reply with a one-paragraph
summary of what you changed.${context ? `\n\n${context}` : ''}`

export const opPrompt = (
  req: ClaudeRequest,
  attachments: StagedAttachment[] = [],
  injectedContext?: string,
  webEnabled = false,
) => {
  const wholeDoc = req.spans.length === 0
  const scope = wholeDoc
    ? // The ⌘J chat is the general agent: a session with full access to the whole
      // project that can do anything the instruction asks.
      'Scope: the whole project — you can read and edit any file. Do whatever the instruction asks: answer a question (changing nothing), make a small targeted edit, or a sweeping document-wide change. Apply edits wherever they belong.'
    : 'Scope (edit only inside these spans):\n' +
      req.spans.map((s) => `- ${s.file} lines ${s.startLine}-${s.endLine}`).join('\n')
  // Each attachment is on disk in a granted dir; list absolute paths + a kind hint
  // and tell Claude to Read them first so it sees the actual content, not just the
  // filename.
  const files = attachments.length
    ? '\nThe user attached the following file(s) — Read each before responding:\n' +
      attachments.map((a) => `- ${a.path} (${kindNote[a.kind]})`).join('\n')
    : ''
  const closing = wholeDoc
    ? 'If the instruction calls for changes, apply them directly to the files; if it is a question, make no edits. Reply with a one-paragraph summary — your answer when it was a question.'
    : 'Apply the edits directly to the files. Reply with a one-paragraph summary.'
  // Only when web access is enabled (the CLI is spawned with the web tools allowed);
  // otherwise don't invite a tool the session can't use.
  const web = webEnabled
    ? '\nYou may use WebFetch to read a URL the instruction references and WebSearch to look up external facts (e.g. a citation); cite anything you used in your summary.'
    : ''
  return `${injectedContext ? `${injectedContext}\n\n` : ''}Instruction: ${req.instruction}
${scope}${files}${web}
${closing}`
}
