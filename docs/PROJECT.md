# Stanza — project context

Stanza is a desktop **LaTeX document editor with Claude built in**. The vision: a
"Word-killer" where LaTeX is the *invisible* engine — people write and edit beautiful
documents without knowing LaTeX, and Claude translates their intent into the `.tex`
source.

## How it works

- A `.tex` project is parsed into addressable **blocks** (paragraphs, sections,
  environments, figures, …) — including nested and multi-file (`\input`) structure.
- The user selects a block **in the rendered PDF**, types an instruction, and Claude
  Code (the headless CLI) edits the `.tex` source.
- Changes surface as a **git diff** with accept / reject. Accept commits; reject
  restores.
- The PDF is compiled locally with **tectonic `--synctex`**; PDF ↔ source mapping uses
  **SyncTeX + the pdf.js text-layer** for block geometry.

## Stack & layout

- **Electron + React + TypeScript + Vite.**
- `src/main/` — Electron main: compile, the Claude bridge, git ops, IPC.
- `src/renderer/` — React UI (paper pane, editor, sidebar, settings).
- `src/shared/` — types, the block model, IPC contracts.
- Claude bridge = the **Claude Code CLI** (one session per open document), never the
  raw API.

## Current state (in `main`)

Working: block model (nested + multi-file), one window per document, native File menu,
Settings panel (editor font/theme, main-file selector, compiler options), history diff
viewer, outline navigation with figure/equation numbers, drag-and-drop file tree, and
Stanza branding/icon. Two-column geometry **Phase 1** is in.

## Pending work

- **Two-column support — Phase 2** (the only open item). Phase 1 shipped per-column
  block geometry; Phase 2 = two-rail Claude bubbles per column + centering. Spec:
  [`docs/two-column-support.md`](two-column-support.md).

## Known issue

- The `pdf-rail-bubble-scroll` e2e test is red (PDF centering / rail-bubble layout) —
  pre-existing.

> Deeper design notes from earlier development are recoverable from git history (the
> `docs/` folder before this cleanup commit).
