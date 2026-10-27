import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import { configureRendererOrigin, isAppRendererUrl, isSafeExternalUrl } from '../rendererOrigin'

const INDEX = '/Applications/Stanza.app/Contents/Resources/app/out/renderer/index.html'
const INDEX_URL = pathToFileURL(INDEX).href

afterEach(() => configureRendererOrigin(null))

describe('isAppRendererUrl (packaged build: file:// index.html)', () => {
  test('accepts the built index.html, with or without query/hash', () => {
    configureRendererOrigin({ indexFile: INDEX })
    expect(isAppRendererUrl(INDEX_URL)).toBe(true)
    expect(isAppRendererUrl(`${INDEX_URL}?win=2#/doc`)).toBe(true)
  })

  test.each([
    ['another local file', 'file:///Users/me/Downloads/evil.html'],
    ['a sibling file in the renderer dir', pathToFileURL(INDEX.replace('index.html', 'evil.html')).href],
    ['a project PDF via the doc protocol', 'stanza-doc://doc/main.pdf'],
    ['a web page', 'https://example.com/'],
    ['a data URL', 'data:text/html,<script>1</script>'],
    ['about:blank', 'about:blank'],
    ['javascript:', 'javascript:alert(1)'],
    ['garbage', 'not a url'],
    ['empty', ''],
  ])('rejects %s', (_label, url) => {
    configureRendererOrigin({ indexFile: INDEX })
    expect(isAppRendererUrl(url)).toBe(false)
  })

  test('a dev-server URL is NOT trusted in a packaged build', () => {
    configureRendererOrigin({ indexFile: INDEX })
    expect(isAppRendererUrl('http://localhost:5173/')).toBe(false)
  })
})

describe('isAppRendererUrl (dev: electron-vite dev server)', () => {
  test('accepts any path on the dev-server origin', () => {
    configureRendererOrigin({ indexFile: INDEX, devUrl: 'http://localhost:5173' })
    expect(isAppRendererUrl('http://localhost:5173/')).toBe(true)
    expect(isAppRendererUrl('http://localhost:5173/index.html?x=1')).toBe(true)
  })

  test.each([
    ['another port', 'http://localhost:5174/'],
    ['another host', 'http://127.0.0.2:5173/'],
    ['https on the same host', 'https://localhost:5173/'],
    ['a userinfo trick', 'http://localhost:5173@evil.com/'],
  ])('rejects %s', (_label, url) => {
    configureRendererOrigin({ indexFile: INDEX, devUrl: 'http://localhost:5173' })
    expect(isAppRendererUrl(url)).toBe(false)
  })
})

describe('isAppRendererUrl (fail closed)', () => {
  test('rejects everything before the origin is configured', () => {
    expect(isAppRendererUrl(INDEX_URL)).toBe(false)
    expect(isAppRendererUrl(undefined)).toBe(false)
  })
})

describe('isSafeExternalUrl', () => {
  test.each(['https://arxiv.org/abs/1234.5678', 'mailto:someone@example.com'])('allows %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(true)
  })

  test.each([
    'http://example.com/',
    'file:///Applications/Calculator.app',
    'smb://evil/share',
    'javascript:alert(1)',
    'x-apple.systempreferences:com.apple.preference.security',
    'vscode://file/etc/passwd',
    'stanza-doc://doc/main.pdf',
    'not a url',
    '',
  ])('denies %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false)
  })
})
