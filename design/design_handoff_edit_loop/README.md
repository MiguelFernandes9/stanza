# Handoff: Stanza v0.1 — Block-Editing Workspace

## Overview
Stanza is a macOS desktop app ("Overleaf with Claude"): a LaTeX project is
parsed into addressable blocks; the user selects blocks **in the rendered
PDF**, types an instruction, and Claude Code (headless `claude -p`) edits the
`.tex` source. Changes surface as diffs with accept/reject. This handoff
covers the **stable v0.1 interaction design**: open screen with project
priming, the three-pane workspace, the margin-rail edit loop with parallel
tasks, section selection + locking, and the compiled review overlay.

## About the Design Files
Everything in this bundle is a **design reference built in HTML/JSX** — it
shows intended look and behavior; it is NOT production code. Recreate these
designs in the Stanza codebase's environment (Electron + React + TypeScript,
per `docs/v1-spec.md` in the stanza repo) using its established patterns.
The JSX here is deliberately cosmetic: state is faked with `setTimeout`,
the PDF is simulated with HTML blocks, and `claude -p` is never called.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, shadows, and copy are final
unless the changelog says otherwise. Recreate pixel-perfectly using the
design tokens (`tokens/*.css` — single source of truth).

## Screens / Views

### 1. Open screen (`ui_kits/stanza/OpenScreen.jsx`, page: `open-screen.html`)
- Centered column, 480px, on `--surface-canvas` (#F4EFE6).
- Brand: 40px logo mark (SVG in `assets/stanza-mark.svg`) + "Stanza" in
  Newsreader 600 30px, tracking −0.01em.
- Tagline: Newsreader 400, 19px/1.5, `--ink-600`.
- Actions: primary "New document" (clay #C25C39, lg = 40px height), secondary
  "Open folder…".
- Recents list: rows 12/14px padding, radius 10px, border `--line` #E1D9C9,
  white bg, shadow-xs; hover lifts to shadow-md + bg `--paper-1` #FCFAF5.
  Three project states:
  - **Working project** (has Claude session): clay-tinted FileText icon chip
    (38px, bg `--clay-50`), green StatusDot + "session · N blocks".
  - **Plain folder** (LaTeX work, never opened in Stanza): neutral Folder
    icon chip (bg `--surface-well` #ECE6DA), "not set up" badge, right-side
    text "plain folder" → on hover "set up & open" in clay.
- Footnote (12px, `--ink-400`): "Folders without a Claude session are set up
  on first open — blocks parsed, version control initialized, session primed."

#### Priming overlay (one-time setup, blocking)
- Scrim rgba(33,30,25,0.42); card 420px, `--paper-1`, radius 14px, shadow-xl.
- Title "Setting up {project}" + reassurance "One-time setup — your files
  aren't changed until you accept an edit."
- Sequential checklist (each step ~520–940ms in mock; real durations vary):
  Reading sources (7 files) → Parsing into blocks (N blocks) → Initializing
  version control (git init) → Starting Claude session (primed).
  States: pending (8px ring outline, 42% opacity row) → running (8px clay dot,
  stz-pulse) → done (16px circle, `--add-bg` bg, `--add-600` check; result in
  11px mono right-aligned).
- New-document variant: Creating from template (article) → git init → session.
- On completion → workspace. Cancel (ghost button) aborts.

### 2. Workspace (`ui_kits/stanza/Workspace.jsx`, pages: `index.html`, `edit-loop.html`)
Layout, left→right:
- **TitleBar** 38px: traffic lights; centered doc title + "— main.tex" (mono
  12px); right: CompilePill (Compiled/Compiling/Errors), Recompile ⌘R,
  Source editor toggle ⌘E, Assistant panel toggle ⌘J, Settings.
- **Sidebar** 240px (`--surface-app` #F8F4EC, right border): project header
  (26px clay folder chip, name + mono path); FILES tree (collapsible dirs,
  chevron + folder icon, file-count meta when collapsed; type icons: FileText
  .tex, List(blue) .bib, Image for .png/.jpg/figure .pdf, PenLine .md/.txt);
  OUTLINE (§ rows per section); HISTORY (git commits: "claude: …" with green
  commit icon, "wip: manual edits" neutral; relative time meta).
  **Files support a right-click context menu + inline rename** — see
  "File management" under Interactions.
  The FILES header "+" buttons (New file / New folder) add at project root;
  the folder context menu adds nested.

#### File context menu (`ui_kits/stanza/Sidebar.jsx` → `ContextMenu`)
- Triggered by `onContextMenu` (right-click) on any file or folder row.
- Floating panel: `--surface-card`, 1px `--border-strong`, radius 10px,
  shadow-xl, 184px min-width, 5px pad, `stz-fade-up` 110ms. Spawns at the
  cursor (`clientX/clientY`) and **clamps to the viewport** (measured via
  `useLayoutEffect` + `getBoundingClientRect`, 8px edge gutter).
- Items: 7px/9px pad rows, radius 5, 15px Lucide icon (`--ink-400`) +
  Hanken 14px medium label + optional mono kbd hint right-aligned; hover
  fills `--hover-fill`. **Destructive items** (Delete) use `--del-600` text,
  `--del-500`→`--del-600` icon, `--del-bg` hover wash. Thin `--border-faint`
  separators group sections.
  - **File**: Open · — · Rename (⏎) · Duplicate · Copy path · — · Delete
  - **Folder**: New file · New folder · — · Rename (⏎) · Copy path · — · Delete
- Dismisses on outside `mousedown`, Esc, scroll (capture), resize, or blur.
- The row that owns the open menu shows a persistent highlight (`--clay-50`
  bg + 1px `--clay-200` inset ring) so the target stays obvious.
- **Inline rename**: choosing Rename swaps the row label for an `<input>`
  (auto-focus + select-all, 1px `--clay-400` border, 3px `--clay-100` focus
  ring). Enter commits, Esc/blur cancels; empty or unchanged is a no-op.
- **Copy path** writes the node's project-relative path to the clipboard
  (`navigator.clipboard.writeText`).
- **SourceEditor** (optional split, left of preview when open): file tabs
  (main.tex / intro.tex active w/ clay dirty dot), eyebrow SOURCE; line-number
  gutter (46px, right-aligned 12px `--ink-300`); tokenized LaTeX (commands
  `--blue-600`, brace args `--ink-500`, prose `--ink-800`, math `--clay-700`,
  comments `--ink-400` italic); 13px/1.75 JetBrains Mono; contentEditable;
  pending-edit lines washed `--clay-50` + 2px clay-400 inset bar; status line
  26px "LaTeX · UTF-8 · Ln 7, Col 12 · 18 lines".
- **PdfPane** (flex 1): toolbar 44px (eyebrow PREVIEW, "main.pdf" mono, task
  counter pill "N tasks" clay-tint when > 0; Read/Select-blocks segmented
  control; zoom group 110%). Scroll area: **margin rail (316px) + 22px gap +
  page (564px)**, centered as a unit.
- **Page**: white, 1px `--line` border, radius 4, shadow-page, padding
  52/56/60. Paper typography: Newsreader; title 25px/1.18 600 centered;
  section heads 17px/1.3 600; body 14.5px/1.62 justified, 1.4em first-line
  indent on opening paragraphs; equation centered italic with (1) number.
- **ChatPane** 428px (hidden by default, ⌘J): session history; same message
  + proposal components as the rail.

## Interactions & Behavior — the edit loop

### File management (sidebar tree)
The FILES tree is editable via a **right-click context menu** (chrome spec
under Sidebar → File context menu). Operations mutate the workspace's `files`
state (a clone of `paper.files`) through a single recursive `mapNode(nodes,
target, op)` helper that rebuilds the tree, matching the target node by
reference identity and replacing it with `op(node)`'s return array (`[]`
deletes, `[a, b]` inserts a sibling, `[patched]` edits in place):
- **Rename** — files change the basename in their `path`; folders rewrite
  `dir` **and** every descendant path/dir prefix. Open tabs and `activeFile`
  are remapped so an open-and-renamed file keeps its tab.
- **Duplicate** (files only) — inserts a sibling with a ` copy` suffix
  inserted before the extension (`intro.tex` → `intro copy.tex`).
- **Delete** — prunes the node; any open tabs it covered (recursively, for a
  folder) are closed via `closeTab`.
- **New file / New folder** — root-level from the FILES header "+" buttons;
  nested (into the clicked folder, which auto-expands) from its context menu.
- **Copy path** — node path → clipboard.

Real app: these map to filesystem ops (`fs.rename`, copy, `fs.rm`, `mkdir`)
plus a re-parse of affected files into blocks; renames/deletes of tracked
files should be staged as git moves/removals. Guard against editing a file
while a busy/review task owns one of its blocks (mirror block locking).

### Task model (core concept)
Every edit is a **task**: `{ id, blockIds[], instruction, phase, proposal }`.
Phases: `compose → busy → review` (accept/reject removes the task).
**Multiple tasks run in parallel.** Tasks render as cards in the margin rail,
vertically aligned with their first block (`getBoundingClientRect` against the
shared wrapper), collision-stacked top-down with 14px min separation, top
transitions 200ms ease-out. A 1.5px connector line runs card→page, colored by
phase (review `--clay-500`, busy `--clay-400`, compose `--line-ink`, 55% op).

### Selection
- Click block (Select-blocks mode) → creates a compose task, card auto-focused.
- Click a **section heading** → claims the WHOLE section (heading + blocks).
- **⇧/⌘-click** another block → adds it to the active compose task.
- **"+ blocks" pill** on the draft card toggles add-mode (plain clicks append).
- Tags on the card are removable (×) while composing; whole-section tasks show
  ONE combined tag ("Abstract · main.tex:24–31"), ad-hoc multi-block tasks
  list each block.
- Block visual: thin 3px edge bar at page-margin left (−26px), phase-colored;
  ONLY the active task's blocks get selection wash rgba(194,92,57,0.13) +
  1.5px inset stroke. Hover pill (above block, ink-700) shows `file:span`.

### Locking
Blocks owned by a busy/review task are **locked**: cursor `progress`, hover
pill becomes ink-500 with lock icon + "Claude editing — locked" / "awaiting
review"; clicking focuses the owning card instead of starting a new task.
Section claims respect locks (can't grab a section containing a locked block).

### Card states (expanded; non-active tasks collapse to 32px chips)
- Chip: phase icon (pulsing 6px dot when busy) + label (Draft edit / Editing… /
  Proposal ready) + italic ellipsized instruction + `file:span` mono. Review
  chips tinted `--clay-50` / border `--clay-200`. Click chip → expands.
- **Compose**: header EDIT WITH CLAUDE + tags + "+ blocks"; textarea (2 rows,
  auto-focus, ↵ run / esc dismiss) + clay Run button w/ up-arrow; hint row.
- **Busy**: quoted instruction (Newsreader italic), 3 pulsing clay dots,
  `claude -p · {file}` mono caption. Not dismissible.
- **Review**: note (13px `--ink-600`), DiffHunk capped at 192px (scrolls),
  buttons Accept (primary) / Reject (secondary) / Review (subtle, maximize icon).
- When a busy task completes, it auto-expands (becomes active).

### Review overlay (the "see it compiled" view)
Scrim rgba(33,30,25,0.42); panel min(880px, 92vw), max-height 86vh,
`--paper-1`, radius 14, shadow-xl.
- Header: sparkles + "Review change" + block tag + **Compiled | Source**
  segmented control + close.
- **Compiled** (default): TWO rendered panes side by side — "CURRENT main.pdf"
  and "PROPOSED after recompile" (clay eyebrow) — each a mini page (white,
  shadow-page, 22/24 padding) typeset like the real page (Newsreader 15px/1.66
  justified, indent). Word-level marks: deletions `--del-bg` wash +
  line-through `--del-600`; additions `--add-bg` wash, `--add-700` text.
- **Source**: full-width DiffHunk.
- Footer: `claude -p · file` caption; ⌘↵ Accept, esc/click-out close;
  Reject + Accept buttons (md).
- Accepting: compile pill → Compiling → Compiled; task removed; git commit
  appears in HISTORY ("claude: <summary>").

## State Management
- `tasks[]` (the loop), `activeTask` (expanded card), `adding` (append mode),
  `view` (read | select), `sourceOpen`, `chatOpen`, `compile` state,
  `messages[]` (session history feeding the optional ChatPane).
- `files[]` (editable clone of `paper.files`), `openFiles[]` + `activeFile`
  (source-editor tabs). File-tree edits go through `mapNode` and keep tab
  state in sync. The context menu + inline-rename UI state (`menu`,
  `renaming`) is local to `Sidebar`.
- Real app: task phases map to `claude -p` lifecycle; locking must be enforced
  server-side per block-span; accept = `git commit`, reject = `git restore`.

## Design Tokens (single source of truth: `tokens/*.css`)
Key values — full scales in the files:
- Paper: canvas #F4EFE6 · app #F8F4EC · raised #FCFAF5 · page #FFFFFF · well #ECE6DA
- Ink: 900 #211E19 · 800 #322D26 · 500 #756A59 · 400 #968B78 · 300 #B3A893
- Clay (accent): 500 #C25C39 · 600 #A94B2E (hover) · 700 #8A3C25 (press) ·
  50 #FAF0EA · selection fill rgba(194,92,57,.13) / edge rgba(194,92,57,.55)
- Blue: 500 #3D6E9C · 600 #2F587E | Diff: add #3B7A55/#E7F0E9, del #B23A3A/#F6E5E2
- Borders: #E1D9C9 default · #D2C7B2 strong | Radii: 3/5/7/10/14/pill
- Fonts (self-hosted woff2, `assets/fonts/`): Newsreader (paper), Hanken
  Grotesk (UI), JetBrains Mono (source). Type scale 11→40px in tokens.
- Motion: --dur-fast 140ms hovers · --dur-base ~200 · ease-out cubic-bezier(.22,1,.36,1)

## Assets
- `assets/stanza-mark.svg`, `assets/stanza-mark-mono.svg` — logo mark.
- `assets/fonts/*.woff2` — Newsreader (roman+italic), Hanken Grotesk,
  JetBrains Mono (all variable).
- Icons: Lucide path data (ISC), 2px stroke — see `ui_kits/stanza/icons.jsx`.
  Use the `lucide-react` package in production.

## Files (design references in the design-system project)
- `ui_kits/stanza/index.html` — full interactive walkthrough (start of loop)
- `ui_kits/stanza/edit-loop.html` — opens mid-loop: 1 review + 1 busy task
- `ui_kits/stanza/open-screen.html` — open screen + priming flows
- `ui_kits/stanza/*.jsx` — TitleBar, Sidebar, PdfPane (rail + overlay),
  SourceEditor, ChatPane, OpenScreen, Workspace (state machine), paperData
- `components/` — Button, IconButton, Badge, BlockTag, DiffHunk, DiffLine,
  CompilePill, StatusDot, SegmentedControl, Kbd, … (props in each `.d.ts`)
- `tokens/*.css`, `styles.css` — design tokens; link or port verbatim
- `DESIGN_CHANGELOG.md` — version ledger; implement against a tagged version
- `design_handoff_edit_loop/FILE_MANAGEMENT.md` — **implementation handoff**
  for the v0.2 sidebar file management (right-click menu, rename, duplicate,
  delete, new), mapped onto the real `stanza` repo: IPC channels, `FileService`,
  `GitClient` additions, Sidebar/Workspace wiring, guards, and tests.
