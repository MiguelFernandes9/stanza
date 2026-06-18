<p align="center">
  <img src="build/icon.png" width="96" alt="Stanza" />
</p>
<h1 align="center">Stanza</h1>
<p align="center"><strong>Overleaf, with Claude.</strong> A macOS desktop app for writing LaTeX the way you read it — edit in the rendered PDF, with Claude as a block-level editing partner.</p>

A LaTeX project is parsed into addressable blocks. You select a block — a
paragraph, a section, an equation — directly in the compiled PDF, type an
instruction, and Claude Code edits the `.tex` source. Every change comes back
as a diff you accept or reject. Nothing lands in your files without your
sign-off.

![Stanza — rendered PDF, file tree, outline, and git history side by side](docs/images/hero.png)

> Status: pre-release, under active development. v1 targets a single local
> user (the author's PhD thesis is the dogfood).

## The loop

```
select blocks in the PDF  →  type an instruction
        →  Claude edits the .tex source
        →  diff proposal (margin card)
        →  accept = git commit · reject = restore
        →  recompile → updated PDF
```

## Using Stanza

### 1. Open a project

Open a folder of `.tex` files (**File ▸ Open**). The left rail is your
project: a file tree, a live **outline** of titled sections, and the
document's git **history**. The center pane is the compiled PDF — press
**⌘R** to build it (tectonic runs locally). The hero shot above is a project
open and compiled.

### 2. The edit loop

Switch to **Select blocks** mode (top-right, or **⌘B** to toggle from Read).
Click any block in the PDF — a paragraph, heading, equation, figure — and a
card opens on the margin rail showing that block's source span
(`ch1.tex:6–7`). Type what should change and hit **Run**; Claude Code edits
the `.tex` source for exactly that span. You can stack several blocks into one
instruction.

![Selecting a paragraph in the PDF opens an Edit-with-Claude card on the rail](docs/images/edit-loop.png)

### 3. Review every change

A finished edit comes back as a **proposed change**: Claude's note, a real
`git` diff, and the block marked *Awaiting review* in the PDF. **Accept**
commits it; **Reject** restores the file. Edits run as **tasks** — several can
be pending at once, each locking its own blocks while it runs, each on its own
branch in *your document's* repo. Every AI edit is attributable, revertable
history.

![A proposed change: Claude's note, the diff, and Accept / Reject](docs/images/proposal.png)

### 4. Find your way around

The sidebar **outline** lists your titled sections; clicking one jumps the PDF
and the source editor to it (jump-only — it never selects or edits). The file
tree hides build noise, and images or PDFs open in an in-app viewer. **⌘B**
toggles Read ↔ Select-blocks at any time.

<img src="docs/images/outline.png" width="280" alt="Sidebar: file tree, section outline, and history" />

### 5. When a compile fails

A failed build opens the **Problems** panel along the bottom: every tectonic
error, with click-to-jump to the offending source line and a raw-log tab. Hit
**Fix with Claude** to hand the whole error log over as a single edit.

![The Problems panel listing a tectonic error, with Fix with Claude](docs/images/console.png)

## How it's built

| concern | choice |
|---|---|
| Shell | Electron + React + TypeScript + Vite |
| Source format | real LaTeX, compiled locally with [tectonic](https://tectonic-typesetting.github.io) (`--synctex`) |
| PDF ↔ source mapping | SyncTeX + the pdf.js text layer, both directions |
| Claude bridge | Claude Code CLI, headless (`claude -p`) — one session per document; no API keys in the app |
| Review | git, in the document's own repo — accept = commit, reject = restore |
| Editor | CodeMirror 6 (source pane), pdf.js (preview) |

The app never calls the Anthropic API directly: it drives your existing
`claude` login, and Claude edits files with its own tools.

## Repository layout

```
src/shared/    pure logic + types: IPC contract, block model, LaTeX utils
src/main/      Electron main: services (document, compile, claude, review)
               over an infra layer (process, git, watcher, store)
src/renderer/  React UI: feature folders + design-system components
design/        design system v0.1 — tokens, component kit, interaction contract
docs/          project context + feature specs
fixtures/      sample LaTeX projects used by the test suites
tests/         unit + Playwright-electron e2e (Claude played by a mock)
```

Start with [docs/PROJECT.md](docs/PROJECT.md) for what the app does and its
current state. The visual source of truth is [design/](design/), versioned by
its [changelog](design/DESIGN_CHANGELOG.md).

## Running it

Prerequisites:

- macOS, Node ≥ 20
- [tectonic](https://tectonic-typesetting.github.io) — `brew install tectonic`
- [Claude Code](https://claude.com/claude-code) CLI, logged in (run `claude` once)

```bash
npm install
npm run dev          # Electron app, hot reload
npm test             # unit suites (no LaTeX needed)
npm run test:e2e     # Playwright-electron, mocked Claude, real builds
npm run test:integration   # real tectonic compiles of fixtures/
```

To regenerate the screenshots in this README from the current UI:

```bash
npm run build && node tests/e2e/capture-readme-shots.mjs
```

## Design

Stanza's interface is an editorial workstation: parchment surfaces, ink
typography, one clay accent, printer's-ink diff colors. The full design
system — tokens, components, app mocks, and the interaction contract the
implementation follows — lives in [design/](design/).
