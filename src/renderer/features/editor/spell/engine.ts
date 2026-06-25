import nspell from 'nspell'
import { LATEX_TERMS } from './latexTerms'

/** Self-contained spell engine: nspell (Hunspell in JS) + the bundled en_US
 *  dictionary. We run our own checker instead of the OS spellchecker because
 *  only we know which ranges are LaTeX prose vs markup — the native checker
 *  squiggles the whole text box indiscriminately. The ~550KB .dic is a `?raw`
 *  asset loaded as a separate chunk on first use, so it never weighs on startup. */

type Speller = ReturnType<typeof nspell>

let speller: Speller | null = null
let loading: Promise<void> | null = null

/** Build the speller once (idempotent). Resolves when the dictionary is ready;
 *  callers re-check after this so words flag the moment the chunk lands. */
export function ensureSpeller(): Promise<void> {
  if (speller) return Promise.resolve()
  loading ??= (async () => {
    const [aff, dic] = await Promise.all([import('./en.aff?raw'), import('./en.dic?raw')])
    const s = nspell(aff.default, dic.default)
    for (const term of LATEX_TERMS) s.add(term) // teach LaTeX/technical vocabulary up front
    speller = s
  })()
  return loading
}

/** True only once the dictionary is loaded AND the word is unknown. Returns false
 *  while still loading so nothing is flagged prematurely. */
export function isMisspelled(word: string): boolean {
  return speller ? !speller.correct(word) : false
}

/** Up to 8 corrections, best first. Empty until the dictionary is loaded. */
export function suggest(word: string): string[] {
  return speller ? speller.suggest(word).slice(0, 8) : []
}

/** Teach the in-memory dictionary a word (Add to Dictionary). Session-scoped. */
export function learnWord(word: string): void {
  speller?.add(word)
}
