#!/usr/bin/env node
// A fake `claude` that reproduces the op-capture race: it prints its
// JSON result and EXITS, while the actual file edit is performed by a
// detached child that lands STANZA_DEFER_MS later — modelling claude's
// write flushing after the process is gone. Used by op-capture.test.ts.
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const args = process.argv.slice(2)
const sessionId = args.includes('--session-id')
  ? args[args.indexOf('--session-id') + 1]
  : args.includes('--resume')
    ? args[args.indexOf('--resume') + 1]
    : 'mock-session'

const json = (result) =>
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result,
      session_id: sessionId,
    }) + '\n',
  )

// Priming call (--session-id, no --resume): just establish the session.
if (!args.includes('--resume')) {
  json('Primed.')
  process.exit(0)
}

// Op call: schedule the edit in a detached child, print, exit NOW.
const target = join(process.cwd(), 'main.tex')
const deferMs = Number(process.env.STANZA_DEFER_MS ?? '500')
const child = spawn(
  process.execPath,
  [
    '-e',
    `setTimeout(() => {
       const fs = require('fs')
       const f = ${JSON.stringify(target)}
       fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Single-File Fixture', 'Edited Title'))
     }, ${deferMs})`,
  ],
  { detached: true, stdio: 'ignore' },
)
child.unref()

json('Edited the title.')
process.exit(0)
