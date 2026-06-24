import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Store, GlobalSettingsStore } from '../Store'

let dir: string
let filePath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stanza-store-'))
  filePath = join(dir, 'projects.json')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('Store', () => {
  test('missing file reads as empty project record', () => {
    const store = new Store(filePath)
    expect(store.getProject('/proj')).toEqual({})
  })

  test('setProject then getProject roundtrips', () => {
    const store = new Store(filePath)
    store.setProject('/proj', { sessionId: 'uuid-1' })
    expect(store.getProject('/proj').sessionId).toBe('uuid-1')
  })

  test('patches merge instead of replacing the record', () => {
    const store = new Store(filePath)
    store.setProject('/proj', { sessionId: 'uuid-1' })
    store.setProject('/proj', {
      ops: [{ opId: 'op1', ts: 't', instruction: 'i', note: 'n', accepted: null }],
    })
    const record = store.getProject('/proj')
    expect(record.sessionId).toBe('uuid-1')
    expect(record.ops).toHaveLength(1)
  })

  test('writes persist across instances and leave no temp files', () => {
    const first = new Store(filePath)
    first.setProject('/proj', { sessionId: 'uuid-1' })
    first.setProject('/proj', { sessionId: 'uuid-2' }) // last write wins

    const second = new Store(filePath)
    expect(second.getProject('/proj').sessionId).toBe('uuid-2')
    expect(existsSync(filePath)).toBe(true)
    expect(readdirSync(dir)).toEqual(['projects.json'])
  })

  test('corrupt file degrades to empty store instead of throwing', () => {
    const first = new Store(filePath)
    first.setProject('/proj', { sessionId: 'uuid-1' })
    rmSync(filePath)
    const second = new Store(filePath)
    expect(second.getProject('/proj')).toEqual({})
  })

  test('listProjects returns all roots with their records', () => {
    const store = new Store(filePath)
    store.setProject('/a', { sessionId: 's-a' })
    store.setProject('/b', { blockCount: 42 })
    const roots = store.listProjects().map(([root]) => root)
    expect(roots.sort()).toEqual(['/a', '/b'])
  })

  // Cross-instance freshness (the session-bus restart bug): two Store instances on
  // the same file model two app processes. A write by one is seen by the OTHER
  // without re-constructing it — the old in-memory cache needed an app restart.
  test('a write by one instance is visible to a long-lived other instance', () => {
    const a = new Store(filePath)
    const b = new Store(filePath) // constructed BEFORE the write
    a.setProject('/proj', { ops: [{ opId: 'o1', ts: 't', instruction: 'i', note: 'n', accepted: true }] })
    expect(b.getProject('/proj').ops).toHaveLength(1) // b sees it live, no restart
  })

  test('concurrent instances merge instead of clobbering (read-merge-write)', () => {
    const a = new Store(filePath)
    const b = new Store(filePath)
    a.setProject('/proj', { sessionId: 's-a' })
    b.setProject('/proj', { blockCount: 7 }) // re-reads first, keeps a's write
    const record = new Store(filePath).getProject('/proj')
    expect(record.sessionId).toBe('s-a')
    expect(record.blockCount).toBe(7)
  })
})

describe('GlobalSettingsStore (Lane S)', () => {
  test('missing file reads as empty settings', () => {
    expect(new GlobalSettingsStore(join(dir, 'settings.json')).get()).toEqual({})
  })

  test('set merges, returns the merged settings, and persists to disk', () => {
    const path = join(dir, 'settings.json')
    const store = new GlobalSettingsStore(path)
    expect(store.set({ editorFontSize: 15 })).toEqual({ editorFontSize: 15 })
    const merged = store.set({ theme: 'dark', editorFontFamily: 'Menlo' })
    expect(merged).toEqual({ editorFontSize: 15, theme: 'dark', editorFontFamily: 'Menlo' })
    // round-trips through a fresh instance (the file on disk)
    expect(new GlobalSettingsStore(path).get()).toEqual(merged)
  })

  test('a corrupt settings.json reads as empty (tolerant load)', () => {
    const path = join(dir, 'settings.json')
    writeFileSync(path, '{ not json')
    expect(new GlobalSettingsStore(path).get()).toEqual({})
  })

  test('a setting changed in one instance is read fresh by another (no restart)', () => {
    const path = join(dir, 'settings.json')
    const a = new GlobalSettingsStore(path)
    const b = new GlobalSettingsStore(path)
    a.set({ claudeModel: 'sonnet' })
    expect(b.get().claudeModel).toBe('sonnet')
  })
})
