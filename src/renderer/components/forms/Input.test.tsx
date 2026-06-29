import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Input } from './Input'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(ui: Parameters<Root['render']>[0]): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}
const input = (): HTMLInputElement => container.querySelector('input') as HTMLInputElement

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Input', () => {
  it('forwards value + data-testid/aria-label to the native input', () => {
    render(<Input data-testid="in" aria-label="Name" value="hi" onChange={() => {}} />)
    const el = container.querySelector('[data-testid="in"]') as HTMLInputElement
    expect(el.tagName).toBe('INPUT')
    expect(el.getAttribute('aria-label')).toBe('Name')
    expect(el.value).toBe('hi')
  })

  it('renders a trailing adornment when given', () => {
    render(<Input value="13" onChange={() => {}} trailing={<span>px</span>} />)
    expect(container.textContent).toContain('px')
  })

  // The wrapper owns the focus ring; the inner control must suppress the global
  // :focus-visible box-shadow, else a hard-cornered square ring paints inside the
  // rounded field (the "stray rectangle" regression seen in the New-document name
  // field and Settings dropdowns).
  it('suppresses the global square focus ring on the inner control', () => {
    render(<Input value="x" onChange={() => {}} />)
    expect(input().style.boxShadow).toBe('none')
  })
})
