#!/usr/bin/env -S npx tsx
/**
 * Detects subscriptions / listeners / timers without teardown in the staged diff.
 * Read-only. Companion of the subscription-cleanup.md rule.
 *
 *   npx tsx subscription-leak-scan.ts            # scans `git diff --cached`
 *   npx tsx subscription-leak-scan.ts --all      # includes unstaged changes
 *   npx tsx subscription-leak-scan.ts --strict   # exit 1 on leak (CI / pre-commit)
 *
 * Line-by-line heuristic (does not follow a multi-line subscribe): exclude a
 * line with a `leak-scan:allow` comment.
 */
import { execSync } from "node:child_process";

const all = process.argv.includes("--all");
const strict = process.argv.includes("--strict");
const range = all ? "HEAD" : "--cached";

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? "";
  }
}

const added = sh(`git diff ${range} -U0`)
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .map((l) => l.slice(1))
  .filter((l) => !/leak-scan:allow/.test(l));

const TEARDOWN = /take\(\s*1\s*\)|takeUntil(Destroyed)?\(|\|\s*async\b|firstValueFrom|\.unsubscribe\(/;

interface Leak { kind: string; line: string }
const leaks: Leak[] = [];
for (const line of added) {
  if (/\.subscribe\(/.test(line) && !TEARDOWN.test(line))
    leaks.push({ kind: "subscribe without teardown", line });
  else if (/addEventListener\(/.test(line))
    leaks.push({ kind: "addEventListener (check removeEventListener)", line });
  else if (/setInterval\(/.test(line))
    leaks.push({ kind: "setInterval (check clearInterval)", line });
}

if (!leaks.length) {
  console.log("✓ No subscription/listener/timer without an apparent teardown in scope.");
  process.exit(0);
}
console.log(`⚠ ${leaks.length} potential leak(s) (subscription-cleanup):`);
for (const l of leaks) console.log(`    [${l.kind}] ${l.line.trim()}`);
console.log("→ Add a teardown, or annotate the line with `leak-scan:allow` if justified.");
process.exit(strict ? 1 : 0);
