The signature Stanza primitive: a chip referencing a block selected in the PDF. Carries a structural glyph, label, and source span; this is what a Claude instruction is scoped to.

```jsx
<BlockTag kind="section" label="Introduction" span="intro.tex:24–31" active onRemove={drop} />
<BlockTag kind="equation" label="eq:energy" span="main.tex:88" />
```

`kind` selects the leading glyph (`section`→§, `paragraph`→¶, `equation`→∑, `figure`, `table`, `itemize`, `citation`→†). `active` shows the selected clay ring.
