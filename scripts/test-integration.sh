#!/usr/bin/env bash
# Integration tests compile fixtures with real tectonic (spec §9).
# Gate (plan T2.2): skip cleanly when tectonic is absent so plain
# environments stay green; the skip is loud, never silent.
set -euo pipefail

if ! command -v tectonic >/dev/null 2>&1; then
  echo "SKIPPED: tectonic not found on PATH — integration tests not run."
  echo "Install it with: brew install tectonic"
  exit 0
fi

# --passWithNoTests: project-level option is ignored under --project
# filtering when no files match (T3 lands the first real tests).
exec npx vitest run --project integration --passWithNoTests
