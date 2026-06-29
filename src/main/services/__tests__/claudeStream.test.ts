import { describe, expect, it } from 'vitest'
import { extractStreamNote, interpretStreamLine } from '../claudeStream'

describe('interpretStreamLine', () => {
  it('ignores system / non-JSON / unknown lines', () => {
    expect(interpretStreamLine('{"type":"system","subtype":"init"}')).toEqual([])
    expect(interpretStreamLine('not json at all')).toEqual([])
    expect(interpretStreamLine('')).toEqual([])
    expect(interpretStreamLine('{"type":"user","message":{}}')).toEqual([])
  })

  it('reads text + thinking blocks from a whole assistant message', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'thinking', thinking: 'I should read the file first.' },
          { type: 'text', text: 'Reading it now.' },
        ],
      },
    })
    expect(interpretStreamLine(line)).toEqual([
      { kind: 'thinking', text: 'I should read the file first.' },
      { kind: 'text', text: 'Reading it now.' },
    ])
  })

  it('maps tool_use blocks to human activity labels', () => {
    const mk = (name: string, input: unknown) =>
      interpretStreamLine(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } }))
    expect(mk('Read', { file_path: '/proj/sections/intro.tex' })).toEqual([{ kind: 'tool', label: 'Reading intro.tex' }])
    expect(mk('Edit', { file_path: '/proj/main.tex' })).toEqual([{ kind: 'tool', label: 'Editing main.tex' }])
    expect(mk('Write', { file_path: '/proj/new.tex' })).toEqual([{ kind: 'tool', label: 'Editing new.tex' }])
    expect(mk('Bash', { command: 'tectonic -X compile main.tex' })).toEqual([{ kind: 'tool', label: 'Compiling' }])
    expect(mk('Grep', { pattern: 'foo' })).toEqual([{ kind: 'tool', label: 'Searching' }])
  })

  it('reads partial thinking_delta / text_delta stream events (token streaming)', () => {
    const think = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'part of a thought' } },
    })
    const text = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'hel' } },
    })
    expect(interpretStreamLine(think)).toEqual([{ kind: 'thinking', text: 'part of a thought' }])
    expect(interpretStreamLine(text)).toEqual([{ kind: 'text', text: 'hel' }])
  })

  it('reads the final result note and flags errors', () => {
    expect(
      interpretStreamLine(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'All done.' })),
    ).toEqual([{ kind: 'result', note: 'All done.', isError: false }])
    // subtype can say "success" even on an auth failure — trust is_error.
    expect(
      interpretStreamLine(
        JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'API Error: 401' }),
      ),
    ).toEqual([{ kind: 'result', note: 'API Error: 401', isError: true }])
  })
})

describe('extractStreamNote', () => {
  it('returns the last result line note + error flag from a JSONL stream', () => {
    const stdout = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Working' }] } }),
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Tightened the intro.' }),
    ].join('\n')
    expect(extractStreamNote(stdout)).toEqual({ note: 'Tightened the intro.', isError: false })
  })

  it('surfaces an errored result', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: true, result: 'API Error: 401' })
    expect(extractStreamNote(stdout)).toEqual({ note: 'API Error: 401', isError: true })
  })

  it('falls back to trimmed raw output when there is no result line', () => {
    expect(extractStreamNote('  oops not json  ')).toEqual({ note: 'oops not json', isError: false })
  })
})
