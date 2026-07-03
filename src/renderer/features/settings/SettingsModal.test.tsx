import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DocumentInfo } from '@shared/ipc'
import { client } from '@renderer/lib/client'
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

  it('shows the signed-in account when Claude is available, no auth hint', async () => {
    await mount({ aiStatus: { status: 'available', email: 'me@x.com', subscriptionType: 'max' } })
    expect(sec('ai-status-detail')?.textContent).toContain('me@x.com')
    expect(sec('ai-status-detail')?.textContent).toContain('max')
    expect(sec('ai-auth-hint')).toBeNull()
  })

  it('shows the reason + claude auth login when Claude is unavailable', async () => {
    await mount({ aiStatus: { status: 'unavailable', reason: 'logged-out' } })
    expect(sec('ai-status-detail')?.textContent).toContain('Signed out')
    expect(sec('ai-auth-hint')?.textContent).toContain('claude auth login')
  })

  it('Recheck calls onRecheckAi', async () => {
    const onRecheckAi = vi.fn()
    await mount({ aiStatus: { status: 'unavailable', reason: 'not-installed' }, onRecheckAi })
    act(() => sec('ai-recheck')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onRecheckAi).toHaveBeenCalledOnce()
  })

  // React tracks controlled values, so tests must set via the native prototype
  // setter and dispatch the event React listens for (select: change, input: input).
  const setSelect = (el: HTMLSelectElement, value: string): void => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const setInput = (el: HTMLInputElement, value: string): void => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const modelSelect = (): HTMLSelectElement =>
    container.querySelector('[aria-label="Assistant model"]') as HTMLSelectElement
  const customIdInput = (): HTMLInputElement | null =>
    container.querySelector('[aria-label="Custom model id"]')

  it('offers version-less model aliases plus a Custom option', async () => {
    await mount()
    expect([...modelSelect().options].map((o) => o.value)).toEqual(['', 'fable', 'opus', 'sonnet', 'haiku', '__custom__'])
    expect(customIdInput()).toBeNull() // no custom input until picked
  })

  it('Custom… reveals the id input and persists the typed id', async () => {
    await mount()
    act(() => setSelect(modelSelect(), '__custom__'))
    const input = customIdInput()
    expect(input).not.toBeNull()
    act(() => setInput(input!, 'claude-fable-5'))
    expect(client.settingsSetGlobal).toHaveBeenCalledWith({ claudeModel: 'claude-fable-5' })
  })

  it('a persisted custom id re-opens in custom mode with the id shown', async () => {
    vi.mocked(client.settingsGetGlobal).mockResolvedValueOnce({ claudeModel: 'my-model-x' })
    await mount()
    expect(modelSelect().value).toBe('__custom__')
    expect(customIdInput()?.value).toBe('my-model-x')
  })
})
