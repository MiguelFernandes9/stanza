# Native File menu + Settings panel — two parallel lanes

Status: spec for implementation (grounded; the design fan-out's synthesis agent hung,
but its 4 recovered ground reports + direct reads back every file:line below). Lanes:
**M (menu/plumbing)** and **S (settings panel)** — run in PARALLEL against the shared
seam contract; only `App.tsx` + `channels.ts` overlap (distinct regions) → whoever
merges second rebases.

Decisions (Miguel): top bar = the **native macOS menu**; Settings v1 = **4 areas**
(editor font/size [global], main-file selector [per-doc], compiler options [per-doc],
UI theme [global]); scope split = fonts/theme global, compiler/main-file per-document.

## The seam (shared contract — both lanes build against this, nobody redefines it)

- **Channels** (`src/shared/ipc/channels.ts`; preload auto-allowlists any value of
  `IpcChannels`):
  - Lane M adds: `menu:newDocument`, `menu:openFolder`, `menu:openRecent` (payload
    `root: string`), `menu:openSettings`.
  - Lane S adds: `settings:getGlobal`, `settings:setGlobal`, `settings:getDocument`,
    `settings:setDocument`, `settings:changed` (broadcast).
- **App state** (`src/renderer/App.tsx`, the only component on both home + in-doc
  screens): `const [settingsOpen, setSettingsOpen] = useState(false)`.
- **Component**: `<SettingsModal open={settingsOpen} doc={doc} onClose={…}
  onDocChanged={setDoc} />` — Lane S creates + mounts it; reads the `settingsOpen`
  state Lane M adds.
- **Menu→renderer pattern** (already proven by `editorCloseActiveTab`): a channel in
  channels.ts + a `webContents.send(channel)` in the menu click (`menu.ts:29`) + a
  typed `onX` in `src/renderer/lib/ipc.ts` (mirror `onEditorCloseActiveTab` at
  `ipc.ts:99`) + a handler in `App.tsx` (App already arbitrates home-vs-doc for ⌘W:
  `App.tsx:26-29`).

App holds exactly one top-level state today, `doc` (`App.tsx:9`), switching
`OpenScreen` ↔ `Workspace` (`App.tsx:31-32`). Open/create/recents are already wired:
`client.documentOpen()` (picker), `client.documentCreate()`, `client.documentRecents()`
(handlers `ipc-registry.ts:45-97`). The TitleBar Settings button is a **dead
placeholder** (`TitleBar.tsx:126-128`, no onClick) — both lanes' Settings entry point.

## Lane M — native File menu + menu→action plumbing (owns the seam state)

Files: `menu.ts`, `channels.ts` (menu:*), `ipc.ts` (onMenu*), `index.ts` (menu
rebuild + store ordering), `ipc-registry.ts` (export a recents accessor), `App.tsx`
(settingsOpen state + menu listeners + wire TitleBar button).

1. **File submenu** (`menu.ts:24`): New document (⌘N), Open folder… (⌘O), Open Recent
   ▸ (submenu), Settings (⌘,) — keep Close Tab. Each fires
   `getFocusedWindow()?.webContents.send(<channel>)` (Open Recent children carry the
   root).
2. **Open Recent submenu** built in MAIN at menu-build time from the store
   (`store.listProjects()`, `Store.ts:31`, same sort/map as `documentRecents`
   `ipc-registry.ts:87-97`). The store is module-private (`ipc-registry.ts:31`) → export
   a `getRecentProjects()` accessor for `menu.ts`.
3. **Make `buildAppMenu` re-runnable** and call it after `documentOpen`/`documentCreate`
   succeed (they already bump `lastOpened`, `ipc-registry.ts:54`) so Open Recent isn't
   stale. Today it runs once (`index.ts:55`) BEFORE `registerIpcHandlers` — ensure the
   store exists before the first build, or read recents lazily in the click.
4. **App listeners** (`App.tsx`): `onMenuNewDocument` → open the New-doc dialog (lift
   `newDocOpen` from OpenScreen to App, or a shared dialog) → `documentCreate` →
   `setDoc`; `onMenuOpenFolder` → `client.documentOpen()` → `setDoc`; `onMenuOpenRecent`
   → `client.documentOpen({root})` → `setDoc`; `onMenuOpenSettings` →
   `setSettingsOpen(true)` (works on home AND in-doc). Add the `settingsOpen` state +
   thread `onOpenSettings` to TitleBar (wire `TitleBar.tsx:126`).
5. (Optional) `app.addRecentDocument(root)` on open for OS-level Open Recent.

## Lane S — Settings store + panel + the 4-area wiring (owns the modal + mount)

Files: new `src/shared/ipc/settings.ts` (types) + `index.ts` export, `Store.ts`
(per-doc fields + a global store), `channels.ts` (settings:*), `ipc-registry.ts`
(5 handlers), `DocumentService.ts` (mainFile override), `CompileService.ts` (compiler
argv), new `SettingsModal.tsx`, `App.tsx` (mount + apply global live),
`cmExtensions.ts` (font/size from CSS vars), theme CSS.

**Storage (scope-split):**
- GLOBAL → NEW `<userData>/settings.json` (reuse Store's atomic-write/corrupt-tolerant
  load). `GlobalSettings { editorFontFamily?, editorFontSize?, theme?:'light'|'dark'|'system' }`.
- PER-DOC → extend `ProjectRecord` (`Store.ts:6`): `mainFile?: string`, `compile?:
  CompileOptions`. Reuse `getProject`/`setProject`, keyed by `session.info.root`.

**IPC handlers** (`ipc-registry.ts`): `settings:getGlobal`/`setGlobal` (set →
`sendToAll('settings:changed', {global})` via `ipc-registry.ts:367` for live update);
`settings:getDocument` (read ProjectRecord of the open session); `settings:setDocument`
(write; if `mainFile` changed, rebuild the session and RETURN a fresh `DocumentInfo`
so the renderer `setDoc`s — same contract as `fileMutationResult` `ipc-registry.ts:330`;
compiler change just updates the session's CompileService config).

**Main-file switch (root-cause path):** honor the override in `DocumentService.open()`
(`DocumentService.ts:55-71`): after `detectMainFile` (`:190`), prefer
`store.getProject(root).mainFile` when set + still in `texFiles`, else auto-detect.
⚠️ `CompileService` captures `doc` at construction (`CompileService.ts:62`) and does
NOT re-read `session.info` — so a mainFile change must **rebuild the session/compiler**
(mirror `document:open`), not just mutate `session.info`. Validate the chosen file
exists; surface tectonic's error rather than hard-blocking (detection isn't
authoritative).

**Compiler options (honest v1 — tectonic's V2 surface is deliberately small):** argv
is fixed `['-X','compile','--synctex','--keep-logs',target]` (`CompileService.ts:100`).
- SHIP (append after the mandatory flags): `paper-size` (`-Z paper-size=`),
  `shell-escape` (`-Z shell-escape`, for minted/pgf), `continue-on-errors`
  (`-Z continue-on-errors`), optionally `reruns` (`-r N`).
- **BLOCKED — do not expose:** `-Z deterministic-mode` (its help says it *breaks
  SyncTeX* — incompatible with the whole PDF↔source model), output-dir (`pdfPath`/
  `synctexPath` are computed from `<root>/<base>`, `CompileService.ts:68`), engine/
  format selector (no user format dump, per agent-bus memory). **`--synctex` is
  mandatory, always on.** A read-only display of the effective compile command is a
  nice touch.

**Panel UI (`SettingsModal.tsx`, conditional `position:fixed` sibling like
`HistoryDiffOverlay`):** 4 sections — (1) editor font family + size [global], (2)
main-file selector (lists `doc.texFiles`) [per-doc], (3) compiler options [per-doc],
(4) UI theme [global]. On home (no `doc`), disable/hide sections 2+3 (only global font
+ theme apply).

**Apply global live** (`App.tsx`, above Workspace so it applies on home too): startup
effect reads `settings:getGlobal` → `document.documentElement.style.setProperty(
'--font-mono', fam)` + an editor-size var + `data-theme`/swap color tokens; subscribe
`onSettingsChanged` → re-apply, no reload. `cmExtensions.ts` `stanzaTheme` currently
hardcodes `13px`/`var(--font-mono)` (`cmExtensions.ts:20`) — drive font family + size
from the CSS vars App sets. Theme = a `:root` token set toggled by a `data-theme`
attribute (define the dark token set if `theme:'dark'` ships; else theme v1 can be
light-only + accent and the toggle is a stub — flag to Miguel).

## Sequencing / collision

Both branch off current main, build in parallel. Overlap: `App.tsx` (M adds
`settingsOpen` state + menu listeners near the top; S adds the `<SettingsModal>` mount
+ the global-apply effect) and `channels.ts` (M: menu:*, S: settings:* — different
lines). **Merge M first** (it owns the seam state), **S rebases** the App.tsx mount
onto M's `settingsOpen`. No other contention (menu/main vs store/compile/modal are
disjoint).

## Tests

- M: menu click → channel send (unit on the click handlers); App routes each
  `onMenu*` to the right client call / `setSettingsOpen`; Open Recent submenu built
  from a fixture store; buildAppMenu re-runs after open.
- S: global store get/set round-trips + persists to settings.json; `setDocument`
  mainFile change returns a fresh DocumentInfo + rebuilds compiler; compiler flags
  splice into argv with `--synctex --keep-logs` preserved; SettingsModal renders 4
  sections, disables 2+3 with no doc; font/theme apply via CSS vars.
- Live (Miguel): File menu has New/Open/Open Recent/Settings and all work; ⌘, opens
  Settings; change editor font/size + theme → applies live; switch main file → the
  PDF recompiles from the new file; toggle a compiler flag → next ⌘R uses it.
