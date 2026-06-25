import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Select } from './Select'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(ui: Parameters<Root['render']>[0]): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}

const select = (): HTMLSelectElement => container.querySelector('select') as HTMLSelectElement

const OPTS = [
  { label: 'A', value: 'a' },
  { label: 'B', value: 'b' }
]

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Select', () => {
  it('renders the options and forwards data-testid + aria-label to the native select', () => {
    render(<Select data-testid="sel" aria-label="Pick" value="a" options={OPTS} />)
    const el = container.querySelector('[data-testid="sel"]') as HTMLSelectElement
    expect(el.tagName).toBe('SELECT')
    expect(el.getAttribute('aria-label')).toBe('Pick')
    expect([...el.options].map((o) => o.value)).toEqual(['a', 'b'])
  })

  it('fires onChange with the chosen value', () => {
    const onChange = vi.fn()
    render(<Select value="a" options={OPTS} onChange={onChange} />)
    act(() => {
      select().value = 'b'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('respects disabled', () => {
    render(<Select value="a" options={OPTS} disabled />)
    expect(select().disabled).toBe(true)
  })

  // The wrapper owns the focus ring; the inner control must suppress the global
  // :focus-visible box-shadow, else a hard-cornered square ring paints inside the
  // rounded field (the "stray rectangle" regression).
  it('suppresses the global square focus ring on the inner control', () => {
    render(<Select value="a" options={OPTS} />)
    expect(select().style.boxShadow).toBe('none')
  })
})
