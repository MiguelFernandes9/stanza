import type { PdfRect } from '@shared/ipc'
import { isMathEnvName } from './paperModel'
import type { PageBlock } from './paperModel'
import type { TextToken } from './pdfTextTokens'

const FLOAT_RE = /^(figure|table)\*?$/i
const CAPTION_RE = /^(Figure|Table)\s+(\d[\d.]*)/i
const EQN_RE = /^\((\d+(?:\.\d+)*)\)$/
// A float's geometry box is the IMAGE/tabular region — the caption renders just
// outside it (below a figure, above a table). Search this far past the box edge,
// in the box's column, for the caption row; nearest-to-the-box wins.
const CAPTION_BAND = 80

/** The rendered outline label for a numbered block, read from the PDF text
 *  layer inside the block's geometry box (rendered truth — survives chapter
 *  resets, `\nonumber`, starred envs that document order can't):
 *
 *  - float (figure/table): the caption's "Figure N" / "Table N".
 *  - math env (equation/align/…): the `(n)` near the box's right edge →
 *    "Equation N", or a range "Equations a–b" for a multi-line env.
 *  - no number rendered (starred / `\nonumber` / unlabelled): the capitalised
 *    env name with no number ("Figure", "Equation") — honest, no guess.
 *
 *  Returns null for blocks that are neither floats nor math envs (sections and
 *  named leaves keep their own name). Pure — the tokens are passed in. */
export function blockNumber(
  envName: string | undefined,
  boxes: PdfRect[],
  tokens: TextToken[]
): string | null {
  if (!envName) return null
  const isFloat = FLOAT_RE.test(envName)
  const isMath = isMathEnvName(envName)
  if (!isFloat && !isMath) return null

  const box = boxes[0]
  if (!box) return isFloat ? capitalize(envName) : 'Equation'

  if (isFloat) return captionNumber(tokens, box) ?? capitalize(envName)

  const nums = equationNumbers(tokens.filter((t) => withinBox(t, box)), box)
  if (nums.length === 0) return 'Equation'
  if (nums.length === 1) return `Equation ${nums[0]}`
  return `Equations ${nums[0]}–${nums[nums.length - 1]}`
}

/** Rendered numbers for every numbered block, keyed by block id — fed to the
 *  outline label. Blocks with no number entry keep their own name. */
export function buildOutlineNumbers(
  blocks: Pick<PageBlock, 'id' | 'envName'>[],
  boxesById: Map<string, PdfRect[]>,
  tokensByPage: Map<number, TextToken[]>
): Map<string, string> {
  const numbers = new Map<string, string>()
  for (const b of blocks) {
    const boxes = boxesById.get(b.id) ?? []
    const page = boxes[0]?.page
    const tokens = page != null ? (tokensByPage.get(page) ?? []) : []
    const label = blockNumber(b.envName, boxes, tokens)
    if (label) numbers.set(b.id, label)
  }
  return numbers
}

function withinBox(t: TextToken, box: PdfRect): boolean {
  return (
    t.baseline >= box.y &&
    t.baseline <= box.y + box.height &&
    t.xRight >= box.x &&
    t.xLeft <= box.x + box.width
  )
}

/** Caption number from the "Figure N" / "Table N" row in the float's column,
 *  nearest the box (the box covers only the image, so the caption sits just
 *  outside it — below a figure, above a table). Nearest wins so an in-text
 *  "Figure N" reference farther away doesn't shadow the real caption. */
function captionNumber(tokens: TextToken[], box: PdfRect): string | null {
  const bottom = box.y + box.height
  const band = tokens.filter(
    (t) =>
      t.xRight >= box.x &&
      t.xLeft <= box.x + box.width &&
      t.baseline >= box.y - CAPTION_BAND &&
      t.baseline <= bottom + CAPTION_BAND
  )
  let best: { label: string; dist: number } | null = null
  for (const row of rows(band)) {
    const m = CAPTION_RE.exec(row.map((t) => t.text).join(' '))
    if (!m) continue
    const b = row[0].baseline
    const dist = b < box.y ? box.y - b : b > bottom ? b - bottom : 0
    if (!best || dist < best.dist) best = { label: `${capitalize(m[1])} ${m[2]}`, dist }
  }
  return best?.label ?? null
}

/** Equation numbers `(n)` in the box's right margin, one per visual row. */
function equationNumbers(tokens: TextToken[], box: PdfRect | undefined): string[] {
  if (!box) return []
  const margin = box.x + box.width / 2 // right half = the eqno column
  const nums: string[] = []
  for (const row of rows(tokens)) {
    const hit = row
      .filter((t) => t.xLeft >= margin)
      .map((t) => EQN_RE.exec(t.text))
      .find((m): m is RegExpExecArray => m != null)
    if (hit) nums.push(hit[1])
  }
  return nums
}

/** Cluster tokens into visual rows (by baseline), each row sorted left→right
 *  and the rows top→bottom. */
function rows(tokens: TextToken[]): TextToken[][] {
  const sorted = [...tokens].sort((a, b) => a.baseline - b.baseline)
  const out: TextToken[][] = []
  for (const t of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(t.baseline - last[0].baseline) <= 3) last.push(t)
    else out.push([t])
  }
  for (const row of out) row.sort((a, b) => a.xLeft - b.xLeft)
  return out
}

function capitalize(s: string): string {
  const base = s.replace(/\*$/, '')
  return base.charAt(0).toUpperCase() + base.slice(1)
}
