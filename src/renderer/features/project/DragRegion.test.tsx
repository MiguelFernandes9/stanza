import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DragRegion } from './DragRegion'

// A frameless (hiddenInset) window needs an explicit -webkit-app-region:drag
// strip per top-level screen; jsdom's CSSOM drops the non-standard property,
// so assert against the serialized markup instead.
describe('DragRegion', () => {
  it('emits a draggable app-region strip', () => {
    const html = renderToStaticMarkup(<DragRegion />)
    expect(html).toContain('-webkit-app-region:drag')
  })

  it('clears the inset traffic-light height by default', () => {
    const html = renderToStaticMarkup(<DragRegion />)
    expect(html).toContain('height:38px')
  })

  it('keeps its children clickable by exempting them from the drag region', () => {
    const html = renderToStaticMarkup(
      <DragRegion>
        <button>hi</button>
      </DragRegion>
    )
    expect(html).toContain('-webkit-app-region:no-drag')
    expect(html).toContain('<button')
  })
})
