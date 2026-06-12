// Fake `claude` CLI engine (plan T4) — see README.md for the
// recording format. Invoked via claude-mock.sh.
import { readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const recordingsDir =
  process.env.STANZA_MOCK_RECORDINGS ??
  join(dirname(fileURLToPath(import.meta.url)), 'recordings')

// The prompt is the last non-flag argument; flags we know take values.
const VALUED_FLAGS = new Set([
  '--session-id', '--resume', '--add-dir', '--output-format',
  '--permission-mode', '--settings', '--model',
])
let prompt = ''
for (let i = 0; i < args.length; i++) {
  if (VALUED_FLAGS.has(args[i])) i++
  else if (!args[i].startsWith('-')) prompt = args[i]
}

const sessionId =
  args[args.indexOf('--session-id') + 1 ?? -1] && args.includes('--session-id')
    ? args[args.indexOf('--session-id') + 1]
    : args.includes('--resume')
      ? args[args.indexOf('--resume') + 1]
      : 'mock-session'

function fail(message) {
  process.stdout.write(
    JSON.stringify({ type: 'result', subtype: 'error', is_error: true, result: message, session_id: sessionId }) + '\n',
  )
  process.exit(1)
}

// First matching recording wins; files are read in name order, so
// recordings are prefixed 00-, 10-, ... to set precedence.
const recordings = readdirSync(recordingsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(recordingsDir, f), 'utf8')) }))

const recording = recordings.find((r) => {
  const m = r.match ?? {}
  if (m.promptRegex && !new RegExp(m.promptRegex, 'i').test(prompt)) return false
  if (m.argsInclude && !m.argsInclude.every((a) => args.includes(a))) return false
  return true
})
if (!recording) fail(`mock: no recording matched argv ${JSON.stringify(args)}`)

if (recording.sleepForever) {
  setInterval(() => {}, 1 << 30) // hang until killed (timeout recording)
}

// "@span" edits target the first span named in the op prompt
// (format from prompts.ts: "- <file> lines <start>-<end>").
const spanMatch = prompt.match(/^- (.+) lines (\d+)-(\d+)$/m)

function resolveTarget(file) {
  const name = file === '@span' ? spanMatch?.[1] : file
  if (!name) fail(`mock: recording ${recording.file} needs a span in the prompt`)
  const rel = normalize(name)
  if (isAbsolute(rel) || rel.startsWith('..')) fail(`mock: refusing path ${name}`)
  return join(process.cwd(), rel)
}

for (const edit of recording.edits ?? []) {
  const target = resolveTarget(edit.file)
  switch (edit.op) {
    case 'replaceSpan': {
      if (!spanMatch) fail(`mock: replaceSpan needs a span in the prompt`)
      const [start, end] = [Number(spanMatch[2]), Number(spanMatch[3])]
      const lines = readFileSync(target, 'utf8').split('\n')
      lines.splice(start - 1, end - start + 1, ...edit.content.replace(/\n$/, '').split('\n'))
      writeFileSync(target, lines.join('\n'))
      break
    }
    case 'append':
      appendFileSync(target, edit.content)
      break
    case 'write':
      writeFileSync(target, edit.content)
      break
    case 'replace': {
      const text = readFileSync(target, 'utf8')
      if (!text.includes(edit.find)) fail(`mock: "${edit.find}" not found in ${edit.file}`)
      writeFileSync(target, text.replace(edit.find, edit.content))
      break
    }
    default:
      fail(`mock: unknown edit op ${edit.op}`)
  }
}

if (!recording.sleepForever) {
  process.stdout.write(
    JSON.stringify({
      type: 'result', subtype: 'success', is_error: false,
      duration_ms: 42, num_turns: 1,
      result: recording.result ?? 'Done.',
      session_id: sessionId, total_cost_usd: 0,
    }) + '\n',
  )
}
