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

const base = {
  file: 'ch1.tex',
  index: 0,
  active: false,
  dirty: false,
  dragging: false,
  onSelect: vi.fn(),
  onClose: vi.fn(),
  onDragStartTab: vi.fn(),
  onDragOverTab: vi.fn(),
  onDragEndTab: vi.fn()
}

function renderTab(overrides: Partial<typeof base> = {}): void {
  render(<FileTab {...base} {...overrides} />)
}

function click(el: Element): void {
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

// jsdom has no DragEvent; dispatch a plain Event with a dataTransfer stub and an
// optional clientX. React's delegated handler reads them off the nativeEvent.
function fireDrag(el: Element, type: string, init: { clientX?: number } = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, {
    dataTransfer: { setData: vi.fn(), getData: () => '', effectAllowed: '' },
    clientX: init.clientX ?? 0
  })
  act(() => el.dispatchEvent(event))
}

const tab = (): HTMLElement => container.querySelector('[data-testid="file-tab"]') as HTMLElement

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe('FileTab', () => {
  it('renders the basename, not the full relative path', () => {
    renderTab({ file: 'chapters/intro.tex' })
    expect(container.textContent).toContain('intro.tex')
    expect(container.textContent).not.toContain('chapters/intro.tex')
  })

  it('shows the dirty dot only when dirty', () => {
    renderTab({ active: true, dirty: true })
    expect(container.querySelector('[data-testid="dirty-dot"]')).not.toBeNull()
  })

  it('hides the dirty dot when clean', () => {
    renderTab({ active: true, dirty: false })
    expect(container.querySelector('[data-testid="dirty-dot"]')).toBeNull()
  })

  it('clicking the tab body selects the file', () => {
    const onSelect = vi.fn()
    renderTab({ onSelect })
    click(container.querySelector('[data-testid="tab-body"]')!)
    expect(onSelect).toHaveBeenCalledWith('ch1.tex')
  })

  it('clicking the ✕ closes the file and does NOT select it', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    renderTab({ onSelect, onClose })
    click(container.querySelector('[aria-label="Close ch1.tex"]')!)
    expect(onClose).toHaveBeenCalledWith('ch1.tex')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('is draggable', () => {
    renderTab()
    expect(tab().draggable).toBe(true)
  })

  it('renders ghosted (reduced opacity + dashed outline) while it is the drag source', () => {
    renderTab({ dragging: true })
    expect(tab().style.opacity).toBe('0.4')
    expect(tab().getAttribute('style') ?? '').toContain('dashed')
  })

  it('is fully opaque when not dragging', () => {
    renderTab({ dragging: false })
    expect(tab().style.opacity).toBe('1')
  })

  it('reports the dragged file on drag start', () => {
    const onDragStartTab = vi.fn()
    renderTab({ file: 'ch2.tex', onDragStartTab })
    fireDrag(tab(), 'dragstart')
    expect(onDragStartTab).toHaveBeenCalledWith('ch2.tex')
  })

  it('reports the insertion gap on drag over (left half → its own index)', () => {
    const onDragOverTab = vi.fn()
    renderTab({ index: 2, onDragOverTab })
    fireDrag(tab(), 'dragover', { clientX: 0 }) // jsdom rect is 0-width → left half
    expect(onDragOverTab).toHaveBeenCalledWith(2)
  })

  it('clears the drag on drag end', () => {
    const onDragEndTab = vi.fn()
    renderTab({ onDragEndTab })
    fireDrag(tab(), 'dragend')
    expect(onDragEndTab).toHaveBeenCalled()
  })
})
