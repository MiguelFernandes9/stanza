import { delimiter } from 'node:path'
import { describe, expect, test } from 'vitest'
import { resolveUserPath } from '../resolveUserPath'

const seg = (p: string) => p.split(delimiter)

describe('resolveUserPath', () => {
  test('puts the login-shell PATH ahead of the bare process PATH and fallbacks', () => {
    const out = resolveUserPath({
      platform: 'darwin',
      currentPath: '/usr/bin:/bin',
      probe: () => '/opt/homebrew/bin:/Users/me/.local/bin',
    })
    const dirs = seg(out)
    expect(dirs[0]).toBe('/opt/homebrew/bin')
    expect(dirs[1]).toBe('/Users/me/.local/bin')
    // bare PATH still present, after the probed entries
    expect(dirs.indexOf('/usr/bin')).toBeGreaterThan(dirs.indexOf('/Users/me/.local/bin'))
  })

  test('falls back to the static dirs when the shell probe fails (never throws)', () => {
    const out = resolveUserPath({
      platform: 'darwin',
      currentPath: '/usr/bin:/bin',
      probe: () => null,
    })
    const dirs = seg(out)
    // the well-known CLI homes are injected even though neither probe nor the
    // bare PATH supplied them — this is what unbricks a Finder-launched .app
    expect(dirs).toContain('/opt/homebrew/bin')
    expect(dirs).toContain('/usr/local/bin')
    expect(dirs).toContain('/usr/bin')
    expect(dirs).toContain('/Library/TeX/texbin') // MacTeX/TeX Live — where synctex lives
  })

  test('dedups repeated entries and drops empties, keeping first occurrence', () => {
    const out = resolveUserPath({
      platform: 'darwin',
      currentPath: '/usr/bin::/usr/bin:/opt/homebrew/bin',
      probe: () => '/opt/homebrew/bin',
    })
    const dirs = seg(out)
    expect(dirs.filter((d) => d === '/opt/homebrew/bin')).toHaveLength(1)
    expect(dirs.filter((d) => d === '/usr/bin')).toHaveLength(1)
    expect(dirs).not.toContain('')
  })

  test('leaves PATH untouched on win32 (different inheritance model)', () => {
    const current = 'C:\\Windows\\System32;C:\\Users\\me\\bin'
    const out = resolveUserPath({
      platform: 'win32',
      currentPath: current,
      probe: () => '/should/not/be/used',
    })
    expect(out).toBe(current)
  })
})
