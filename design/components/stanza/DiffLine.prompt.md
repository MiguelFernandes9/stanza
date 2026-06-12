A single unified-diff row with dual gutter line numbers and a +/−/context sign.

```jsx
<DiffLine type="del" oldNo={24} text="\\section{Intro}" />
<DiffLine type="add" newNo={24} text="\\section{Introduction}" />
<DiffLine type="context" oldNo={25} newNo={25} text="We study…" />
```

Types: `add | del | context | meta`. Usually rendered by `DiffHunk` from a unified-diff string rather than by hand.
