import { describe, expect, it } from 'vitest'
import {
  clamp,
  clampPaneWidths,
  CONSOLE_MAX,
  CONSOLE_MIN,
  DEFAULT_CONSOLE,
  DEFAULT_EDITOR,
  DEFAULT_SIDEBAR,
  EDITOR_MAX,
  EDITOR_MIN,
  loadPaneWidths,
  savePaneWidths,
  SIDEBAR_MAX,
  SIDEBAR_MIN
} from './usePaneWidths'

const KEY = 'stanza.paneWidths'

function fakeStorage(seed?: Record<string, string>) {
  const mem = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    mem,
    getItem: (k: string): string | null => mem.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      mem.set(k, v)
    }
  }
}

describe('clamp', () => {
  it('bounds a value to [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe('clampPaneWidths', () => {
  it('clamps every pane below its minimum', () => {
    expect(clampPaneWidths({ sidebar: 50, editor: 50, consoleHeight: 10 })).toEqual({
      sidebar: SIDEBAR_MIN,
      editor: EDITOR_MIN,
      consoleHeight: CONSOLE_MIN
    })
  })

  it('clamps every pane above its maximum', () => {
    expect(clampPaneWidths({ sidebar: 9999, editor: 9999, consoleHeight: 9999 })).toEqual({
      sidebar: SIDEBAR_MAX,
      editor: EDITOR_MAX,
      consoleHeight: CONSOLE_MAX
    })
  })

  it('leaves in-range sizes untouched', () => {
    expect(clampPaneWidths({ sidebar: 300, editor: 500, consoleHeight: 250 })).toEqual({
      sidebar: 300,
      editor: 500,
      consoleHeight: 250
    })
  })
})

describe('loadPaneWidths', () => {
  const defaults = { sidebar: DEFAULT_SIDEBAR, editor: DEFAULT_EDITOR, consoleHeight: DEFAULT_CONSOLE }

  it('returns defaults when nothing is stored', () => {
    expect(loadPaneWidths(fakeStorage())).toEqual(defaults)
  })

  it('returns defaults when no storage is available (SSR / disabled)', () => {
    expect(loadPaneWidths(undefined)).toEqual(defaults)
  })

  it('reads stored sizes, clamping out-of-range values', () => {
    const s = fakeStorage({ [KEY]: JSON.stringify({ sidebar: 9999, editor: 400, consoleHeight: 9999 }) })
    expect(loadPaneWidths(s)).toEqual({ sidebar: SIDEBAR_MAX, editor: 400, consoleHeight: CONSOLE_MAX })
  })

  it('falls back to defaults on corrupt JSON', () => {
    expect(loadPaneWidths(fakeStorage({ [KEY]: 'not json {' }))).toEqual(defaults)
  })

  it('fills a missing field with its default', () => {
    const s = fakeStorage({ [KEY]: JSON.stringify({ sidebar: 300 }) })
    expect(loadPaneWidths(s)).toEqual({ sidebar: 300, editor: DEFAULT_EDITOR, consoleHeight: DEFAULT_CONSOLE })
  })
})

describe('savePaneWidths', () => {
  it('writes JSON under stanza.paneWidths', () => {
    const s = fakeStorage()
    savePaneWidths({ sidebar: 300, editor: 500, consoleHeight: 250 }, s)
    expect(JSON.parse(s.mem.get(KEY)!)).toEqual({ sidebar: 300, editor: 500, consoleHeight: 250 })
  })

  it('round-trips through loadPaneWidths', () => {
    const s = fakeStorage()
    savePaneWidths({ sidebar: 320, editor: 600, consoleHeight: 300 }, s)
    expect(loadPaneWidths(s)).toEqual({ sidebar: 320, editor: 600, consoleHeight: 300 })
  })

  it('never throws when storage is unavailable', () => {
    expect(() => savePaneWidths({ sidebar: 300, editor: 500, consoleHeight: 250 }, undefined)).not.toThrow()
  })
})
