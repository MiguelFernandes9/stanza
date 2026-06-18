import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { OpRecord } from '../../shared/ipc/claude'
import type { ThreadRecord } from '../../shared/ipc/conversation'
import type { CompileOptions, GlobalSettings } from '../../shared/ipc/settings'

/** Everything Stanza persists about one project, keyed by its root. */
export interface ProjectRecord {
  sessionId?: string
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
 *  Atomic temp+rename writes; a missing or corrupt file reads as empty. */
export class Store {
  private data: Record<string, ProjectRecord>

  constructor(private filePath: string) {
    this.data = loadJson(filePath, {})
  }

  getProject(root: string): ProjectRecord {
    return this.data[root] ?? {}
  }

  setProject(root: string, patch: Partial<ProjectRecord>): void {
    this.data[root] = { ...this.data[root], ...patch }
    this.persist()
  }

  listProjects(): [string, ProjectRecord][] {
    return Object.entries(this.data)
  }

  private persist(): void {
    atomicWriteJson(this.filePath, this.data)
  }
}

/** App-wide settings (fonts + theme) in one JSON file (<userData>/settings.json).
 *  Separate from the per-project Store; same atomic-write / corrupt-tolerant load. */
export class GlobalSettingsStore {
  private data: GlobalSettings

  constructor(private filePath: string) {
    this.data = loadJson<GlobalSettings>(filePath, {})
  }

  get(): GlobalSettings {
    return this.data
  }

  set(patch: Partial<GlobalSettings>): GlobalSettings {
    this.data = { ...this.data, ...patch }
    atomicWriteJson(this.filePath, this.data)
    return this.data
  }
}
