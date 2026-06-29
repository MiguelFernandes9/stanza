import nspell from 'nspell'
import { client } from '@renderer/lib/client'
import { LATEX_TERMS } from './latexTerms'

/** Self-contained spell engine: nspell (Hunspell in JS) + the bundled
 *  American-English (en-US) dictionary — British spellings (colour, organise,
 *  centre) are intentionally flagged. We run our own checker instead of the OS
 *  spellchecker because only we know which ranges are LaTeX prose vs markup — the
 *  native checker squiggles the whole text box indiscriminately. The ~540KB .dic
 *  is a `?raw` asset loaded as a separate chunk on first use, off the startup path.
 *  Source: wooorm `dictionary-en` (the maintained en-US dictionary; see LICENSE). */

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
    for (const w of await loadLearnedWords()) s.add(w) // persisted personal words
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

/** Teach the dictionary a word (Add to Dictionary): apply now for this window,
 *  and persist it so it survives restarts (re-applied by ensureSpeller). */
export function learnWord(word: string): void {
  speller?.add(word)
  void persistWord(word)
}

/** Persisted personal words, or [] when the IPC bridge is unavailable — a partial
 *  client (e.g. a test mock) or offline state must never crash the editor. Guards
 *  the call itself, not just the promise, since a missing method throws on call. */
async function loadLearnedWords(): Promise<string[]> {
  try {
    return (await client.spellGetWords()) ?? []
  } catch {
    return []
  }
}

async function persistWord(word: string): Promise<void> {
  try {
    await client.spellAddWord(word)
  } catch {
    /* persistence unavailable — the word still applies for this session */
  }
}
