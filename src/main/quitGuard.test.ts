import { describe, expect, it } from 'vitest'
import { quitDialogOptions, shouldPromptQuit } from './quitGuard'

describe('shouldPromptQuit', () => {
  it('prompts by default (preference unset)', () => {
    expect(shouldPromptQuit({}, false)).toBe(true)
  })

  it('prompts when confirmBeforeQuit is explicitly true', () => {
    expect(shouldPromptQuit({ confirmBeforeQuit: true }, false)).toBe(true)
  })

  it('skips when the user opted out (confirmBeforeQuit === false)', () => {
    expect(shouldPromptQuit({ confirmBeforeQuit: false }, false)).toBe(false)
  })

  it('skips once the quit is already confirmed (avoids re-prompt loop)', () => {
    expect(shouldPromptQuit({}, true)).toBe(false)
    expect(shouldPromptQuit({ confirmBeforeQuit: true }, true)).toBe(false)
  })
})

describe('quitDialogOptions', () => {
  it('offers Quit (default) / Cancel and a Don\'t-ask-again checkbox', () => {
    const o = quitDialogOptions()
    expect(o.buttons).toEqual(['Quit', 'Cancel'])
    expect(o.defaultId).toBe(0)
    expect(o.cancelId).toBe(1)
    expect(o.checkboxLabel).toBe("Don't ask again")
    expect(o.message).toMatch(/quit/i)
  })
})
