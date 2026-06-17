/** Build artifacts and noise that never belong in the file sidebar. Single
 *  source of truth shared by the main-side directory walk (`listFiles`) and the
 *  recompile watcher (`FileWatcher`), so the ignore set is defined once.
 *
 *  A PDF is NOT a suffix here on purpose: a `.pdf` can be a figure/asset and
 *  must stay visible. Only the *compiled* output pdf is hidden, and that's done
 *  by exact name (it lives at the repo root as `<mainBase>.pdf`). */
export const BUILD_ARTIFACT_SUFFIXES = [
  '.synctex.gz',
  '.log',
  '.aux',
  '.xdv',
  '.toc',
  '.out',
  '.bbl',
  '.blg',
  '.fls',
  '.fdb_latexmk',
] as const

/** Visual assets that open in the in-app viewer (image tag / pdf.js) rather than
 *  the text editor. Mirrors the 'image' row of FILE_KINDS — kept as a pure path
 *  predicate so the renderer can route a click without a FileEntry. */
const VIEWER_ASSET_RE = /\.(png|jpe?g|gif|svg|pdf|eps)$/i

/** True when a sidebar entry should be hidden: any dotfile (`.DS_Store`,
 *  `.gitignore`, …), any build artifact by suffix, or the compiled output pdf
 *  (`outputPdfRel`, root-relative). Pure. */
export function isHiddenInSidebar(relPath: string, outputPdfRel: string): boolean {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1)
  if (base.startsWith('.')) return true
  if (relPath === outputPdfRel) return true
  const lower = base.toLowerCase()
  return BUILD_ARTIFACT_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

/** True when a path is an image/pdf asset the viewer should render. */
export function isViewerAsset(relPath: string): boolean {
  return VIEWER_ASSET_RE.test(relPath)
}
