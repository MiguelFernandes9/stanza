# App branding — name "Stanza" + Stanza icon (kill the Electron defaults)

Status: spec for implementation. Lane: build/main + assets. Independent of all other
lanes (home-chrome, menu/settings, rail). One sibling.

## Ask (Miguel)

Stop showing "Electron" as the app name and the Electron icon — it should be Stanza,
name and icon, everywhere (Dock, menu bar, window, About).

## Current state (grounded)

- `package.json`: `name: "stanza"`, **no `productName`**, **no packaging config** (no
  electron-builder / forge — only `electron-vite` for dev+build). Scripts stop at
  `electron-vite build` (no `package`/`dist`).
- `src/main/index.ts`: **no `app.setName`**, **no window `icon`**, no About panel.
  BrowserWindow opts at `:16-29`; `app.whenReady().then(...)` at `:54`.
- **No icon assets** anywhere (only `node_modules/.../Electron.app/.../electron.icns`).
  The brand mark exists only as an in-app SVG: `features/project/StanzaMark.tsx` (the
  clay rounded-square + glyph used on the home screen + sidebar header).

So dev runs the raw Electron binary (`Electron.app`) → "Electron" name + icon. Root
cause: the app is never named and never given an icon, and isn't packaged.

## Fix — two halves

### A. Dev branding (immediate — the daily `electron-vite dev` experience)

1. **Name.** `app.setName('Stanza')` at the TOP of `main/index.ts` (before
   `app.whenReady`, alongside `registerDocScheme()` `:7`). Makes `app.name` =
   "Stanza" → the custom `role:'appMenu'` (`menu.ts`) renders "Stanza", and the
   About panel + notifications use it.
   - ⚠️ **Side effect:** `app.setName` before first `getPath('userData')` use also
     moves the default userData dir from `…/Electron` to `…/Stanza`. The per-project
     store (`infra/Store.ts`) relocates → existing dev recents/ops look "reset" once.
     One-time, acceptable; the `STANZA_USER_DATA` test seam (`index.ts:11`) is
     unaffected. Note it in the PR.
2. **macOS Dock icon (dev).** In `whenReady`, mac only:
   `app.dock?.setIcon(nativeImage.createFromPath(<icon.png>))`. (On macOS the per-
   window `icon` is ignored — the Dock is the lever in dev.)
3. **Window icon (Win/Linux).** Add `icon: <icon.png>` to the BrowserWindow opts
   (`index.ts:16`). No-op on mac, correct elsewhere.
4. **About panel.** `app.setAboutPanelOptions({ applicationName:'Stanza', applicationVersion: app.getVersion() })`.

### B. Icon assets

Generate from the existing brand, so the OS icon matches the in-app mark:

1. Author a **1024×1024 master PNG** from `StanzaMark.tsx` — the glyph on a clay
   rounded-square (the same mark on the home screen / sidebar). Keep the source SVG in
   the repo (`build/icon.svg`) next to the master so it's regenerable.
2. Produce the set: **`icon.icns`** (mac), **`icon.ico`** (win), **`icon.png`** (≥512,
   Linux + the dev Dock). Use a dev-time generator (`electron-icon-builder` or
   `png2icns`, or mac `iconutil`). Commit the generated assets under `build/`
   (electron-builder's default `buildResources`).

### C. Packaging (durable — a real distributable named Stanza)

Add **electron-builder** (devDep) + config so a built app IS `Stanza.app` with the
icon (not just a dev override):

```jsonc
// package.json
"productName": "Stanza",
"build": {
  "appId": "com.miguelfernandes.stanza",
  "productName": "Stanza",
  "directories": { "buildResources": "build" },
  "files": ["out/**"],
  "mac":   { "icon": "build/icon.icns", "category": "public.app-category.productivity" },
  "win":   { "icon": "build/icon.ico" },
  "linux": { "icon": "build/icon.png" }
}
```
+ a script: `"dist": "electron-vite build && electron-builder"`.

- ⚠️ **Code-signing / notarization (mac) is DEFERRED** — needs an Apple Developer
  cert. The unsigned build still shows the Stanza name + icon (Gatekeeper warns only
  on distribution to other machines; fine for personal dogfooding). Don't block on it.

## Tests

- Unit/smoke: `app.getName() === 'Stanza'` (guard the setName call). Build assets
  exist (`build/icon.icns`/`.ico`/`.png`).
- Live (Miguel): `npm run dev` → Dock + menu bar show "Stanza" + the Stanza icon;
  About shows Stanza. `npm run dist` → `Stanza.app` (or platform pkg) with the icon.

## Lane / owner

`src/main/index.ts` (setName + dock/window icon + About), `package.json` (productName
+ build + dist script + electron-builder devDep), new `build/` assets (icon.svg +
icns/ico/png). Self-contained, no overlap with home-chrome / menu-settings / rail
lanes. Owner: a free sibling. Commit A (dev branding + assets) first = immediate
relief; commit B (packaging) second.
