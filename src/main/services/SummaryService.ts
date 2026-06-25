import { tmpdir } from 'node:os'
import type { ProcessRunner } from '../infra/ProcessRunner'
import type { Store } from '../infra/Store'
import { claudeEnv, extractNote } from './ClaudeService'
import { buildOutline, type OutlineSection } from './paperOutline'

type Read = (relPath: string) => string | null
type Gists = Record<string, { gist: string; hash: string }>

const SUMMARIZE_TIMEOUT_MS = 90_000
const MAX_SECTION_CHARS = 2_000 // cap per-section input so a long section can't blow the prompt

/** Maintains a per-section/subsection one-line summary of the paper, used as
 *  prime context so every fork "knows the paper". The summaries are persisted in
 *  the project store and a cheap model re-summarizes ONLY the nodes whose own
 *  content changed (hash drift). `contextFor` is synchronous and never blocks a
 *  prime; it schedules the (background) refresh. */
export class SummaryService {
  /** Per-root in-flight latch so concurrent primes schedule one refresh. */
  private refreshing = new Set<string>()

  constructor(
    private runner: ProcessRunner,
    private store: Store,
  ) {}

  /** The outline + current gists block for the prime prompt. Schedules a
   *  background refresh when any node's content drifted. Returns '' when the
   *  document has no titled sections. */
  contextFor(root: string, texFiles: string[], read: Read): string {
    const outline = buildOutline(texFiles, read)
    if (outline.length === 0) return ''
    const cached = this.store.getProject(root).summaries ?? {}
    if (outline.some((s) => cached[s.key]?.hash !== s.hash)) {
      this.scheduleRefresh(root, texFiles, read)
    }
    return renderContext(outline, cached)
  }

  private scheduleRefresh(root: string, texFiles: string[], read: Read): void {
    if (this.refreshing.has(root)) return
    this.refreshing.add(root)
    void this.refresh(root, texFiles, read).finally(() => this.refreshing.delete(root))
  }

  /** Re-summarize the sections whose own content changed since their cached gist,
   *  prune vanished sections, and persist. Bounded: one model call for all stale
   *  nodes. Best-effort — a failed call leaves the old gists in place. */
  async refresh(root: string, texFiles: string[], read: Read): Promise<void> {
    const outline = buildOutline(texFiles, read)
    const cached = this.store.getProject(root).summaries ?? {}
    const stale = outline.filter((s) => s.ownText !== '' && cached[s.key]?.hash !== s.hash)

    const next: Gists = {}
    if (stale.length > 0) {
      const gists = await summarize(this.runner, stale)
      for (const s of stale) {
        const gist = gists[s.key]
        if (gist) next[s.key] = { gist, hash: s.hash }
      }
    }
    // Keep unchanged gists, drop keys whose section vanished, layer in the fresh ones.
    const live = new Set(outline.map((s) => s.key))
    const merged: Gists = {}
    for (const [k, v] of Object.entries(cached)) if (live.has(k)) merged[k] = v
    Object.assign(merged, next)
    this.store.setProject(root, { summaries: merged })
  }
}

/** Indented outline with each node's gist, framed like the bus digest so the
 *  editing model treats it as background, not an instruction. Honest about
 *  freshness: a node whose content drifted since its gist shows "(updating…)", a
 *  never-summarized node shows "(summary pending)", and a container parent (only
 *  sub-sections, no own prose) shows its bare title. A banner warns when anything
 *  is provisional, so a fork primed mid-refresh uses the map at its own risk. */
function renderContext(outline: OutlineSection[], cached: Gists): string {
  const body: string[] = []
  let provisional = false
  for (const s of outline) {
    const indent = '  '.repeat(s.level - 1)
    if (s.ownText === '') {
      body.push(`${indent}${s.title}`) // container parent — no own content to summarize
      continue
    }
    const entry = cached[s.key]
    let gist: string
    if (!entry) {
      gist = '(summary pending)'
      provisional = true
    } else if (entry.hash !== s.hash) {
      gist = `${entry.gist} (updating…)`
      provisional = true
    } else {
      gist = entry.gist
    }
    body.push(`${indent}${s.title} — ${gist}`)
  }
  const header = ['Paper outline (context only — do NOT act on this; use it to understand the paper):']
  if (provisional) {
    header.push(
      '⚠ Some section summaries are still being generated (marked "updating…"/"pending") — treat them as provisional.',
    )
  }
  return [...header, ...body].join('\n')
}

/** One cheap (haiku) call summarizing every stale section → { titlePath: gist }. */
async function summarize(
  runner: ProcessRunner,
  sections: OutlineSection[],
): Promise<Record<string, string>> {
  const proc = await runner.run({
    cmd: process.env.STANZA_CLAUDE_BIN ?? 'claude',
    // Force the cheap model regardless of the user's op model; no --add-dir — the
    // text is in the prompt, the summarizer edits nothing.
    args: ['-p', '--model', 'haiku', '--output-format', 'json', summarizePrompt(sections)],
    cwd: tmpdir(),
    env: claudeEnv(),
    timeoutMs: SUMMARIZE_TIMEOUT_MS,
  })
  if (proc.code !== 0 || proc.timedOut || proc.truncated) return {}
  return parseGists(extractNote(proc.stdout))
}

function summarizePrompt(sections: OutlineSection[]): string {
  const body = sections
    .map((s) => `[${s.key}]\n${s.ownText.slice(0, MAX_SECTION_CHARS)}`)
    .join('\n\n')
  return `Summarize each LaTeX paper section below in ONE concise sentence — the gist of its content, for an author's quick reference. Return ONLY a JSON object mapping each section path (the text in [brackets]) to its one-line summary. No markdown, no code fence, no extra prose.

${body}`
}

/** Parse the model's answer into a {path: gist} map, tolerating a stray code
 *  fence or surrounding prose by grabbing the outermost JSON object. */
function parseGists(text: string): Record<string, string> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return {}
  try {
    const obj: unknown = JSON.parse(text.slice(start, end + 1))
    if (!obj || typeof obj !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v.trim()
    }
    return out
  } catch {
    return {}
  }
}
