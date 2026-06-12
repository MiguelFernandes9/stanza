# Test fixtures

LaTeX projects used by the unit, integration, and E2E suites
(plan T1, spec §9). `tests/fixtures/` asserts the contracts below —
change a fixture and its test together.

## Contracts

- **`thesis/`** — compiles clean with tectonic. Book class;
  `main.tex` `\input`s `preamble.tex` and `\include`s two chapters;
  `preamble.tex` has **exactly three** `\usepackage` lines;
  `style/thesis.sty` defines **one** custom macro (`\keyterm`, used in
  ch1); `chapters/ch2.tex` has a figure (`figs/plot.pdf`, tiny vector
  PDF built with tectonic from a `standalone` picture doc) and a
  citation into `refs.bib`.
- **`thesis-broken/`** — byte-identical to `thesis/` except
  `chapters/ch1.tex` **line 12** is an undefined control sequence
  (`\undefinedcontrolsequence`). Compile must fail with
  `file = chapters/ch1.tex, line = 12` (T3.1, B3 log-parser tests).
- **`single/`** — one self-contained `main.tex` (article class, no
  `\input`/`\include`, no bib, no figures). Used by DocumentService
  single-file tests and the E2E smoke.
- **`logs/`** — captured tectonic (0.16.9) logs: `thesis-ok.log`
  (clean compile, warnings only) and `thesis-broken.log` (contains
  `! Undefined control sequence.` + `l.12 \undefinedcontrolsequence`)
  for `shared/latex/log` parser tests. Re-capture after changing a
  fixture: `cd fixtures/thesis && tectonic --synctex --keep-logs
  main.tex`, same for `thesis-broken`, copy `main.log` here under the
  matching name.

Build outputs (`main.pdf`, `*.synctex.gz`, `*.aux`, ...) are
git-ignored; `figs/plot.pdf` is tracked content, not output.
