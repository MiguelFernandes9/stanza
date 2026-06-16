import type { GlobalSettings } from '@shared/ipc'

/** Resolve a theme choice to the concrete attribute value — 'system' follows
 *  the OS preference. */
export function resolveTheme(theme: GlobalSettings['theme'], prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'dark') return 'dark'
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return 'light' // 'light' | undefined
}

/** Apply global settings to the document root as CSS vars + a data-theme — the
 *  single place fonts/theme become visible. App calls it at startup and on every
 *  settings:changed (no reload). The editor font family overrides --font-mono;
 *  the size sets --stz-editor-font-size (cmExtensions reads it). `el` and
 *  `prefersDark` are injectable for tests. */
export function applyGlobalSettings(
  s: GlobalSettings,
  el: HTMLElement = document.documentElement,
  prefersDark: boolean = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
): void {
  if (s.editorFontFamily) el.style.setProperty('--font-mono', s.editorFontFamily)
  else el.style.removeProperty('--font-mono')

  if (s.editorFontSize) el.style.setProperty('--stz-editor-font-size', `${s.editorFontSize}px`)
  else el.style.removeProperty('--stz-editor-font-size')

  el.setAttribute('data-theme', resolveTheme(s.theme, prefersDark))
}
