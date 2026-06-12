import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DefaultProcessRunner } from '../../infra/ProcessRunner'
import { GitClient } from '../../infra/GitClient'
import { Store } from '../../infra/Store'
import type { DocumentInfo, PrimeStep } from '../../../shared/ipc/document'
import { DocumentService } from '../DocumentService'

const runner = new DefaultProcessRunner()
let dir: string
let store: Store
let primed: DocumentInfo[]
let service: DocumentService

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stanza-create-'))
  store = new Store(join(dir, 'projects.json'))
  primed = []
  service = new DocumentService({
    store,
    makeGit: (root) => new GitClient(runner, root),
    primeSession: async (doc) => {
      primed.push(doc)
      store.setProject(doc.root, { sessionId: 'primed-session' })
    },
  })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('DocumentService.create', () => {
  test('writes the article template and returns DocumentInfo', async () => {
    const info = await service.create({ name: 'My Thesis', dir })

    expect(info.root).toBe(join(dir, 'My Thesis'))
    expect(info.mainFile).toBe('main.tex')
    const tex = readFileSync(join(info.root, 'main.tex'), 'utf8')
    expect(tex).toContain('\\documentclass[11pt]{article}')
    expect(tex).toContain('\\title{My Thesis}')
    expect(tex).toContain('\\section{Introduction}')
  })

  test('template parses to at least two blocks', async () => {
    const info = await service.create({ name: 'Blocks', dir })
    const { parseBlocks } = await import('../../../shared/blocks/parse')
    const source = readFileSync(join(info.root, 'main.tex'), 'utf8')
    expect(countBlocks(parseBlocks('main.tex', source))).toBeGreaterThanOrEqual(2)
  })
})

describe('DocumentService.prime', () => {
  test('emits read, parse, git, session in order with done states', async () => {
    const info = await service.create({ name: 'Steps', dir })
    const steps: PrimeStep[] = []

    await service.prime(info.root, (step) => steps.push(step))

    const order = steps.filter((s) => s.state === 'done').map((s) => s.step)
    expect(order).toEqual(['read', 'parse', 'git', 'session'])
    // every step ran before it finished
    for (const name of ['read', 'parse', 'git', 'session'] as const) {
      const states = steps.filter((s) => s.step === name).map((s) => s.state)
      expect(states).toEqual(['running', 'done'])
    }
    const parseDone = steps.find((s) => s.step === 'parse' && s.state === 'done')
    expect(parseDone?.detail).toMatch(/^\d+ blocks$/)
  })

  test('git step creates a repo with an initial commit; session primes once', async () => {
    const info = await service.create({ name: 'Repo', dir })
    await service.prime(info.root, () => {})

    const git = new GitClient(runner, info.root)
    expect(await git.isRepo()).toBe(true)
    expect(await git.isClean()).toBe(true)
    expect(await git.log(5)).toHaveLength(1)
    expect(primed.map((d) => d.root)).toEqual([info.root])
  })

  test('recents gains the project with hasSession and blockCount', async () => {
    const info = await service.create({ name: 'Recents', dir })
    await service.prime(info.root, () => {})

    const record = store.getProject(info.root)
    expect(record.sessionId).toBe('primed-session')
    expect(record.blockCount).toBeGreaterThanOrEqual(2)
    expect(record.lastOpened).toBeTruthy()
    expect(existsSync(join(dir, 'projects.json'))).toBe(true)
  })
})

function countBlocks(roots: { children: unknown[] }[]): number {
  let count = 0
  const walk = (nodes: { children: unknown[] }[]) => {
    for (const node of nodes) {
      count++
      walk(node.children as { children: unknown[] }[])
    }
  }
  walk(roots)
  return count
}
