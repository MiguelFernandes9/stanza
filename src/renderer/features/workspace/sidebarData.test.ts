import { describe, expect, it } from 'vitest'
import type { FileEntry } from '../../../shared/ipc'
import { buildFileTree, relativeTime } from './sidebarData'

const f = (relPath: string, kind: FileEntry['kind'] = 'tex'): FileEntry => ({ relPath, kind })

describe('buildFileTree', () => {
  it('keeps root files flat and groups directories', () => {
    const tree = buildFileTree([
      f('main.tex'),
      f('chapters/ch1.tex'),
      f('chapters/ch2.tex'),
      f('refs.bib', 'bib')
    ])
    expect(tree.map((n) => ('dir' in n ? n.dir : n.entry.relPath))).toEqual([
      'chapters',
      'main.tex',
      'refs.bib'
    ])
    const chapters = tree[0]
    if (!('dir' in chapters)) throw new Error('expected dir node')
    expect(chapters.children.map((c) => ('dir' in c ? c.dir : c.entry.relPath))).toEqual([
      'chapters/ch1.tex',
      'chapters/ch2.tex'
    ])
  })

  it('nests subdirectories', () => {
    const tree = buildFileTree([f('a/b/deep.tex'), f('a/top.tex')])
    const a = tree[0]
    if (!('dir' in a)) throw new Error('expected dir node')
    expect(a.children.length).toBe(2)
    const b = a.children[0]
    if (!('dir' in b)) throw new Error('expected nested dir node')
    expect(b.dir).toBe('a/b')
  })

  it('sorts directories before files, each alphabetically', () => {
    const tree = buildFileTree([f('z.tex'), f('figs/p.pdf', 'image'), f('a.tex')])
    expect(tree.map((n) => ('dir' in n ? n.dir : n.entry.relPath))).toEqual([
      'figs',
      'a.tex',
      'z.tex'
    ])
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-06-12T20:00:00Z')
  it('formats minutes, hours, days', () => {
    expect(relativeTime('2026-06-12T19:58:00Z', now)).toBe('2m')
    expect(relativeTime('2026-06-12T17:00:00Z', now)).toBe('3h')
    expect(relativeTime('2026-06-09T10:00:00Z', now)).toBe('3d')
  })
  it('clamps fresh timestamps to "now"', () => {
    expect(relativeTime('2026-06-12T19:59:40Z', now)).toBe('now')
  })
})
