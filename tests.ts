#!/usr/bin/env tsx
/**
 * Deterministic behavioral tests for the tooling the content harness (skills.ts)
 * does NOT cover: the installer (plan/install/check/detach, lockfile, drift,
 * detached preservation) and the hooks (command rewriting, exit-code safety,
 * session-memo schema). Run via `tsx tests.ts` (wired into `npm test`).
 *
 * No dates/random: fixtures live under a fixed temp dir, wiped at start.
 */
import {
  mkdirSync, rmSync, writeFileSync, readFileSync, existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildMemo, persistMemo, repoSlug, branchSlug } from "./hooks/session-writer.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const WORK = join(tmpdir(), "ronce-racine-tests");

// ---- tiny test framework -------------------------------------------------
let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function contains(haystack: string, needle: string, msg: string): void {
  if (!haystack.includes(needle)) throw new Error(`${msg} — missing ${JSON.stringify(needle)} in: ${haystack.slice(0, 400)}`);
}
function absent(haystack: string, needle: string, msg: string): void {
  if (haystack.includes(needle)) throw new Error(`${msg} — unexpected ${JSON.stringify(needle)}`);
}

// ---- helpers -------------------------------------------------------------
interface Run { status: number | null; stdout: string; stderr: string; }
function cli(args: string[]): Run {
  const r = spawnSync(TSX, args, { cwd: ROOT, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
function hook(file: string, input: unknown, env: Record<string, string> = {}): Run {
  const r = spawnSync(TSX, [join("hooks", file)], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify(input),
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
function freshRepo(name: string): string {
  const repo = join(WORK, name);
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: repo });
  // Deterministic branch: a fresh repo reports "HEAD" until the first commit.
  spawnSync("git", ["symbolic-ref", "HEAD", "refs/heads/master"], { cwd: repo });
  spawnSync("git", ["-c", "user.email=t@t.dev", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "init"], { cwd: repo });
  return repo;
}
interface Lock { source: string; installed: string[]; detached: string[]; }
function readLock(repo: string): Lock {
  return JSON.parse(readFileSync(join(repo, ".claude/.ronce-racine.json"), "utf8"));
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ==========================================================================
// Installer
// ==========================================================================

test("plan is read-only (writes nothing into the target)", () => {
  const repo = freshRepo("plan");
  const r = cli(["install.ts", "plan", repo]);
  assert(r.status === 0, `plan exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "Analysis of", "plan should print an analysis");
  assert(!existsSync(join(repo, ".claude")), "plan must NOT create .claude/");
});

test("install writes files + a valid lockfile", () => {
  const repo = freshRepo("install");
  const r = cli(["install.ts", "install", repo]);
  assert(r.status === 0, `install exit ${r.status}: ${r.stderr}`);
  const lock = readLock(repo);
  assert(lock.installed.length > 0, "lockfile should list installed tokens");
  assert(Array.isArray(lock.detached) && lock.detached.length === 0, "detached should start empty");
  assert(typeof lock.source === "string" && lock.source.length > 0, "lockfile needs a source");
  assert(existsSync(join(repo, ".claude/rules/shared/.adopted")), ".adopted manifest should exist");
});

test("check is clean right after install", () => {
  const repo = freshRepo("check-clean");
  cli(["install.ts", "install", repo]);
  const r = cli(["install.ts", "check", repo]);
  assert(r.status === 0, `check exit ${r.status}`);
  contains(r.stdout, "match the canonical", "check should report a clean state");
});

test("check detects a modified artifact (soft warns, --strict fails)", () => {
  const repo = freshRepo("check-drift");
  cli(["install.ts", "install", repo]);
  const lock = readLock(repo);
  const ruleTok = lock.installed.find((t) => t.startsWith("rule:"))!;
  const rulePath = join(repo, ".claude/rules/shared", ruleTok.slice("rule:".length));
  writeFileSync(rulePath, readFileSync(rulePath, "utf8") + "\n# LOCAL EDIT\n");

  const soft = cli(["install.ts", "check", repo]);
  assert(soft.status === 0, "soft check should not fail the process");
  contains(soft.stdout, "drift", "soft check should report drift");

  const strict = cli(["install.ts", "check", repo, "--strict"]);
  assert(strict.status === 1, `--strict must exit 1 on drift (got ${strict.status})`);
});

test("re-install PRESERVES a detached, customized artifact (data-loss guard)", () => {
  const repo = freshRepo("detach-preserve");
  cli(["install.ts", "install", repo]);
  const ruleTok = readLock(repo).installed.find((t) => t.startsWith("rule:"))!;
  const rulePath = join(repo, ".claude/rules/shared", ruleTok.slice("rule:".length));

  const CUSTOM = "\n# MY DELIBERATE CUSTOMIZATION\n";
  writeFileSync(rulePath, readFileSync(rulePath, "utf8") + CUSTOM);

  const det = cli(["install.ts", "detach", repo, ruleTok]);
  assert(det.status === 0, `detach exit ${det.status}: ${det.stderr}`);
  assert(readLock(repo).detached.includes(ruleTok), "token should be recorded as detached");

  // Re-install: the documented "idempotent" resync must NOT clobber the edit.
  const re = cli(["install.ts", "install", repo]);
  assert(re.status === 0, `re-install exit ${re.status}`);
  contains(readFileSync(rulePath, "utf8"), CUSTOM.trim(), "customization must survive re-install");
});

test("check does not crash when a canonical file was removed upstream", () => {
  const repo = freshRepo("ghost");
  cli(["install.ts", "install", repo]);
  const lock = readLock(repo);
  lock.installed.push("rule:__ghost__.md");
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), JSON.stringify(lock, null, 2));
  writeFileSync(join(repo, ".claude/rules/shared/__ghost__.md"), "orphan\n");

  const r = cli(["install.ts", "check", repo]);
  assert(r.status === 0, `check must not crash (exit ${r.status}): ${r.stderr}`);
  contains(r.stdout, "canonical-removed", "removed canonical should be reported, not thrown");
});

test("install merges hooks into an existing settings.json (backup + preserve + idempotent)", () => {
  const repo = freshRepo("settings");
  const dc = join(repo, ".claude");
  mkdirSync(dc, { recursive: true });
  const sp = join(dc, "settings.json");
  // A user already has a settings.json with an unrelated hook + custom key.
  writeFileSync(sp, JSON.stringify({
    customKey: "keep me",
    hooks: { Stop: [{ hooks: [{ type: "command", command: "echo bye" }] }] },
  }, null, 2));

  cli(["install.ts", "install", repo]);
  const s1 = JSON.parse(readFileSync(sp, "utf8"));
  assert(s1.customKey === "keep me", "unrelated user setting must be preserved");
  contains(JSON.stringify(s1.hooks), "echo bye", "pre-existing hook must be preserved");
  contains(JSON.stringify(s1.hooks), "skill-reminder.ts", "the new hook must be wired");
  assert(existsSync(sp + ".bak"), "an existing settings.json must be backed up before merge");
  const count1 = (JSON.stringify(s1.hooks).match(/\.claude\/hooks\//g) ?? []).length;

  // Re-install: idempotent — no duplicate wiring.
  cli(["install.ts", "install", repo]);
  const s2 = JSON.parse(readFileSync(sp, "utf8"));
  const count2 = (JSON.stringify(s2.hooks).match(/\.claude\/hooks\//g) ?? []).length;
  assert(count2 === count1, `re-install must not duplicate wirings (was ${count1}, now ${count2})`);
});

test("install --rules-only installs rules only (no skills/hooks/settings)", () => {
  const repo = freshRepo("rules-only");
  const r = cli(["install.ts", "install", repo, "--rules-only"]);
  assert(r.status === 0, `--rules-only exit ${r.status}: ${r.stderr}`);
  const lock = readLock(repo);
  assert(lock.installed.length > 0, "should install some rules");
  assert(lock.installed.every((t) => t.startsWith("rule:")), `only rule tokens expected, got ${lock.installed.join(", ")}`);
  assert(!existsSync(join(repo, ".claude/settings.json")), "no hooks → no settings.json");
});

// ==========================================================================
// Hooks — bash-npm-silent
// ==========================================================================

function updatedCommand(r: Run): string | null {
  if (!r.stdout.trim()) return null;
  try {
    return JSON.parse(r.stdout)?.hookSpecificOutput?.updatedInput?.command ?? null;
  } catch {
    return null;
  }
}

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

// ==========================================================================
// Hooks — truncate-output
// ==========================================================================

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

// ==========================================================================
// Hooks — session memo trio
// ==========================================================================

test("buildMemo is deterministic and carries branch + intent", () => {
  const memo = buildMemo("feat/x", "ship the thing", "2026-01-01 00:00");
  contains(memo, "# Session — 2026-01-01 00:00", "fixed timestamp");
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

// ==========================================================================
// Summary
// ==========================================================================
rmSync(WORK, { recursive: true, force: true });

if (failures.length) {
  console.error(`✗ ${failures.length} test(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ ${passed} behavioral tests passed (installer + hooks)`);
