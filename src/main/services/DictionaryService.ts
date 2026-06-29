import { net } from 'electron'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dictionaryUrls, spellLanguage, SPELL_LANGUAGES } from '@shared/spell/languages'

export interface Dictionary {
  aff: string
  dic: string
}

/** Fetch a URL's text. Injectable so the service unit-tests without network. */
export type Fetcher = (url: string) => Promise<string>

const netFetch: Fetcher = async (url) => {
  const res = await net.fetch(url)
  if (!res.ok) throw new Error(`dictionary fetch failed (${res.status}): ${url}`)
  return res.text()
}

/** Downloads + caches Hunspell dictionaries under <userData>/dictionaries/<code>.
 *  nspell runs in the renderer; this only fetches/persists the bytes (via
 *  Electron's proxy-aware net.fetch) and hands them back over IPC. Nothing is
 *  bundled in git — the default language is fetched on first run. */
export class DictionaryService {
  private readonly inflight = new Map<string, Promise<Dictionary>>()

  constructor(
    private readonly dir: string,
    private readonly fetch: Fetcher = netFetch
  ) {}

  /** The dictionary for `code`, downloading + persisting it on first use.
   *  Concurrent calls for the same code share one download. Throws if the code
   *  is unknown or the download fails (offline / 404). */
  ensure(code: string): Promise<Dictionary> {
    const existing = this.inflight.get(code)
    if (existing) return existing
    const p = this.load(code).finally(() => this.inflight.delete(code))
    this.inflight.set(code, p)
    return p
  }

  /** Codes currently cached on disk (for the picker's installed indicator). */
  async installed(): Promise<string[]> {
    const checks = SPELL_LANGUAGES.map(async (l) =>
      (await this.onDisk(join(this.dir, l.code, 'index.dic'))) ? l.code : null
    )
    return (await Promise.all(checks)).filter((c): c is string => c !== null)
  }

  private async load(code: string): Promise<Dictionary> {
    const lang = spellLanguage(code)
    if (!lang) throw new Error(`unknown spell language: ${code}`)
    const folder = join(this.dir, code)
    const affPath = join(folder, 'index.aff')
    const dicPath = join(folder, 'index.dic')

    const cached = await this.readCached(affPath, dicPath)
    if (cached) return cached

    const urls = dictionaryUrls(lang.pkg)
    const [aff, dic] = await Promise.all([this.fetch(urls.aff), this.fetch(urls.dic)])
    await mkdir(folder, { recursive: true })
    await this.atomicWrite(affPath, aff)
    await this.atomicWrite(dicPath, dic)
    return { aff, dic }
  }

  private async readCached(affPath: string, dicPath: string): Promise<Dictionary | null> {
    try {
      const [aff, dic] = await Promise.all([readFile(affPath, 'utf8'), readFile(dicPath, 'utf8')])
      return { aff, dic }
    } catch {
      return null // not cached yet
    }
  }

  private async onDisk(path: string): Promise<boolean> {
    return access(path).then(() => true, () => false)
  }

  /** temp + rename so a crash mid-write never leaves a half-file (mirrors Store). */
  private async atomicWrite(path: string, data: string): Promise<void> {
    const tmp = `${path}.tmp`
    await writeFile(tmp, data)
    await rename(tmp, path)
  }
}
