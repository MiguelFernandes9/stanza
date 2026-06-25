/** Cross-platform helpers shared by the main process and the renderer. Kept PURE
 *  and parameterized by the platform string: `process.platform` exists in the main
 *  process and the preload, but NOT in the renderer's isolated world, so the renderer
 *  passes the value the preload bridges (window.stanza.platform). See
 *  src/renderer/lib/platform.ts for the renderer-side convenience wrappers. */
export type Platform = NodeJS.Platform | string

export const isMac = (platform: Platform): boolean => platform === 'darwin'
export const isWindows = (platform: Platform): boolean => platform === 'win32'

/** The platform's command-key label for keyboard hints — the ⌘ glyph on macOS,
 *  "Ctrl" everywhere else (Windows + Linux both use Control). */
export const modKey = (platform: Platform): string => (isMac(platform) ? '⌘' : 'Ctrl')

/** Collapse a path's separators to forward slashes. Every path the app holds is
 *  forward-slash internally; this is the boundary normalizer for paths arriving
 *  from the OS or an external tool on Windows (`path.relative` → backslashes,
 *  synctex `Input:C:\…`). A POSIX path is unchanged. Drive letters and UNC
 *  prefixes survive (`C:\a` → `C:/a`, `\\host\s` → `//host/s`). */
export const toPosix = (p: string): string => p.replace(/\\/g, '/')

/** Split text into lines on LF or CRLF, so a Windows-authored `.tex` (CRLF) maps
 *  to the SAME line array as an LF file — the synctex line-number pipeline (block
 *  parse, \input resolution, log parse) must not carry a trailing `\r`. One entry
 *  per newline, so line indices are identical to `split('\n')` on an LF file. */
export const splitLines = (s: string): string[] => s.split(/\r?\n/)
