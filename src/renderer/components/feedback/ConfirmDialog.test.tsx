import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConfirmDialog } from './ConfirmDialog'

// Lightweight DOM render — the repo carries no React Testing Library, so we
// drive real event handlers through react-dom/client + React's act().
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
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function keydown(key: string): void {
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
}

const button = (name: string): HTMLButtonElement | null =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === name) ?? null

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ConfirmDialog', () => {
  it('renders the title, message, and one button per action', () => {
    render(
      <ConfirmDialog
        title="Unsaved changes"
        message="Save main.tex before closing?"
        actions={[
          { label: 'Save', onClick: vi.fn() },
          { label: 'Discard', onClick: vi.fn() }
        ]}
        onCancel={vi.fn()}
      />
    )
    expect(container.textContent).toContain('Unsaved changes')
    expect(container.textContent).toContain('Save main.tex before closing?')
    expect(button('Save')).not.toBeNull()
    expect(button('Discard')).not.toBeNull()
  })

  it('clicking an action fires its handler and nothing else', () => {
    const save = vi.fn()
    const discard = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        title="t"
        message="m"
        actions={[
          { label: 'Save', onClick: save },
          { label: 'Discard', onClick: discard }
        ]}
        onCancel={onCancel}
      />
    )
    click(button('Save')!)
    expect(save).toHaveBeenCalledTimes(1)
    expect(discard).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('ESC cancels', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog title="t" message="m" actions={[{ label: 'OK', onClick: vi.fn() }]} onCancel={onCancel} />
    )
    keydown('Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('clicking the backdrop cancels', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog title="t" message="m" actions={[{ label: 'OK', onClick: vi.fn() }]} onCancel={onCancel} />
    )
    click(container.querySelector('[data-testid="confirm-backdrop"]')!)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
