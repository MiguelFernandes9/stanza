import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { OpRecord } from '../../shared/ipc/claude'
import type { ThreadRecord } from '../../shared/ipc/conversation'
import type { CompileOptions, GlobalSettings } from '../../shared/ipc/settings'

/** Everything Stanza persists about one project, keyed by its root. */
export interface ProjectRecord {
  sessionId?: string
  /** The dir the session was primed in (the doc's op worktree). A session can
   *  only be resumed in the dir it was primed in — Claude's file sandbox is
   *  pinned there — so a stored session whose `primedWorkdir` ≠ the current
   *  worktree must be re-primed. */
  primedWorkdir?: string
  ops?: OpRecord[]
  /** Persistent conversation bubbles ("Keep chat") — each its own session +
   *  transcript + block anchor, restored when the project reopens. */
  threads?: ThreadRecord[]
  lastOpened?: string // ISO — recents ordering
  blockCount?: number // recents card detail
  /** Per-document settings: main-file override + compiler options (Lane S). */
  mainFile?: string
  compile?: CompileOptions
}

/** Atomic temp+rename write so a crash never leaves a half-written file. */
function atomicWriteJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, JSON.stringify(data, null, 2))
  renameSync(tempPath, filePath)
}

/** Read JSON, tolerating a missing or corrupt file (reads as `fallback`). */
function loadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Per-project persisted state in one JSON file (<userData>/projects.json).
 *
 *  Reads + writes hit DISK fresh — the file IS the source of truth, never an
 *  in-memory cache. Stanza can run as several processes (separate app launches all
 *  sharing this one file); a cached copy meant a peer's write — e.g. a sibling
 *  session's op in the session bus — wasn't seen until the app restarted. Reading
 *  fresh, and read-merge-writing each patch, keeps every instance current without a
 *  restart. `readFileSync`/`writeFileSync` are synchronous, so a read-merge-write is
 *  atomic WITHIN a process (two patches can't interleave); across processes a rare
 *  TOCTOU remains (two near-simultaneous writers, one lost) — acceptable for the
 *  human-paced op cadence; a file lock would be the durable fix. */
export class Store {
  constructor(private filePath: string) {}

  private all(): Record<string, ProjectRecord> {
    return loadJson<Record<string, ProjectRecord>>(this.filePath, {})
  }

  getProject(root: string): ProjectRecord {
    return this.all()[root] ?? {}
  }

  setProject(root: string, patch: Partial<ProjectRecord>): void {
    const all = this.all() // re-read so a peer's concurrent change isn't clobbered
    all[root] = { ...all[root], ...patch }
    atomicWriteJson(this.filePath, all)
  }

  listProjects(): [string, ProjectRecord][] {
    return Object.entries(this.all())
  }
}

/** App-wide settings in one JSON file (<userData>/settings.json). Reads/writes fresh
 *  like Store (above) so a model/effort change in one instance reaches another. */
export class GlobalSettingsStore {
  constructor(private filePath: string) {}

  get(): GlobalSettings {
    return loadJson<GlobalSettings>(this.filePath, {})
  }

  set(patch: Partial<GlobalSettings>): GlobalSettings {
    const next = { ...loadJson<GlobalSettings>(this.filePath, {}), ...patch }
    atomicWriteJson(this.filePath, next)
    return next
  }
}
