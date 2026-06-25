import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ReviewProposal } from '../../../shared/ipc/review'
import { TaskCard } from './TaskCard'
import type { EditTask, TaskPhase } from './taskStore'

// react-dom/client + act() — the repo carries no RTL (matches WholeDocRail.test).
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
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

const proposal: ReviewProposal = {
  opId: 'op1',
  instruction: 'tighten',
  branch: 'stanza/op-op1',
  files: ['main.tex'],
  outsideSpan: [],
  diff: '',
  blocks: [] // required since per-block changes landed; TaskCard summarizes it
}

const handlers = () => ({
  onToggleAdding: vi.fn(),
  onRemoveBlock: vi.fn(),
  onActivate: vi.fn(),
  onUpdate: vi.fn(),
  onSubmit: vi.fn(),
  onDismiss: vi.fn(),
  onCollapse: vi.fn(),
  onTogglePersistent: vi.fn(),
  onResolve: vi.fn(),
  onOpenReview: vi.fn(),
  refCb: vi.fn()
})

function renderPhase(phase: TaskPhase, h: ReturnType<typeof handlers>): void {
  const task: EditTask = {
    id: 1,
    blockIds: [], // whole-doc tag, no PageBlock fixture needed
    instruction: 'tighten',
    phase,
    proposal: phase === 'review' ? proposal : null,
    note: phase === 'noop' ? 'no change' : undefined
  }
  render(<TaskCard task={task} blocks={[]} expanded adding={false} {...h} />)
}

const headerX = (): HTMLElement | null =>
  container.querySelector('button[aria-label="Dismiss"], button[aria-label="Collapse"]')
const byText = (text: string): HTMLElement | undefined =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

describe('TaskCard header X — collapse vs close', () => {
  it('compose (edit): X dismisses, not collapses', () => {
    const h = handlers()
    renderPhase('compose', h)
    expect(headerX()!.getAttribute('aria-label')).toBe('Dismiss')
    click(headerX()!)
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
    expect(h.onCollapse).not.toHaveBeenCalled()
  })

  it('busy (thinking): X is shown and collapses, never dismisses', () => {
    const h = handlers()
    renderPhase('busy', h)
    expect(headerX()).not.toBeNull() // busy now renders the X (was hidden before)
    expect(headerX()!.getAttribute('aria-label')).toBe('Collapse')
    click(headerX()!)
    expect(h.onCollapse).toHaveBeenCalledTimes(1)
    expect(h.onDismiss).not.toHaveBeenCalled()
  })

  it('review (accept/reject): X collapses; Reject button still rejects', () => {
    const h = handlers()
    renderPhase('review', h)
    click(headerX()!)
    expect(h.onCollapse).toHaveBeenCalledTimes(1)
    expect(h.onDismiss).not.toHaveBeenCalled()
    expect(h.onResolve).not.toHaveBeenCalled()
    click(byText('Reject')!)
    expect(h.onResolve).toHaveBeenCalledWith(false)
  })

  it('noop (no changes): X collapses; Dismiss button still removes', () => {
    const h = handlers()
    renderPhase('noop', h)
    expect(headerX()!.getAttribute('aria-label')).toBe('Collapse')
    click(headerX()!)
    expect(h.onCollapse).toHaveBeenCalledTimes(1)
    expect(h.onDismiss).not.toHaveBeenCalled()
    click(byText('Dismiss')!)
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('TaskCard spellcheck', () => {
  it('the compose textarea opts into native spellcheck', () => {
    renderPhase('compose', handlers())
    expect(container.querySelector('textarea')!.getAttribute('spellcheck')).toBe('true')
  })
})
