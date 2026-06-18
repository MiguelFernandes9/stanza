import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FillerPage } from './FillerPage'

// The pre-/failed-compile surface must be honest: a status, never invented
// document prose. The mock "Block-addressable…" lorem is gone for good.
describe('FillerPage', () => {
  it('shows a compiling surface while the first compile runs — no fake prose', () => {
    const html = renderToStaticMarkup(<FillerPage state="running" errors={0} />)
    expect(html).toContain('Compiling')
    expect(html).not.toContain('Block-addressable')
    // Minimal indicator: spinner + label only, no verbose subtitle.
    expect(html).not.toContain('Rendering the document')
  })

  it('treats idle (first compile pending) as compiling', () => {
    const html = renderToStaticMarkup(<FillerPage state="idle" errors={0} />)
    expect(html).toContain('Compiling')
  })

  it('shows the failed surface with the error count', () => {
    const html = renderToStaticMarkup(<FillerPage state="failed" errors={3} />)
    expect(html).toContain('Compile failed')
    expect(html).toContain('3')
  })

  it('singularises a one-error failure', () => {
    const html = renderToStaticMarkup(<FillerPage state="failed" errors={1} />)
    expect(html).toContain('1 error')
    expect(html).not.toContain('1 errors')
  })
})
