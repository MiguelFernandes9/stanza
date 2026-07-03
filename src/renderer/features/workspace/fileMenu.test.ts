import { describe, expect, it } from 'vitest'
import { composeSiblingPath, menuItemsForKind, uniqueName } from './fileMenu'

/** Render a menu entry list to compact tokens (sep → '—', else the id). */
const tokens = (entries: ReturnType<typeof menuItemsForKind>): string[] =>
  entries.map((e) => ('sep' in e ? '—' : e.id))

describe('composeSiblingPath', () => {
  it('keeps a file in its directory', () => {
    expect(composeSiblingPath('chapters/ch1.tex', 'intro.tex')).toBe('chapters/intro.tex')
  })

  it('renames a root-level path', () => {
    expect(composeSiblingPath('main.tex', 'paper.tex')).toBe('paper.tex')
  })

  it('renames a nested directory in place', () => {
    expect(composeSiblingPath('a/b/old', 'new')).toBe('a/b/new')
  })
})

describe('menuItemsForKind', () => {
  it('orders the file menu: open, rename, duplicate, copy, delete', () => {
    expect(tokens(menuItemsForKind('file'))).toEqual([
      'open',
      '—',
      'rename',
      'duplicate',
      'copyPath',
      '—',
      'delete'
    ])
  })

  it('orders the folder menu: new file/folder, upload, rename, copy, delete', () => {
    expect(tokens(menuItemsForKind('dir'))).toEqual([
      'newFile',
      'newFolder',
      'upload',
      '—',
      'rename',
      'copyPath',
      '—',
      'delete'
    ])
  })

  it('marks Rename with the ⏎ hint and Delete as destructive', () => {
    const items = menuItemsForKind('file').filter((e) => !('sep' in e))
    const rename = items.find((i) => 'id' in i && i.id === 'rename')
    const del = items.find((i) => 'id' in i && i.id === 'delete')
    expect(rename && 'kbd' in rename && rename.kbd).toBe('⏎')
    expect(del && 'danger' in del && del.danger).toBe(true)
  })

  it('disables Rename and Delete when the file is locked, nothing else', () => {
    const items = menuItemsForKind('file', { locked: true }).filter((e) => !('sep' in e))
    const disabled = items.filter((i) => 'disabled' in i && i.disabled).map((i) => 'id' in i && i.id)
    expect(disabled.sort()).toEqual(['delete', 'rename'])
  })

  it('leaves nothing disabled when unlocked', () => {
    const items = menuItemsForKind('dir').filter((e) => !('sep' in e))
    expect(items.some((i) => 'disabled' in i && i.disabled)).toBe(false)
  })

  it('offers Set as compile target only for .tex files, right after Open', () => {
    expect(tokens(menuItemsForKind('file', { tex: true }))).toEqual([
      'open',
      'setMain',
      '—',
      'rename',
      'duplicate',
      'copyPath',
      '—',
      'delete'
    ])
    expect(tokens(menuItemsForKind('file'))).not.toContain('setMain')
    expect(tokens(menuItemsForKind('dir', { tex: true }))).not.toContain('setMain')
  })

  it('disables Set as compile target when the file already is the target', () => {
    const item = menuItemsForKind('file', { tex: true, isMain: true }).find(
      (e) => 'id' in e && e.id === 'setMain'
    )
    expect(item && 'disabled' in item && item.disabled).toBe(true)
  })
})

describe('uniqueName', () => {
  it('returns the base name when free', () => {
    expect(uniqueName([], 'untitled', '.tex')).toBe('untitled.tex')
  })

  it('suffixes a counter on collision', () => {
    expect(uniqueName(['untitled.tex'], 'untitled', '.tex')).toBe('untitled 2.tex')
  })

  it('skips past several collisions', () => {
    expect(uniqueName(['untitled.tex', 'untitled 2.tex'], 'untitled', '.tex')).toBe('untitled 3.tex')
  })

  it('works without an extension (folders)', () => {
    expect(uniqueName(['New Folder'], 'New Folder')).toBe('New Folder 2')
  })
})
