# Stanza

**Overleaf, with Claude.** A macOS desktop app for writing LaTeX the way
you read it: edit in the rendered PDF, with Claude as a block-level
editing partner.

A LaTeX project is parsed into addressable blocks. You select a block —
a paragraph, a section, an equation — directly in the compiled PDF,
type an instruction, and Claude Code edits the `.tex` source. Every
change comes back as a diff you accept or reject. Nothing lands in your
files without your sign-off.

> Status: pre-release, under active development. v1 targets a single
> local user (the author's PhD thesis is the dogfood).

## The loop

```
select blocks in the PDF  →  type an instruction
        →  Claude edits the .tex source
        →  diff proposal (margin card)
        →  accept = git commit · reject = restore
        →  recompile → updated PDF
```

Edits run as **tasks**: cards in a margin rail next to the page, each
tied to its blocks. While a task runs, its blocks are locked; finished
tasks wait as reviewable proposals — several can be pending at once,
each on its own git branch in *your document's* repo, so every AI edit
is attributable, revertable history.

## How it's built

| concern | choice |
|---|---|
| Shell | Electron + React + TypeScript + Vite |
| Source format | real LaTeX, compiled locally with [tectonic](https://tectonic-typesetting.github.io) (`--synctex`) |
| PDF ↔ source mapping | SyncTeX, both directions |
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
docs/          architecture, v1 spec, v1 implementation plan
fixtures/      sample LaTeX projects used by the test suites
```

Start with [docs/v1-spec.md](docs/v1-spec.md) (what v1 does) and
[docs/v1-plan.md](docs/v1-plan.md) (how it's being built). The visual
source of truth is [design/](design/), versioned by its
[changelog](design/DESIGN_CHANGELOG.md).

## Running it

Prerequisites:

- macOS, Node ≥ 20
- [tectonic](https://tectonic-typesetting.github.io) — `brew install tectonic`
- [Claude Code](https://claude.com/claude-code) CLI, logged in (`claude` once)

```bash
npm install
npm run dev        # Electron app, hot reload
npm test           # unit suites (no LaTeX needed)
npm run test:integration   # real tectonic compiles of fixtures/
```

## Design

Stanza's interface is an editorial workstation: parchment surfaces, ink
typography, one clay accent, printer's-ink diff colors. The full design
system — tokens, components, app mocks, and the interaction contract
the implementation follows — lives in [design/](design/).
