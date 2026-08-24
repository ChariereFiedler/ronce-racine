# Reusable hooks

Generic Claude Code hooks, to be wired into `settings.json` (or a repo's `.claude/settings.json`). The harness runs these scripts; they depend on no particular project.

Hooks are authored in TypeScript but SHIP BUILT: the installer copies `.mjs` files that run on plain `node`. A target repo needs Node and nothing else to run them - no `tsx`, no compilation on every invocation (which used to cost about half a second per prompt).

> **Note** - the `install.ts` installer copies the selected hooks and automatically composes the merged `settings.json` snippet - the manual wiring below is only useful for a hand install.


## Wiring rule: exec form, always

Every snippet below uses the **exec form** - `"command"` holds the executable,
`"args"` holds the arguments:

```json
{ "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/skill-reminder.mjs"] }
```

Not the shell form (`"command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/x.mjs"`),
which shipped until 0.7.0 and broke for every adopter whose project path
contained a space - the shell split the expanded path at the space, and on a
Windows box without Git Bash the unbraced `$CLAUDE_PROJECT_DIR` was never
expanded at all. Exec form spawns with no shell: each argument is passed exactly
as written, and `${CLAUDE_PROJECT_DIR}` braced is substituted by Claude Code
itself rather than by whichever shell happens to be there.

Two constraints worth knowing:

- **`node` plus a script path, never the script as the executable.** On Windows
  exec form needs `command` to resolve to a real binary; `node.exe` is one
  everywhere. The `.cmd` shims in `node_modules/.bin` are not.
- **A hook needing shell syntax stays in shell form** - a pipe, `&&`, `|| true`.
  Then every placeholder must be wrapped in double quotes (see the
  `precommit-scan` snippet below), because the shell does the tokenizing.

`ronce-racine install` writes the exec form and repairs a pre-0.8 shell-form
wiring in place, so re-running the installer is enough to pick this up.

---

## Permission gate: the rewriting hooks answer `allow`

`bash-npm-silent` and `truncate-output` change the command that runs. Claude Code
only applies an `updatedInput` when the hook answers
`permissionDecision: "allow"`, so **every command these two rewrite is
auto-approved and skips the permission prompt you would otherwise see.**

Concretely, with both installed, these no longer prompt: `npm install`, `npm ci`
(which run `postinstall` scripts), `cargo build/test/clippy`, `curl …`,
`docker build/logs`, `rustup …`, and unbounded `git log`/`git diff`. Commands
they do not match are unaffected.

This is a real widening of what runs without asking. If that trade is not one you
want, do not install these two hooks - or wire them under an `if` rule narrowing
them to the command classes you accept. The other hooks in this directory observe
without rewriting and do not answer `allow`.

---

## Composition rule: a hook is never alone on its event

Several plugins can observe the same Claude Code event, and `PreToolUse`
`updatedInput` is last-wins. A hook that rewrites a command therefore hands its
output to whatever runs next, plus the transcript and the logs.

**A hook that rewrites a command must preserve the original in readable form.**
`truncate-output` learned this the hard way: it replaced the command with an
opaque base64 blob, which broke every downstream consumer and made transcripts
unreadable. It now carries the original as a trailing shell comment, which runs
to end of line and swallows quotes and apostrophes without interpreting them.

Two corollaries:

- **Rewrite only when the rewrite earns its cost.** `truncate-output` used to
  wrap `git log --oneline -5`, whose output never reaches the truncation
  threshold: pure loss.
- **Never mask an exit code.** Piping through `head` or `tail` replaces the
  command's status with the pipe's. `bash-npm-silent` adds a flag rather than a
  pipe for exactly this reason.

---

## `skill-reminder.ts` - skill suggestion (UserPromptSubmit)

On prompt submit, reads the descriptions of the skills present and suggests those whose triggers match. Self-maintained (no hardcoded list), silent when there is no match, never blocks.

Locates skills in this order: `$CLAUDE_PROJECT_DIR/.claude/skills`, `./.claude/skills`, `./skills`.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/skill-reminder.mjs"] }] }
    ]
  }
}
```

---

## `bash-npm-silent.ts` - silencing npm installs (PreToolUse)

**Event**: `PreToolUse` · **Matcher**: `Bash`

Intercepts `npm install` / `npm ci` calls with no package argument (build/setup) and appends `--silent` to reduce the noise injected into the context. If the command contains `# no-silent`, it is passed through unchanged.

Leaves interactive `npm install <pkg>` calls (adding a dependency) untouched.

**Bypass**: add `# no-silent` in the command.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command",
          "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/bash-npm-silent.mjs"] }] }
    ]
  }
}
```

---

## `truncate-output.ts` + `truncate-bash-output.ts` - truncating verbose output (PreToolUse)

**Event**: `PreToolUse` · **Matcher**: `Bash`

`truncate-output.ts` wraps verbose commands (`cargo build/test`, `npm install`, `git log`, `curl`…): their output is truncated beyond a character threshold. On error (exit ≠ 0), the full output is always preserved for debugging.

`truncate-bash-output.ts` is the helper script invoked by `truncate-output.ts` (actual execution + truncation) - it is not wired separately.

**Bypass**: add `# no-truncate` in the command.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command",
          "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/truncate-output.mjs"] }] }
    ]
  }
}
```

---

## Session memo: `session-writer.ts` + `session-inject.ts` + `session-precompact.ts`

A coordinated trio that persists and re-injects the session context across compactions.

### `session-writer.ts` - writing the memo (Stop)

**Event**: `Stop` · **Matcher**: none (every session end)

Writes a session memo to `~/.claude/projects/<repo-slug>/sessions/<branch>.md` (outside the repo, does not pollute `git status`).

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command",
          "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/session-writer.mjs"] }] }
    ]
  }
}
```

### `session-inject.ts` - re-injection after compaction (SessionStart)

**Event**: `SessionStart` · **Matcher**: `compact`

Re-reads the memo (written by `session-writer`) and injects it as `additionalContext`. Silent exit 0 if there is no memo for the current branch.

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "compact",
        "hooks": [{ "type": "command",
          "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/session-inject.mjs"] }] }
    ]
  }
}
```

### `session-precompact.ts` - anchoring before compaction (PreCompact)

**Event**: `PreCompact` · **Matcher**: none (every compaction)

Injects the memo as `systemMessage` into the compaction prompt, so the generated summary preserves the intent and context of the session.

```json
{
  "hooks": {
    "PreCompact": [
      { "hooks": [{ "type": "command",
          "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/session-precompact.mjs"] }] }
    ]
  }
}
```

---

## `worktree-env-setup.ts` - `.env` symlink in worktrees (SessionStart)

**Event**: `SessionStart` · **Matcher**: none (every session)

If the session starts in a linked git worktree (not the main worktree) and the main repo has a `.env` that is absent from the worktree, creates a `.env → <main-repo>/.env` symlink. Idempotent, never overwrites an existing `.env`. Absolutely fail-open (any error → silent exit 0).

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command",
          "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/worktree-env-setup.mjs"] }] }
    ]
  }
}
```

---

## `readme-freshness.ts` - re-reads the README before a push (PreToolUse/Bash)

**Event**: `PreToolUse` · **Matcher**: `Bash` · **Opt-in** (spends one API call per push)

Before a `git push` that carries structural changes (`install.ts`, `package.json`,
`skills/`, `rules/`, `hooks/`, `agents/`, `scripts/`, `templates/`), asks Claude to
read `README.md` against the diff being pushed and report the claims it
contradicts: a wrong count, a renamed command, a mechanism that changed, a
documented file that moved.

An LLM rather than a grep, because the drift that matters is semantic - "34
skills" or "validated by npm test" stays true-looking to any pattern you can
write, and stops being true the moment the number or the command changes.

**Warns, never blocks, by default.** It fails open on every failure mode: no
`claude` on PATH, not authenticated, timed out, rate-limited, no upstream to
diff against. A push is never held hostage by this check.

| Variable | Effect |
|---|---|
| `RONCE_README_CHECK=block` | a contradiction denies the push instead of warning |
| `RONCE_README_CHECK=off` | skips the check entirely |
| `RONCE_CLAUDE_BIN` | path to the `claude` binary (default: `claude` on PATH) |

Scope: this sees pushes made by Claude. A human typing `git push` in their own
terminal does not go through it - keep a CI job for that guarantee.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command",
          "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/readme-freshness.mjs"] }] }
    ]
  }
}
```

---

## `precommit-scan.ts` - secret/debug scan before commit

Shipped with the `commit-readiness-review` skill (`skills/commit-readiness-review/scripts/precommit-scan.ts`). Read-only, exit 1 if a secret/sensitive file is staged. Two possible wirings:

**Native git hook** (`.husky/pre-commit` or `.git/hooks/pre-commit`):
```bash
exec npx tsx "$CLAUDE_PROJECT_DIR/.claude/skills/commit-readiness-review/scripts/precommit-scan.ts"
```

**Claude Code PreToolUse hook** (warns before a `git commit` launched by the agent):
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command",
          "command": "npx tsx \"${CLAUDE_PROJECT_DIR}/.claude/skills/commit-readiness-review/scripts/precommit-scan.ts\" || true" }] }
    ]
  }
}
```

---

## Installing in a target repo

The `install.ts` installer copies the selected hooks and automatically composes the merged `settings.json` snippet - this is the recommended method.

For a manual install: copy the desired `.mjs` files into `<repo>/.claude/hooks/`, then add the corresponding wiring to `<repo>/.claude/settings.json`. Paths use `${CLAUDE_PROJECT_DIR}` (substituted by Claude Code itself) - no hardcoded absolute path, and no reliance on a shell to expand it.
