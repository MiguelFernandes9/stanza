Icon-only button for toolbars, pane headers, and inline row actions. Always pass `label` (used for aria + tooltip).

```jsx
<IconButton label="Recompile"><RefreshIcon/></IconButton>
<IconButton label="Source editor" active><CodeIcon/></IconButton>
```

`variant`: `ghost` (default, transparent) or `solid` (paper + border). `active` shows the clay toggled state. Sizes `sm | md | lg`.
