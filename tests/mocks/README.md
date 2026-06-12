# Claude CLI mock (plan T4)

`claude-mock.sh` is a fake `claude` executable: it matches the call
against a recording, applies that recording's file edits to **cwd**
(ClaudeService spawns with cwd = document root), and prints Claude
Code-style `--output-format json` result JSON. The timeout recording
sleeps until killed instead.

## Using it

- **Unit/integration (T5):** point ClaudeService's runner at
  `tests/mocks/claude-mock.sh`, or prepend `tests/mocks/bin/` to
  `PATH` (it holds a `claude` symlink).
- **E2E (T6):** launch the app with
  `STANZA_CLAUDE_BIN=$PWD/tests/mocks/claude-mock.sh` (backend B10
  reads this env var).
- Alternate recordings dir: `STANZA_MOCK_RECORDINGS=<dir>`.

## Recording format (`recordings/*.json`)

Read in filename order, first match wins — hence the `NN-` prefixes.

```jsonc
{
  "match": {
    "promptRegex": "formalize",      // tested case-insensitively against the prompt arg
    "argsInclude": ["--resume"]      // every entry must be an exact argv element
  },
  "sleepForever": false,             // true = hang until killed, print nothing
  "edits": [
    { "file": "@span", "op": "replaceSpan", "content": "..." },
    // "@span" = file of the first span line in the op prompt
    // ("- <file> lines <a>-<b>"); replaceSpan swaps those lines.
    { "file": "preamble.tex", "op": "append",  "content": "..." },
    { "file": "notes.tex",    "op": "write",   "content": "..." },
    { "file": "main.tex",     "op": "replace", "find": "old", "content": "new" }
  ],
  "result": "text that becomes ClaudeResult.note"
}
```

No match → error JSON on stdout, exit 1 (loud, never silent).
Contract is pinned by `claude-mock.test.ts`.
