Live status indicator for compile / Claude session state.

```jsx
<StatusDot tone="ok" label="Compiled · 0 errors" />
<StatusDot tone="busy" pulse label="Claude is editing…" />
<StatusDot tone="error" label="3 errors" />
```

Tones: `neutral | accent | ok | busy | error | info`. Set `pulse` for in-progress states. Omit `label` for a bare dot.
