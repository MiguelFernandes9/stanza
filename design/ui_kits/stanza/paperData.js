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
})();
