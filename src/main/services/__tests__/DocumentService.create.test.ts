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

  test('rejects a non-absolute dir instead of creating in the app CWD', async () => {
    await expect(service.create({ name: 'Stray', dir: 'untitled-papers' })).rejects.toThrow(
      /absolute/,
    )
    await expect(service.create({ name: 'Stray', dir: './here' })).rejects.toThrow(
      /absolute/,
    )
    expect(existsSync(join(process.cwd(), 'untitled-papers'))).toBe(false)
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

  test('fresh init writes a doc .gitignore that keeps figure pdfs tracked', async () => {
    const info = await service.create({ name: 'Ignore', dir })
    await service.prime(info.root, () => {})

    const ignore = readFileSync(join(info.root, '.gitignore'), 'utf8')
    expect(ignore).toContain('/main.pdf')
    expect(ignore).toContain('*.synctex.gz')
    expect(ignore).toContain('*.log')
    expect(ignore).not.toContain('*.pdf') // figures stay versioned
    const git = new GitClient(runner, info.root)
    expect(await git.isClean()).toBe(true) // .gitignore is in the initial commit
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

describe('DocumentService.prime cancellation (prime:cancel)', () => {
  function cancellableService(): { svc: DocumentService; controller: AbortController } {
    const controller = new AbortController()
    const svc = new DocumentService({
      store,
      makeGit: (root) => new GitClient(runner, root),
      // hangs like a real claude prime until the signal fires
      primeSession: (_doc, signal) =>
        new Promise<void>((_, reject) => {
          if (signal?.aborted) return reject(new Error('aborted'))
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    })
    return { svc, controller }
  }

  test('cancel mid-session: PRIME_CANCELED, no store record, no orphan .git', async () => {
    const { svc, controller } = cancellableService()
    const info = await service.create({ name: 'Cancelled', dir })

    const priming = svc.prime(info.root, (step) => {
      if (step.step === 'session' && step.state === 'running') controller.abort()
    }, controller.signal)

    await expect(priming).rejects.toThrow('PRIME_CANCELED')
    expect(store.getProject(info.root)).toEqual({})
    expect(existsSync(join(info.root, '.git'))).toBe(false)
    expect(existsSync(join(info.root, 'main.tex'))).toBe(true) // user files stay
  })

  test('cancel never deletes a pre-existing repo', async () => {
    const { svc, controller } = cancellableService()
    const info = await service.create({ name: 'Existing', dir })
    const git = new GitClient(runner, info.root)
    await git.init()
    await git.commitAll('user history')

    const priming = svc.prime(info.root, (step) => {
      if (step.step === 'session' && step.state === 'running') controller.abort()
    }, controller.signal)

    await expect(priming).rejects.toThrow('PRIME_CANCELED')
    expect(existsSync(join(info.root, '.git'))).toBe(true)
    expect(await git.log(5)).toHaveLength(1) // history untouched
  })

  test('abort before the pipeline starts cancels at the first step', async () => {
    const { svc, controller } = cancellableService()
    const info = await service.create({ name: 'Early', dir })
    controller.abort()
    await expect(svc.prime(info.root, () => {}, controller.signal)).rejects.toThrow(
      'PRIME_CANCELED',
    )
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
