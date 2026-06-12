import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { OpRecord } from '../../shared/ipc/claude'

/** Everything Stanza persists about one project, keyed by its root. */
export interface ProjectRecord {
  sessionId?: string
  ops?: OpRecord[]
  lastOpened?: string // ISO — recents ordering
  blockCount?: number // recents card detail
}

/** Per-project persisted state in one JSON file (<userData>/projects.json).
 *  Atomic temp+rename writes; a missing or corrupt file reads as empty. */
export class Store {
  private data: Record<string, ProjectRecord>

  constructor(private filePath: string) {
    this.data = load(filePath)
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
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.tmp`
    writeFileSync(tempPath, JSON.stringify(this.data, null, 2))
    renameSync(tempPath, this.filePath)
  }
}

function load(filePath: string): Record<string, ProjectRecord> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, ProjectRecord>
  } catch {
    return {}
  }
}
