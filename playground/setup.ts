#!/usr/bin/env -S npx tsx
/**
 * Generates throwaway target repos to try the installer by hand.
 *
 *   npx tsx playground/setup.ts                 # (re)creates playground/fixtures/<stack>/
 *   npx tsx playground/setup.ts --only <name>   # rebuilds one fixture, keeps the rest
 *   npx tsx playground/setup.ts --only <base>:  # rebuilds a base and its overlays
 *
 * Each fixture is a real git repo with a distinct stack, to observe
 * what `install.ts plan/install` detects and proposes. Idempotent: the
 * fixtures/ folder is fully recreated on each run (it is gitignored).
 */
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { BASES, OVERLAYS, resolve, type CommitStep, type FileEdit, type Fixture } from "./fixtures-def/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");
/** Pinned so a fixture's history is identical on every machine and every run. */
const AUTHOR = ["-c", "user.email=t@t.dev", "-c", "user.name=t"];

/**
 * Runs git strictly inside `repo`.
 *
 * `cwd` alone is not enough: if the fixture repo was not created, or `git init`
 * failed, git walks UP the tree, finds this checkout's own .git and commits the
 * fixture there. That happened on 2026-07-21, putting six `fix(cart)` commits
 * and 600+ junk files into the real history. GIT_CEILING_DIRECTORIES stops the
 * upward search, so a broken fixture fails loudly instead of writing somewhere
 * it should never write.
 *
 * Arguments are an array, never a command string: they carry fixture-authored
 * commit messages, and a realistic one ("fix: don't drop the user's \"pending\"
 * flag") breaks a shell string while `$(...)` in one would run here.
 */
function git(repo: string, args: string[], ceiling: string = FIXTURES): void {
  execFileSync("git", args, {
    cwd: repo,
    stdio: "ignore",
    env: { ...process.env, GIT_CEILING_DIRECTORIES: ceiling },
  });
}

function write(repo: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const dst = join(repo, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, content);
  }
}

/** Applies one patch to `body`, or explains why the file cannot be patched. */
function patched(body: string, edit: FileEdit, rel: string): string {
  if ("append" in edit) return body + edit.append;
  const occurrences = body.split(edit.find).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${rel}: anchor "${edit.find}" matches ${occurrences} times, expected exactly 1`);
  }
  // A function replacer, so a `$&` or `$1` in fixture content is inserted
  // literally rather than read as a String.replace substitution pattern.
  return body.replace(edit.find, () => edit.replace);
}

/** Rewrites files in place from what the previous commit left on disk. */
function applyEdits(repo: string, edits: Record<string, FileEdit[]>): void {
  for (const [rel, list] of Object.entries(edits)) {
    const dst = join(repo, rel);
    if (!existsSync(dst)) throw new Error(`${rel}: cannot patch a file no earlier commit wrote`);
    let body = readFileSync(dst, "utf8");
    for (const edit of list) body = patched(body, edit, rel);
    writeFileSync(dst, body);
  }
}

/** Removes paths, refusing the silent no-op of deleting what was never there. */
function remove(repo: string, paths: string[]): void {
  for (const rel of paths) {
    const dst = join(repo, rel);
    if (!existsSync(dst)) throw new Error(`${rel}: cannot delete a file no earlier commit wrote`);
    rmSync(dst, { recursive: true });
  }
}

/** Materialises one history step, then commits whatever it changed. */
function commitStep(repo: string, step: CommitStep, root: string): void {
  write(repo, step.changes ?? {});
  applyEdits(repo, step.edits ?? {});
  remove(repo, step.deletes ?? []);
  git(repo, ["add", "-A"], root);
  git(repo, [...AUTHOR, "commit", "-q", "-m", step.message], root);
}

/** Writes one fixture as a real git repo under `root`, replacing any previous one. */
export function materialise(f: Fixture, root: string = FIXTURES): void {
  const repo = join(root, f.name);
  rmSync(repo, { recursive: true, force: true });
  write(repo, f.files);
  git(repo, ["init", "-q"], root);
  // The ground truth stays out of git entirely. eval-tasks.ts removes it from
  // the worktree it ships, but a tracked file survives that: `git show
  // :EXPECTED.md` printed the answer key inside the image (found 2026-09-02).
  writeFileSync(join(repo, ".git", "info", "exclude"), "EXPECTED.md\n");
  git(repo, ["add", "-A"], root);
  if (f.extraCommits?.length) {
    // Without this the first layered commit would BE the initial one and carry
    // the whole tree, so a history of "three fixes" would start with a fix that
    // created the file it claims to repair.
    git(repo, [...AUTHOR, "commit", "-q", "-m", "chore: initial import"], root);
  }
  for (const step of f.extraCommits ?? []) commitStep(repo, step, root);
  // Last, and never added: this is what leaves the worktree dirty over an
  // empty index (see Fixture.unstaged).
  write(repo, f.unstaged ?? {});
}

interface Entry {
  fixture: Fixture;
  /** The base it overlays, or null for a base fixture. */
  base: string | null;
}

function entries(): Entry[] {
  return [
    ...BASES.map((fixture) => ({ fixture, base: null })),
    ...OVERLAYS.map((o) => ({ fixture: resolve(o), base: o.base })),
  ];
}

/** `<name>` picks one fixture, `<base>:` picks a base and every overlay on it. */
function select(only: string): Entry[] {
  if (only.endsWith(":")) {
    const base = only.slice(0, -1);
    return entries().filter((e) => e.fixture.name === base || e.base === base);
  }
  return entries().filter((e) => e.fixture.name === only);
}

/** Bases in full, their overlays as one line per base. */
function report(chosen: Entry[]): void {
  const grouped = new Set<string>();
  for (const { fixture } of chosen.filter((e) => e.base === null)) {
    console.log(`✓ ${fixture.name.padEnd(14)} - ${fixture.why}`);
    const overlays = chosen.filter((e) => e.base === fixture.name).map((e) => e.fixture.name);
    if (overlays.length === 0) continue;
    console.log(`  └ ${overlays.length} overlay(s): ${overlays.join(", ")}`);
    for (const name of overlays) grouped.add(name);
  }
  for (const { fixture } of chosen.filter((e) => e.base !== null && !grouped.has(e.fixture.name))) {
    console.log(`✓ ${fixture.name.padEnd(14)} - ${fixture.why}`);
  }
}

function main(argv: string[]): number {
  const flag = argv.indexOf("--only");
  const only = flag === -1 ? null : argv[flag + 1];
  const consumed = flag === -1 ? [] : [flag, flag + 1];
  const rest = argv.filter((_, i) => !consumed.includes(i));
  if (rest.length > 0) {
    console.error(`unknown argument(s): ${rest.join(" ")}`);
    return 1;
  }
  if (flag !== -1 && !only) {
    console.error("--only needs a fixture name, or a base name followed by ':'");
    return 1;
  }

  const chosen = only ? select(only) : entries();
  if (chosen.length === 0) {
    console.error(`--only ${only}: no fixture declares that name`);
    return 1;
  }
  // The full run wipes and rebuilds; --only rebuilds in place, so authoring one
  // scenario does not cost a regeneration of all of them.
  if (!only) {
    rmSync(FIXTURES, { recursive: true, force: true });
    mkdirSync(FIXTURES, { recursive: true });
  }
  for (const { fixture } of chosen) materialise(fixture);
  report(chosen);
  if (only) return 0;

  const install = join(HERE, "..", "install.ts");
  console.log(`\n${chosen.length} target repos in playground/fixtures/. Examples:`);
  console.log(`  npx tsx ${install} plan    playground/fixtures/frontend-vue   # proposal (read-only)`);
  console.log(`  npx tsx ${install} install playground/fixtures/frontend-vue   # interactive selector (TTY)`);
  console.log(`  npx tsx ${install} install playground/fixtures/backend-node --yes   # defaults, no prompt`);
  console.log(`  npx tsx ${install} check   playground/fixtures/frontend-vue   # drift vs canonical (after install)`);
  console.log(`\nRe-running this script resets the fixtures; --only <name> rebuilds just one.`);
  return 0;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) process.exit(main(process.argv.slice(2)));
