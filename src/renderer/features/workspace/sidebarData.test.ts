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

  it('renders an empty directory entry as an expandable dir node (BUG-47)', () => {
    const tree = buildFileTree([f('main.tex'), f('untitled', 'dir')])
    expect(tree.map((n) => ('dir' in n ? n.dir : n.entry.relPath))).toEqual(['untitled', 'main.tex'])
    const dir = tree[0]
    if (!('dir' in dir)) throw new Error('expected an empty dir node, got a file leaf')
    expect(dir.children).toEqual([])
  })

  it('does not double-create a dir present both as an entry and via its files (BUG-47)', () => {
    const tree = buildFileTree([f('chapters', 'dir'), f('chapters/ch1.tex')])
    expect(tree).toHaveLength(1) // one 'chapters' dir node, not a dir + a stray leaf
    const chapters = tree[0]
    if (!('dir' in chapters)) throw new Error('expected dir node')
    expect(chapters.children.map((c) => ('dir' in c ? c.dir : c.entry.relPath))).toEqual([
      'chapters/ch1.tex'
    ])
  })

  it('nests an empty subdirectory (BUG-47)', () => {
    const tree = buildFileTree([f('chapters/ch1.tex'), f('chapters/sub', 'dir')])
    const chapters = tree[0]
    if (!('dir' in chapters)) throw new Error('expected dir node')
    expect(chapters.children.map((c) => ('dir' in c ? c.dir : c.entry.relPath))).toEqual([
      'chapters/sub', // empty dir sorts before the file
      'chapters/ch1.tex'
    ])
    const sub = chapters.children[0]
    if (!('dir' in sub)) throw new Error('expected nested empty dir node')
    expect(sub.children).toEqual([])
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
