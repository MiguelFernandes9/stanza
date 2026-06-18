import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { RecentProject } from '@shared/ipc'
import { RecentRow } from './RecentRow'

// No React Testing Library in the repo — drive a real render through
// react-dom/client so we can read the resolved inline styles.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(ui: Parameters<Root['render']>[0]): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const longPath = '/Users/someone/Documents/Projects/a-very-long-unbreakable-project-folder-name/paper'
const longName = 'a-very-long-unbreakable-project-name-with-no-spaces-at-all'

const findByText = (tag: string, text: string): HTMLElement | undefined =>
  [...container.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent === text)

const recent = (over: Partial<RecentProject> = {}): RecentProject => ({
  root: longPath,
  name: longName,
  hasSession: true,
  lastOpened: '2026-02-01T00:00:00Z',
  ...over
})

describe('RecentRow truncation (BUG-51)', () => {
  it('clips the unbreakable path with an ellipsis so it cannot overflow the status', () => {
    render(<RecentRow recent={recent()} onOpen={vi.fn()} />)
    const path = findByText('div', longPath)
    expect(path).toBeDefined()
    expect(path!.style.whiteSpace).toBe('nowrap')
    expect(path!.style.overflow).toBe('hidden')
    expect(path!.style.textOverflow).toBe('ellipsis')
  })

  it('clips a long project name the same way', () => {
    render(<RecentRow recent={recent({ hasSession: false })} onOpen={vi.fn()} />)
    const name = findByText('span', longName)
    expect(name).toBeDefined()
    expect(name!.style.whiteSpace).toBe('nowrap')
    expect(name!.style.overflow).toBe('hidden')
    expect(name!.style.textOverflow).toBe('ellipsis')
  })
})
