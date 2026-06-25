import { describe, expect, it } from 'vitest'
import { isMac, modKey } from './platform'

describe('platform helpers', () => {
  it('isMac is true only for darwin', () => {
    expect(isMac('darwin')).toBe(true)
    expect(isMac('win32')).toBe(false)
    expect(isMac('linux')).toBe(false)
  })

  it('modKey is the ⌘ glyph on macOS and "Ctrl" on Windows/Linux', () => {
    expect(modKey('darwin')).toBe('⌘')
    expect(modKey('win32')).toBe('Ctrl')
    expect(modKey('linux')).toBe('Ctrl')
  })
})
