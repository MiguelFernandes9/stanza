import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(channel, fn) },
}))

import { configureRendererOrigin } from '../rendererOrigin'
import { ipcMain } from '../ipc/trustedIpc'

const INDEX = '/app/out/renderer/index.html'
const fromUrl = (url: string | undefined) => ({ senderFrame: url === undefined ? null : { url }, sender: { id: 1 } })

beforeEach(() => {
  h.handlers.clear()
  configureRendererOrigin({ indexFile: INDEX })
})
afterEach(() => configureRendererOrigin(null))

describe('trustedIpc.ipcMain.handle', () => {
  test('passes the event and args through for the app renderer', async () => {
    const listener = vi.fn((_e: unknown, a: number, b: number) => a + b)
    ipcMain.handle('math:add', listener)
    const event = fromUrl(pathToFileURL(INDEX).href)
    expect(await h.handlers.get('math:add')!(event, 2, 3)).toBe(5)
    expect(listener).toHaveBeenCalledWith(event, 2, 3)
  })

  test.each([
    ['a foreign file', 'file:///Users/me/evil.html'],
    ['a web page', 'https://evil.example/'],
    ['a destroyed / missing frame', undefined],
  ])('rejects %s without running the handler', async (_label, url) => {
    const listener = vi.fn()
    ipcMain.handle('document:save', listener)
    await expect(h.handlers.get('document:save')!(fromUrl(url), 'main.tex', 'x')).rejects.toThrow(
      'IPC_UNTRUSTED_SENDER',
    )
    expect(listener).not.toHaveBeenCalled()
  })

  test('rejects everything while the origin is unconfigured (fail closed)', async () => {
    configureRendererOrigin(null)
    const listener = vi.fn()
    ipcMain.handle('x', listener)
    await expect(h.handlers.get('x')!(fromUrl(pathToFileURL(INDEX).href))).rejects.toThrow('IPC_UNTRUSTED_SENDER')
    expect(listener).not.toHaveBeenCalled()
  })
})
