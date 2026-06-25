import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, ContextMenuParams, WebContents } from 'electron'

const mocks = vi.hoisted(() => ({
  popup: vi.fn(),
  buildFromTemplate: vi.fn(),
  setSpellCheckerEnabled: vi.fn()
}))
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: mocks.buildFromTemplate },
  session: { defaultSession: { setSpellCheckerEnabled: mocks.setSpellCheckerEnabled } }
}))

import { buildSpellingTemplate, installSpellcheckMenu, setSpellcheckEnabled } from '../spellcheck'

function fakeSpeller(): WebContents {
  return {
    replaceMisspelling: vi.fn(),
    session: { addWordToSpellCheckerDictionary: vi.fn() }
  } as unknown as WebContents
}
const params = (misspelledWord: string, dictionarySuggestions: string[]): ContextMenuParams =>
  ({ misspelledWord, dictionarySuggestions }) as ContextMenuParams

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildFromTemplate.mockReturnValue({ popup: mocks.popup })
})

describe('buildSpellingTemplate', () => {
  it('lists each suggestion; clicking one replaces the misspelling in place', () => {
    const wc = fakeSpeller()
    const items = buildSpellingTemplate(wc, params('teh', ['the', 'tech']))
    expect(items.slice(0, 2).map((i) => i.label)).toEqual(['the', 'tech'])
    ;(items[0].click as () => void)()
    expect(wc.replaceMisspelling).toHaveBeenCalledWith('the')
  })

  it('shows a disabled "No Guesses Found" when the dictionary is empty', () => {
    const items = buildSpellingTemplate(fakeSpeller(), params('asdf', []))
    expect(items[0]).toMatchObject({ label: 'No Guesses Found', enabled: false })
  })

  it('always ends with Add to Dictionary → addWordToSpellCheckerDictionary(word)', () => {
    const wc = fakeSpeller()
    const items = buildSpellingTemplate(wc, params('asdf', []))
    const add = items[items.length - 1]
    expect(add.label).toBe('Add to Dictionary')
    ;(add.click as () => void)()
    expect(wc.session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith('asdf')
  })
})

describe('installSpellcheckMenu', () => {
  function fakeWin(): { win: BrowserWindow; fire: (p: ContextMenuParams) => void } {
    let handler: ((e: unknown, p: ContextMenuParams) => void) | undefined
    const win = {
      webContents: {
        on: vi.fn((_evt: string, cb: (e: unknown, p: ContextMenuParams) => void) => {
          handler = cb
        }),
        replaceMisspelling: vi.fn(),
        session: { addWordToSpellCheckerDictionary: vi.fn() }
      }
    } as unknown as BrowserWindow
    return { win, fire: (p) => handler?.(null, p) }
  }

  it('pops a menu over a misspelled word', () => {
    const { win, fire } = fakeWin()
    installSpellcheckMenu(win)
    fire(params('teh', ['the']))
    expect(mocks.buildFromTemplate).toHaveBeenCalledOnce()
    expect(mocks.popup).toHaveBeenCalledWith({ window: win })
  })

  it('does nothing when the word is not misspelled (keeps off the editor)', () => {
    const { win, fire } = fakeWin()
    installSpellcheckMenu(win)
    fire(params('', []))
    expect(mocks.buildFromTemplate).not.toHaveBeenCalled()
    expect(mocks.popup).not.toHaveBeenCalled()
  })
})

describe('setSpellcheckEnabled', () => {
  it('flips the session spellchecker both ways', () => {
    setSpellcheckEnabled(false)
    expect(mocks.setSpellCheckerEnabled).toHaveBeenCalledWith(false)
    setSpellcheckEnabled(true)
    expect(mocks.setSpellCheckerEnabled).toHaveBeenCalledWith(true)
  })
})
