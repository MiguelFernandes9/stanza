export interface CompileRequest { includeOnly?: string[] }  // chapter scope (M3)
export interface CompileError { file: string; line: number | null; message: string }
export interface CompileResult {
  ok: boolean
  aborted?: boolean     // superseded by a newer compile — not a real failure
  pdfPath?: string      // absolute; set when ok
  synctexPath?: string
  errors: CompileError[]
  log?: string          // raw tectonic .log (or stderr); set on failure for the console
}
export type CompileStatus = 'running' | 'ok' | 'failed'
export interface InversePoint { page: number; x: number; y: number }  // PDF pt
export interface SourceLocation { file: string; line: number }
/** Which column a box occupies on its page. A box is per (page × column): a
 *  full-width block (title, figure*) → one `full` box; a normal block → one
 *  `l`/`r` box; a paragraph that flows across the column break → an `l` box AND
 *  an `r` box. `col` is computed in the geometry layer from the rendered text
 *  layer (parse never sees columns); single-column documents are all `full`, so
 *  omitting/ignoring it is the pre-two-column behaviour. */
export type PdfCol = 'full' | 'l' | 'r'
export interface PdfRect { page: number; x: number; y: number; width: number; height: number; col?: PdfCol }
