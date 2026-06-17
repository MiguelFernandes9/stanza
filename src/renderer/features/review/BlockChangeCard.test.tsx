import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BlockChangeCard } from './BlockChangeCard'
import type { BlockChange } from '@shared/blocks/changes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(ui: Parameters<Root['render']>[0]): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}
const card = (): HTMLElement => container.querySelector('[data-testid="block-card"]') as HTMLElement
function click(el: Element): void {
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const change = (over: Partial<BlockChange>): BlockChange => ({
  status: 'modified',
  kind: 'paragraph',
  file: 'main.tex',
  beforeSpan: { file: 'main.tex', startLine: 4, endLine: 4 },
  afterSpan: { file: 'main.tex', startLine: 4, endLine: 4 },
  beforeText: 'Old text.',
  afterText: 'New text.',
  ...over,
})
const noop = (): void => {}

describe('BlockChangeCard', () => {
  it('labels a modified paragraph and word-diffs both sides of the source', () => {
    render(<BlockChangeCard change={change({})} selected={false} onSelect={noop} />)
    expect(container.textContent).toContain('Paragraph')
    expect(container.textContent).toContain('Modified')
    expect(container.textContent).toContain('Old')
    expect(container.textContent).toContain('New')
    expect(container.textContent).toContain('text.')
  })

  it('labels an environment by its name and shows the section title', () => {
    render(<BlockChangeCard change={change({ kind: 'environment', name: 'equation' })} selected={false} onSelect={noop} />)
    expect(container.textContent).toContain('Equation')
    render(<BlockChangeCard change={change({ kind: 'section', name: 'Methods' })} selected={false} onSelect={noop} />)
    expect(container.textContent).toContain('Methods')
  })

  it('reflects the selected state and fires onSelect on click', () => {
    const onSelect = vi.fn()
    render(<BlockChangeCard change={change({})} selected onSelect={onSelect} />)
    expect(card().getAttribute('data-selected')).toBe('true')
    click(card())
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
