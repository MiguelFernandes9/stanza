import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { BugReportInput } from '../../../shared/ipc/bugReport'
import { BugReportService } from '../BugReportService'

// 1x1 transparent PNG.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`

let base: string
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'stanza-bugs-'))
})
afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

const meta = { appVersion: '0.1.0-alpha.1', platform: 'darwin', errors: [] }

function svc(ids: string[] = ['id-1']) {
  let i = 0
  return new BugReportService(base, { genId: () => ids[i++] ?? `id-${i}`, now: () => '2026-06-29T00:00:00.000Z' })
}

describe('BugReportService', () => {
  test('writes the report dir with meta, markdown, and a decoded image', () => {
    const input: BugReportInput = {
      description: 'block overlaps the equation',
      images: [{ name: 'shot.png', dataUrl: PNG_DATA_URL }],
    }
    const res = svc().write(input, meta)

    expect(res.dir).toBe(join(base, 'id-1'))
    const m = JSON.parse(readFileSync(join(res.dir, 'meta.json'), 'utf8'))
    expect(m.description).toBe('block overlaps the equation')
    expect(m.appVersion).toBe('0.1.0-alpha.1')
    expect(m.images).toEqual(['shot.png'])

    expect(readFileSync(join(res.dir, 'report.md'), 'utf8')).toContain('block overlaps the equation')
    // image bytes round-trip exactly
    expect(readFileSync(join(res.dir, 'shot.png'))).toEqual(Buffer.from(PNG_B64, 'base64'))
  })

  test('writes geometry.json and an overlap summary only when geometry is present', () => {
    const withGeom: BugReportInput = {
      description: 'overlap',
      images: [],
      geometry: {
        timestamp: '2026-06-29T00:00:00.000Z',
        mainFile: 'main.tex',
        boxes: [],
        overlaps: [
          {
            a: { blockId: 'main.tex#0/1', label: 'paragraph (main.tex:10)' },
            b: { blockId: 'main.tex#0/2', label: 'equation (main.tex:14)' },
            page: 0,
            region: { x: 1, y: 2, width: 3, height: 4, area: 12 },
          },
        ],
      },
    }
    const res = svc().write(withGeom, meta)
    const geom = JSON.parse(readFileSync(join(res.dir, 'geometry.json'), 'utf8'))
    expect(geom.overlaps).toHaveLength(1)
    const md = readFileSync(join(res.dir, 'report.md'), 'utf8')
    expect(md).toContain('1 overlap')
    expect(JSON.parse(readFileSync(join(res.dir, 'meta.json'), 'utf8')).overlapCount).toBe(1)

    // no geometry → no geometry.json
    const res2 = svc(['id-2']).write({ description: 'x', images: [] }, meta)
    expect(existsSync(join(res2.dir, 'geometry.json'))).toBe(false)
  })

  test('appends each report to the shared index', () => {
    const s = svc(['id-1', 'id-2'])
    s.write({ description: 'first', images: [] }, meta)
    s.write({ description: 'second', images: [] }, meta)
    const index = JSON.parse(readFileSync(join(base, 'reports.json'), 'utf8'))
    expect(index.reports.map((r: { id: string }) => r.id)).toEqual(['id-1', 'id-2'])
  })

  test('sanitizes a path-traversal image name to stay inside the report dir', () => {
    const res = svc().write(
      { description: 'x', images: [{ name: '../../evil.png', dataUrl: PNG_DATA_URL }] },
      meta,
    )
    expect(existsSync(join(res.dir, 'evil.png'))).toBe(true)
    expect(existsSync(join(base, 'evil.png'))).toBe(false)
  })

  test('isWithinBase guards reveal against arbitrary paths', () => {
    const s = svc()
    expect(s.isWithinBase(join(base, 'id-1'))).toBe(true)
    expect(s.isWithinBase('/etc')).toBe(false)
  })
})
