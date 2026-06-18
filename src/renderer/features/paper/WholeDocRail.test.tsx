import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EditTask } from '../tasks/taskStore'
import { WholeDocRail } from './WholeDocRail'

// react-dom/client + act() — the repo carries no RTL (matches FileTab.test).
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

const wholeDoc: EditTask = {
  id: 1,
  blockIds: [],
  instruction: 'tighten the whole document',
  phase: 'busy',
  proposal: null
}

const base = {
  openIds: [] as number[],
  adding: false,
  onToggle: vi.fn(),
  onToggleAdding: vi.fn(),
  onActivate: vi.fn(),
  onUpdate: vi.fn(),
  onSubmit: vi.fn(),
  onDismiss: vi.fn(),
  onCollapse: vi.fn(),
  onResolve: vi.fn(),
  onOpenReview: vi.fn()
}

const badge = (): HTMLElement | null => container.querySelector('[data-testid="whole-doc-badge"]')
const bubble = (): HTMLElement | null => container.querySelector('[data-testid="whole-doc-bubble"]')

describe('WholeDocRail', () => {
  it('renders a pinned badge per whole-doc task, no bubble while collapsed', () => {
    render(<WholeDocRail {...base} tasks={[wholeDoc]} />)
    expect(badge()).not.toBeNull()
    // The pinned rail is a pane-relative absolute layer (not page-scroll coords).
    expect(container.querySelector('[data-testid="whole-doc-rail"]')!.getAttribute('style')).toContain(
      'position: absolute'
    )
    expect(bubble()).toBeNull()
  })

  it('clicking the badge toggles the task open', () => {
    const onToggle = vi.fn()
    render(<WholeDocRail {...base} tasks={[wholeDoc]} onToggle={onToggle} />)
    click(badge()!)
    expect(onToggle).toHaveBeenCalledWith(1)
  })

  it('shows the bubble pinned when the task is open', () => {
    render(<WholeDocRail {...base} tasks={[wholeDoc]} openIds={[1]} />)
    expect(bubble()).not.toBeNull()
  })

  it('renders nothing when there are no whole-doc tasks', () => {
    render(<WholeDocRail {...base} tasks={[]} />)
    expect(container.querySelector('[data-testid="whole-doc-rail"]')).toBeNull()
  })

  it('the open busy bubble X collapses (onCollapse), never dismisses', () => {
    const onCollapse = vi.fn()
    const onDismiss = vi.fn()
    render(
      <WholeDocRail {...base} tasks={[wholeDoc]} openIds={[1]} onCollapse={onCollapse} onDismiss={onDismiss} />
    )
    const x = container.querySelector('button[aria-label="Collapse"]')
    expect(x).not.toBeNull() // busy/thinking now shows the header X
    click(x!)
    expect(onCollapse).toHaveBeenCalledWith(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
