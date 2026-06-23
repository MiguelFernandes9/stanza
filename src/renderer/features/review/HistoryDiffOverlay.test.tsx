import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HistoryDiffOverlay } from './HistoryDiffOverlay'

// No RTL in the repo — react-dom/client + act() (mirrors FileTab.test.tsx).
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

const button = (name: string): HTMLButtonElement | null =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === name) ?? null

const TWO_FILE_DIFF = `diff --git a/intro.tex b/intro.tex
--- a/intro.tex
+++ b/intro.tex
@@ -1 +1 @@
-old intro
+new intro
diff --git a/method.tex b/method.tex
--- a/method.tex
+++ b/method.tex
@@ -1 +1 @@
-old method
+new method
`

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe('HistoryDiffOverlay', () => {
  it('renders one diff card per changed file', () => {
    render(
      <HistoryDiffOverlay
        subject="claude: edit two files"
        iso="2026-06-16T00:00:00Z"
        diff={TWO_FILE_DIFF}
        files={['intro.tex', 'method.tex']}
        onRestore={() => {}}
        onClose={() => {}}
      />
    )
    const view = container.querySelector('[data-testid="diff-view"]')
    expect(view).not.toBeNull()
    expect(view!.children).toHaveLength(2)
    expect(container.textContent).toContain('intro.tex')
    expect(container.textContent).toContain('method.tex')
  })

  it('shows the commit subject in the header', () => {
    render(
      <HistoryDiffOverlay subject="claude: tighten abstract" iso="2026-06-16T00:00:00Z" diff="" files={[]} onRestore={() => {}} onClose={() => {}} />
    )
    expect(container.textContent).toContain('claude: tighten abstract')
  })

  it('clicking close fires onClose', () => {
    const onClose = vi.fn()
    render(<HistoryDiffOverlay subject="x" iso="2026-06-16T00:00:00Z" diff="" files={[]} onRestore={() => {}} onClose={onClose} />)
    click(container.querySelector('[aria-label="Close"]')!)
    expect(onClose).toHaveBeenCalled()
  })

  it('offers a "Restore to this version" button', () => {
    render(<HistoryDiffOverlay subject="x" iso="2026-06-16T00:00:00Z" diff="" files={[]} onRestore={() => {}} onClose={() => {}} />)
    expect(button('Restore to this version')).not.toBeNull()
  })

  it('clicking Restore fires onRestore and not onClose (it is inside the dialog, not the backdrop)', () => {
    const onRestore = vi.fn()
    const onClose = vi.fn()
    render(
      <HistoryDiffOverlay subject="x" iso="2026-06-16T00:00:00Z" diff="" files={[]} onRestore={onRestore} onClose={onClose} />
    )
    click(button('Restore to this version')!)
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
