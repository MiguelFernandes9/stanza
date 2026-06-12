# Test fixtures

LaTeX projects used by the unit, integration, and E2E suites
(plan T1, spec §9). `tests/fixtures/` asserts the contracts below —
change a fixture and its test together.

## Contracts

- **`thesis/`** — compiles clean with tectonic. Book class;
  `main.tex` `\input`s `preamble.tex` and `\include`s two chapters;
  `preamble.tex` has **exactly three** `\usepackage` lines;
  `style/thesis.sty` defines **one** custom macro (`\keyterm`, used in
  ch1); `chapters/ch2.tex` has a figure (`figs/plot.pdf`, minimal
  hand-built vector PDF) and a citation into `refs.bib`.
- **`thesis-broken/`** — byte-identical to `thesis/` except
  `chapters/ch1.tex` **line 12** is an undefined control sequence
  (`\undefinedcontrolsequence`). Compile must fail with
  `file = chapters/ch1.tex, line = 12` (T3.1, B3 log-parser tests).
- **`single/`** — one self-contained `main.tex` (article class, no
  `\input`/`\include`, no bib, no figures). Used by DocumentService
  single-file tests and the E2E smoke.
- **`logs/`** — captured tectonic logs of `thesis/` (ok) and
  `thesis-broken/` (fail) for `shared/latex/log` parser tests.
  **Pending: tectonic not installed yet** (T1.1); capture with:
  `cd fixtures/thesis && tectonic --synctex --keep-logs -X compile main.tex`
  (same for thesis-broken), then copy the `.log` files here.

Build outputs (`main.pdf`, `*.synctex.gz`, `*.aux`, ...) are
git-ignored; `figs/plot.pdf` is tracked content, not output.
