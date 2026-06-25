import { describe, expect, it } from 'vitest'
import { fileToAttachment, filesFromTransfer, filesToAttachments, pickedToAttachment } from './attachmentIntake'

// Note: image conversion isn't exercised here — jsdom can't decode an <img>, so a
// thumbnail() await would hang. The text/PDF paths (no thumbnail) and the pure
// mappers cover the logic; image decode is left to the live app.

describe('fileToAttachment', () => {
  it('converts an accepted text file to a data-URL attachment', async () => {
    const att = await fileToAttachment(new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    expect(att).not.toBeNull()
    expect(att!.kind).toBe('text')
    expect(att!.name).toBe('notes.txt')
    expect(att!.dataUrl?.startsWith('data:')).toBe(true)
    expect(att!.id).toBeTruthy()
  })

  it('classifies a PDF', async () => {
    const att = await fileToAttachment(new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' }))
    expect(att!.kind).toBe('pdf')
  })

  it('rejects a type the Read tool cannot open (returns null)', async () => {
    expect(await fileToAttachment(new File(['x'], 'report.docx'))).toBeNull()
    expect(await fileToAttachment(new File(['x'], 'archive.zip'))).toBeNull()
  })
})

describe('filesToAttachments', () => {
  it('keeps accepted files and drops the rest', async () => {
    const out = await filesToAttachments([
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.docx'),
      new File(['c'], 'c.md', { type: 'text/markdown' }),
    ])
    expect(out.map((a) => a.name)).toEqual(['a.txt', 'c.md'])
  })

  it('gives each attachment a distinct id', async () => {
    const out = await filesToAttachments([
      new File(['a'], 'a.txt'),
      new File(['b'], 'b.txt'),
    ])
    expect(new Set(out.map((a) => a.id)).size).toBe(2)
  })
})

describe('filesFromTransfer', () => {
  it('returns the dropped files', () => {
    const f = new File(['x'], 'x.png', { type: 'image/png' })
    const dt = { files: [f], items: [] } as unknown as DataTransfer
    expect(filesFromTransfer(dt)).toEqual([f])
  })

  it('is empty for a null transfer', () => {
    expect(filesFromTransfer(null)).toEqual([])
  })
})

describe('pickedToAttachment', () => {
  it('maps a picked file to a srcPath attachment (bytes stay on disk)', () => {
    const att = pickedToAttachment({ path: '/tmp/refs.pdf', name: 'refs.pdf', kind: 'pdf', thumbDataUrl: undefined })
    expect(att.srcPath).toBe('/tmp/refs.pdf')
    expect(att.dataUrl).toBeUndefined()
    expect(att.kind).toBe('pdf')
    expect(att.name).toBe('refs.pdf')
  })
})
