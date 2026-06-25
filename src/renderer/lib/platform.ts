import { isMac as isMacFor, modKey as modKeyFor } from '@shared/platform'

// The renderer's isolated world has no `process`; the preload bridges the host OS
// as window.stanza.platform. Read it lazily (at call time, not module init) and
// fall back to 'darwin' so a missing bridge — e.g. a renderer unit test that only
// stubs invoke/on — can't crash on import. Wraps the pure shared helpers so call
// sites stay no-arg.
const platform = (): string => window.stanza?.platform ?? 'darwin'

export const isMac = (): boolean => isMacFor(platform())
export const modKey = (): string => modKeyFor(platform())
