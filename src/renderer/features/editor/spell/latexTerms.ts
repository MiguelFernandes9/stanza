/** Words the dictionary doesn't know but a LaTeX author writes constantly:
 *  package + class names (when named in prose, since \texttt code and
 *  \usepackage args are already skipped by the parser), TeX tooling, Greek
 *  letters and math operators (named in prose like "the lambda term"), and
 *  typesetting / CS / ML jargon. Added to the speller on top of whichever
 *  language is active. A curated DOMAIN DICTIONARY — extensible, not exhaustive
 *  (CTAN has thousands of packages); the long tail is right-click → Add to
 *  Dictionary. Lowercase unless the word carries internal capitals the user types
 *  verbatim (TikZ, BibTeX, IEEEtran). */
export const LATEX_TERMS: readonly string[] = [
  // --- TeX engines, formats, tooling ---
  'tex', 'latex', 'pdftex', 'pdflatex', 'xetex', 'xelatex', 'luatex', 'lualatex',
  'bibtex', 'biber', 'context', 'metapost', 'metafont', 'tectonic', 'synctex',
  'dvi', 'dvips', 'dvipdfm', 'dvisvgm', 'ctan', 'miktex', 'texlive', 'overleaf',
  'mathjax', 'katex', 'latexmk', 'arara', 'chktex', 'latexindent', 'makeindex',
  'makeglossaries', 'kpathsea', 'pandoc', 'asymptote', 'pstricks', 'pythontex',
  'TeX', 'LaTeX', 'XeTeX', 'LuaTeX', 'BibTeX', 'ConTeXt', 'pdfTeX', 'BibLaTeX',

  // --- common packages (named in prose) ---
  'amsmath', 'amssymb', 'amsfonts', 'amsthm', 'mathtools', 'mathrsfs', 'bm', 'bbm',
  'booktabs', 'tabularx', 'tabularray', 'nicematrix', 'longtable', 'multirow',
  'multicol', 'makecell', 'threeparttable', 'array', 'colortbl', 'diagbox', 'tabu',
  'siunitx', 'units', 'pgf', 'pgfplots', 'pgfplotstable', 'tikz', 'TikZ', 'pgffor',
  'circuitikz', 'forest', 'pgfgantt', 'tcolorbox', 'mdframed', 'framed', 'adjustbox',
  'hyperref', 'bookmark', 'cleveref', 'varioref', 'nameref', 'url', 'xurl', 'doi',
  'graphicx', 'svg', 'xcolor', 'color', 'geometry', 'fancyhdr', 'titlesec', 'titletoc',
  'setspace', 'parskip', 'enumitem', 'paralist', 'listings', 'minted', 'fancyvrb',
  'verbatim', 'algorithm', 'algorithmic', 'algorithmicx', 'algpseudocode', 'algorithm2e',
  'biblatex', 'natbib', 'apacite', 'csquotes', 'microtype', 'ragged2e', 'subcaption',
  'subfig', 'subfigure', 'caption', 'float', 'floatrow', 'wrapfig', 'placeins', 'flafter',
  'babel', 'polyglossia', 'fontspec', 'inputenc', 'fontenc', 'textcomp', 'lmodern',
  'helvet', 'courier', 'inconsolata', 'mathptmx', 'mathpazo', 'newtxtext', 'newtxmath',
  'libertine', 'biolinum', 'fourier', 'kpfonts', 'stix', 'unicode-math', 'fontawesome',
  'beamer', 'beamerposter', 'tikzposter', 'etoolbox', 'xparse', 'expl3', 'ifthen',
  'calc', 'xstring', 'environ', 'standalone', 'import', 'subfiles', 'glossaries',
  'acronym', 'nomencl', 'makeidx', 'imakeidx', 'todonotes', 'lineno', 'changes',
  'lipsum', 'blindtext', 'ulem', 'soul', 'xspace', 'physics', 'mhchem', 'chemfig',
  'cancel', 'nicefrac', 'xfrac', 'empheq', 'breqn', 'stmaryrd', 'dsfont', 'esint',
  'pdfpages', 'pdflscape', 'rotating', 'afterpage', 'needspace', 'lastpage', 'pdfcomment',

  // --- document classes (often named in prose) ---
  'ieeetran', 'IEEEtran', 'acmart', 'elsarticle', 'revtex', 'llncs', 'memoir',
  'amsart', 'amsbook', 'tufte', 'scrartcl', 'scrbook', 'koma',

  // --- Greek letters (named in prose: "the lambda term") ---
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta',
  'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'rho', 'varrho',
  'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',

  // --- math operators / symbols (bare, non-English) ---
  'frac', 'dfrac', 'tfrac', 'binom', 'sqrt', 'infty', 'nabla', 'cdot', 'cdots', 'ldots',
  'vdots', 'ddots', 'leq', 'geq', 'neq', 'approx', 'equiv', 'simeq', 'cong', 'propto',
  'forall', 'nexists', 'emptyset', 'subseteq', 'supseteq', 'mapsto', 'rightarrow',
  'leftarrow', 'Leftrightarrow', 'otimes', 'oplus', 'odot', 'mathbb', 'mathcal',
  'mathfrak', 'mathbf', 'mathrm', 'mathsf', 'mathtt', 'boldsymbol', 'operatorname',
  'argmax', 'argmin', 'limsup', 'liminf', 'softmax', 'mathbf',

  // --- typesetting / document jargon ---
  'preamble', 'preprint', 'glyph', 'glyphs', 'kerning', 'ligature', 'ligatures',
  'hbox', 'vbox', 'mbox', 'strut', 'struts', 'baselineskip', 'parindent', 'leading',
  'monospace', 'monospaced', 'typeface', 'typefaces', 'smallcaps', 'sans', 'serif',
  'serifs', 'subscript', 'subscripts', 'superscript', 'superscripts', 'overfull',
  'underfull', 'crossref', 'crossrefs', 'frontmatter', 'backmatter', 'colophon',
  'pagebreak', 'widow', 'gutter', 'recto', 'verso', 'displaystyle', 'textstyle',

  // --- CS / ML / math technical English the dictionary misses ---
  'toolchain', 'pseudocode', 'decompositions', 'whitespace', 'subexpression',
  'subexpressions', 'lookahead', 'precompute', 'precomputed', 'inlining', 'inlined',
  'substring', 'substrings', 'submatrix', 'submatrices', 'subgraph', 'subgraphs',
  'memoization', 'discretize', 'discretized', 'discretization', 'parallelize',
  'parallelizable', 'parametrize', 'parametrized', 'parametrization', 'unary',
  'preprocessor', 'preprocessing', 'reproducibility', 'reparameterize', 'codebase',
  'runtime', 'namespace', 'namespaces', 'refactor', 'refactoring', 'boolean',
  'idempotent', 'surjective', 'injective', 'bijective', 'homomorphism', 'isomorphism',
  'orthonormal', 'submodular', 'nonconvex', 'nonnegative', 'nonzero', 'semidefinite',
  'pseudoinverse', 'eigenvalue', 'eigenvalues', 'eigenvector', 'eigenvectors',
  'autoencoder', 'autoencoders', 'backpropagation', 'hyperparameter', 'hyperparameters',
  'minibatch', 'minibatches', 'dropout', 'sigmoid', 'softmax', 'relu', 'tanh',
  'convolutional', 'recurrent', 'transformer', 'transformers', 'embedding', 'embeddings',
  'tokenization', 'tokenizer', 'tokenizers', 'dataset', 'datasets', 'dataloader',
  'contrastive', 'pretraining', 'pretrained', 'finetuning', 'finetuned', 'downstream',
  'baselines', 'ablation', 'ablations', 'benchmarking', 'generalizability'
]
