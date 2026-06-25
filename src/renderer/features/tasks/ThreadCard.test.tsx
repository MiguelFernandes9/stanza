import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ThreadCard } from './ThreadCard'
import type { EditTask } from './taskStore'

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
function type(el: HTMLTextAreaElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

const handlers = () => ({
  onSubmitTurn: vi.fn(),
  onResolve: vi.fn(),
  onCollapse: vi.fn(),
  onDelete: vi.fn(),
  onOpenReview: vi.fn(),
  refCb: vi.fn()
})

function renderThread(h: ReturnType<typeof handlers>, aiEnabled = true): void {
  const task: EditTask = {
    id: 1,
    blockIds: [],
    instruction: '',
    phase: 'thread-idle',
    proposal: null,
    persistent: true,
    turns: []
  }
  render(<ThreadCard task={task} blocks={[]} aiEnabled={aiEnabled} {...h} />)
}

const sendBtn = (): HTMLButtonElement =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Send')) as HTMLButtonElement

describe('ThreadCard — Claude unavailable', () => {
  it('locks the composer and shows the sign-in notice when AI is off', () => {
    const h = handlers()
    renderThread(h, false)
    const textarea = container.querySelector('textarea')!
    expect(textarea.disabled).toBe(true)
    expect(container.querySelector('[data-testid="ai-disabled-notice"]')).not.toBeNull()
    act(() => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(h.onSubmitTurn).not.toHaveBeenCalled()
  })

  it('sends a follow-up turn when AI is available', () => {
    const h = handlers()
    renderThread(h, true)
    const textarea = container.querySelector('textarea')!
    expect(textarea.disabled).toBe(false)
    expect(container.querySelector('[data-testid="ai-disabled-notice"]')).toBeNull()
    type(textarea, 'expand this')
    act(() => sendBtn().dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(h.onSubmitTurn).toHaveBeenCalledWith('expand this')
  })
})
