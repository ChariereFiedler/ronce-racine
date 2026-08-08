/**
 * Shared harness for the behavioral test files, running on Vitest.
 *
 * The domain helpers (`hook`, `builtHook`, `cli`, `freshRepo`…) are the point of
 * this file: they spawn the real hooks and the real CLI as subprocesses, which
 * is what makes these tests behavioral rather than unit. The assertion helpers
 * (`test`, `assert`, `contains`, `absent`) are kept as thin wrappers over Vitest
 * so the seven test files did not need rewriting when the runner changed.
 *
 * No dates/random: fixtures live under a per-file temp dir, wiped by initWork().
 */
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test as vitestTest, expect, afterAll } from "vitest";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TSX = join(ROOT, "node_modules", ".bin", "tsx");

/**
 * One workspace per test file, so files run in any order and in parallel.
 *
 * Under the previous runner each file was its own process, so `process.argv[1]`
 * identified it. Vitest runs them from a shared entry point, where argv[1] is
 * the Vitest binary and every file would have collided on one directory. The
 * test path comes from Vitest's own state instead.
 */
function workspaceName(): string {
  const testPath = expect.getState().testPath;
  return testPath ? basename(testPath, ".ts") : basename(process.argv[1] ?? "run", ".ts");
}
export const WORK = join(tmpdir(), "ronce-racine-tests", workspaceName());

/** Declares a case. Same signature as before, so the test files are unchanged. */
export function test(name: string, fn: () => void): void {
  vitestTest(name, fn);
}
export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
export function contains(haystack: string, needle: string, msg: string): void {
  expect(haystack, msg).toContain(needle);
}
export function absent(haystack: string, needle: string, msg: string): void {
  expect(haystack, msg).not.toContain(needle);
}

export interface Run { status: number | null; stdout: string; stderr: string; }
/** Runs the toolkit CLI (install.ts, tools/skills.ts…) from the repo root. */
export function cli(args: string[]): Run {
  const r = spawnSync(TSX, args, { cwd: ROOT, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
/** Runs a hooks/<file> with a JSON stdin payload. */
/**
 * Runs a hook from SOURCE. Prefer builtHook() for anything that must hold in a
 * target repo: two published hooks were dead because their entry guard tested a
 * .ts extension that the shipped .mjs no longer has, and every test ran the
 * source, so nothing noticed.
 */
export function hook(file: string, input: unknown, env: Record<string, string> = {}): Run {
  const r = spawnSync(TSX, [join(ROOT, "hooks", file)], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify(input),
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
/** Runs a skills/<rel> script (e.g. "detection-sweep/scripts/sweep.ts"). */
export function skillScript(rel: string, args: string[], cwd: string): Run {
  const r = spawnSync(TSX, [join(ROOT, "skills", rel), ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A fresh deterministic git repo under WORK. */
export function freshRepo(name: string): string {
  const repo = join(WORK, name);
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: repo });
  // Deterministic branch: a fresh repo reports "HEAD" until the first commit.
  spawnSync("git", ["symbolic-ref", "HEAD", "refs/heads/master"], { cwd: repo });
  gitCommit(repo, "init", true);
  return repo;
}
export function gitCommit(repo: string, msg: string, allowEmpty = false): void {
  spawnSync("git", ["-c", "user.email=t@t.dev", "-c", "user.name=t", "commit", "-q", "-m", msg, ...(allowEmpty ? ["--allow-empty"] : [])], { cwd: repo });
}

export type LockSource = string | { package: string; version: string; contentHash: string };
export interface Lock { source: LockSource; installed: string[]; detached: string[]; }
export function readLock(repo: string): Lock {
  return JSON.parse(readFileSync(join(repo, ".claude/.ronce-racine.json"), "utf8"));
}

/** Wipes and recreates this file's workspace. Call once at the top. */
export function initWork(): void {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
}

/**
 * Registers cleanup of this file's workspace. Vitest reports the verdict, so all
 * that remains of the former runner's `finish()` is the teardown; the call is
 * kept at the bottom of each test file to say plainly what gets cleaned up.
 */
export function finish(_label: string): void {
  afterAll(() => {
    rmSync(WORK, { recursive: true, force: true });
  });
}

/** Runs a hook exactly as a target repo does: the BUILT .mjs, on plain node. */
export function builtHook(file: string, input: unknown, env: Record<string, string> = {}): Run {
  const built = join(ROOT, "dist", "hooks", file.replace(/\.ts$/, ".mjs"));
  const r = spawnSync("node", [built], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify(input),
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
