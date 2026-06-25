import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Modal } from './Modal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(ui: Parameters<Root['render']>[0]): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}
function click(el: Element): void {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
function keydown(key: string): void {
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Modal', () => {
  it('renders the title and children', () => {
    render(
      <Modal title="Settings" onClose={vi.fn()} testid="m">
        <div>body content</div>
      </Modal>
    )
    expect(container.textContent).toContain('Settings')
    expect(container.textContent).toContain('body content')
  })

  it('ESC closes', () => {
    const onClose = vi.fn()
    render(
      <Modal title="t" onClose={onClose} testid="m">
        <div>x</div>
      </Modal>
    )
    keydown('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a backdrop click closes; an inner click does not', () => {
    const onClose = vi.fn()
    render(
      <Modal title="t" onClose={onClose} testid="m">
        <div data-testid="inner">x</div>
      </Modal>
    )
    click(container.querySelector('[data-testid="inner"]')!)
    expect(onClose).not.toHaveBeenCalled()
    click(container.querySelector('[data-testid="m"]')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
