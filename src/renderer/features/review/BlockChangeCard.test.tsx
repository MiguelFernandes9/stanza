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
const testid = (id: string): HTMLElement | null => container.querySelector(`[data-testid="${id}"]`)
async function clickAsync(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
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
const ok = vi.fn(async () => ({ url: 'data:image/png;base64,AA' }))

describe('BlockChangeCard', () => {
  it('labels a modified paragraph and word-diffs both sides of the source', () => {
    render(<BlockChangeCard change={change({})} onRender={ok} />)
    expect(container.textContent).toContain('Paragraph')
    expect(container.textContent).toContain('Modified')
    // word-diff: "Old" (deleted) and "New" (added) flank the shared " text."
    expect(container.textContent).toContain('Old')
    expect(container.textContent).toContain('New')
    expect(container.textContent).toContain('text.')
  })

  it('labels an environment by its name and shows the section title', () => {
    render(<BlockChangeCard change={change({ kind: 'environment', name: 'equation' })} onRender={ok} />)
    expect(container.textContent).toContain('Equation')
    render(<BlockChangeCard change={change({ kind: 'section', name: 'Methods' })} onRender={ok} />)
    expect(container.textContent).toContain('Methods')
  })

  it('hides the render preview for a preamble change (no body output)', () => {
    render(<BlockChangeCard change={change({ kind: 'preamble' })} onRender={ok} />)
    expect(testid('block-render-toggle')).toBeNull()
  })

  it('renders only the after side for an added block', () => {
    const onRender = vi.fn(async () => ({ url: 'data:image/png;base64,AA' }))
    render(
      <BlockChangeCard
        change={change({ status: 'added', beforeText: '', beforeSpan: undefined, afterText: 'Brand new.' })}
        onRender={onRender}
      />
    )
    expect(container.textContent).toContain('Added')
    expect(container.textContent).toContain('Brand new.')
  })

  it('compiles both sides on demand and shows the rendered images', async () => {
    const onRender = vi.fn(async (side: 'before' | 'after') => ({ url: `data:image/png;base64,${side}` }))
    render(<BlockChangeCard change={change({})} onRender={onRender} />)
    await clickAsync(testid('block-render-toggle')!)
    expect(onRender).toHaveBeenCalledWith('before')
    expect(onRender).toHaveBeenCalledWith('after')
    expect(container.querySelectorAll('img').length).toBe(2)
  })
})
