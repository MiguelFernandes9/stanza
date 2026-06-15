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

// Drag events: jsdom has no DragEvent, so dispatch a plain Event with a
// dataTransfer stub. React's delegated handler reads nativeEvent.dataTransfer.
function drop(el: Element, draggedFile: string): void {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  ;(event as unknown as { dataTransfer: unknown }).dataTransfer = {
    getData: () => draggedFile,
    setData: vi.fn()
  }
  act(() => el.dispatchEvent(event))
}

const tab = (): HTMLElement => container.querySelector('[data-testid="file-tab"]') as HTMLElement

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('FileTab', () => {
  it('renders the basename, not the full relative path', () => {
    render(<FileTab file="chapters/intro.tex" active={false} dirty={false} onSelect={vi.fn()} onClose={vi.fn()} onReorder={vi.fn()} />)
    expect(container.textContent).toContain('intro.tex')
    expect(container.textContent).not.toContain('chapters/intro.tex')
  })

  it('shows the dirty dot only when dirty', () => {
    render(<FileTab file="main.tex" active dirty onSelect={vi.fn()} onClose={vi.fn()} onReorder={vi.fn()} />)
    expect(container.querySelector('[data-testid="dirty-dot"]')).not.toBeNull()
  })

  it('hides the dirty dot when clean', () => {
    render(<FileTab file="main.tex" active dirty={false} onSelect={vi.fn()} onClose={vi.fn()} onReorder={vi.fn()} />)
    expect(container.querySelector('[data-testid="dirty-dot"]')).toBeNull()
  })

  it('clicking the tab body selects the file', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<FileTab file="ch1.tex" active={false} dirty={false} onSelect={onSelect} onClose={onClose} onReorder={vi.fn()} />)
    click(container.querySelector('[data-testid="tab-body"]')!)
    expect(onSelect).toHaveBeenCalledWith('ch1.tex')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking the ✕ closes the file and does NOT select it', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<FileTab file="ch1.tex" active dirty={false} onSelect={onSelect} onClose={onClose} onReorder={vi.fn()} />)
    click(container.querySelector('[aria-label="Close ch1.tex"]')!)
    expect(onClose).toHaveBeenCalledWith('ch1.tex')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('is draggable', () => {
    render(<FileTab file="ch2.tex" active={false} dirty={false} onSelect={vi.fn()} onClose={vi.fn()} onReorder={vi.fn()} />)
    expect(tab().draggable).toBe(true)
  })

  it('dropping a dragged tab onto it fires onReorder(draggedFile, thisFile)', () => {
    const onReorder = vi.fn()
    render(<FileTab file="ch2.tex" active={false} dirty={false} onSelect={vi.fn()} onClose={vi.fn()} onReorder={onReorder} />)
    drop(tab(), 'main.tex')
    expect(onReorder).toHaveBeenCalledWith('main.tex', 'ch2.tex')
  })

  it('ignores a drop of the tab onto itself', () => {
    const onReorder = vi.fn()
    render(<FileTab file="ch2.tex" active={false} dirty={false} onSelect={vi.fn()} onClose={vi.fn()} onReorder={onReorder} />)
    drop(tab(), 'ch2.tex')
    expect(onReorder).not.toHaveBeenCalled()
  })
})
