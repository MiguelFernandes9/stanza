---
name: stanza-design
description: Use this skill to generate well-branded interfaces and assets for Stanza ("Overleaf, with Claude" — a desktop app for editing LaTeX papers in the rendered PDF), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Fast orientation

- **Brand in one line:** an editorial workstation — warm parchment surfaces, ink
  typography, one clay accent (the "Claude inside" warmth), muted printer's-ink
  diff colors. Scholarly, precise, calm. No gradients, no emoji.
- **Link `styles.css`** for all tokens and fonts. Use the CSS custom properties
  (`var(--clay-500)`, `var(--font-serif)`, `var(--surface-card)`, `--shadow-sm`)
  rather than hard-coded values.
- **Components** compile into `window.StanzaDesignSystem_d6c63d` (load
  `_ds_bundle.js`). Primitives: Button, IconButton, Input, Switch, Checkbox,
  Badge, StatusDot, Tooltip, Toast, Card, Avatar, Kbd, SegmentedControl, and the
  Stanza-specific BlockTag, DiffLine, DiffHunk, CompilePill. Each has a
  `.prompt.md` with usage.
- **The product UI** (three-pane workspace) is recreated in
  `ui_kits/stanza/` — read it before mocking any Stanza screen; copy its
  `icons.jsx` for iconography (Lucide path data).
- **Type:** Newsreader (serif / paper), Hanken Grotesk (UI), JetBrains Mono
  (source & diffs). **Glyphs:** `§ ¶ ∑ ❏ ▦ †` label block kinds.
- **Voice:** second person, sentence case, terse and exact. Domain nouns matter:
  block, span, proposal, diff, accept/reject, commit/restore, compile, session.

## Key files
- `readme.md` — full design guide (content, visual, iconography, manifest).
- `styles.css` + `tokens/` — foundations.
- `assets/stanza-mark.svg` — brand mark; wordmark is "Stanza" in Newsreader.
- `components/**` — reusable primitives (`.jsx` + `.d.ts` + `.prompt.md` + card).
- `ui_kits/stanza/**` — the full app recreation.
