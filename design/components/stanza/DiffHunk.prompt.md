Renders a unified-diff string as a paper-diff card — the body of a Claude "proposal" in the accept/reject flow.

```jsx
<DiffHunk file="sections/intro.tex" diff={`@@ -24,3 +24,3 @@\n-\\section{Intro}\n+\\section{Introduction}\n We study…`} />
```

Parses `@@` hunk headers and +/− lines into dual-gutter `DiffLine`s and tallies the +/− counts in the header. Pass a raw `git diff` body.
