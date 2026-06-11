# Stanza architecture

One loop drives the whole app:

```
open .tex project
   └─ compile (tectonic --synctex) ──► PDF + .synctex.gz
        └─ render PDF (pdf.js) in renderer
             └─ user selects region in PDF
                  └─ SyncTeX edit query: (page, x, y) → file:line
                       └─ line → block node (from parsed block tree)
                            └─ user types instruction
                                 └─ claude -p --resume <doc-session> "<block-scoped prompt>"
                                      └─ Claude edits .tex with its own tools
                                           └─ app sees file change → git diff = proposal
                                                └─ inline diff UI: accept (commit) / reject (restore)
                                                     └─ recompile → loop
```

## 1. Block model (`src/shared/`)

Parse .tex into a tree with `@unified-latex/unified-latex-util-parse`:
preamble, `\section`/`\subsection` nodes, paragraphs, environments
(`equation`, `figure`, `table`, `itemize`...). Each node keeps its
source span (file, start/end line). Block id = structural path +
content hash — derived from the parse, never embedded in the source.
Re-parse after every accepted edit; ids are session-local.

The tree serves two lookups:
- **line → block** (SyncTeX gives a line, we need the enclosing block)
- **block → span** (to scope Claude's prompt and to highlight the PDF)

## 2. LaTeX compile (`src/main/compile.ts`)

`tectonic --synctex -X compile main.tex` in the document folder.
Surface compile errors in the UI (parsed log) instead of failing
silently. SyncTeX answers both directions:
- *edit query* (PDF → source): selection point → file:line
- *view query* (source → PDF): block span → PDF rects, used to draw
  block highlight overlays on the rendered page.

## 3. Claude bridge (`src/main/claude.ts`)

Claude Code CLI headless, one session per open document:

- On document open: generate UUID, prime the session —
  `claude -p --session-id <uuid> --add-dir <docdir> "<context prompt>"`
  (context prompt: project layout, main file, outline of blocks).
- Per operation:
  `claude -p --resume <uuid> --output-format json --permission-mode acceptEdits "<instruction>"`
  with the instruction scoped: block source span, file path, the
  user's text, and the rule "edit only within this span unless the
  instruction requires touching cross-references".
- Claude edits files directly; the bridge does not parse rewrites out
  of the response. The response text is shown as Claude's note in
  the chat pane.
- Session persists across operations → Claude accumulates document
  context for cheap follow-ups ("now do the same to the next section").

Spawn via `child_process.execFile("claude", [...])`, cwd = document
folder. Auth note (security): the CLI uses the user's existing Claude
login — the app never stores or handles API keys itself.

## 4. Review flow (`src/main/review.ts`)

The document folder is its own git repo (auto-`git init` on first open
if absent; this is the user's paper repo, unrelated to the stanza app
repo).

- Before each Claude op: require clean tree (auto-commit pending user
  edits as `wip: manual edits`).
- After the op: `git diff` is the proposal. Renderer shows it inline.
- Accept → `git add <touched> && git commit -m "claude: <instruction>"`.
- Reject → `git checkout -- <touched>`.
- This gives free history/undo of every AI edit.

## 5. Renderer (`src/renderer/`)

Three panes:
- **PDF pane** (primary): pdf.js canvas + selection overlay; hovering
  shows block boundaries (view-query rects), click selects a block,
  drag selects several.
- **Instruction bar / chat**: instruction input bound to current
  selection; shows Claude's response notes and op status.
- **Diff pane** (on proposal): side-by-side or inline diff,
  accept/reject buttons. Source editor (CodeMirror) is secondary —
  collapsible, for manual edits.

## 6. Module map → worktree tasks

| branch | scope |
|---|---|
| `feat/electron-shell` | Electron+Vite+React scaffold, IPC skeleton, file open dialog, pane layout |
| `feat/block-parser` | unified-latex block tree, line→block / block→span lookups, fixtures |
| `feat/latex-compile` | tectonic wrapper, synctex queries, error log parsing |
| `feat/pdf-view` | pdf.js render, selection overlay, block highlights |
| `feat/claude-bridge` | session lifecycle, prompt templates, headless calls |
| `feat/review-ui` | git proposal flow, diff view, accept/reject |

Dependency order: `electron-shell` first; `block-parser`, `latex-compile`,
`claude-bridge` are independent after that; `pdf-view` needs compile;
`review-ui` needs bridge. Miguel dispatches and merges.

## Risks / open items

- SyncTeX precision on multi-column or float-heavy pages — may need
  fallback "pick block from outline" UI.
- `--permission-mode acceptEdits` scope: confirm it cannot touch files
  outside `--add-dir` before shipping; tighten with a settings file in
  the doc folder if needed.
- tectonic distribution: bundle binary vs. require install — decide in
  `feat/latex-compile`.
- Long sessions grow context/cost — consider re-priming a fresh
  session after N ops or on file-set change.
