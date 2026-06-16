import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OpenScreen } from './OpenScreen'

// BUG-52: the home screen carries no TitleBar, so the frameless (hiddenInset)
// window had no drag region and couldn't be moved. It must mount one.
describe('OpenScreen chrome', () => {
  it('mounts a draggable region so the home window can be moved', () => {
    const noop = (): void => {}
    const html = renderToStaticMarkup(
      <OpenScreen onNewDocument={noop} onOpenFolder={noop} onOpenRecent={noop} error={null} />
    )
    expect(html).toContain('-webkit-app-region:drag')
  })
})
