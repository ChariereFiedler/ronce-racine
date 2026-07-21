/**
 * Shared mini-harness for the behavioral test files (zero deps, tsx only).
 *
 * Each *.test.ts file is standalone: it can be run directly
 * (`npx tsx tests/installer.test.ts`, `npx tsx skills/<s>/scripts/<x>.test.ts`)
 * or discovered by the root runner (`tsx tools/tests.ts`, wired into `npm test`).
 *
 * No dates/random: fixtures live under a per-file temp dir, wiped by initWork().
 */
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TSX = join(ROOT, "node_modules", ".bin", "tsx");
/** One workspace per test file, so files run standalone or in any order. */
export const WORK = join(tmpdir(), "ronce-racine-tests", basename(process.argv[1] ?? "run", ".ts"));

let passed = 0;
const failures: string[] = [];

export function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
  }
}
export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
export function contains(haystack: string, needle: string, msg: string): void {
  if (!haystack.includes(needle)) throw new Error(`${msg} - missing ${JSON.stringify(needle)} in: ${haystack.slice(0, 400)}`);
}
export function absent(haystack: string, needle: string, msg: string): void {
  if (haystack.includes(needle)) throw new Error(`${msg} - unexpected ${JSON.stringify(needle)}`);
}

export interface Run { status: number | null; stdout: string; stderr: string; }
/** Runs the toolkit CLI (install.ts, tools/skills.ts…) from the repo root. */
export function cli(args: string[]): Run {
  const r = spawnSync(TSX, args, { cwd: ROOT, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
/** Runs a hooks/<file> with a JSON stdin payload. */
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

/** Prints this file's verdict and exits non-zero on failure. Call once at the end. */
export function finish(label: string): void {
  rmSync(WORK, { recursive: true, force: true });
  if (failures.length) {
    console.error(`✗ ${label}: ${failures.length} test(s) failed:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ ${passed} ${label} tests passed`);
}
