Paper surface container — the base for panes, dialogs, and grouped content.

```jsx
<Card title="Proposal" subtitle="2 files · intro.tex, refs.bib"
      actions={<IconButton label="Close"><XIcon/></IconButton>}>
  …diff…
</Card>
```

`elevation`: `flat | card | raised | pop`. `padding`: `none | sm | md | lg`. Omit `title`/`actions` for a headerless surface.
