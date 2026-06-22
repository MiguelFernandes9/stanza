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

const props = (over: Partial<Parameters<typeof ChatPane>[0]> = {}): Parameters<typeof ChatPane>[0] => ({
  messages: [],
  busy: false,
  chips: [],
  onRemoveChip: vi.fn(),
  onSubmit: vi.fn(),
  onResolveOp: vi.fn(),
  ...over
})

describe('ChatPane — block mode deactivates the assistant composer (F4)', () => {
  it('locks the composer and shows the switch-to-Read hint when disabled', () => {
    const onSubmit = vi.fn()
    render(<ChatPane {...props({ disabled: true, onSubmit })} />)
    const textarea = container.querySelector('textarea')!
    expect(textarea.disabled).toBe(true)
    const run = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Run'))!
    expect(run.hasAttribute('disabled')).toBe(true)
    expect(container.textContent).toContain('Read mode')
    // ⌘↵ while disabled must not submit.
    act(() => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('leaves the composer usable when not disabled', () => {
    render(<ChatPane {...props({ disabled: false })} />)
    const textarea = container.querySelector('textarea')!
    expect(textarea.disabled).toBe(false)
    expect(container.textContent).toContain('edits the')
    expect(container.textContent).not.toContain('Read mode')
  })
})
