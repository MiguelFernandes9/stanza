# Security

> **Only open projects from people you trust.** Stanza is pre-release
> software. A project folder crafted by someone else (for example a
> downloaded template, a cloned repository, or a zip that includes its `.git`
> folder) may be able to overwrite files elsewhere on your computer, or steer
> the AI agent, when you open and work on it in Stanza. See
> [Known limitations](#known-limitations) below.

## Reporting a vulnerability

Please report vulnerabilities **privately** through
[GitHub Security Advisories](https://github.com/MiguelFernandes9/stanza/security/advisories/new)
on this repository, not in public issues. Include steps to reproduce and the
Stanza version (see `package.json`). Stanza is a pre-release personal
project, so fixes are best-effort, but security reports get priority.

## Security model

Stanza is a single-user, local desktop app.

**What it trusts:**
- the logged-in user;
- the tools it launches from your `PATH` (`claude`, `git`, `tectonic`, `synctex`, `latexdiff`);
- its own UI.

**What it does not trust:** the contents of the projects it opens. `.tex`,
`.bib` and PDF files, any git metadata, and any Claude Code configuration
inside a project folder are all treated as potentially hostile.

Concretely:

- **Claude Code runs headless** (`claude -p`) with your own login. Stanza never
  sees or stores an API key. Project-local Claude configuration
  (`CLAUDE.md`, `.claude/settings.json`, `.mcp.json`) is ignored: only your
  user-level settings apply, project MCP servers are not loaded, and the Bash
  tool is disabled for the agent.
- **AI edits are isolated.** Each operation runs in a temporary git worktree
  with file edits auto-approved *there* (`--permission-mode acceptEdits`).
  Nothing reaches your files until you accept the proposal in a diff review.
- **Git runs hardened.** For Stanza's own git calls, repository hooks,
  fsmonitor, commit and tag signing, and submodule recursion are turned off,
  and external diff and textconv drivers are not run. Your own hooks (for
  example a pre-commit linter) therefore don't run on the commits Stanza
  makes either.
- **Existing repositories are checked before opening.** If the folder already
  has a `.git`, Stanza reads its local config and warns you before running
  any git command if it finds anything outside a short list of harmless
  settings, or if the repository uses submodules, config includes,
  per-worktree config, or a `.git` that points outside the folder. If you
  choose **Open anyway**, git itself may still run that repository's filters
  and merge drivers. Repositories with submodules, or with tools such as Git
  LFS or commit signing set up in the repository's own config (rather than
  your global config), will show this warning.
- **LaTeX compiles with tectonic, with shell-escape off.** You can turn
  shell-escape on per document. Doing so means any edit you accept can run
  commands at the next compile, so only enable it for documents you fully
  trust.

## Known limitations

These are open issues that a crafted project could exploit. They are the
reason for the warning at the top of this page.

- **Symbolic links inside a project are followed.** Stanza writes some
  temporary files (for compiling snippets and previews) into the project
  folder without checking whether that name is a symbolic link, and saving
  or reading a file through a symlinked folder can reach outside the project.
  A crafted project, including one cloned with git, could use this to
  overwrite a file in your home folder, such as a shell startup file.
- **Creating a document in an existing folder overwrites its `main.tex`.**

## Known risk: prompt injection

Stanza asks an LLM agent to read your project. Text in any file the agent
reads can contain hidden instructions ("prompt injection") that steer the
agent. That includes a `.tex` or `.bib` file from a co-author, a template, a
pasted abstract, or a web page the agent fetches.

**Web access (WebFetch / WebSearch) is enabled by default** so the agent can
look up references. That means a successful injection could send parts of
your project to a website. Edits only reach your files after you accept them,
but anything sent over the web cannot be taken back.

Recommendations:

- Turn off web access in **Settings** for confidential or unpublished work.
- Use AI features only on projects whose content you trust.
- Review every proposal, especially changes outside the block you selected.
  Stanza flags those.
- Remember that your own `~/.claude/settings.json` permissions (for example,
  broad `allow` rules) also apply to the agent Stanza runs.
