Transient notification card shown after an operation (edit applied, reverted, compile failed).

```jsx
<Toast tone="success" title="Edit accepted"
  message="Committed to intro.tex" onDismiss={close} />
<Toast tone="danger" title="Compile failed" message="3 errors in main.tex"
  action={<Button size="sm" variant="secondary">View log</Button>} />
```

Tones: `neutral | accent | success | danger | warn`. A left stripe carries the tone.
