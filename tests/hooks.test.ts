#!/usr/bin/env tsx
/**
 * Behavioral tests of the hooks: command rewriting (bash-npm-silent,
 * truncate-output), session-memo trio (schema + persistence), worktree-env-setup.
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import {
  test, assert, contains, absent, hook, freshRepo, initWork, finish, WORK,
  type Run,
} from "./helpers.js";
import { buildMemo, persistMemo, repoSlug, branchSlug } from "../hooks/session-writer.js";
import { truncateOutput, THRESHOLD } from "../hooks/truncate-bash-output.js";

initWork();

function updatedCommand(r: Run): string | null {
  if (!r.stdout.trim()) return null;
  try {
    return JSON.parse(r.stdout)?.hookSpecificOutput?.updatedInput?.command ?? null;
  } catch {
    return null;
  }
}

// ---- bash-npm-silent -----------------------------------------------------

test("bash-npm-silent: `npm ci` gets --silent and NO exit-masking pipe", () => {
  const cmd = updatedCommand(hook("bash-npm-silent.ts", { tool_name: "Bash", tool_input: { command: "npm ci" } }));
  assert(cmd === "npm ci --silent", `expected 'npm ci --silent', got ${JSON.stringify(cmd)}`);
  absent(cmd, "tail", "must not pipe through tail (would mask the exit code)");
  absent(cmd, "|", "must not add a pipe (would mask the exit code)");
});

test("bash-npm-silent: `npm install <pkg>` is left untouched (deliberate add)", () => {
  const cmd = updatedCommand(hook("bash-npm-silent.ts", { tool_name: "Bash", tool_input: { command: "npm install lodash" } }));
  assert(cmd === null, `dependency add must not be rewritten, got ${JSON.stringify(cmd)}`);
});

test("bash-npm-silent: compound command is left untouched", () => {
  const cmd = updatedCommand(hook("bash-npm-silent.ts", { tool_name: "Bash", tool_input: { command: "npm ci && npm run build" } }));
  assert(cmd === null, `compound command must not be rewritten, got ${JSON.stringify(cmd)}`);
});

// ---- truncate-output -----------------------------------------------------

test("truncate-output: wraps cargo with a portable runtime (npx tsx, not strip-types)", () => {
  const cmd = updatedCommand(hook("truncate-output.ts", { tool_name: "Bash", tool_input: { command: "cargo build" } }));
  assert(cmd !== null, "cargo build should be wrapped");
  contains(cmd!, "npx -y tsx", "must run helper via npx tsx (works on any Node)");
  absent(cmd!, "experimental-strip-types", "must not depend on Node >= 22.6");
});

test("truncate-output: no longer touches `npm ci` (bash-npm-silent owns it)", () => {
  const cmd = updatedCommand(hook("truncate-output.ts", { tool_name: "Bash", tool_input: { command: "npm ci" } }));
  assert(cmd === null, `npm ci must not be double-handled, got ${JSON.stringify(cmd)}`);
});

// ---- session memo trio ---------------------------------------------------

test("buildMemo is deterministic and carries branch + intent", () => {
  const memo = buildMemo("feat/x", "ship the thing", "2026-01-01 00:00");
  contains(memo, "# Session - 2026-01-01 00:00", "fixed timestamp");
  contains(memo, "`feat/x`", "branch");
  contains(memo, "> ship the thing", "user intent");
});

test("persistMemo writes the memo derived from the transcript", () => {
  const repo = freshRepo("memo");
  const home = join(WORK, "home-memo");
  const transcript = join(WORK, "transcript.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "user", message: { role: "user", content: "do the migration" } }) + "\n");
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  try {
    persistMemo(repo, transcript, "2026-01-01 00:00");
    const memoPath = join(home, ".claude/projects", repoSlug(repo), "sessions", branchSlug("master") + ".md");
    assert(existsSync(memoPath), `memo should be written at ${memoPath}`);
    contains(readFileSync(memoPath, "utf8"), "do the migration", "memo should capture the intent");
  } finally {
    process.env.HOME = prevHome;
  }
});

test("session-inject emits the CORRECT SessionStart schema (nested additionalContext)", () => {
  const repo = freshRepo("inject");
  const home = join(WORK, "home-inject");
  const memoPath = join(home, ".claude/projects", repoSlug(repo), "sessions", branchSlug("master") + ".md");
  mkdirSync(dirname(memoPath), { recursive: true });
  writeFileSync(memoPath, "# Session\nprevious work here\n");

  const r = hook("session-inject.ts", {}, { HOME: home, CLAUDE_PROJECT_DIR: repo });
  assert(r.stdout.trim().length > 0, "inject should emit context when a memo exists");
  const out = JSON.parse(r.stdout);
  assert(out.hookSpecificOutput?.hookEventName === "SessionStart", "must nest under hookSpecificOutput with hookEventName");
  contains(out.hookSpecificOutput?.additionalContext ?? "", "previous work here", "must inject the memo content");
  assert(out.additionalContext === undefined, "must NOT use the (ignored) top-level additionalContext field");
});

// ---- worktree-env-setup --------------------------------------------------

/** Main repo + a linked worktree, with a .env in the main repo. */
function repoWithWorktree(name: string): { main: string; wt: string } {
  const main = freshRepo(name);
  writeFileSync(join(main, ".env"), "SECRET=1\n");
  const wt = join(WORK, name + "-wt");
  rmSync(wt, { recursive: true, force: true });
  spawnSync("git", ["worktree", "add", "-q", wt], { cwd: main });
  return { main, wt };
}

test("worktree-env-setup symlinks .env into a linked worktree (and is idempotent)", () => {
  const { main, wt } = repoWithWorktree("wt-link");
  const r = hook("worktree-env-setup.ts", {}, { CLAUDE_PROJECT_DIR: wt });
  assert(r.status === 0, `hook exit ${r.status}: ${r.stderr}`);
  const envWt = join(wt, ".env");
  assert(readFileSync(envWt, "utf8") === "SECRET=1\n", ".env must resolve to the main repo's file");
  const r2 = hook("worktree-env-setup.ts", {}, { CLAUDE_PROJECT_DIR: wt });
  assert(r2.status === 0, "second run must stay silent (idempotent)");
  void main;
});

test("worktree-env-setup repairs a BROKEN .env symlink, never a real file", () => {
  const { wt } = repoWithWorktree("wt-broken");
  const envWt = join(wt, ".env");
  spawnSync("ln", ["-s", join(wt, "does-not-exist"), envWt]);
  hook("worktree-env-setup.ts", {}, { CLAUDE_PROJECT_DIR: wt });
  assert(readFileSync(envWt, "utf8") === "SECRET=1\n", "broken symlink must be replaced by the correct link");

  const { wt: wt2 } = repoWithWorktree("wt-realfile");
  writeFileSync(join(wt2, ".env"), "LOCAL=override\n");
  hook("worktree-env-setup.ts", {}, { CLAUDE_PROJECT_DIR: wt2 });
  assert(readFileSync(join(wt2, ".env"), "utf8") === "LOCAL=override\n", "a real .env must never be touched");
});

test("worktree-env-setup does nothing in a main (non-linked) worktree", () => {
  const repo = freshRepo("wt-main-only");
  writeFileSync(join(repo, ".env"), "SECRET=1\n");
  const r = hook("worktree-env-setup.ts", {}, { CLAUDE_PROJECT_DIR: repo });
  assert(r.status === 0 && r.stdout.trim() === "", "must exit 0 silently outside a linked worktree");
});

// ---- skill-reminder --------------------------------------------------------

test("skill-reminder suggests the matching skill, stays silent otherwise", () => {
  const hit = hook("skill-reminder.ts", { prompt: "lance un sweep sur le projet" });
  assert(hit.status === 0, `hook exit ${hit.status}`);
  contains(hit.stdout, "detection-sweep", "a matching trigger must suggest its skill");

  const miss = hook("skill-reminder.ts", { prompt: "zzz qqq nothing relevant here" });
  assert(miss.status === 0 && miss.stdout.trim() === "", "no match must stay silent");

  const garbage = hook("skill-reminder.ts", "not json" as unknown);
  assert(garbage.status === 0 && garbage.stdout.trim() === "", "garbage stdin must fail open silently");
});

// ---- truncateOutput (unit) -------------------------------------------------

test("truncateOutput keeps short output, truncates long output head+tail", () => {
  assert(truncateOutput("short") === "short", "short output must pass through");

  const long = Array.from({ length: 500 }, (_, i) => `line ${i} ${"x".repeat(20)}`).join("\n");
  const cut = truncateOutput(long);
  assert(cut.length < long.length, "long output must shrink");
  contains(cut, "line 0 ", "head must be kept");
  contains(cut, "line 499 ", "tail must be kept");
  contains(cut, "lines omitted", "omission marker expected");

  // Over the char threshold but too few lines to cut: left untouched.
  const fewLines = "y".repeat(THRESHOLD + 100);
  assert(truncateOutput(fewLines) === fewLines, "few-lines output must pass through");
});

// ---- rewrite-hook skip branches ---------------------------------------------

test("bash-npm-silent skip branches: # no-silent, already silent, non-Bash tool", () => {
  const bypass = updatedCommand(hook("bash-npm-silent.ts", { tool_name: "Bash", tool_input: { command: "npm ci # no-silent" } }));
  assert(bypass === null, `# no-silent must bypass, got ${JSON.stringify(bypass)}`);
  const already = updatedCommand(hook("bash-npm-silent.ts", { tool_name: "Bash", tool_input: { command: "npm ci --silent" } }));
  assert(already === null, `already-silent must not be rewritten, got ${JSON.stringify(already)}`);
  const notBash = updatedCommand(hook("bash-npm-silent.ts", { tool_name: "Read", tool_input: { command: "npm ci" } }));
  assert(notBash === null, "non-Bash tool must pass through");
});

test("truncate-output skip branches: already piped, # no-truncate", () => {
  const piped = updatedCommand(hook("truncate-output.ts", { tool_name: "Bash", tool_input: { command: "cargo build | head -50" } }));
  assert(piped === null, `already-piped command must not be double-wrapped, got ${JSON.stringify(piped)}`);
  const bypass = updatedCommand(hook("truncate-output.ts", { tool_name: "Bash", tool_input: { command: "cargo build # no-truncate" } }));
  assert(bypass === null, `# no-truncate must bypass, got ${JSON.stringify(bypass)}`);
});

// ---- session trio: remaining branches ---------------------------------------

test("session-inject stays silent when no memo exists", () => {
  const repo = freshRepo("inject-empty");
  const home = join(WORK, "home-empty");
  mkdirSync(home, { recursive: true });
  const r = hook("session-inject.ts", {}, { HOME: home, CLAUDE_PROJECT_DIR: repo });
  assert(r.status === 0 && r.stdout.trim() === "", "no memo must produce no output");
});

test("session-precompact persists a memo from the event's transcript", () => {
  const repo = freshRepo("precompact");
  const home = join(WORK, "home-precompact");
  const transcript = join(WORK, "precompact.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "user", message: { role: "user", content: "refactor the parser" } }) + "\n");
  const r = hook("session-precompact.ts", { transcript_path: transcript, cwd: repo }, { HOME: home, CLAUDE_PROJECT_DIR: repo });
  assert(r.status === 0, `precompact exit ${r.status}: ${r.stderr}`);
  const memoPath = join(home, ".claude/projects", repoSlug(repo), "sessions", branchSlug("master") + ".md");
  assert(existsSync(memoPath), "precompact must write the memo");
  contains(readFileSync(memoPath, "utf8"), "refactor the parser", "memo must carry the intent");
});

finish("hooks");
