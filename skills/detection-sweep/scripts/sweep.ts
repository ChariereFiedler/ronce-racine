#!/usr/bin/env -S npx tsx
/**
 * Generic, read-only detection sweep: flags common problems to triage.
 * Paired with the detection-sweep skill. Writes/modifies nothing - produces a report.
 *
 *   npx tsx sweep.ts [path]       # default: current directory
 *
 * Broad heuristics (false positives accepted): the skill decides what to ticket.
 */
import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".";
const PRUNE = new Set(["node_modules", "target", "dist", "build", ".git", "vendor", ".nuxt", ".next"]);
const EXT = /\.(ts|tsx|js|vue|py|go|rs|php|java)$/;
const BIG_FILE_LINES = 800; // beyond this, a file is a candidate for splitting

function walk(dir: string, acc: string[] = []): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!PRUNE.has(e.name)) walk(join(dir, e.name), acc);
    } else if (EXT.test(e.name)) {
      acc.push(join(dir, e.name));
    }
  }
  return acc;
}

const files = walk(root).map((f) => {
  try {
    return { f, lines: readFileSync(f, "utf8").split("\n") };
  } catch {
    return { f, lines: [] as string[] };
  }
});

function count(re: RegExp): number {
  let n = 0;
  for (const { lines } of files) for (const l of lines) if (re.test(l)) n++;
  return n;
}
function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}
function row(label: string, re: RegExp): void {
  console.log(label.padEnd(40) + count(re));
}

section("Flagged debt");
row("TODO/FIXME/HACK", /TODO|FIXME|HACK|XXX/);
row("Lint/type suppressions", /@ts-ignore|@ts-nocheck|eslint-disable|type:\s*ignore|#\[allow\(/);

section("Debug leftovers (lines to check)");
row("Debug statements", /console\.(log|debug)|debugger;|dbg!\(|var_dump|binding\.pry|fmt\.Println/);

section("Fragile / disabled tests");
row("Hardcoded waits", /waitForTimeout|sleep\(|Thread\.sleep/);
row("Disabled tests", /\.skip\(|xit\(|xdescribe\(|#\[ignore\]|@Disabled|@pytest\.mark\.skip/);

section("Suspicious error handling");
row("Swallowed errors / unwrap", /catch\s*\([^)]*\)\s*\{\s*\}|except[^:]*:\s*pass|\.unwrap\(\)|panic!\(/);

section("Potential secrets (check)");
row("Secret patterns", /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk_live_|glpat-|ghp_/);

section(`Large files (> ${BIG_FILE_LINES} lines)`);
files
  .map(({ f, lines }) => ({ f, n: lines.length }))
  .filter(({ n }) => n > BIG_FILE_LINES)
  .sort((a, b) => b.n - a.n)
  .slice(0, 15)
  .forEach(({ f, n }) => console.log(`${String(n).padStart(6)}  ${f}`));

console.log("\n→ Triage these signals: 1 ticket per root cause, not 1 per occurrence (see the detection-sweep skill).");
