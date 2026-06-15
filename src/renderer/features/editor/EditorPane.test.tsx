import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DocumentInfo } from '@shared/ipc'
import { EditorPane } from './EditorPane'
import { EMPTY_CONTEXT } from './completion/projectContext'

const doc: DocumentInfo = {
  root: '/proj',
  mainFile: 'main.tex',
  texFiles: ['main.tex', 'ch1.tex', 'ch2.tex']
}

const noop = (): void => {}

function markup(openFiles: string[], activeFile = 'main.tex'): string {
  return renderToStaticMarkup(
    <EditorPane
      doc={doc}
      width={320}
      activeFile={activeFile}
      openFiles={openFiles}
      projectContext={EMPTY_CONTEXT}
      onSelectFile={noop}
      onCloseFile={noop}
      onReorder={noop}
      onDocChanged={noop}
      errors={[]}
      onForwardSearch={noop}
      register={noop}
    />
  )
}

describe('EditorPane tab bar', () => {
  it('renders a tab per OPEN file, not for every project .tex', () => {
    const html = markup(['main.tex', 'ch1.tex'])
    expect(html).toContain('main.tex')
    expect(html).toContain('ch1.tex')
    // ch2.tex is a project file but not open → no tab.
    expect(html).not.toContain('ch2.tex')
  })

  it('gives every tab a close affordance', () => {
    const html = markup(['main.tex', 'ch1.tex'])
    expect(html).toContain('Close main.tex')
    expect(html).toContain('Close ch1.tex')
  })

  it('has no "Source" label in the bar (tabs carry the meaning)', () => {
    expect(markup(['main.tex'])).not.toContain('Source')
  })

  it('shows a placeholder and no tabs when no file is open', () => {
    const html = markup([], '')
    expect(html).toContain('No file open')
    // No tab chips, no close affordances.
    expect(html).not.toContain('Close main.tex')
  })
})
