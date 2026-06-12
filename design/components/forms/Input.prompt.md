Single-line text field. Sits on a sunken paper well; focuses to a clay ring.

```jsx
<Input placeholder="Search blocks…" iconLeft={<SearchIcon/>} />
<Input mono defaultValue="sections/intro.tex" trailing={<kbd>⌘P</kbd>} />
<Input invalid defaultValue="bad@" />
```

Props: `size`, `iconLeft`, `trailing`, `mono` (path/command voice), `invalid`. Forwards all native input attrs.
