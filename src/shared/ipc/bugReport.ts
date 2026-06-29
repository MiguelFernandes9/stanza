import type { PdfRect } from './compile'

// In-app bug reporter (alpha dogfood). The renderer gathers a description, any
// pasted/picked images, and a snapshot of the current block geometry; main writes
// it all to <userData>/bug-reports/<id>/ so a later session can read and fix it.

/** One attached image. `dataUrl` is a `data:image/...;base64,...` string (pasted
 *  from the clipboard or read from a picked file) — main base64-decodes it to a
 *  real file, mirroring ClaudeService attachment staging. */
export interface BugReportImage {
  name: string
  dataUrl: string
}

/** One block's rendered footprint, with the source identity needed to locate it.
 *  `rects` is one box per (page, column) — a block can span pages/columns. */
export interface GeometryBox {
  blockId: string
  file: string
  startLine: number
  endLine: number
  kind: string
  name?: string
  rects: PdfRect[]
}

/** A detected collision between two blocks whose rendered boxes overlap on a page
 *  (ancestor/descendant nesting is excluded upstream — only real overlaps land
 *  here). `region` is the intersection rectangle in PDF points. */
export interface GeometryOverlap {
  a: { blockId: string; label: string }
  b: { blockId: string; label: string }
  page: number
  region: { x: number; y: number; width: number; height: number; area: number }
}

/** Block positions + detected overlaps at the moment a report is filed — the
 *  payload that makes stanza's overlap bugs (galley collision, strut overhang,
 *  box-over-equation) diagnosable offline. */
export interface GeometrySnapshot {
  timestamp: string
  mainFile: string
  boxes: GeometryBox[]
  overlaps: GeometryOverlap[]
}

/** What the renderer sends to file a report. `docPath` and `geometry` are best
 *  effort (absent before a document is open). */
export interface BugReportInput {
  description: string
  images: BugReportImage[]
  docPath?: string
  geometry?: GeometrySnapshot
}

/** What main returns: the report id and the absolute dir it was written to (the
 *  dir is what "Reveal in Finder" opens). */
export interface BugReportResult {
  id: string
  dir: string
}
