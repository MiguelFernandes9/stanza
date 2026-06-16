# Multi-window: open a document → its own window

Status: spec for implementation. Lane: main-process core (session model + window
lifecycle + event routing) + a light renderer change. One focused sibling — this is a
tightly-coupled refactor, not parallelizable.

## Decision (Miguel)

Opening a document opens it in **its own window**. Specifically (macOS document-app
convention): the **first** open from the launcher **reuses that window** (it becomes
the doc window); once a window already shows a document, **File ▸ Open / New / Open
Recent spawn a NEW window**. Multiple document windows coexist, each fully independent.
Opening a document that's already open elsewhere **focuses the existing window** (no
duplicate).

## Why it's a refactor (grounded)

Today the app is single-document: `session` is a **module singleton**
(`ipc-registry.ts:39`), one open document for the whole process. **21
`requireSession()` sites** (`ipc-registry.ts`) all resolve that one session, and
`sendToAll` (`ipc-registry.ts:424`) broadcasts every compile/claude/review/prime event
to **all** windows. A second window would share the one session and cross-receive
another doc's events. `App` loads the (global) doc via `documentCurrent()` on mount
(`App.tsx:35`).

Good news — `DocumentSession` (`session.ts:13`) owns only `compiler/git/review/claude/
files/info` with **no long-lived watcher or process** (the settle watcher is per-op,
armed+disposed inside `runClaudeOp`, `ipc-registry.ts:309-318`; `claude` is stateless
between `-p` calls). So per-window sessions are cheap to create and drop — disposal is
just releasing the map entry.

## The model

1. **Sessions keyed per window.** Replace `let session` with
   `const sessions = new Map<number /*webContents.id*/, DocumentSession>()`.
2. **`requireSession()` → `sessionFor(event)`.** `ipcMain.handle` callbacks already
   receive `event` first; thread it and resolve `sessions.get(event.sender.id)`. Touch
   all **21** sites. (A few non-event callers — menu/protocol — resolve via the focused
   window's id.)
3. **Event routing — per-doc vs global.** Split `sendToAll`:
   - **Per-document** events (`compileStatus`, `claudeStatus`, `reviewProposal`,
     `primeStatus`) → send ONLY to the owning window (`win.webContents.send`). Each
     handler already has the session/window context.
   - **App-global** events (`settingsChanged` — global font/theme) → keep broadcasting
     to **all** windows. (Per-doc settings changes target the owning window.)
4. **Window-open flow — main owns the reuse-vs-new decision.** `documentOpen` /
   `documentCreate` / `openRecent` resolve the calling window:
   - calling window has **no session** (launcher) → create a session bound to
     `event.sender.id`, **return `DocumentInfo`** → renderer `setDoc` (reuse, today's
     path).
   - calling window **has a session** → if a window already holds this `root`, focus
     it; else `createWindow()`, bind a new session to the new window's
     `webContents.id`, load the renderer, and **return `null`/`{openedInNewWindow:true}`**
     so the caller does NOT `setDoc` (the new window shows it).
5. **New-window → doc handshake.** Create the session in the map keyed to the new
   window's `webContents.id` BEFORE/at load; the new window's `App` calls
   `documentCurrent()` → `sessionFor(event)` returns its bound doc. No query-param
   plumbing needed — `documentCurrent` becomes per-window for free.
6. **Lifecycle.** On `win.on('closed')`, `sessions.delete(win.webContents.id)` (drop
   the ref; nothing else to dispose). `window-all-closed` stays as-is (mac keeps
   running); dock-`activate` opens a fresh launcher window (`index.ts:83`).
7. **Crash-restore (L6) still works per-window.** `render-process-gone` → `win.reload()`
   (`index.ts`) keeps the SAME `webContents.id`, so the reloaded `App` re-fetches
   `documentCurrent()` → its still-bound session. No change needed.

## Renderer change (light)

- The File-menu listeners from Lane M (`App.tsx`, `onMenuOpenFolder/New/OpenRecent` →
  `client.documentOpen()` → `setDoc`) stay AS-IS — the reuse-vs-new decision moved to
  main, so they just `setDoc(result)` when a `DocumentInfo` comes back and **do nothing
  when it's `null`** (a new window handled it). `OpenScreen`'s buttons likewise.
- No new renderer state. `App` already keys everything off its one `doc`; each window
  is an independent `App` instance.

## What to watch

- **Thread `event` through all 21 handlers** — a missed one silently resolves the
  wrong/no session. Grep `requireSession(` to enforce zero remaining.
- **Don't broadcast per-doc events** — a leaked `sendToAll` shows window A's compile
  spinner / review proposal in window B. Audit every `sendToAll` call site.
- **`store` stays a process-global singleton** (recents + global settings are app-wide)
  — do NOT per-window it. Only `DocumentSession` is per-window.
- **`getFocusedWindow()` menu actions** (Close Tab `ipc-registry.ts:108`) already act
  on the focused window — fine.
- **Duplicate-open focus**: match by `session.info.root` across the map → `win.focus()`.

## Tests

- Main (unit): `sessionFor` resolves by `event.sender.id`; two sessions coexist
  isolated; closing a window deletes its session; `documentOpen` returns `DocumentInfo`
  for an empty (launcher) window and spawns + returns the new-window marker for a window
  that already has a doc; duplicate root focuses the existing window.
- Routing (unit): a per-doc event targets only its window; `settingsChanged` hits all.
- Live (Miguel): open doc A → window A; from A, File ▸ Open doc B → NEW window B; edit/
  compile/Claude in A and B independently with no cross-talk; re-open A from recents →
  focuses window A, no duplicate; close B → A unaffected.

## Lane / sequencing

Almost entirely `src/main/ipc-registry.ts` (session map + 21 `sessionFor` + routing +
open flow) + `src/main/index.ts` (createWindow returns/loads, lifecycle) + a light
`src/renderer/App.tsx` / `OpenScreen.tsx` (`null` result handling) + maybe one
`window:*` channel. Single focused sibling. It touches the just-merged File-menu
handlers (`App.tsx`) and the per-doc event consumers, so run it as **one lane off
current main** while other work avoids `ipc-registry.ts`.
