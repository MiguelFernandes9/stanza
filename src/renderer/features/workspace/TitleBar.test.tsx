import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TitleBar } from './TitleBar'
import type { AiStatus } from '../assistant/availability'

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

const props = (aiStatus?: AiStatus, onOpenSettings = vi.fn()) => ({
  title: 'Paper',
  mainFile: 'main.tex',
  compile: { state: 'ok' as const, errors: 0, warnings: 0 },
  onCompile: vi.fn(),
  sourceOpen: false,
  onToggleSource: vi.fn(),
  chatOpen: false,
  chatUnread: false,
  onToggleChat: vi.fn(),
  onOpenSettings,
  aiStatus
})

const indicator = (): HTMLElement | null => container.querySelector('[data-testid="ai-status"]')

describe('TitleBar — Claude availability indicator', () => {
  it('shows an offline indicator when unavailable; clicking it opens Settings', () => {
    const onOpenSettings = vi.fn()
    render(<TitleBar {...props({ status: 'unavailable', reason: 'logged-out' }, onOpenSettings)} />)
    expect(indicator()).not.toBeNull()
    act(() => indicator()!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('hides the indicator when available or still checking', () => {
    render(<TitleBar {...props({ status: 'available' })} />)
    expect(indicator()).toBeNull()
    act(() => root.unmount())
    container.remove()
    render(<TitleBar {...props({ status: 'checking' })} />)
    expect(indicator()).toBeNull()
  })
})
