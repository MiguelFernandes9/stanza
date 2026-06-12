import { afterEach, describe, expect, it } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

// Contract of the fake `claude` CLI (plan T4): match argv against a
// recording, apply its edits to cwd, print Claude-style result JSON.

const execFileP = promisify(execFile)
const mockBin = fileURLToPath(new URL('./claude-mock.sh', import.meta.url))
const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))

const tmpDirs: string[] = []
function projectCopy(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'stanza-mock-'))
  cpSync(join(fixtures, fixture), dir, { recursive: true })
  tmpDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function runMock(cwd: string, args: string[]) {
  const { stdout } = await execFileP(mockBin, args, { cwd })
  return JSON.parse(stdout)
}

const OP_FLAGS = ['-p', '--resume', 'sess-1', '--output-format', 'json', '--permission-mode', 'acceptEdits']

describe('claude-mock priming', () => {
  it('answers the prime call without editing anything', async () => {
    const cwd = projectCopy('single')
    const before = readFileSync(join(cwd, 'main.tex'), 'utf8')
    const res = await runMock(cwd, [
      '-p', '--session-id', 'sess-1', '--add-dir', cwd, '--output-format', 'json',
      'You are the editing engine inside Stanza, a LaTeX editor. ...',
    ])
    expect(res.type).toBe('result')
    expect(res.is_error).toBe(false)
    expect(res.session_id).toBe('sess-1')
    expect(typeof res.result).toBe('string')
    expect(readFileSync(join(cwd, 'main.tex'), 'utf8')).toBe(before)
  })
})

describe('claude-mock rewrite-within-span', () => {
  it('replaces exactly the span lines of the file named in the prompt', async () => {
    const cwd = projectCopy('single')
    const before = readFileSync(join(cwd, 'main.tex'), 'utf8').split('\n')
    const res = await runMock(cwd, [
      ...OP_FLAGS,
      'Instruction: Formalize this paragraph\nScope (edit only inside these spans):\n- main.tex lines 13-14\nApply the edits directly to the files. Reply with a one-paragraph summary.',
    ])
    expect(res.is_error).toBe(false)
    expect(res.session_id).toBe('sess-1')
    const after = readFileSync(join(cwd, 'main.tex'), 'utf8').split('\n')
    // lines outside the span untouched
    expect(after.slice(0, 12)).toEqual(before.slice(0, 12))
    expect(after.slice(-(before.length - 14))).toEqual(before.slice(-(before.length - 14)))
    // span content replaced
    expect(after.slice(12).join('\n')).not.toBe(before.slice(12).join('\n'))
  })
})

describe('claude-mock edit-outside-span', () => {
  it('touches a file no span mentions', async () => {
    const cwd = projectCopy('thesis')
    const before = readFileSync(join(cwd, 'preamble.tex'), 'utf8')
    const res = await runMock(cwd, [
      ...OP_FLAGS,
      'Instruction: Sneak an edit outside the span\nScope (edit only inside these spans):\n- chapters/ch1.tex lines 6-7\nApply the edits directly to the files.',
    ])
    expect(res.is_error).toBe(false)
    const after = readFileSync(join(cwd, 'preamble.tex'), 'utf8')
    expect(after).not.toBe(before)
    expect(after.startsWith(before)).toBe(true) // append, not rewrite
  })
})

describe('claude-mock timeout', () => {
  it('sleeps past the deadline and dies on SIGTERM', async () => {
    const cwd = projectCopy('single')
    const child = spawn(mockBin, [...OP_FLAGS, 'Instruction: hang forever please'], { cwd })
    const exited = new Promise<boolean>((resolve) => {
      child.on('exit', () => resolve(true))
    })
    const timedOut = await Promise.race([
      exited,
      new Promise<false>((r) => setTimeout(() => r(false), 400)),
    ])
    expect(timedOut).toBe(false) // still running after 400 ms
    child.kill('SIGTERM')
    expect(await exited).toBe(true)
  })
})

describe('claude-mock unmatched call', () => {
  it('fails loudly with an error result', async () => {
    const cwd = projectCopy('single')
    await expect(
      execFileP(mockBin, ['--frob', 'no recording covers this'], { cwd }),
    ).rejects.toMatchObject({ code: 1 })
  })
})
