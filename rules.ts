#!/usr/bin/env -S npx tsx
/**
 * DEPRECATED - rules-only distribution CLI, superseded by `install.ts --rules-only`.
 *
 * Kept working for existing adopters; it will be removed in a future version.
 * Prefer the single CLI, which unifies rules/skills/hooks/agents under one
 * lockfile-based drift mechanism:
 *
 *   npx tsx install.ts install <repo> --rules-only   # install only the rules
 *   npx tsx install.ts check   <repo>                 # drift (all artifacts)
 *
 * Legacy behavior (this file): copies the rules listed in
 *   <repo>/.claude/rules/shared/.adopted   (one filename per line, e.g. `commits.md`)
 * Rules not listed are left intact, so a repo can keep its own enriched version.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL = join(dirname(fileURLToPath(import.meta.url)), "rules");

function adoptedList(repo: string): string[] {
  const manifest = join(repo, ".claude/rules/shared/.adopted");
  if (!existsSync(manifest)) {
    throw new Error(`Missing manifest: ${manifest}\nList the adopted rules (one per line, e.g. commits.md).`);
  }
  return readFileSync(manifest, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function canonical(name: string): string {
  const path = join(CANONICAL, name);
  if (!existsSync(path)) throw new Error(`Unknown canonical rule: ${name}`);
  return readFileSync(path, "utf8");
}

function sync(repo: string): void {
  const dest = join(repo, ".claude/rules/shared");
  mkdirSync(dest, { recursive: true });
  for (const name of adoptedList(repo)) {
    writeFileSync(join(dest, name), canonical(name));
    console.log(`✓ ${name}`);
  }
}

function check(repo: string): void {
  const dest = join(repo, ".claude/rules/shared");
  const drifted: string[] = [];
  for (const name of adoptedList(repo)) {
    const local = join(dest, name);
    if (!existsSync(local) || readFileSync(local, "utf8") !== canonical(name)) {
      drifted.push(name);
    }
  }
  if (drifted.length) {
    console.error(`Drift detected (run \`rules.ts sync\`):\n  ${drifted.join("\n  ")}`);
    process.exit(1);
  }
  console.log("✓ rules up to date");
}

const [cmd, repo] = process.argv.slice(2);
if (!repo || (cmd !== "sync" && cmd !== "check")) {
  console.error("usage: rules.ts <sync|check> <repo>");
  process.exit(2);
}
console.error("⚠ rules.ts is DEPRECATED - use `install.ts --rules-only` (unified lockfile drift). Continuing…\n");
(cmd === "sync" ? sync : check)(repo);
