import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import type { DocumentInfo } from '@shared/ipc'
import { EditorPane } from './EditorPane'
import type { EditorApi } from './EditorPane'
import { EMPTY_CONTEXT } from './completion/projectContext'

// EditorPane keeps a read-through per-file buffer cache; after a Claude op is
// accepted the file on disk changed, so the open buffer must reload (M3-1).
vi.mock('@renderer/lib/client', () => ({
  client: { documentRead: vi.fn(), documentSave: vi.fn().mockResolvedValue(undefined) }
}))
import { client } from '@renderer/lib/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const doc: DocumentInfo = { root: '/proj', mainFile: 'A.tex', texFiles: ['A.tex'] }
const noop = (): void => {}
const read = client.documentRead as unknown as ReturnType<typeof vi.fn>

let container: HTMLDivElement
let root: Root
let api: EditorApi

const flush = (): Promise<void> => act(async () => { await Promise.resolve(); await Promise.resolve() })
const view = (): EditorView => EditorView.findFromDOM(container.querySelector('.cm-editor')!)!
const docText = (): string => view().state.doc.toString()

function mount(activeFile = 'A.tex'): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root.render(
      <EditorPane
        doc={doc}
        width={320}
        activeFile={activeFile}
        openFiles={['A.tex']}
        projectContext={EMPTY_CONTEXT}
        onSelectFile={noop}
        onCloseFile={noop}
        onReorder={noop}
        onSaveActiveAndCompile={noop}
        errors={[]}
        onForwardSearch={noop}
        register={(a) => {
          api = a
        }}
      />
    )
  )
}

beforeEach(() => read.mockReset())
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('EditorPane.reloadFiles — refresh the open buffer after an accept (M3-1)', () => {
  it('replaces the active buffer with the fresh disk content', async () => {
    read.mockResolvedValue('OLD body')
    mount()
    await flush()
    expect(docText()).toBe('OLD body') // first load from disk

    read.mockResolvedValue('NEW longer body')
    await act(async () => {
      await api.reloadFiles(['A.tex'])
    })
    expect(docText()).toBe('NEW longer body') // reloaded, not the stale cache
  })

  it('skips a dirty buffer — never clobbers unsaved edits', async () => {
    read.mockResolvedValue('OLD body')
    mount()
    await flush()
    // A user edit marks the buffer dirty.
    act(() => view().dispatch({ changes: { from: view().state.doc.length, insert: ' EDITED' } }))
    expect(docText()).toBe('OLD body EDITED')

    read.mockResolvedValue('NEW body')
    await act(async () => {
      await api.reloadFiles(['A.tex'])
    })
    expect(docText()).toBe('OLD body EDITED') // unsaved edit preserved, reload skipped
  })
})
