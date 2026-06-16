import { describe, expect, test, vi } from 'vitest'

// Branding guard: importing the main entry must name the app "Stanza" (so the
// appMenu / About / Dock read Stanza, never "Electron"). Heavy collaborators are
// mocked and `whenReady` never resolves, so the import only runs the top-level
// branding — not window creation.
const h = vi.hoisted(() => ({ name: 'Electron' }))

vi.mock('electron', () => ({
  app: {
    setName: vi.fn((n: string) => {
      h.name = n
    }),
    getName: () => h.name,
    getVersion: () => '0.1.0',
    setAboutPanelOptions: vi.fn(),
    setPath: vi.fn(),
    whenReady: () => new Promise(() => {}), // never resolves → skip the ready callback
    on: vi.fn(),
    dock: { setIcon: vi.fn() }
  },
  BrowserWindow: vi.fn(),
  shell: { openExternal: vi.fn() },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) }
}))
vi.mock('../ipc-registry', () => ({ currentDocRoot: () => null, registerIpcHandlers: vi.fn() }))
vi.mock('../menu', () => ({ buildAppMenu: vi.fn() }))
vi.mock('../protocol', () => ({ registerDocScheme: vi.fn(), handleDocProtocol: vi.fn() }))

import { app } from 'electron'

describe('app branding', () => {
  test('names the app "Stanza" on startup', async () => {
    await import('../index')
    expect(app.setName).toHaveBeenCalledWith('Stanza')
    expect(app.getName()).toBe('Stanza')
  })
})
