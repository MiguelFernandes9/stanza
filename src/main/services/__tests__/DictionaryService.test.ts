import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ net: { fetch: vi.fn() } })) // satisfy the import; tests inject a fetcher

import { DictionaryService } from '../DictionaryService'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'stanza-dict-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function fakeFetcher() {
  const calls: string[] = []
  const fetch = vi.fn(async (url: string) => {
    calls.push(url)
    return url.endsWith('.aff') ? 'AFF-DATA' : 'DIC-DATA'
  })
  return { fetch, calls }
}

describe('DictionaryService', () => {
  it('downloads aff+dic, caches to disk, and returns the content', async () => {
    const dir = tmp()
    const { fetch, calls } = fakeFetcher()
    const d = await new DictionaryService(dir, fetch).ensure('en')
    expect(d).toEqual({ aff: 'AFF-DATA', dic: 'DIC-DATA' })
    expect(calls).toHaveLength(2)
    expect(readFileSync(join(dir, 'en', 'index.dic'), 'utf8')).toBe('DIC-DATA')
  })

  it('reads from disk on the second call (no re-download)', async () => {
    const dir = tmp()
    const { fetch } = fakeFetcher()
    const svc = new DictionaryService(dir, fetch)
    await svc.ensure('en')
    fetch.mockClear()
    expect((await svc.ensure('en')).dic).toBe('DIC-DATA')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('dedups concurrent downloads of the same code', async () => {
    const { fetch, calls } = fakeFetcher()
    const svc = new DictionaryService(tmp(), fetch)
    await Promise.all([svc.ensure('en'), svc.ensure('en'), svc.ensure('en')])
    expect(calls).toHaveLength(2) // aff + dic once, not 6
  })

  it('throws on an unknown language code', async () => {
    await expect(new DictionaryService(tmp(), fakeFetcher().fetch).ensure('klingon')).rejects.toThrow(
      'unknown spell language'
    )
  })

  it('installed() lists only codes present on disk', async () => {
    const svc = new DictionaryService(tmp(), fakeFetcher().fetch)
    expect(await svc.installed()).toEqual([])
    await svc.ensure('en')
    await svc.ensure('fr')
    expect((await svc.installed()).sort()).toEqual(['en', 'fr'])
  })
})
