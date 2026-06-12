Toolbar pill for the LaTeX compile state.

```jsx
<CompilePill state="running" />
<CompilePill state="ok" />
<CompilePill state="failed" errors={3} warnings={1} onClick={openLog} />
```

States: `idle | running | ok | failed`. `running` pulses; `failed` goes red. Error/warning counts render in mono when nonzero.
