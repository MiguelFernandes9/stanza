/* Stanza UI kit — sample document model.
   A believable single-column LaTeX paper, parsed into addressable blocks.
   Each block carries a source span (file:line) — the unit Claude ops scope to.
   Self-referential subject matter keeps the sample safe and on-theme. */
(function () {
  window.STZ_PAPER = {
    project: 'block-editing',
    mainFile: 'main.tex',
    files: [
      { path: 'main.tex', active: true },
      { path: 'macros.tex' },
      { path: 'refs.bib' },
      { dir: 'sections', open: true, children: [
        { path: 'sections/intro.tex' },
        { path: 'sections/method.tex' },
        { path: 'sections/results.tex' }
      ] },
      { dir: 'figures', open: true, children: [
        { path: 'figures/pipeline.pdf' },
        { path: 'figures/block-map.png' },
        { path: 'figures/latency.png' }
      ] },
      { dir: 'tables', children: [
        { path: 'tables/ablation.tex' }
      ] },
      { dir: 'notes', children: [
        { path: 'notes/outline.md' },
        { path: 'notes/reviewer-response.txt' }
      ] }
    ],
    // Rendered blocks, in page order.
    blocks: [
      { id: 'title', kind: 'title', file: 'main.tex', span: '12–14',
        text: 'Block-Addressable Editing of Structured Documents' },
      { id: 'authors', kind: 'paragraph', file: 'main.tex', span: '16–18',
        text: 'M. Fernandes,  A. Reis,  J. Costa' },
      { id: 'affil', kind: 'paragraph', file: 'main.tex', span: '19',
        text: 'Instituto Superior Técnico' },
      { id: 'abs-h', kind: 'section', file: 'main.tex', span: '24', text: 'Abstract', heading: true, sec: 'abs' },
      { id: 'abstract', kind: 'paragraph', file: 'main.tex', span: '25–31', sec: 'abs',
        text: 'We present a method for editing structured documents by addressing their rendered output rather than their source. A document is parsed into a tree of blocks, each retaining its source span. Selecting a region of the rendering resolves to a block; a natural-language instruction is then scoped to that block\u2019s span. We show the approach reduces edit latency and preserves cross-references across revisions.' },
      { id: 's1-h', kind: 'section', file: 'sections/intro.tex', span: '1', text: '1   Introduction', sec: 's1' },
      { id: 's1-p1', kind: 'paragraph', file: 'sections/intro.tex', span: '3–9', sec: 's1',
        text: 'Authors of technical documents think in terms of what they see \u2014 a paragraph, an equation, a figure \u2014 not in terms of line numbers in a source file. Yet every editing tool asks them to translate between the two. The model is good and works well in many cases, but the translation step is a persistent source of friction.' },
      { id: 's1-eq', kind: 'equation', file: 'sections/intro.tex', span: '11–13', sec: 's1',
        text: '\\mathcal{B}(p, x, y)\\;\\longmapsto\\;(\\textsf{file},\\,\\ell)\\;\\longmapsto\\;\\textsf{block}', num: '1' },
      { id: 's1-p2', kind: 'paragraph', file: 'sections/intro.tex', span: '15–20', sec: 's1',
        text: 'We close this gap with a bidirectional map between rendered coordinates and source spans (1). A selection in the page becomes a file-and-line pair, which resolves to the enclosing block of the parsed tree. Edits are proposed as diffs and reviewed in place.' },
      { id: 's2-h', kind: 'section', file: 'sections/method.tex', span: '1', text: '2   Method', sec: 's2' },
      { id: 's2-p1', kind: 'paragraph', file: 'sections/method.tex', span: '3–10', sec: 's2',
        text: 'The document folder is treated as a version-controlled workspace. Before each operation the working tree is required to be clean; the resulting diff is the proposal. Accepting commits the change; rejecting restores the prior state. This yields a complete, reversible history of every machine-authored edit.' }
    ],
    // Canned Claude proposals, keyed by target block (demo).
    proposals: {
      's1-p1': {
        note: 'Tightened the opening paragraph and added a forward reference to the method (§2). Removed the filler clause; kept the cross-reference intact.',
        targetBlock: 's1-p1',
        files: ['sections/intro.tex'],
        // rendered (compiled) comparison segments: k = unchanged, d = removed, a = added
        before: [
          ['k', 'Authors of technical documents think in terms of what they see — a paragraph, an equation, a figure — not '],
          ['d', 'in terms of '],
          ['k', 'line numbers in a source file. Yet '],
          ['d', 'every editing tool asks '],
          ['k', 'them to translate between the two'],
          ['d', '. The model is good and works well in many cases, but the translation step is a persistent source of friction.']
        ],
        after: [
          ['k', 'Authors of technical documents think in terms of what they see — a paragraph, an equation, a figure — not '],
          ['k', 'line numbers in a source file. Yet '],
          ['a', 'editors force '],
          ['k', 'them to translate between the two'],
          ['a', ', a persistent source of friction we remove in §2.']
        ],
        diff: '@@ -3,7 +3,6 @@\n Authors of technical documents think in terms of what they\n-see — a paragraph, an equation, a figure — not in terms of line\n-numbers in a source file. Yet every editing tool asks them to\n-translate between the two. The model is good and works well in\n-many cases, but the translation step is a persistent source of\n-friction.\n+see — a paragraph, an equation, a figure — not line numbers in a\n+source file. Yet editors force them to translate between the two,\n+a persistent source of friction we remove in \\S2.'
      },
      'abstract': {
        note: 'Sharpened the abstract’s first sentence — the contribution now leads; method detail moved to the second sentence.',
        targetBlock: 'abstract',
        files: ['main.tex'],
        before: [
          ['d', 'We present a method for editing structured documents by addressing their rendered output rather than their source.'],
          ['k', ' A document is parsed into a tree of blocks, each retaining its source span. Selecting a region of the rendering resolves to a block; a natural-language instruction is then scoped to that block’s span.']
        ],
        after: [
          ['a', 'We edit structured documents by addressing the rendered page directly.'],
          ['k', ' A document is parsed into a tree of blocks, each retaining its source span. Selecting a region of the rendering resolves to a block; a natural-language instruction is then scoped to that block’s span.']
        ],
        diff: '@@ -25,5 +25,4 @@\n-We present a method for editing structured documents by\n-addressing their rendered output rather than their source. A\n-document is parsed into a tree of blocks, each retaining its\n-source span.\n+We edit structured documents by addressing the rendered page\n+directly. A document is parsed into a tree of blocks, each\n+retaining its source span.'
      },
      default: {
        note: 'Applied the requested edit; cross-references and labels preserved.',
        files: ['sections/intro.tex'],
        before: [
          ['k', 'We close this gap with a bidirectional map between rendered coordinates and source spans (1)'],
          ['d', '. A selection in the page becomes a file-and-line pair, which resolves to the enclosing block.']
        ],
        after: [
          ['k', 'We close this gap with a bidirectional map between rendered coordinates and source spans (1)'],
          ['a', '; a selection resolves to the enclosing block of the parsed tree.']
        ],
        diff: '@@ -15,4 +15,3 @@\n We close this gap with a bidirectional map between rendered\n-coordinates and source spans (1). A selection in the page becomes\n-a file-and-line pair, which resolves to the enclosing block.\n+coordinates and source spans (1); a selection resolves to the\n+enclosing block of the parsed tree.'
      }
    },
    // Back-compat: the single canned proposal some cards still reference.
    proposal: {
      note: 'Tightened the opening paragraph and added a forward reference to the method (\u00a72). Removed the filler clause; kept the cross-reference intact.',
      targetBlock: 's1-p1',
      files: ['sections/intro.tex'],
      diff: '@@ -3,7 +3,6 @@\n Authors of technical documents think in terms of what they\n-see \u2014 a paragraph, an equation, a figure \u2014 not in terms of line\n-numbers in a source file. Yet every editing tool asks them to\n-translate between the two. The model is good and works well in\n-many cases, but the translation step is a persistent source of\n-friction.\n+see \u2014 a paragraph, an equation, a figure \u2014 not line numbers in a\n+source file. Yet editors force them to translate between the two,\n+a persistent source of friction we remove in \\S2.'
    }
  };

  /* ---- A TWO-COLUMN paper (NeurIPS/IEEE-style). Blocks carry a column
     hint (full | l | r) so the edit loop can hang each Claude bubble in
     the margin nearest its column. ---- */
  window.STZ_PAPER2 = {
    project: 'sparse-routing',
    mainFile: 'main.tex',
    twoColumn: true,
    files: [
      { path: 'main.tex', active: true },
      { path: 'macros.tex' },
      { path: 'refs.bib' },
      { dir: 'sections', open: true, children: [
        { path: 'sections/intro.tex' },
        { path: 'sections/method.tex' },
        { path: 'sections/experiments.tex' }
      ] },
      { dir: 'figures', children: [
        { path: 'figures/routing.pdf' },
        { path: 'figures/scaling.png' }
      ] }
    ],
    blocks: [
      { id: 'title', kind: 'title', col: 'full', file: 'main.tex', span: '14–16',
        text: 'Sparse Routing for Long-Context Attention' },
      { id: 'authors', kind: 'authors', col: 'full', file: 'main.tex', span: '18–21',
        text: 'A. Reis¹    M. Fernandes¹    J. Costa²' },
      { id: 'affil', kind: 'affil', col: 'full', file: 'main.tex', span: '22',
        text: '¹Instituto Superior Técnico    ²INESC-ID' },
      { id: 'abs-h', kind: 'abshead', col: 'full', file: 'main.tex', span: '26', text: 'Abstract', sec: 'abs' },
      { id: 'abstract', kind: 'abstract', col: 'full', file: 'main.tex', span: '27–34', sec: 'abs',
        text: 'Attention over long contexts is dominated by the quadratic cost of all-pairs interaction. We introduce a learned router that sends each query to a sparse set of key blocks, reducing cost to near-linear while retaining the accuracy of dense attention. The router is trained end-to-end and adds no inference-time hyperparameters.' },

      { id: 's1-h', kind: 'section', col: 'l', file: 'sections/intro.tex', span: '1', text: '1   Introduction', sec: 's1' },
      { id: 'l-p1', kind: 'paragraph', col: 'l', file: 'sections/intro.tex', span: '3–11', sec: 's1',
        text: 'Transformer attention compares every query with every key, so the cost grows with the square of the sequence length. For documents, codebases, and long dialogues this quickly dominates both compute and memory, and a range of sparse and low-rank schemes have been proposed to contain it.' },
      { id: 'l-p2', kind: 'paragraph', col: 'l', file: 'sections/intro.tex', span: '13–19', sec: 's1',
        text: 'Most such schemes fix the sparsity pattern in advance. We instead learn which key blocks each query should attend to, letting the model spend its budget where it matters and adapt the pattern per input.' },
      { id: 's2-h', kind: 'section', col: 'l', file: 'sections/method.tex', span: '1', text: '2   Method', sec: 's2' },
      { id: 'l-p3', kind: 'paragraph', col: 'l', file: 'sections/method.tex', span: '3–12', sec: 's2',
        text: 'Keys are partitioned into contiguous blocks. For each query a lightweight router scores every block and selects the top-k; attention is then computed only against the selected blocks. The score is a dot product against a learned block summary, so routing adds negligible overhead.' },

      { id: 'r-eq', kind: 'equation', col: 'r', file: 'sections/method.tex', span: '14–16',
        text: 'router(q) = top-k( qᵀS )', num: '2' },
      { id: 'r-p1', kind: 'paragraph', col: 'r', file: 'sections/method.tex', span: '18–25', sec: 's2',
        text: 'Here S holds one summary vector per key block. Because the top-k operation is not differentiable, we train the router with a straight-through estimator and a small load-balancing penalty that discourages collapse onto a few blocks.' },
      { id: 's3-h', kind: 'section', col: 'r', file: 'sections/experiments.tex', span: '1', text: '3   Experiments', sec: 's3' },
      { id: 'r-p2', kind: 'paragraph', col: 'r', file: 'sections/experiments.tex', span: '3–10', sec: 's3',
        text: 'On long-context language modeling the router matches dense attention within 0.2 perplexity while attending to a quarter of the keys. End-to-end throughput improves 2.3× at 32k tokens, and the gap widens with sequence length.' },
      { id: 'r-fig', kind: 'figure', col: 'r', file: 'sections/experiments.tex', span: '12–15',
        text: 'Figure 1: Perplexity vs. attended-key fraction. The router (clay) tracks dense attention down to ~25% of keys.' }
    ],
    proposals: {
      'l-p2': {
        note: 'Made the contrast with prior work explicit and named the contribution (learned, per-input routing) up front.',
        files: ['sections/intro.tex'],
        before: [
          ['d', 'Most such schemes fix the sparsity pattern in advance.'],
          ['k', ' We instead learn which key blocks each query should attend to, letting the model spend its budget where it matters '],
          ['d', 'and adapt the pattern per input.']
        ],
        after: [
          ['a', 'Prior schemes fix the sparsity pattern in advance and cannot adapt to the input.'],
          ['k', ' We instead learn which key blocks each query should attend to, letting the model spend its budget where it matters '],
          ['a', '— a pattern chosen per query, end-to-end.']
        ],
        diff: '@@ -13,7 +13,7 @@\n-Most such schemes fix the sparsity pattern in advance. We\n-instead learn which key blocks each query should attend to,\n-letting the model spend its budget where it matters and adapt\n-the pattern per input.\n+Prior schemes fix the sparsity pattern in advance and cannot\n+adapt to the input. We instead learn which key blocks each query\n+should attend to, letting the model spend its budget where it\n+matters; a pattern chosen per query, end-to-end.'
      },
      'r-p2': {
        note: 'Led with the headline result and tightened the throughput claim.',
        files: ['sections/experiments.tex'],
        before: [
          ['k', 'On long-context language modeling the router matches dense attention within 0.2 perplexity while attending to a quarter of the keys. '],
          ['d', 'End-to-end throughput improves 2.3× at 32k tokens, and the gap widens with sequence length.']
        ],
        after: [
          ['k', 'On long-context language modeling the router matches dense attention within 0.2 perplexity while attending to a quarter of the keys. '],
          ['a', 'Throughput improves 2.3× at 32k tokens and 3.1× at 64k, so the advantage grows with context length.']
        ],
        diff: '@@ -3,8 +3,8 @@\n On long-context language modeling the router matches dense\n attention within 0.2 perplexity while attending to a quarter of\n-the keys. End-to-end throughput improves 2.3x at 32k tokens, and\n-the gap widens with sequence length.\n+the keys. Throughput improves 2.3x at 32k tokens and 3.1x at\n+64k, so the advantage grows with context length.'
      },
      default: {
        note: 'Applied the requested edit; cross-references and equation labels preserved.',
        files: ['main.tex'],
        before: [['k', 'We introduce a learned router that sends each query to a sparse set of key blocks, '], ['d', 'reducing cost to near-linear while retaining the accuracy of dense attention.']],
        after: [['k', 'We introduce a learned router that sends each query to a sparse set of key blocks, '], ['a', 'cutting attention cost to near-linear at no measurable loss in accuracy.']],
        diff: '@@ -27,3 +27,3 @@\n a learned router that sends each query to a sparse set of key\n-blocks, reducing cost to near-linear while retaining the\n-accuracy of dense attention.\n+blocks, cutting attention cost to near-linear at no measurable\n+loss in accuracy.'
      }
    }
  };
})();
