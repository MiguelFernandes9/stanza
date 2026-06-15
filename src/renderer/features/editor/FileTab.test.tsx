import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FileTab } from './FileTab'

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
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('FileTab', () => {
  it('renders the basename, not the full relative path', () => {
    render(<FileTab file="chapters/intro.tex" active={false} dirty={false} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(container.textContent).toContain('intro.tex')
    expect(container.textContent).not.toContain('chapters/intro.tex')
  })

  it('shows the dirty dot only when dirty', () => {
    render(<FileTab file="main.tex" active dirty onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(container.querySelector('[data-testid="dirty-dot"]')).not.toBeNull()
  })

  it('hides the dirty dot when clean', () => {
    render(<FileTab file="main.tex" active dirty={false} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(container.querySelector('[data-testid="dirty-dot"]')).toBeNull()
  })

  it('clicking the tab body selects the file', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<FileTab file="ch1.tex" active={false} dirty={false} onSelect={onSelect} onClose={onClose} />)
    click(container.querySelector('[data-testid="tab-body"]')!)
    expect(onSelect).toHaveBeenCalledWith('ch1.tex')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking the ✕ closes the file and does NOT select it', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<FileTab file="ch1.tex" active dirty={false} onSelect={onSelect} onClose={onClose} />)
    click(container.querySelector('[aria-label="Close ch1.tex"]')!)
    expect(onClose).toHaveBeenCalledWith('ch1.tex')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
