export interface CompileRequest { includeOnly?: string[] }  // chapter scope (M3)
export interface CompileError { file: string; line: number | null; message: string }
export interface CompileResult {
  ok: boolean
  aborted?: boolean     // superseded by a newer compile — not a real failure
  pdfPath?: string      // absolute; set when ok
  synctexPath?: string
  errors: CompileError[]
}
export type CompileStatus = 'running' | 'ok' | 'failed'
export interface InversePoint { page: number; x: number; y: number }  // PDF pt
export interface SourceLocation { file: string; line: number }
export interface PdfRect { page: number; x: number; y: number; width: number; height: number }
