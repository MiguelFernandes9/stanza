Toggle for binary settings (auto-recompile, side-by-side diff, etc).

```jsx
<Switch checked={auto} onChange={setAuto} label="Auto-recompile" />
```

`onChange` receives the next boolean. Sizes `sm | md`. Omit `label` for a bare toggle.
