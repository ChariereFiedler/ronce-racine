# Reusable hooks

Generic Claude Code hooks, to be wired into `settings.json` (or a repo's `.claude/settings.json`). The harness runs these scripts; they depend on no particular project.

All scripts are TypeScript, run via `tsx` (like `install.ts`/`tools/skills.ts`). The target repo must have `tsx` available (`npx tsx` resolves it on the fly).

> **Note** - the `install.ts` installer copies the selected hooks and automatically composes the merged `settings.json` snippet - the manual wiring below is only useful for a hand install.

---

## `skill-reminder.ts` - skill suggestion (UserPromptSubmit)

On prompt submit, reads the descriptions of the skills present and suggests those whose triggers match. Self-maintained (no hardcoded list), silent when there is no match, never blocks.

Locates skills in this order: `$CLAUDE_PROJECT_DIR/.claude/skills`, `./.claude/skills`, `./skills`.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/skill-reminder.ts" }] }
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
          "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/bash-npm-silent.ts" }] }
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
          "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/truncate-output.ts" }] }
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
          "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/session-writer.ts" }] }
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
          "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/session-inject.ts" }] }
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
          "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/session-precompact.ts" }] }
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
          "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/worktree-env-setup.ts" }] }
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
          "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/skills/commit-readiness-review/scripts/precommit-scan.ts || true" }] }
    ]
  }
}
```

---

## Installing in a target repo

The `install.ts` installer copies the selected hooks and automatically composes the merged `settings.json` snippet - this is the recommended method.

For a manual install: copy the desired `.ts` files into `<repo>/.claude/hooks/`, then add the corresponding wiring to `<repo>/.claude/settings.json`. Paths use `$CLAUDE_PROJECT_DIR` (resolved by Claude Code) - no hardcoded absolute path.
