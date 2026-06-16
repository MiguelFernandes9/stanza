import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DocumentInfo } from '@shared/ipc'
import { SettingsModal } from './SettingsModal'

vi.mock('@renderer/lib/client', () => ({
  client: {
    settingsGetGlobal: vi.fn().mockResolvedValue({}),
    settingsGetDocument: vi.fn().mockResolvedValue({}),
    settingsSetGlobal: vi.fn().mockResolvedValue({}),
    settingsSetDocument: vi.fn().mockResolvedValue({ doc: null })
  }
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const doc: DocumentInfo = { root: '/p', mainFile: 'main.tex', texFiles: ['main.tex', 'ch1.tex'] }
const noop = (): void => {}

let container: HTMLDivElement
let root: Root

async function mount(props: Partial<Parameters<typeof SettingsModal>[0]> = {}): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <SettingsModal open doc={doc} onClose={noop} onDocChanged={noop} {...props} />
    )
    await Promise.resolve()
  })
}
const sec = (id: string): HTMLElement | null => container.querySelector(`[data-testid="${id}"]`)

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('SettingsModal', () => {
  it('renders the four settings areas', async () => {
    await mount()
    expect(sec('section-editor-font')).not.toBeNull()
    expect(sec('section-main-file')).not.toBeNull()
    expect(sec('section-compiler')).not.toBeNull()
    expect(sec('section-theme')).not.toBeNull()
  })

  it('lists the document texFiles in the main-file selector', async () => {
    await mount()
    const select = container.querySelector('[data-testid="main-file-select"]') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['main.tex', 'ch1.tex'])
    expect(select.disabled).toBe(false)
  })

  it('disables the per-doc sections (main file + compiler) with no document', async () => {
    await mount({ doc: null })
    expect(sec('section-main-file')?.getAttribute('data-disabled')).toBe('true')
    expect(sec('section-compiler')?.getAttribute('data-disabled')).toBe('true')
    expect((container.querySelector('[data-testid="main-file-select"]') as HTMLSelectElement).disabled).toBe(true)
    expect((container.querySelector('[data-testid="paper-size-select"]') as HTMLSelectElement).disabled).toBe(true)
    // global sections stay enabled
    expect(sec('section-editor-font')?.getAttribute('data-disabled')).toBeNull()
    expect(sec('section-theme')?.getAttribute('data-disabled')).toBeNull()
  })

  it('renders nothing when closed', async () => {
    await mount({ open: false })
    expect(sec('settings-modal')).toBeNull()
  })
})
