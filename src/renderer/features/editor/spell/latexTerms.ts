/** Words the en_US dictionary doesn't know but a LaTeX author writes constantly:
 *  package names (when named in prose rather than \texttt code, which the parser
 *  already skips), TeX tooling, and typesetting / CS jargon. Added to the speller
 *  so they aren't underlined. This is a domain dictionary — curated and
 *  extensible, NOT exhaustive (CTAN has thousands of packages); the long tail is
 *  covered by right-click → Add to Dictionary. Keep entries lowercase unless the
 *  word carries internal capitals (TikZ, BibTeX) the user would type verbatim. */
export const LATEX_TERMS: readonly string[] = [
  // --- TeX engines, formats, tooling ---
  'tex', 'latex', 'pdftex', 'pdflatex', 'xetex', 'xelatex', 'luatex', 'lualatex',
  'bibtex', 'biber', 'context', 'metapost', 'metafont', 'tectonic', 'synctex',
  'dvi', 'dvips', 'dvipdfm', 'ctan', 'miktex', 'texlive', 'overleaf', 'mathjax',
  'katex', 'TeX', 'LaTeX', 'XeTeX', 'LuaTeX', 'BibTeX', 'ConTeXt', 'pdfTeX',

  // --- common packages (named in prose) ---
  'amsmath', 'amssymb', 'amsfonts', 'amsthm', 'mathtools', 'mathrsfs', 'bm',
  'booktabs', 'tabularx', 'longtable', 'multirow', 'makecell', 'threeparttable',
  'array', 'colortbl', 'siunitx', 'pgf', 'pgfplots', 'tikz', 'TikZ', 'pgffor',
  'tcolorbox', 'mdframed', 'framed', 'hyperref', 'cleveref', 'varioref', 'nameref',
  'graphicx', 'xcolor', 'color', 'geometry', 'fancyhdr', 'titlesec', 'titletoc',
  'setspace', 'parskip', 'enumitem', 'paralist', 'listings', 'minted', 'fancyvrb',
  'verbatim', 'algorithm', 'algorithmic', 'algorithmicx', 'algpseudocode', 'algorithm2e',
  'biblatex', 'natbib', 'bibtex', 'csquotes', 'microtype', 'subcaption', 'subfig',
  'caption', 'float', 'wrapfig', 'placeins', 'babel', 'polyglossia', 'fontspec',
  'inputenc', 'fontenc', 'textcomp', 'lmodern', 'helvet', 'courier', 'inconsolata',
  'mathptmx', 'newtxtext', 'newtxmath', 'beamer', 'etoolbox', 'xparse', 'expl3',
  'ifthen', 'calc', 'xstring', 'environ', 'standalone', 'import', 'subfiles',
  'glossaries', 'acronym', 'nomencl', 'makeidx', 'imakeidx', 'todonotes', 'lineno',
  'lipsum', 'blindtext', 'ulem', 'soul', 'xspace', 'siunitx', 'physics', 'mhchem',
  'chemfig', 'cancel', 'nicefrac', 'xfrac', 'empheq', 'breqn', 'stmaryrd', 'dsfont',
  'pdfpages', 'pdflscape', 'rotating', 'afterpage', 'needspace', 'lastpage',

  // --- typesetting / document jargon ---
  'preamble', 'preprint', 'glyph', 'glyphs', 'kerning', 'ligature', 'ligatures',
  'hbox', 'vbox', 'mbox', 'strut', 'struts', 'baselineskip', 'parindent', 'leading',
  'monospace', 'typeface', 'typefaces', 'smallcaps', 'sans', 'serif', 'serifs',
  'subscript', 'subscripts', 'superscript', 'superscripts', 'overfull', 'underfull',
  'crossref', 'crossrefs', 'frontmatter', 'backmatter', 'colophon', 'pagebreak',

  // --- CS / math technical English en_US misses ---
  'toolchain', 'pseudocode', 'decompositions', 'whitespace', 'subexpression',
  'subexpressions', 'lookahead', 'precompute', 'precomputed', 'inlining', 'inlined',
  'substring', 'substrings', 'submatrix', 'submatrices', 'subgraph', 'subgraphs',
  'memoization', 'discretize', 'discretized', 'discretization', 'parallelize',
  'parallelizable', 'parametrize', 'parametrized', 'parametrization', 'unary',
  'preprocessor', 'preprocessing', 'reproducibility', 'reparameterize'
]
