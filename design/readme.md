# Stanza Design System

> **Stanza** — *"Overleaf, with Claude."* A desktop app for editing LaTeX papers
> **in the rendered page**. You select a block in the compiled PDF, type an
> instruction, and Claude Code edits the `.tex` source. Every change surfaces as
> a diff you accept or reject.

This repository is the brand & product design system for Stanza: the typography,
color, spacing and motion foundations, a library of reusable React components,
and a high-fidelity recreation of the app's three-pane workspace.

---

## Product context

Stanza closes the gap between *what an author sees* (a paragraph, an equation, a
figure) and *what a tool edits* (line numbers in a source file). The core loop:

```
open .tex project → compile (tectonic) → PDF + SyncTeX
  → select a region in the rendered PDF → resolves to file:line → block
    → type an instruction → claude -p edits the .tex (its own tools)
      → git diff = proposal → accept (commit) / reject (restore) → recompile
```

Three panes drive the UI:
- **PDF pane** (primary) — the compiled page; hover shows block boundaries, click
  selects, drag selects several.
- **Instruction / chat pane** — the instruction bound to the current selection;
  shows Claude's notes and, on a proposal, an inline diff with accept/reject.
- **Source editor** (secondary, collapsible) — a CodeMirror view of the `.tex`.

It is an **Electron + React + TypeScript** app. Claude is invoked through the
**Claude Code CLI** (one session per open document), never the raw API. Review is
**git-based** — each op starts from a clean tree; the resulting diff is the
proposal.

### Sources this system was built from

There was **no existing visual design** to copy — the codebase is an early
backend/Electron scaffold (main process, IPC contracts, shared types) with no
renderer, React UI, colors, fonts, or logo. The brand and product UI in this
system were therefore **designed from scratch**, faithfully following the
documented architecture. Inputs consulted:

- **Codebase** (attached, read-only): `stanza/` — `docs/architecture.md`,
  `CLAUDE.local.md`, the `feat/electron-shell` worktree
  (`src/main/`, `src/shared/ipc.ts` — the IPC + document/block/diff data model).
- **GitHub:** [`MiguelFernandes9/stanza`](https://github.com/MiguelFernandes9/stanza)
  — at the time of writing this repo contains `docs/` only (architecture + test
  plan). Explore it for the authoritative spec of the block model, Claude bridge,
  compile pipeline, and review flow; it is the best reference for building
  higher-fidelity Stanza designs.

> If you have access to a later build of Stanza with a real renderer, treat that
> as the source of truth over this system's invented UI, and update the UI kit to
> match.

---

## Content fundamentals

How Stanza writes. The product speaks to **researchers and technical authors** —
people who care about precision and dislike ceremony. The register is **calm,
literate, and exact**, never hypey.

- **Voice — second person, plain imperative.** The product addresses *you*:
  "Edit your paper in the page." "Select a block, say what you want." UI actions
  are bare verbs: *Open project*, *Accept*, *Reject*, *Run*, *Recompile*.
- **Concision over completeness.** Short declaratives. A subtitle is one
  sentence: *"Select a block, type an instruction, review the diff."* No
  exclamation points, no "Let's…", no "powered by AI".
- **The domain vocabulary is exact.** *Block*, *span*, *proposal*, *diff*,
  *accept / reject*, *commit / restore*, *compile*, *session*. These are nouns
  with precise meanings from the architecture — use them consistently. A
  selection is a **block**; a change is a **proposal**; accepting **commits**.
- **Claude is named, and credited honestly.** The assistant is "Claude" (or
  "Claude Code"), shown with its own avatar. Microcopy states plainly what
  happens: *"Claude Code edits the .tex source directly."* No anthropomorphic
  fluff ("I'd be happy to…"); Claude's notes are terse engineering notes —
  *"Tightened the opening paragraph and added a forward reference to §2."*
- **Casing.** Sentence case everywhere — buttons, headers, menus
  (*"Open project…"*, not *"Open Project"*). Uppercase is reserved for tiny
  eyebrow labels (`FILES`, `OUTLINE`, `PREVIEW`) with wide tracking.
- **Numbers & code are mono.** File paths, line spans, shortcuts, counts, and
  LaTeX render in JetBrains Mono — `intro.tex:24–31`, `+12 −4`, `⌘↵`.
- **Structural glyphs as shorthand.** `§` section, `¶` paragraph, `∑` equation,
  `†` citation — these stand in for block kinds in chips and labels.
- **No emoji.** Ever. The structural glyphs and a restrained icon set carry all
  the symbolic weight.

---

## Visual foundations

The aesthetic is **"the editorial workstation"** — a warm, paper-forward
scholarly tool that honors LaTeX's heritage of beautiful typesetting, with a
Claude-clay accent that signals the AI living inside.

### Color & light
- **Ink on paper.** Surfaces are warm parchment (`--paper-base` `#F4EFE6` →
  `--paper-2` `#FFFFFF`), ascending as they lift. Text is a warm near-black ink
  ramp (`--ink-900` `#211E19` → `--ink-200`). Never cold gray.
- **Clay is the one accent** (`--clay-500` `#C25C39`) — a terracotta that nods to
  Claude's warmth without copying it. Used for the primary action, selection, the
  brand mark's middle line, and the active state. Used *sparingly* — most of the
  screen is paper and ink.
- **A scholarly ink-blue** (`--blue-600`) is the quiet secondary: links,
  cross-references, `.bib` files, LaTeX commands in source.
- **Diff colors are reserved semantics, never decoration.** Addition green
  (`--add-600`) and deletion red (`--del-600`) appear *only* in diffs and
  status. They are muted "printer's ink" — paper-compatible, not terminal-neon.
- **Selection** is a clay wash + outline (`--select-fill` / `--select-edge`);
  **hover** is a faint ink wash + warm hairline. This is how a block reads in the
  PDF.

### Typography
A three-voice system (see the Type cards):
- **Newsreader** (`--font-serif`) — the scholarly *paper* voice. Display titles,
  headings, marketing leads, and the rendered-PDF body. A true italic adds
  editorial flavor (often set in clay).
- **Hanken Grotesk** (`--font-sans`) — the precise *app-chrome* voice. Labels,
  controls, navigation, body UI. Neutral but warm.
- **JetBrains Mono** (`--font-mono`) — the *source* voice. `.tex`, diffs, paths,
  spans, shortcuts.
- Scale is a 1.20 minor third; headings are semibold with tight tracking; body UI
  is 13–14px at desktop density; paper body reads at ~1.62 line-height.

### Form, depth & motion
- **Backgrounds** are solid warm paper — *no gradients, no meshes, no noise*. Depth
  comes from elevation, not color. The one texture is the literal "page": a white
  sheet with a soft shadow floating on the parchment canvas.
- **Corners are restrained** — 3–10px on controls and cards (this is an
  instrument, not a toy). Pills only for badges, toggles, and status.
- **Borders are warm hairlines** (`--line` family). Almost every surface is
  defined by a 1px warm line first, a shadow second.
- **Shadows are warm umber, soft, low-alpha** (`--shadow-*`) — paper lifting off
  paper, never a cold drop-shadow. Inputs and the code gutter use an *inset* well.
- **Cards** = paper surface + 1px warm border + `--shadow-sm`, `--radius-lg`. A
  header is divided by a faint hairline.
- **Motion is quiet and quick.** 110–280ms, `--ease-out` for most things; a gentle
  spring only on the toggle knob. Page-load uses a short staggered fade-up.
  Pulses (compile running, Claude editing) are slow and calm. Reduced-motion
  zeroes all durations. **No bounces, no decorative loops.**
- **Hover** lightens/tints (ghost → faint ink wash; primary → darker clay).
  **Press** darkens one clay step and nudges 0.5px down. Focus is a 2px clay ring
  on an offset.
- **Transparency & blur** are used minimally — only the selection/hover washes are
  translucent so the page text shows through. No frosted-glass chrome.

---

## Iconography

- **System: [Lucide](https://lucide.dev) (ISC license), 2px stroke, rounded
  caps/joins** — a clean line set that matches the precise, scholarly tool feel.
  The codebase ships **no icon assets** (no renderer yet), so this is a
  **flagged substitution**; swap for Stanza's own set when one exists.
- In the UI kit, the icons we use are copied in as path data
  (`ui_kits/stanza/icons.jsx`) so there's no runtime dependency. For new work you
  may also link Lucide from CDN.
- **Structural glyphs** (`§ ¶ ∑ ❏ ▦ †`) are a *typographic* icon system unique to
  Stanza — set in Newsreader, they label block kinds in chips, the outline, and
  selection handles. Prefer them over drawn icons for document structure.
- **The brand mark** (`assets/stanza-mark.svg`) is a selection-marquee enclosing
  three lines of type, the middle one in clay — the core interaction (selecting a
  block; the line Claude edits) compressed into a glyph. `stanza-mark-mono.svg` is
  the single-color variant. The wordmark is simply **Stanza** set in Newsreader
  semibold.
- **No emoji**, no Unicode-emoji icons.

---

## What's in here (manifest)

**Foundations**
- `styles.css` — the global entry point (consumers link this one file). `@import`
  manifest only.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`,
  `elevation.css`, `base.css`. All custom properties + `@font-face` rules
  pointing at the self-hosted webfonts in `assets/fonts/`.
- `guidelines/*.card.html` — foundation specimen cards (Colors, Type, Spacing,
  Brand) shown in the Design System tab.
- `assets/` — `stanza-mark.svg`, `stanza-mark-mono.svg`.

**Components** (`components/<group>/`, React; import `window.StanzaDesignSystem_d6c63d`)
- `forms/` — **Button, IconButton, Input, Switch, Checkbox**
- `feedback/` — **Badge, StatusDot, Tooltip, Toast**
- `data/` — **Card, Avatar, Kbd, SegmentedControl**
- `stanza/` — **BlockTag, DiffLine, DiffHunk, CompilePill** (the product's
  signature primitives)
- Each directory has a `*.card.html` showcase, and each component a `.d.ts` +
  `.prompt.md`.

**UI kit** (`ui_kits/stanza/`)
- `index.html` — interactive recreation of the **workspace**: the margin-rail
  edit loop from the start (draft a task, run it, review the diff).
- `edit-loop.html` — opens **mid-loop**: one proposal under review + one task
  still running, in parallel.
- `open-screen.html` — launch view: new document · working project (has a
  Claude session) · plain folder → one-time priming overlay.
- Components: `TitleBar`, `Sidebar`, `PdfPane` (margin rail + review overlay),
  `ChatPane`, `SourceEditor`, `OpenScreen`, `Workspace` (task state machine),
  plus `icons.jsx` and `paperData.js`.

**Iteration with the implementation**
- `design_handoff_edit_loop/README.md` — self-sufficient implementation spec
  for Claude Code (v0.1 interaction contract: task model, locking, selection,
  review overlay, priming).
- `DESIGN_CHANGELOG.md` — version ledger; new design work lands here first,
  Claude Code appends implementation notes per version.

**Skill**
- `SKILL.md` — makes this system usable as an Agent Skill (e.g. in Claude Code).

---

## Using the system

Link the stylesheet, then read components from the compiled namespace:

```html
<link rel="stylesheet" href="styles.css" />
<script src="_ds_bundle.js"></script>
<script type="text/babel">
  const { Button, BlockTag, DiffHunk, CompilePill } = window.StanzaDesignSystem_d6c63d;
</script>
```

Reach for the CSS custom properties for everything — `var(--clay-500)`,
`var(--font-serif)`, `var(--shadow-sm)`. The semantic aliases
(`--surface-card`, `--text-body`, `--accent`, `--success`/`--danger`) are the
preferred handles.

> **Font note:** Newsreader, Hanken Grotesk, and JetBrains Mono are **self-hosted**
> as variable `woff2` files in `assets/fonts/` (latin subset), declared via
> `@font-face` in `tokens/fonts.css`. The system works fully offline — no CDN
> dependency. Newsreader ships roman + italic; Hanken and JetBrains carry their
> full weight axis in a single file each.
