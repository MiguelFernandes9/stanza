import nspell from 'nspell'
import { client } from '@renderer/lib/client'
import { DEFAULT_SPELL_LANGUAGE } from '@shared/spell/languages'
import { LATEX_TERMS } from './latexTerms'

/** Self-contained spell engine: nspell (Hunspell in JS) over a downloadable
 *  dictionary. The active language's Hunspell files are fetched + cached by the
 *  main process (DictionaryService) and handed over IPC — nothing is bundled in
 *  git. We run our own checker (not the OS one) because only we know which ranges
 *  are LaTeX prose vs markup. British/American/etc. is the user's choice via the
 *  Settings language picker; the curated LATEX_TERMS + the personal dictionary
 *  are layered on top of whichever language is active. */

type Speller = ReturnType<typeof nspell>

let speller: Speller | null = null
let loading: Promise<void> | null = null
let activeLang = DEFAULT_SPELL_LANGUAGE
let enabled = true
const subscribers = new Set<() => void>()

function notify(): void {
  for (const cb of subscribers) cb()
}

/** Build the speller for the active language (idempotent). Downloads the
 *  dictionary on first use; on failure (offline) leaves the speller null and
 *  clears `loading` so a later call retries. No-ops while disabled. */
export function ensureSpeller(): Promise<void> {
  if (speller || !enabled) return Promise.resolve()
  loading ??= (async () => {
    try {
      const { aff, dic } = await client.spellDictionary(activeLang)
      const s = nspell(aff, dic)
      for (const term of LATEX_TERMS) s.add(term) // LaTeX/technical vocabulary
      for (const w of await loadLearnedWords()) s.add(w) // persisted personal words
      speller = s
    } catch {
      loading = null // download/build failed — allow a retry on the next call
    }
  })()
  return loading
}

/** True only when enabled, loaded, and the word is unknown. */
export function isMisspelled(word: string): boolean {
  return enabled && speller ? !speller.correct(word) : false
}

/** Up to 8 corrections, best first. Empty until the dictionary is loaded. */
export function suggest(word: string): string[] {
  return speller ? speller.suggest(word).slice(0, 8) : []
}

/** Switch the correction language. Drops the current speller and reloads (which
 *  downloads the new dictionary if needed), then tells subscribers to recompute. */
export function setActiveLanguage(code: string): void {
  if (code === activeLang) return
  activeLang = code
  speller = null
  loading = null
  void ensureSpeller().then(notify)
}

/** Turn the editor checker on/off (the "Check spelling as you type" toggle). Off
 *  drops the speller so underlines clear; on reloads and recomputes. */
export function setEnabled(on: boolean): void {
  if (on === enabled) return
  enabled = on
  if (on) {
    void ensureSpeller().then(notify)
  } else {
    speller = null
    loading = null
    notify()
  }
}

/** Subscribe to dictionary (re)loads — language switch, enable toggle, first
 *  load. Editor views recompute their underlines on this. Returns an unsubscribe. */
export function onReload(cb: () => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
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
