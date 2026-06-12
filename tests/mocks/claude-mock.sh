#!/usr/bin/env bash
# Fake `claude` CLI for tests (plan T4). Matches the call against a
# recording in ./recordings/, applies the recording's file edits to
# cwd, prints Claude Code-style result JSON. JSON logic lives in
# claude-mock.mjs; this wrapper exists so anything expecting an
# executable script (PATH prepend, STANZA_CLAUDE_BIN) can use it.
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$dir/claude-mock.mjs" "$@"
