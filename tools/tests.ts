#!/usr/bin/env tsx
/**
 * Behavioral test runner: discovers and runs every *.test.ts file.
 *
 *   tests/*.test.ts                       - installer, hooks (by domain)
 *   skills/<skill>/scripts/*.test.ts      - each skill script's test procedure,
 *                                           co-located with the script it exercises
 *
 * Each file is standalone (run it directly with `npx tsx <file>`); this runner
 * just executes them all and aggregates the exit codes. Wired into `npm test`.
 */
import { readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

// Optional filter: `tsx tests.ts installer` runs only matching files.
const only = process.argv[2];

const files: string[] = [];
for (const f of readdirSync(join(ROOT, "tests")).sort()) {
  if (f.endsWith(".test.ts")) files.push(join(ROOT, "tests", f));
}
for (const skill of readdirSync(join(ROOT, "skills")).sort()) {
  const scripts = join(ROOT, "skills", skill, "scripts");
  if (!existsSync(scripts)) continue;
  for (const f of readdirSync(scripts).sort()) {
    if (f.endsWith(".test.ts")) files.push(join(scripts, f));
  }
}

const selected = only ? files.filter((f) => f.includes(only)) : files;
if (only && !selected.length) {
  console.error(`no test file matches "${only}"`);
  process.exit(2);
}

let failed = 0;
for (const file of selected) {
  const r = spawnSync(TSX, [file], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) failed++;
}

if (failed) {
  console.error(`✗ ${failed}/${selected.length} test file(s) failed`);
  process.exit(1);
}
console.log(`✓ ${selected.length} test files passed (${selected.map((f) => relative(ROOT, f)).join(", ")})`);
