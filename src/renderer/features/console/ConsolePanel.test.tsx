import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConsolePanel } from './ConsolePanel'
import type { CompileError } from '@shared/ipc'

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
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
const testid = (id: string): HTMLElement | null => container.querySelector(`[data-testid="${id}"]`)
const fixBtn = (): HTMLButtonElement => testid('console-fix') as HTMLButtonElement

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const err = (file: string, line: number | null, message: string): CompileError => ({ file, line, message })
const base = { log: '', state: 'failed' as const, height: 220, onJump: vi.fn(), onFix: vi.fn(), onClose: vi.fn(), busy: false }

describe('ConsolePanel', () => {
  it('lists one row per error with file:line and message', () => {
    render(<ConsolePanel {...base} errors={[err('main.tex', 12, 'Undefined control sequence')]} />)
    expect(container.textContent).toContain('main.tex:12')
    expect(container.textContent).toContain('Undefined control sequence')
  })

  it('clicking an error with a line jumps to its source', () => {
    const onJump = vi.fn()
    render(<ConsolePanel {...base} onJump={onJump} errors={[err('intro.tex', 7, 'Missing $ inserted')]} />)
    click(testid('console-error:intro.tex:7')!)
    expect(onJump).toHaveBeenCalledWith('intro.tex', 7)
  })

  it('does not jump for a lineless error', () => {
    const onJump = vi.fn()
    render(<ConsolePanel {...base} onJump={onJump} errors={[err('main.tex', null, 'Emergency stop')]} />)
    click(testid('console-error:main.tex:')!)
    expect(onJump).not.toHaveBeenCalled()
  })

  it('shows the clean empty state when compile succeeded', () => {
    render(<ConsolePanel {...base} state="ok" errors={[]} />)
    expect(container.textContent).toContain('No problems')
  })

  it('disables Fix with Claude when there are no errors', () => {
    render(<ConsolePanel {...base} state="ok" errors={[]} />)
    expect(fixBtn().disabled).toBe(true)
  })

  it('disables Fix with Claude while busy', () => {
    render(<ConsolePanel {...base} busy errors={[err('main.tex', 1, 'x')]} />)
    expect(fixBtn().disabled).toBe(true)
  })

  it('fires onFix when the enabled button is clicked', () => {
    const onFix = vi.fn()
    render(<ConsolePanel {...base} onFix={onFix} errors={[err('main.tex', 1, 'x')]} />)
    click(fixBtn())
    expect(onFix).toHaveBeenCalledOnce()
  })

  it('disables Fix with Claude when Claude is unavailable, even with errors', () => {
    const onFix = vi.fn()
    render(<ConsolePanel {...base} aiEnabled={false} onFix={onFix} errors={[err('main.tex', 1, 'x')]} />)
    expect(fixBtn().disabled).toBe(true)
    click(fixBtn())
    expect(onFix).not.toHaveBeenCalled()
  })

  it('toggles to the raw-log view', () => {
    render(<ConsolePanel {...base} log="! Undefined control sequence.\nl.12 \\foo" errors={[err('main.tex', 12, 'x')]} />)
    expect(testid('console-log')).toBeNull() // problems view by default
    const logTab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Raw log')!
    click(logTab)
    expect(testid('console-log')!.textContent).toContain('Undefined control sequence')
  })

  it('fires onClose from the close button', () => {
    const onClose = vi.fn()
    render(<ConsolePanel {...base} onClose={onClose} errors={[err('main.tex', 1, 'x')]} />)
    click(container.querySelector('[aria-label="Close console"]')!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
