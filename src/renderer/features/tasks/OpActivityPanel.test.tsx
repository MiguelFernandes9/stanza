import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { OpActivityPanel } from './OpActivityPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
const render = (ui: Parameters<Root['render']>[0]): void => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(ui))
}
const click = (el: Element): void =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const thinkingBox = (): HTMLElement | null => container.querySelector('[data-thinking]')
const toggle = (): HTMLElement => container.querySelector('[aria-label="Toggle reasoning"]')!

describe('OpActivityPanel', () => {
  it('renders nothing when there is no activity yet', () => {
    render(<OpActivityPanel />)
    expect(container.textContent).toBe('')
    render(<OpActivityPanel activity={{ thinking: '', steps: [] }} />)
    expect(container.textContent).toBe('')
  })

  it('streams the reasoning text and shows the latest step', () => {
    render(<OpActivityPanel activity={{ thinking: 'Weighing two phrasings…', steps: ['Reading intro.tex', 'Editing main.tex'] }} />)
    expect(thinkingBox()?.textContent).toContain('Weighing two phrasings…')
    expect(container.textContent).toContain('Editing main.tex') // latest step
    expect(container.textContent).not.toContain('Reading intro.tex') // only the latest
  })

  it('collapses and re-expands the reasoning body', () => {
    render(<OpActivityPanel activity={{ thinking: 'secret thoughts', steps: [] }} />)
    expect(thinkingBox()).not.toBeNull() // expanded by default
    click(toggle())
    expect(thinkingBox()).toBeNull()
    click(toggle())
    expect(thinkingBox()).not.toBeNull()
  })
})
