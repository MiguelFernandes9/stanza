import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DefaultProcessRunner } from '../../infra/ProcessRunner'
import { GitClient } from '../../infra/GitClient'
import { FileService, safeJoin } from '../FileService'

const runner = new DefaultProcessRunner()
let root: string
let git: GitClient
let files: FileService

const write = (rel: string, content: string) => writeFileSync(join(root, rel), content)
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const has = (rel: string) => existsSync(join(root, rel))

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'stanza-files-'))
  git = new GitClient(runner, root)
  files = new FileService(root, git)
  write('main.tex', 'main\n')
  mkdirSync(join(root, 'chapters'))
  write('chapters/ch1.tex', 'one\n')
  write('chapters/ch2.tex', 'two\n')
  await git.init()
  await git.commitAll('initial')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('safeJoin', () => {
  test('rejects parent traversal with PATH_ESCAPE', () => {
    expect(() => safeJoin(root, '../escape.tex')).toThrow('PATH_ESCAPE')
  })

  test('rejects nested traversal that climbs out', () => {
    expect(() => safeJoin(root, 'chapters/../../escape.tex')).toThrow('PATH_ESCAPE')
  })

  test('rejects absolute paths with PATH_ESCAPE', () => {
    expect(() => safeJoin(root, '/etc/passwd')).toThrow('PATH_ESCAPE')
  })

  test('resolves an in-root relative path', () => {
    expect(safeJoin(root, 'chapters/ch1.tex')).toBe(join(root, 'chapters/ch1.tex'))
  })
})

describe('FileService.rename', () => {
  test('renames a tracked file and leaves a clean tree with a wip commit', async () => {
    await files.rename('main.tex', 'paper.tex')
    expect(has('paper.tex')).toBe(true)
    expect(has('main.tex')).toBe(false)
    expect(read('paper.tex')).toBe('main\n')
    expect(await git.isClean()).toBe(true)
    expect((await git.log(1))[0]).toMatchObject({ kind: 'wip' })
  })

  test('renames an untracked file via the fs fallback', async () => {
    write('scratch.tex', 'tmp\n') // never committed
    await files.rename('scratch.tex', 'notes.tex')
    expect(has('notes.tex')).toBe(true)
    expect(has('scratch.tex')).toBe(false)
    expect(read('notes.tex')).toBe('tmp\n')
  })

  test('renaming a folder rewrites all its descendants', async () => {
    await files.rename('chapters', 'parts')
    expect(has('parts/ch1.tex')).toBe(true)
    expect(has('parts/ch2.tex')).toBe(true)
    expect(has('chapters')).toBe(false)
    expect(await git.isTracked('parts/ch1.tex')).toBe(true)
    expect(await git.isClean()).toBe(true)
  })

  test('renaming onto an existing path throws NAME_EXISTS', async () => {
    await expect(files.rename('chapters/ch1.tex', 'chapters/ch2.tex')).rejects.toThrow(
      'NAME_EXISTS',
    )
  })

  test('a traversal target is rejected with PATH_ESCAPE', async () => {
    await expect(files.rename('main.tex', '../escape.tex')).rejects.toThrow('PATH_ESCAPE')
  })
})

describe('FileService.duplicate', () => {
  test('suffixes " copy" before the extension', async () => {
    const next = await files.duplicate('chapters/ch1.tex')
    expect(next).toBe('chapters/ch1 copy.tex')
    expect(read('chapters/ch1 copy.tex')).toBe('one\n')
    expect(await git.isClean()).toBe(true)
  })

  test('an extensionless file gets " copy" appended', async () => {
    write('README', 'readme\n')
    await git.commitAll('wip: add readme')
    const next = await files.duplicate('README')
    expect(next).toBe('README copy')
    expect(has('README copy')).toBe(true)
  })

  test('a repeated duplicate increments the suffix to stay collision-free', async () => {
    await files.duplicate('main.tex') // main copy.tex
    const second = await files.duplicate('main.tex')
    expect(second).toBe('main copy 2.tex')
    expect(has('main copy.tex')).toBe(true)
    expect(has('main copy 2.tex')).toBe(true)
  })
})

describe('FileService.remove', () => {
  test('removes a tracked file and commits a clean tree', async () => {
    await files.remove('main.tex')
    expect(has('main.tex')).toBe(false)
    expect(await git.isClean()).toBe(true)
  })

  test('removes a folder and all its contents recursively', async () => {
    await files.remove('chapters')
    expect(has('chapters')).toBe(false)
    expect(has('chapters/ch1.tex')).toBe(false)
    expect(await git.isClean()).toBe(true)
  })
})

describe('FileService.createFile', () => {
  test('creates an empty file at the root and returns its relPath', async () => {
    const rel = await files.createFile('', 'intro.tex')
    expect(rel).toBe('intro.tex')
    expect(read('intro.tex')).toBe('')
    expect(await git.isClean()).toBe(true)
  })

  test('creates a file inside a directory', async () => {
    const rel = await files.createFile('chapters', 'ch3.tex')
    expect(rel).toBe('chapters/ch3.tex')
    expect(has('chapters/ch3.tex')).toBe(true)
  })

  test('throws NAME_EXISTS when the file already exists', async () => {
    await expect(files.createFile('', 'main.tex')).rejects.toThrow('NAME_EXISTS')
  })
})

describe('FileService.createFolder', () => {
  test('creates a new directory', async () => {
    await files.createFolder('', 'appendix')
    expect(existsSync(join(root, 'appendix'))).toBe(true)
  })

  test('throws NAME_EXISTS when the folder already exists', async () => {
    await expect(files.createFolder('', 'chapters')).rejects.toThrow('NAME_EXISTS')
  })
})
