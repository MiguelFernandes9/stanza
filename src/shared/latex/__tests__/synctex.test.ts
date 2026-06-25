import { describe, expect, it } from 'vitest'
import { parseEditOutput, parseViewOutput } from '../synctex'

describe('parseEditOutput (synctex backward map)', () => {
  it('parses a POSIX Input path', () => {
    expect(parseEditOutput('Output:...\nInput:/Users/me/proj/main.tex\nLine:42\n')).toEqual({
      file: '/Users/me/proj/main.tex',
      line: 42,
    })
  })

  it('normalizes a Windows Input path to forward slashes', () => {
    // synctex on Windows emits a native path; downstream file matching is forward-slash.
    expect(parseEditOutput('Input:C:\\Users\\me\\proj\\chapters\\ch1.tex\nLine:7\n')).toEqual({
      file: 'C:/Users/me/proj/chapters/ch1.tex',
      line: 7,
    })
  })

  it('tolerates CRLF line endings (no trailing \\r in the path)', () => {
    expect(parseEditOutput('Input:C:\\proj\\main.tex\r\nLine:3\r\n')).toEqual({
      file: 'C:/proj/main.tex',
      line: 3,
    })
  })

  it('returns null when the record is incomplete', () => {
    expect(parseEditOutput('Input:/x/main.tex\n')).toBeNull() // no Line
  })
})

describe('parseViewOutput (synctex forward map) — CRLF tolerant', () => {
  it('parses rects whether the stream is LF or CRLF', () => {
    const body = 'Page:2\nh:72\nv:100\nW:468\nH:12\n'
    const lf = parseViewOutput(body)
    const crlf = parseViewOutput(body.replace(/\n/g, '\r\n'))
    expect(lf).toEqual([{ page: 2, x: 72, y: 88, width: 468, height: 12 }])
    expect(crlf).toEqual(lf)
  })
})
