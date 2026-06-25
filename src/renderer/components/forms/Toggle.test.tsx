import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Toggle } from './Toggle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(ui: Parameters<Root['render']>[0]): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}
const sw = (): HTMLButtonElement => container.querySelector('[role="switch"]') as HTMLButtonElement
function click(el: Element): void {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Toggle', () => {
  it('reflects checked in aria-checked', () => {
    render(<Toggle checked aria-label="x" onChange={vi.fn()} />)
    expect(sw().getAttribute('aria-checked')).toBe('true')
  })

  it('clicking toggles to the opposite value', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} aria-label="x" onChange={onChange} />)
    click(sw())
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('disabled does not fire onChange', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} disabled aria-label="x" onChange={onChange} />)
    click(sw())
    expect(onChange).not.toHaveBeenCalled()
  })
})
