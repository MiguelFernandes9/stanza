# Renderer error observability ("the debugger")

Status: spec for implementation. Fixes BUG-43 (silent white screen) and gives
every future intermittent renderer failure a stack trace and a recovery path.
Manager spec; a sibling implements; Miguel merges.

## Problem

A render-time exception unmounts the React tree, leaving only the
`--surface-canvas` background — the "all-white" window. The renderer **process is
still alive** (CSS loaded, bg painted), so main's `render-process-gone` reload
(`src/main/index.ts:37`) never fires — that only catches a dead process (GPU/OOM).
There is no React error boundary, no `window.onerror` / `unhandledrejection`
handler, and no persistent renderer-error log (`console.error` goes to a DevTools
console the user doesn't have open). So a render throw is **silent, unrecoverable,
and untraceable** — we cannot fix the specific throw because we never see it.

## Design — three layers

1. **Root ErrorBoundary** — `src/renderer/ErrorBoundary.tsx`, wrapping `<App/>` in
   `main.tsx`. `getDerivedStateFromError` → render a minimal recovery panel
   (error message + a "Reload" button calling `location.reload()`), styled on the
   existing design tokens — **never white**. `componentDidCatch(error, info)` →
   report `{ message, stack, componentStack }` to main.

2. **Global handlers** — registered in `main.tsx` before render:
   `window.onerror` and `window.addEventListener('unhandledrejection', …)` →
   same report channel. Catches async / event-handler throws that a render
   boundary structurally cannot.

3. **Persistent log + DevTools (main)** — a one-way IPC `app:logError` (renderer →
   main) appends `{ ts, kind, message, stack, componentStack }` as one JSON line
   to `app.getPath('userData')/logs/renderer-errors.log` via a small
   `src/main/errorLog.ts`. Mirror the existing `render-process-gone` event into the
   same file. In dev (`ELECTRON_RENDERER_URL` set), `win.webContents.openDevTools()`
   on the first reported error.

## Contract

`src/shared/ipc`: add an `appLogError` channel and
`RendererError { kind: 'render' | 'window' | 'rejection'; message: string;
stack?: string; componentStack?: string; ts: string }`. Preload exposes
`logError(e: RendererError): void`. A single renderer report helper feeds all
three layers (boundary, onerror, unhandledrejection).

## Why this shape (root cause, not one throw)

One boundary + global handlers catch the **whole class** of renderer errors, not a
single site; the persistent log makes the intermittent cause **diagnosable**; the
recovery panel turns a dead-white app into one-click recovery. After it lands, the
next white-screen leaves a stack in the log → fix that specific throw (likely the
hot geometry math, e.g. `Math.min(...[])` on empty rect/row sets) at the source as
a follow-up. Composes with every future feature — all renderer errors flow through
the same path.

## Tests

- ErrorBoundary: a throwing child renders the fallback (not the app) and calls the
  report helper with a `componentStack` (RTL).
- `errorLog`: `app:logError` appends a JSON line to the log path (tmp dir in test).
- Live (Miguel): force a throw (or wait for the next occurrence) → recovery panel
  + a line in `renderer-errors.log`, not a white screen.

## Lane

Renderer: `main.tsx`, new `ErrorBoundary.tsx`, report helper. Main: `index.ts`
(+ wire DevTools-on-error) + new `errorLog.ts`. Shared: `ipc` channel + type.
Preload: expose `logError`. Self-contained — one sibling. Independent of the
BUG-42 (SPANS_LOCKED) and M2-5 lanes; can run in parallel.
