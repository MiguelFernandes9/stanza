import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChatPane } from './ChatPane'

// react-dom/client + act() — the repo carries no RTL (matches TaskCard.test).
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(ui: Parameters<Root['render']>[0]): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

// Drive the controlled <textarea> the way React expects (native value setter +
// input event) — the repo carries no RTL user-event helper.
function type(el: HTMLTextAreaElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const props = (over: Partial<Parameters<typeof ChatPane>[0]> = {}): Parameters<typeof ChatPane>[0] => ({
  messages: [],
  busy: false,
  onSubmit: vi.fn(),
  onResolveOp: vi.fn(),
  ...over
})

describe('ChatPane — the one whole-document assistant (⌘J)', () => {
  it('is always usable and submits the typed instruction whole-document on ⌘↵', () => {
    const onSubmit = vi.fn()
    render(<ChatPane {...props({ onSubmit })} />)
    const textarea = container.querySelector('textarea')!
    // Independent of block selection: never disabled, never block-scoped, no
    // "switch to Read mode" hint.
    expect(textarea.disabled).toBe(false)
    expect(container.textContent).toContain('Whole document')
    expect(container.textContent).not.toContain('Read mode')

    type(textarea, 'tighten the intro')
    act(() => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })))
    // No attachments staged → the second arg is undefined.
    expect(onSubmit).toHaveBeenCalledWith('tighten the intro', undefined)
  })

  it('does not submit an empty instruction', () => {
    const onSubmit = vi.fn()
    render(<ChatPane {...props({ onSubmit })} />)
    const textarea = container.querySelector('textarea')!
    act(() => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables Run and refuses to submit while a turn is in flight (busy)', () => {
    const onSubmit = vi.fn()
    render(<ChatPane {...props({ busy: true, onSubmit })} />)
    const textarea = container.querySelector('textarea')!
    const run = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Run'))!
    expect(run.hasAttribute('disabled')).toBe(true)
    type(textarea, 'later')
    act(() => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('opts the composer into native spellcheck', () => {
    render(<ChatPane {...props()} />)
    expect(container.querySelector('textarea')!.getAttribute('spellcheck')).toBe('true')
  })

  it('when Claude is unavailable: disables Run, shows the sign-in notice, refuses ⌘↵', () => {
    const onSubmit = vi.fn()
    render(<ChatPane {...props({ aiEnabled: false, onSubmit })} />)
    const textarea = container.querySelector('textarea')!
    const run = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Run'))!
    expect(run.hasAttribute('disabled')).toBe(true)
    expect(container.querySelector('[data-testid="ai-disabled-notice"]')).not.toBeNull()
    type(textarea, 'do it anyway')
    act(() => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows no sign-in notice when Claude is available', () => {
    render(<ChatPane {...props({ aiEnabled: true })} />)
    expect(container.querySelector('[data-testid="ai-disabled-notice"]')).toBeNull()
  })
})
