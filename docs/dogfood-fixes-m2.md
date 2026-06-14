# Dogfood fixes — Manager 2 friction log

Parallel to [`dogfood-fixes.md`](docs/dogfood-fixes.md) (Manager 1's log).
Two managers run at once; each owns its own log file so the two never
merge-conflict — a single-writer append-only doc has no contended lines.

**Conventions.**
- Entries are namespaced **`M2-N`** so they never collide with Manager 1's
  `BUG-N`.
- Each entry: symptom → root cause (file:line) → fix → test → lane.
- Same division of labour: this manager diagnoses; siblings (or this
  manager, in its own worktree) implement; **Miguel merges**.
- This file removes manager-*log* conflicts only. Source changes still
  ride their own branch — code merges are handled per-lane, not here.

---

## M2-1 — PDF blurry at some zoom levels (resolution looks inconsistent)

**Symptom.** Rendered PDF sharpness changes with the zoom level: crisp at
some steps, soft/blurry at others. Default (150%) looks fine, so it only
shows when stepping zoom. Reads as "weird, probably a resolution issue".

**Root cause.** `PageCanvas`
([PdfPageStack.tsx:38](src/renderer/features/pdf/PdfPageStack.tsx#L38))
sizes the canvas backing store and the CSS box inconsistently:

```
canvas.width      = Math.floor(viewport.width * dpr)   // backing: floored
canvas.style.width = `${viewport.width}px`             // CSS: NOT floored
```

The backing store is floored to whole device pixels (a fractional canvas
is illegal), but the CSS size is the raw, *fractional* `viewport.width`.
When `backing / dpr ≠ cssWidth` the browser resamples the bitmap to fit
the box — a blur. Whether they match depends on the zoom: for a 612 pt
Letter page at `dpr = 2`, `612 · zoom · 2` is integral at zoom
**0.5 / 1.0 / 1.5 / 2.0** (sharp) and fractional at **0.6 / 0.7 / 1.1 /
1.3 …** (resampled → blurry). That is the zoom-dependent sharpness.

**Fix.** Derive the CSS size back from the *floored* backing store
(`backing / dpr`) so a CSS pixel always maps to a whole number of backing
pixels and the browser never resamples. Extracted a pure helper
`canvasDims(viewportW, viewportH, dpr)`
([canvasDims.ts](src/renderer/features/pdf/canvasDims.ts)) returning
device-pixel-aligned `{backingWidth, backingHeight, cssWidth, cssHeight}`;
`PageCanvas` now consumes it.

**Test.** `canvasDims.test.ts` — asserts the backing store is floored and
that `cssWidth · dpr === backingWidth` for every zoom step 0.5–2.0 (the
no-resample invariant), plus a `dpr = 1` passthrough. tsc clean, full
suite green (397/397).

**Lane.** `src/renderer/features/pdf/` only — disjoint from Manager 1's
in-flight lanes (BUG-33 = tasks/workspace). Parallel-safe.

**Status.** Diagnosed + implemented in this worktree (uncommitted, pending
Miguel's call on how Manager-2 work lands in main).

**Follow-up (not this bug).** `PageCanvas` re-renders on `[page, scale]`
only, not on `devicePixelRatio` — dragging the window to a display with a
different DPR (or changing display scaling) won't re-rasterize until the
next zoom/scroll. Separate, lower-priority; log as M2-N if it bites.
