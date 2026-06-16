import { describe, expect, it } from 'vitest'
import { applyGlobalSettings, resolveTheme } from './applyGlobalSettings'

describe('resolveTheme', () => {
  it('returns the literal for light/dark; undefined → light', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme(undefined, true)).toBe('light')
  })
  it('system follows the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('applyGlobalSettings — editor font + theme via CSS vars', () => {
  it('sets --font-mono, --stz-editor-font-size, and data-theme', () => {
    const el = document.createElement('div')
    applyGlobalSettings({ editorFontFamily: 'Menlo, monospace', editorFontSize: 16, theme: 'dark' }, el, false)
    expect(el.style.getPropertyValue('--font-mono')).toBe('Menlo, monospace')
    expect(el.style.getPropertyValue('--stz-editor-font-size')).toBe('16px')
    expect(el.getAttribute('data-theme')).toBe('dark')
  })

  it('clears overrides when unset so the design defaults apply', () => {
    const el = document.createElement('div')
    el.style.setProperty('--font-mono', 'X')
    el.style.setProperty('--stz-editor-font-size', '20px')
    applyGlobalSettings({}, el, false)
    expect(el.style.getPropertyValue('--font-mono')).toBe('')
    expect(el.style.getPropertyValue('--stz-editor-font-size')).toBe('')
    expect(el.getAttribute('data-theme')).toBe('light')
  })

  it('resolves the system theme via the injected preference', () => {
    const el = document.createElement('div')
    applyGlobalSettings({ theme: 'system' }, el, true)
    expect(el.getAttribute('data-theme')).toBe('dark')
  })
})
