import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Sidebar } from './Sidebar'
import type { CommitInfo, DocumentInfo, FileEntry } from '@shared/ipc'

// No React Testing Library in the repo — drive real handlers through
// react-dom/client + React's act() (mirrors FileTab.test.tsx).
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

const noop = (): void => {}

const baseDoc: DocumentInfo = {
  root: '/Users/me/projects/thesis',
  mainFile: 'main.tex',
  texFiles: ['main.tex']
}

const baseProps = {
  doc: baseDoc,
  width: 280,
  files: [] as FileEntry[],
  blocks: [],
  history: [] as CommitInfo[],
  activeBlock: null,
  onPickBlock: noop,
  onOpenFile: noop,
  onRename: noop,
  onDuplicate: noop,
  onDelete: noop,
  onCreateFile: noop,
  onCreateFolder: noop,
  onUpload: noop,
  onMove: noop,
  onImportFiles: noop,
  onSetMainFile: noop,
  onPickHistory: noop,
  lockedFiles: new Set<string>()
}

function renderSidebar(overrides: Partial<typeof baseProps> = {}): void {
  render(<Sidebar {...baseProps} {...overrides} />)
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe('Sidebar — BUG-50 project icon stays square', () => {
  it('keeps the header icon a fixed 26x26 chip that opts out of flex-shrink under a long path', () => {
    // jsdom has no layout engine, so we cannot measure the squish directly;
    // assert the chip carries the inline style that prevents it (flex-shrink:0)
    // alongside its fixed 26x26 box. Live measurement is Miguel's gate.
    renderSidebar({
      doc: { ...baseDoc, root: '/Users/me/very/deeply/nested/projects/a-thesis-with-a-very-long-name/sub' }
    })
    const icon = container.querySelector('[data-testid="project-icon"]') as HTMLElement
    expect(icon).not.toBeNull()
    expect(icon.style.width).toBe('26px')
    expect(icon.style.height).toBe('26px')
    expect(icon.style.flexShrink).toBe('0')
  })
})

describe('Sidebar — collapsible OUTLINE + HISTORY sections', () => {
  const commit: CommitInfo = { hash: 'c0ffee1', subject: 'Initial commit', iso: '2026-06-16T00:00:00Z', kind: 'other' }

  // Section headers are the only elements carrying aria-expanded.
  const sectionHeader = (title: string): HTMLElement =>
    [...container.querySelectorAll('[aria-expanded]')].find((b) =>
      (b.textContent ?? '').toLowerCase().includes(title.toLowerCase())
    ) as HTMLElement

  it('renders Outline and History open by default', () => {
    renderSidebar({ history: [commit] })
    expect(sectionHeader('Outline').getAttribute('aria-expanded')).toBe('true')
    expect(sectionHeader('History').getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Initial commit')
  })

  it('clicking a section header hides its body; clicking again shows it', () => {
    renderSidebar({ history: [commit] })
    expect(container.textContent).toContain('Initial commit')

    click(sectionHeader('History'))
    expect(container.textContent).not.toContain('Initial commit')
    expect(sectionHeader('History').getAttribute('aria-expanded')).toBe('false')

    click(sectionHeader('History'))
    expect(container.textContent).toContain('Initial commit')
    expect(sectionHeader('History').getAttribute('aria-expanded')).toBe('true')
  })

  it('toggles each section independently', () => {
    renderSidebar({ history: [commit] })
    click(sectionHeader('Outline'))
    // Collapsing Outline must not collapse History.
    expect(sectionHeader('Outline').getAttribute('aria-expanded')).toBe('false')
    expect(sectionHeader('History').getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Initial commit')
  })
})

describe('Sidebar — clickable HISTORY rows (history diff viewer)', () => {
  const commit: CommitInfo = { hash: 'abc1234def', subject: 'Tighten abstract', iso: '2026-06-16T00:00:00Z', kind: 'claude' }

  it('clicking a history row fires onPickHistory with the commit hash', () => {
    const onPickHistory = vi.fn()
    renderSidebar({ history: [commit], onPickHistory })
    const row = container.querySelector('[data-testid="history:abc1234def"]') as HTMLElement
    expect(row).not.toBeNull()
    click(row)
    expect(onPickHistory).toHaveBeenCalledWith('abc1234def')
  })
})
