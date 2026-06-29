/** Offered spellcheck languages. Each maps to a wooorm `dictionary-<…>` npm
 *  package whose `index.aff` / `index.dic` we fetch from jsDelivr on demand and
 *  cache in user data — nothing is committed to git. Curated, not exhaustive
 *  (CTAN-of-languages is huge); extend the list as needed. */
export interface SpellLanguage {
  /** Our identifier + on-disk folder name. */
  code: string
  /** Shown in the language picker. */
  label: string
  /** npm package (served by jsDelivr) carrying the Hunspell files. */
  pkg: string
}

export const SPELL_LANGUAGES: readonly SpellLanguage[] = [
  { code: 'en', label: 'English (American)', pkg: 'dictionary-en' },
  { code: 'en-gb', label: 'English (British)', pkg: 'dictionary-en-gb' },
  { code: 'en-au', label: 'English (Australian)', pkg: 'dictionary-en-au' },
  { code: 'pt-pt', label: 'Portuguese (Portugal)', pkg: 'dictionary-pt-pt' },
  { code: 'pt-br', label: 'Portuguese (Brazil)', pkg: 'dictionary-pt-br' },
  { code: 'es', label: 'Spanish', pkg: 'dictionary-es' },
  { code: 'fr', label: 'French', pkg: 'dictionary-fr' },
  { code: 'de', label: 'German', pkg: 'dictionary-de' },
  { code: 'it', label: 'Italian', pkg: 'dictionary-it' },
  { code: 'nl', label: 'Dutch', pkg: 'dictionary-nl' }
]

/** American English — the default, auto-fetched on first run. */
export const DEFAULT_SPELL_LANGUAGE = 'en'

export function spellLanguage(code: string): SpellLanguage | undefined {
  return SPELL_LANGUAGES.find((l) => l.code === code)
}

/** jsDelivr URLs for a package's Hunspell files. */
export function dictionaryUrls(pkg: string): { aff: string; dic: string } {
  const base = `https://cdn.jsdelivr.net/npm/${pkg}`
  return { aff: `${base}/index.aff`, dic: `${base}/index.dic` }
}
