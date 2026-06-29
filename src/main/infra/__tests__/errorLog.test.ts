import { describe, expect, test } from 'vitest'
import { createErrorLog } from '../errorLog'

describe('errorLog', () => {
  test('records an Error as its message, with the label', () => {
    const log = createErrorLog()
    log.record('uncaughtException', new Error('boom'))
    const [entry] = log.recent()
    expect(entry.label).toBe('uncaughtException')
    expect(entry.message).toBe('boom')
    expect(typeof entry.ts).toBe('string')
  })

  test('stringifies a non-Error reason', () => {
    const log = createErrorLog()
    log.record('unhandledRejection', 'just a string')
    expect(log.recent()[0].message).toBe('just a string')
  })

  test('caps at max, dropping the oldest, preserving chronological order', () => {
    const log = createErrorLog(3)
    log.record('a', new Error('1'))
    log.record('b', new Error('2'))
    log.record('c', new Error('3'))
    log.record('d', new Error('4'))
    expect(log.recent().map((e) => e.message)).toEqual(['2', '3', '4'])
  })

  test('recent() returns a copy — mutating it does not corrupt the ring', () => {
    const log = createErrorLog()
    log.record('a', new Error('1'))
    log.recent().push({ ts: 'x', label: 'y', message: 'z' })
    expect(log.recent()).toHaveLength(1)
  })
})
