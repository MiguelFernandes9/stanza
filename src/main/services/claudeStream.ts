/** Normalized event from one line of `claude -p --output-format stream-json`.
 *  The renderer turns these into the op bubble's live thinking + activity feed. */
export type StreamEvent =
  | { kind: 'thinking'; text: string } // the model's reasoning (partial delta or whole block)
  | { kind: 'text'; text: string } // assistant prose (the eventual note, streamed)
  | { kind: 'tool'; label: string } // a tool call, as a human activity line
  | { kind: 'result'; note: string; isError: boolean } // the terminal result line

/** Parse ONE JSONL line of the CLI stream into zero or more normalized events.
 *  Two layers carry the same content at different granularities, and we read
 *  BOTH so the feed works whether or not `--include-partial-messages` emits:
 *   - `stream_event` content_block_delta → token-level thinking/text deltas;
 *   - a whole `assistant` message → its complete content blocks (text, thinking,
 *     tool_use as an activity label);
 *   - `result` → the final note (trust `is_error`, not `subtype`, which the CLI
 *     can still report as "success" on an auth failure).
 *  `system`/`user`/unknown/non-JSON lines yield []. Never throws. */
export function interpretStreamLine(line: string): StreamEvent[] {
  const trimmed = line.trim()
  if (!trimmed) return []
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return []
  }

  if (obj.type === 'stream_event') return fromStreamEvent(obj.event)
  if (obj.type === 'assistant') return fromAssistantMessage(obj.message)
  if (obj.type === 'result') {
    const note = typeof obj.result === 'string' ? obj.result : ''
    return [{ kind: 'result', note, isError: obj.is_error === true }]
  }
  return []
}

/** The terminal note of a completed stream-json run: the last `result` line's
 *  text and its error flag. Falls back to the trimmed raw output when no result
 *  line is present (e.g. a crash before the stream emitted one). */
export function extractStreamNote(stdout: string): { note: string; isError: boolean } {
  let found: { note: string; isError: boolean } | null = null
  for (const line of stdout.split('\n')) {
    for (const ev of interpretStreamLine(line)) {
      if (ev.kind === 'result') found = { note: ev.note, isError: ev.isError }
    }
  }
  return found ?? { note: stdout.trim(), isError: false }
}

/** A partial content_block_delta — one token's worth of thinking or text. */
function fromStreamEvent(event: unknown): StreamEvent[] {
  if (!isObj(event) || event.type !== 'content_block_delta') return []
  const delta = event.delta
  if (!isObj(delta)) return []
  if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
    return [{ kind: 'thinking', text: delta.thinking }]
  }
  if (delta.type === 'text_delta' && typeof delta.text === 'string') {
    return [{ kind: 'text', text: delta.text }]
  }
  return []
}

/** A whole assistant message — flatten its content blocks to events. */
function fromAssistantMessage(message: unknown): StreamEvent[] {
  if (!isObj(message) || !Array.isArray(message.content)) return []
  const out: StreamEvent[] = []
  for (const block of message.content) {
    if (!isObj(block)) continue
    if (block.type === 'thinking' && typeof block.thinking === 'string') {
      out.push({ kind: 'thinking', text: block.thinking })
    } else if (block.type === 'text' && typeof block.text === 'string') {
      out.push({ kind: 'text', text: block.text })
    } else if (block.type === 'tool_use' && typeof block.name === 'string') {
      out.push({ kind: 'tool', label: toolLabel(block.name, block.input) })
    }
  }
  return out
}

/** Human-readable activity line for a tool call. */
function toolLabel(name: string, input: unknown): string {
  const file = isObj(input) && typeof input.file_path === 'string' ? basename(input.file_path) : ''
  switch (name) {
    case 'Read':
      return file ? `Reading ${file}` : 'Reading a file'
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return file ? `Editing ${file}` : 'Editing a file'
    case 'Grep':
    case 'Glob':
      return 'Searching'
    case 'Bash': {
      const cmd = isObj(input) && typeof input.command === 'string' ? input.command : ''
      return /\btectonic\b/.test(cmd) ? 'Compiling' : 'Running a command'
    }
    default:
      return name
  }
}

function basename(p: string): string {
  return p.replace(/[/\\]+$/, '').replace(/^.*[/\\]/, '')
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
