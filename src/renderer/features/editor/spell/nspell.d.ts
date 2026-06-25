// nspell ships no types. Minimal ambient declaration for the slice we use.
// Standalone (no import/export) so it stays a global script, not a module.
declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean
    suggest(word: string): string[]
    add(word: string): NSpell
  }
  export default function nspell(aff: string, dic?: string): NSpell
}
