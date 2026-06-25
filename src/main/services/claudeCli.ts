// How the app invokes the `claude` CLI: the binary it resolves and the child
// env it runs under. The single source of truth shared by every spawn —
// ClaudeService ops, the SummaryService summarizer, and the availability probe
// — so a change here (or a drift in either) can never make the availability
// flag disagree with what a real op would actually do.

/** The claude binary: an env override for the test harness (T6), else `claude`
 *  on PATH. */
export function claudeBin(): string {
  return process.env.STANZA_CLAUDE_BIN ?? 'claude'
}

/** The child env for the claude CLI, with the API-key overrides removed so the
 *  CLI authenticates with the logged-in Claude subscription (the user's plan)
 *  instead of a pay-per-token API account. A stray `ANTHROPIC_API_KEY` in the
 *  shell/launchd env would otherwise route every op to API credits and fail
 *  with "Credit balance is too low" (BUG-29). The CLI reads its OAuth/session
 *  auth from its own config, not from these vars. */
export function claudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}
