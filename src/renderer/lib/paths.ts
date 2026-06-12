/** Resolve a backend-provided file path to a known root-relative file.
 *
 *  IPC contracts return paths relative to the document root, but a regression
 *  (e.g. synctex once returned an absolute realpath, /private/tmp/…) should
 *  degrade gracefully instead of silently breaking file matching. Absolute or
 *  realpath-diverged inputs are suffix-matched against the project's file list;
 *  the longest match wins so nested files beat a bare basename. Unmatched
 *  input is returned untouched. */
export function resolveToKnownFile(file: string, knownFiles: string[]): string {
  if (knownFiles.includes(file)) return file
  let best: string | null = null
  for (const known of knownFiles) {
    if (file.endsWith(`/${known}`) && (best === null || known.length > best.length)) {
      best = known
    }
  }
  return best ?? file
}
