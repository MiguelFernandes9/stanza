import { describe, expect, it } from 'vitest'
import { attachmentKind, isAcceptedAttachment } from './attachments'

describe('attachmentKind', () => {
  it('classifies images by extension (case-insensitive)', () => {
    for (const n of ['a.png', 'b.JPG', 'c.jpeg', 'd.gif', 'e.svg', 'f.webp']) {
      expect(attachmentKind(n)).toBe('image')
    }
  })

  it('classifies PDFs', () => {
    expect(attachmentKind('paper.pdf')).toBe('pdf')
    expect(attachmentKind('PAPER.PDF')).toBe('pdf')
  })

  it('treats everything else readable as text', () => {
    for (const n of ['notes.txt', 'readme.md', 'main.tex', 'refs.bib', 'data.csv', 'x.json']) {
      expect(attachmentKind(n)).toBe('text')
    }
  })
})

describe('isAcceptedAttachment', () => {
  it('accepts images, pdf, and the text family', () => {
    for (const n of ['a.png', 'b.pdf', 'c.txt', 'd.md', 'e.tex', 'f.bib', 'g.csv', 'h.json', 'i.yaml', 'j.html']) {
      expect(isAcceptedAttachment(n)).toBe(true)
    }
  })

  it('rejects types the headless Read tool cannot open (docx, binaries, archives)', () => {
    for (const n of ['report.docx', 'app.exe', 'bundle.zip', 'movie.mp4', 'sheet.xlsx']) {
      expect(isAcceptedAttachment(n)).toBe(false)
    }
  })
})
