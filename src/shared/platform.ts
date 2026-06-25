/** Cross-platform helpers shared by the main process and the renderer. Kept PURE
 *  and parameterized by the platform string: `process.platform` exists in the main
 *  process and the preload, but NOT in the renderer's isolated world, so the renderer
 *  passes the value the preload bridges (window.stanza.platform). See
 *  src/renderer/lib/platform.ts for the renderer-side convenience wrappers. */
export type Platform = NodeJS.Platform | string

export const isMac = (platform: Platform): boolean => platform === 'darwin'

/** The platform's command-key label for keyboard hints — the ⌘ glyph on macOS,
 *  "Ctrl" everywhere else (Windows + Linux both use Control). */
export const modKey = (platform: Platform): string => (isMac(platform) ? '⌘' : 'Ctrl')
