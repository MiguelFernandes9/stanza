import { describe, expect, it } from 'vitest'
import { isMac, isWindows, modKey, splitLines, toPosix } from './platform'

describe('platform helpers', () => {
  it('isMac/isWindows match only their platform', () => {
    expect(isMac('darwin')).toBe(true)
    expect(isMac('win32')).toBe(false)
    expect(isWindows('win32')).toBe(true)
    expect(isWindows('linux')).toBe(false)
  })

  it('modKey is the ⌘ glyph on macOS and "Ctrl" on Windows/Linux', () => {
    expect(modKey('darwin')).toBe('⌘')
    expect(modKey('win32')).toBe('Ctrl')
    expect(modKey('linux')).toBe('Ctrl')
  })

  it('toPosix collapses backslashes, preserving drive letters and UNC', () => {
    expect(toPosix('src\\file.tex')).toBe('src/file.tex')
    expect(toPosix('C:\\Users\\me\\proj\\main.tex')).toBe('C:/Users/me/proj/main.tex')
    expect(toPosix('\\\\host\\share\\a.tex')).toBe('//host/share/a.tex')
    expect(toPosix('already/posix.tex')).toBe('already/posix.tex') // unchanged
  })

  it('splitLines treats LF and CRLF identically (same indices)', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c'])
    expect(splitLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']) // no trailing \r
    expect(splitLines('one\r\ntwo')[1]).toBe('two')
  })
})
