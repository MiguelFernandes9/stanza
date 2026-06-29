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
  setUp: true,
  lastOpened: '2026-02-01T00:00:00Z',
  ...over
})

// Keep in sync with REVEAL_W in RecentRow.tsx (the drag-open snap distance).
const REVEAL_W = 88

const row = (): HTMLElement => container.querySelector<HTMLElement>('[data-recent-row]')!
const removeButton = (): HTMLElement | null =>
  container.querySelector<HTMLElement>('[aria-label="Remove from recents"]')

const fire = (target: EventTarget, type: string, clientX = 0): void =>
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX }))
  })

/** Press on the row, move the pointer to `dx` (negative = left), release. */
const drag = (dx: number): void => {
  fire(row(), 'mousedown', 300)
  fire(window, 'mousemove', 300 + dx)
  fire(window, 'mouseup', 300 + dx)
}

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
    render(<RecentRow recent={recent({ setUp: false })} onOpen={vi.fn()} />)
    const name = findByText('span', longName)
    expect(name).toBeDefined()
    expect(name!.style.whiteSpace).toBe('nowrap')
    expect(name!.style.overflow).toBe('hidden')
    expect(name!.style.textOverflow).toBe('ellipsis')
  })
})

describe('RecentRow drag-to-reveal remove', () => {
  it('dragging left past the threshold reveals the Remove action (snaps open)', () => {
    render(<RecentRow recent={recent()} onOpen={vi.fn()} onRemove={vi.fn()} />)
    expect(row().style.transform).toBe('translateX(0px)') // closed
    drag(-(REVEAL_W * 0.6)) // past half → opens
    expect(row().style.transform).toBe(`translateX(-${REVEAL_W}px)`)
    expect(removeButton()).not.toBeNull()
  })

  it('a short drag springs back closed', () => {
    render(<RecentRow recent={recent()} onOpen={vi.fn()} onRemove={vi.fn()} />)
    drag(-10) // under half → closes
    expect(row().style.transform).toBe('translateX(0px)')
  })

  it('clicking Remove (revealed) removes the row, not opens it', () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()
    render(<RecentRow recent={recent()} onOpen={onOpen} onRemove={onRemove} />)
    drag(-(REVEAL_W * 0.6))
    fire(removeButton()!, 'click')
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a drag gesture does not open the project on the trailing click', () => {
    const onOpen = vi.fn()
    render(<RecentRow recent={recent()} onOpen={onOpen} onRemove={vi.fn()} />)
    drag(-(REVEAL_W * 0.6))
    fire(row(), 'click') // the click browsers fire after a drag
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a plain click (no drag) opens the project', () => {
    const onOpen = vi.fn()
    render(<RecentRow recent={recent()} onOpen={onOpen} onRemove={vi.fn()} />)
    fire(row(), 'click')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
