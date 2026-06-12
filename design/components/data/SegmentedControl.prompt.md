Compact mutually-exclusive switch (diff view mode, tabs, filters).

```jsx
<SegmentedControl
  value={view}
  onChange={setView}
  options={[{value:'inline',label:'Inline'},{value:'split',label:'Side-by-side'}]} />
```

Options may be plain strings or `{ value, label, icon }`. Active segment lifts to a paper chip.
