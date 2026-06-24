import { existsSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { ForkManager, type ForkGit } from '../ForkManager'

/** Records git calls without spawning — real worktree behavior is covered by
 *  GitClient.test.ts; here we assert ForkManager issues the right commands. */
class FakeGit implements ForkGit {
  calls: string[] = []
  repo = true
  worktrees: string[] = []
  async isRepo(): Promise<boolean> {
    return this.repo
  }
  async addWorktree(dir: string): Promise<void> {
    this.calls.push(`add ${dir}`)
    this.worktrees.push(dir)
  }
  async removeWorktree(dir: string): Promise<void> {
    this.calls.push(`remove ${dir}`)
    this.worktrees = this.worktrees.filter((d) => d !== dir)
  }
  async pruneWorktrees(): Promise<void> {
    this.calls.push('prune')
  }
  async listWorktrees(): Promise<string[]> {
    return this.worktrees
  }
}

describe('ForkManager — scheduling', () => {
  test('pool caps concurrency across different forks', async () => {
    const fm = new ForkManager(new FakeGit(), '/base', 2)
    let active = 0
    let peak = 0
    const work = () => {
      const fork = fm.create({ kind: 'doc' }, 'ephemeral')
      return fm.schedule(fork, async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 20))
        active--
      })
    }
    await Promise.all([work(), work(), work(), work(), work()])
    expect(peak).toBeLessThanOrEqual(2)
    expect(peak).toBeGreaterThan(0)
  })

  test("a fork serialises its OWN turns (different forks do not)", async () => {
    const fm = new ForkManager(new FakeGit(), '/base', 8)
    const fork = fm.create({ kind: 'doc' }, 'persistent')
    const order: string[] = []
    const t1 = fm.schedule(fork, async () => {
      order.push('1-start')
      await new Promise((r) => setTimeout(r, 20))
      order.push('1-end')
    })
    const t2 = fm.schedule(fork, async () => {
      order.push('2-start')
      order.push('2-end')
    })
    await Promise.all([t1, t2])
    expect(order).toEqual(['1-start', '1-end', '2-start', '2-end'])
  })

  test('a failed turn does not poison the fork chain', async () => {
    const fm = new ForkManager(new FakeGit(), '/base', 4)
    const fork = fm.create({ kind: 'doc' }, 'persistent')
    await expect(fm.schedule(fork, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(fm.schedule(fork, async () => 'ok')).resolves.toBe('ok')
  })
})

describe('ForkManager — fork allocation', () => {
  test('each fork gets a distinct worktree dir under the base', () => {
    const fm = new ForkManager(new FakeGit(), '/base', 4)
    const a = fm.create({ kind: 'doc' }, 'ephemeral')
    const b = fm.create({ kind: 'blocks', spans: [] }, 'ephemeral')
    expect(a.worktreeDir).toBe(`/base/${a.forkId}`)
    expect(b.worktreeDir).toBe(`/base/${b.forkId}`)
    expect(a.forkId).not.toBe(b.forkId)
    expect(fm.get(a.forkId)).toBe(a)
    expect(fm.list()).toHaveLength(2)
  })
})

describe('ForkManager — worktree lifecycle', () => {
  test('ensureWorktree adds a detached worktree (idempotent)', async () => {
    const git = new FakeGit()
    const fm = new ForkManager(git, '/base', 4)
    const fork = fm.create({ kind: 'doc' }, 'ephemeral')
    await fm.ensureWorktree(fork)
    expect(git.calls).toContain(`add ${fork.worktreeDir}`)
    expect(git.worktrees).toContain(fork.worktreeDir)
  })

  test('ensureWorktree is a no-op when the doc is not a repo', async () => {
    const git = new FakeGit()
    git.repo = false
    const fm = new ForkManager(git, '/base', 4)
    const fork = fm.create({ kind: 'doc' }, 'ephemeral')
    await fm.ensureWorktree(fork)
    expect(git.calls).not.toContain(`add ${fork.worktreeDir}`)
  })

  test('resolve removes an ephemeral fork + its worktree; keeps a persistent one', async () => {
    const git = new FakeGit()
    const fm = new ForkManager(git, '/base', 4)
    const eph = fm.create({ kind: 'doc' }, 'ephemeral')
    const persistent = fm.create({ kind: 'doc' }, 'persistent')
    await fm.ensureWorktree(eph)
    await fm.ensureWorktree(persistent)

    await fm.resolve(eph.forkId)
    expect(fm.get(eph.forkId)).toBeUndefined()
    expect(git.worktrees).not.toContain(eph.worktreeDir)

    await fm.resolve(persistent.forkId)
    expect(fm.get(persistent.forkId)).toBe(persistent) // a live chat survives
    expect(git.worktrees).toContain(persistent.worktreeDir)
  })

  test('close tears down a persistent fork', async () => {
    const git = new FakeGit()
    const fm = new ForkManager(git, '/base', 4)
    const fork = fm.create({ kind: 'doc' }, 'persistent')
    await fm.ensureWorktree(fork)
    await fm.close(fork.forkId)
    expect(fm.get(fork.forkId)).toBeUndefined()
    expect(git.worktrees).not.toContain(fork.worktreeDir)
  })

  test('disposeAll removes every fork worktree and prunes', async () => {
    const git = new FakeGit()
    const fm = new ForkManager(git, '/base', 4)
    const a = fm.create({ kind: 'doc' }, 'ephemeral')
    const b = fm.create({ kind: 'doc' }, 'persistent')
    await fm.ensureWorktree(a)
    await fm.ensureWorktree(b)
    await fm.disposeAll()
    expect(git.worktrees).toHaveLength(0)
    expect(git.calls).toContain('prune')
    expect(fm.list()).toHaveLength(0)
    expect(existsSync('/base')).toBe(false) // rmSync of a missing dir is a no-op, never throws
  })

  test('sweepStale removes worktrees under the base not backed by a live fork', async () => {
    const git = new FakeGit()
    const fm = new ForkManager(git, '/base', 4)
    const live = fm.create({ kind: 'doc' }, 'persistent')
    await fm.ensureWorktree(live)
    git.worktrees.push('/base/orphan-1', '/other/keep') // orphan under base + unrelated
    await fm.sweepStale()
    expect(git.worktrees).not.toContain('/base/orphan-1')
    expect(git.worktrees).toContain('/base/' + live.forkId) // live kept
    expect(git.worktrees).toContain('/other/keep') // outside base, untouched
  })
})
