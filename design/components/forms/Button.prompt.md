Primary action control for Stanza — use for any clickable command, from the clay "Apply edit" CTA to ghost toolbar actions.

```jsx
<Button variant="primary" onClick={apply}>Apply edit</Button>
<Button variant="secondary" iconLeft={<RejectIcon/>}>Reject</Button>
<Button variant="ghost" size="sm">Cancel</Button>
```

Variants: `primary` (clay fill — the main action), `secondary` (paper + hairline border), `ghost` (transparent, toolbar), `subtle` (clay tint), `danger` (deletion red). Sizes `sm | md | lg`. Pass `loading` for an inline spinner, `full` to stretch, `iconLeft`/`iconRight` for Lucide icons.
