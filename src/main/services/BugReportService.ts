import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative } from 'node:path'
import type { BugReportInput, BugReportResult, GeometrySnapshot } from '../../shared/ipc/bugReport'
import type { ErrorEntry } from '../infra/errorLog'
import { atomicWriteJson, loadJson } from '../infra/Store'

// Writes a bug report to <userData>/bug-reports/<id>/ — one folder per report,
// holding the decoded images, a geometry snapshot, structured meta.json, and a
// human-readable report.md, plus an append to the shared reports.json index. The
// renderer supplies description/images/geometry; main fills the context
// (app version, platform, recent errors) it alone knows. fs-only and
// electron-free so it unit-tests with a real temp dir.

/** Context main attaches that the renderer can't supply. */
export interface BugReportMeta {
  appVersion: string
  platform: string
  errors: ErrorEntry[]
  docPath?: string
}

interface IndexEntry {
  id: string
  timestamp: string
  summary: string
  dir: string
  overlapCount: number
}
interface ReportIndex {
  reports: IndexEntry[]
}

export class BugReportService {
  private genId: () => string
  private now: () => string

  constructor(
    private base: string,
    opts: { genId?: () => string; now?: () => string } = {},
  ) {
    this.genId = opts.genId ?? randomUUID
    this.now = opts.now ?? (() => new Date().toISOString())
  }

  get baseDir(): string {
    return this.base
  }

  write(input: BugReportInput, meta: BugReportMeta): BugReportResult {
    const id = this.genId()
    const dir = join(this.base, id)
    mkdirSync(dir, { recursive: true })
    const timestamp = this.now()

    const images = input.images.map((img, i) => {
      const name = safeImageName(img.name, i)
      writeFileSync(join(dir, name), decodeDataUrl(img.dataUrl))
      return name
    })

    if (input.geometry) {
      writeFileSync(join(dir, 'geometry.json'), JSON.stringify(input.geometry, null, 2))
    }

    const overlapCount = input.geometry?.overlaps.length ?? 0
    const record = {
      id,
      timestamp,
      description: input.description,
      docPath: input.docPath ?? meta.docPath ?? null,
      appVersion: meta.appVersion,
      platform: meta.platform,
      images,
      overlapCount,
      errors: meta.errors,
    }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(record, null, 2))
    writeFileSync(join(dir, 'report.md'), renderMarkdown(record, input.geometry))

    const index = loadJson<ReportIndex>(join(this.base, 'reports.json'), { reports: [] })
    index.reports.push({ id, timestamp, summary: firstLine(input.description), dir, overlapCount })
    atomicWriteJson(join(this.base, 'reports.json'), index)

    return { id, dir }
  }

  /** True when `dir` is the report root or a path under it — the guard the reveal
   *  handler uses so the renderer can't open an arbitrary folder. */
  isWithinBase(dir: string): boolean {
    const rel = relative(this.base, dir)
    return !rel.startsWith('..') && !isAbsolute(rel)
  }
}

/** Strip the `data:<mime>;base64,` prefix and decode to bytes (ClaudeService
 *  attachment-staging pattern). */
function decodeDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:[^;]*;base64,/, ''), 'base64')
}

/** Reduce an untrusted image name to a safe basename inside the report dir. */
function safeImageName(name: string, i: number): string {
  const cleaned = basename(name).replace(/[^\w.-]/g, '_')
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : `image-${i + 1}.png`
}

function firstLine(s: string): string {
  return s.split('\n')[0].trim()
}

function renderMarkdown(
  r: {
    timestamp: string
    description: string
    docPath: string | null
    appVersion: string
    platform: string
    images: string[]
    errors: ErrorEntry[]
  },
  geometry?: GeometrySnapshot,
): string {
  const lines: string[] = [
    '# Bug report',
    '',
    r.description.trim() || '_(no description)_',
    '',
    '---',
    `- **When:** ${r.timestamp}`,
    `- **App version:** ${r.appVersion}`,
    `- **Platform:** ${r.platform}`,
    `- **Document:** ${r.docPath ?? '(none)'}`,
    `- **Images:** ${r.images.length ? r.images.join(', ') : '(none)'}`,
    '',
  ]

  lines.push('## Block overlaps')
  if (!geometry) {
    lines.push('_(no geometry captured)_')
  } else if (geometry.overlaps.length === 0) {
    lines.push('No overlaps detected.')
  } else {
    const n = geometry.overlaps.length
    lines.push(`${n} overlap${n === 1 ? '' : 's'} detected:`)
    for (const o of geometry.overlaps) {
      lines.push(
        `- ${o.a.label} ↔ ${o.b.label} on page ${o.page + 1} (area ${o.region.area.toFixed(1)} pt²)`,
      )
    }
  }
  lines.push('')

  lines.push('## Recent errors')
  if (r.errors.length === 0) {
    lines.push('None.')
  } else {
    for (const e of r.errors) lines.push(`- [${e.label}] ${e.message}`)
  }
  lines.push('')

  return lines.join('\n')
}
