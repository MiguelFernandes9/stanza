import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { installNavigationGuards } from '../navigationGuard'
import { configureRendererOrigin } from '../rendererOrigin'

const INDEX = '/app/out/renderer/index.html'
const APP_URL = pathToFileURL(INDEX).href

/** A fake WebContents: an EventEmitter that records its window-open handler. */
class FakeContents extends EventEmitter {
  openHandler?: (d: { url: string }) => { action: string }
  setWindowOpenHandler(fn: (d: { url: string }) => { action: string }): void {
    this.openHandler = fn
  }
}

const navEvent = (url: string) => ({ url, preventDefault: vi.fn() })

let app: EventEmitter
let openExternal: ReturnType<typeof vi.fn>
let contents: FakeContents

beforeEach(() => {
  configureRendererOrigin({ indexFile: INDEX })
  app = new EventEmitter()
  openExternal = vi.fn(async () => {})
  installNavigationGuards(app as never, { openExternal } as never)
  contents = new FakeContents()
  app.emit('web-contents-created', {}, contents)
})
afterEach(() => configureRendererOrigin(null))

describe('installNavigationGuards', () => {
  test('will-navigate to a foreign URL is cancelled; the app URL is allowed', () => {
    const bad = navEvent('https://evil.example/')
    contents.emit('will-navigate', bad, bad.url)
    expect(bad.preventDefault).toHaveBeenCalled()

    const good = navEvent(APP_URL)
    contents.emit('will-navigate', good, good.url)
    expect(good.preventDefault).not.toHaveBeenCalled()
  })

  test('will-frame-navigate (main or sub frame) to a foreign URL is cancelled', () => {
    const bad = navEvent('file:///Users/me/evil.html')
    contents.emit('will-frame-navigate', bad)
    expect(bad.preventDefault).toHaveBeenCalled()

    const good = navEvent(`${APP_URL}#/x`)
    contents.emit('will-frame-navigate', good)
    expect(good.preventDefault).not.toHaveBeenCalled()
  })

  test('window.open always denies; only https/mailto reach the system handler', () => {
    expect(contents.openHandler!({ url: 'https://arxiv.org/' })).toEqual({ action: 'deny' })
    expect(contents.openHandler!({ url: 'mailto:a@b.c' })).toEqual({ action: 'deny' })
    expect(contents.openHandler!({ url: 'file:///Applications/Calculator.app' })).toEqual({ action: 'deny' })
    expect(contents.openHandler!({ url: 'smb://evil/share' })).toEqual({ action: 'deny' })
    expect(openExternal.mock.calls.map((c) => c[0])).toEqual(['https://arxiv.org/', 'mailto:a@b.c'])
  })
})
