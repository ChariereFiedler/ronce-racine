#!/usr/bin/env tsx
/**
 * Mutation harness: proves the behavioral tests can fail.
 *
 * For each declared mutation: break the code under test, run the covering test
 * file, REQUIRE it to fail, restore the original. A mutation that survives
 * (tests stay green on broken code) means a Liar test - the run fails.
 *
 *   npm run test:mutation      (wired into CI; ~1 min, spawns real test files)
 *
 * Companion of the writing-robust-tests skill (§5 "the test can fail") applied
 * to this repo's own harness.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

interface Mutation { name: string; file: string; find: string; replace: string; test: string }

const MUTATIONS: Mutation[] = [
  {
    name: "installer: first-install backup disabled",
    file: "install.ts",
    find: 'cpSync(dst, dst + ".pre-install.bak", { recursive: true });',
    replace: "/* mutated */;",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: .test.ts distribution filter removed",
    file: "install.ts",
    find: '{ recursive: true, filter: (s) => !s.endsWith(".test.ts") && !s.endsWith("eval.yaml") && !s.endsWith("README.md") }',
    replace: "{ recursive: true }",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: bogus hooks-shape guard removed",
    file: "install.ts",
    find: "    malformed = true;\n    delete settings.hooks;",
    replace: "    /* mutated */",
    test: "tests/installer.test.ts",
  },
  {
    name: "selector: group toggle inverted",
    file: "install.ts",
    find: "group.forEach((i) => (allOn ? state.checked.delete(i) : state.checked.add(i)));",
    replace: "group.forEach((i) => (allOn ? state.checked.add(i) : state.checked.delete(i)));",
    test: "tests/selector.test.ts",
  },
  {
    name: "eval: repo_clean modification detection disabled",
    file: "tools/eval.ts",
    find: "else if (ctx.baseline.get(rel) !== content) dirty.push(`~${rel}`);",
    replace: "",
    test: "tests/eval.test.ts",
  },
  {
    name: "eval: judge anti-leniency downgrade removed",
    file: "tools/eval.ts",
    find: 'verdict: v.verdict === "pass" && v.evidence?.trim() ? "pass" : "fail",',
    replace: "verdict: v.verdict,",
    test: "tests/eval.test.ts",
  },
  {
    name: "eval: inline-object pair matching broken",
    file: "tools/eval.ts",
    find: '/([\\w-]+):\\s*("(?:[^"\\\\]|\\\\.)*"|[^,}]+)/g',
    replace: "/([\\w-]+):\\s*([^,]+)/g",
    test: "tests/eval.test.ts",
  },
  {
    name: "worktree-env-setup: broken-symlink repair disabled",
    file: "hooks/worktree-env-setup.ts",
    find: "try { unlinkSync(envWt) } catch { return }",
    replace: "return",
    test: "tests/hooks.test.ts",
  },
  {
    name: "truncate-bash-output: truncation disabled",
    file: "hooks/truncate-bash-output.ts",
    find: "if (output.length <= THRESHOLD) return output",
    replace: "if (true) return output",
    test: "tests/hooks.test.ts",
  },
  {
    name: "precommit-scan: blocking exit disabled",
    file: "skills/commit-readiness-review/scripts/precommit-scan.ts",
    find: "process.exit(1);",
    replace: "process.exit(0);",
    test: "skills/commit-readiness-review/scripts/precommit-scan.test.ts",
  },
  {
    name: "sweep: debt detection regex broken",
    file: "skills/detection-sweep/scripts/sweep.ts",
    find: 'row("TODO/FIXME/HACK", /TODO|FIXME|HACK|XXX/);',
    replace: 'row("TODO/FIXME/HACK", /NEVERMATCHXYZ/);',
    test: "skills/detection-sweep/scripts/sweep.test.ts",
  },
  {
    name: "audit-entry-points: usage exit disabled",
    file: "skills/frontend-spec-call-site-audit/scripts/audit-entry-points.ts",
    find: "process.exit(2)",
    replace: "process.exit(0)",
    test: "skills/frontend-spec-call-site-audit/scripts/audit-entry-points.test.ts",
  },
  {
    name: "detect-recurring-fixes: recurrence exit disabled",
    file: "skills/recurring-bug-root-cause/scripts/detect-recurring-fixes.ts",
    find: "process.exit(1)",
    replace: "process.exit(0)",
    test: "skills/recurring-bug-root-cause/scripts/detect-recurring-fixes.test.ts",
  },
  {
    name: "sweep-call-sites: usage exit disabled",
    file: "skills/refactoring-shared-component-api/scripts/sweep-call-sites.ts",
    find: "process.exit(2)",
    replace: "process.exit(0)",
    test: "skills/refactoring-shared-component-api/scripts/sweep-call-sites.test.ts",
  },
  {
    name: "installer: canonicalHash ignores file contents",
    file: "install.ts",
    find: "      h.update(readFileSync(canon));",
    replace: "      /* mutated */;",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: legacy lockfile treated as stale",
    file: "install.ts",
    find: 'if (typeof s === "string") return false;',
    replace: 'if (typeof s === "string") return true;',
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: staleness compares the wrong token set after detach",
    file: "install.ts",
    find: "isStale(lock.source, lock.installed)",
    replace: "isStale(lock.source, checked)",
    test: "tests/installer.test.ts",
  },
];

// This harness edits tracked files in place. Two concurrent runs corrupt each
// other: the first mutates a file, the second reports its target snippet as
// missing and calls the table stale. Refuse to start rather than mislead.
const LOCK = join(ROOT, ".mutations.lock");
if (existsSync(LOCK)) {
  // The lock records its owner's pid, so a lock left behind by a killed run
  // clears itself. Telling a human to "delete it if no run is active" invites
  // deleting it while one IS active, which is the race the lock exists to stop.
  const owner = Number(readFileSync(LOCK, "utf8").trim());
  let alive = false;
  try { process.kill(owner, 0); alive = true; } catch { alive = false; }
  if (alive) {
    console.error(`✗ mutation run ${owner} is already in progress. Wait for it to finish.`);
    process.exit(2);
  }
  console.error(`- clearing a stale lock from dead process ${owner}`);
  rmSync(LOCK, { force: true });
}
writeFileSync(LOCK, `${process.pid}\n`);
const releaseLock = (): void => { try { rmSync(LOCK, { force: true }); } catch { /* best effort */ } };
process.on("exit", releaseLock);
process.on("SIGINT", () => { releaseLock(); process.exit(130); });

let killed = 0;
const survivors: string[] = [];

for (const m of MUTATIONS) {
  const path = join(ROOT, m.file);
  const original = readFileSync(path, "utf8");
  if (!original.includes(m.find)) {
    survivors.push(`${m.name}: target snippet not found in ${m.file} - mutation table is stale`);
    continue;
  }
  writeFileSync(path, original.replace(m.find, m.replace));
  try {
    const r = spawnSync(TSX, [join(ROOT, m.test)], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) survivors.push(`${m.name}: tests stayed GREEN on mutated code (Liar test)`);
    else killed++;
  } finally {
    writeFileSync(path, original);
  }
  console.log(`  ${survivors.at(-1)?.startsWith(m.name) ? "✗ survived" : "✓ killed  "} ${m.name}`);
}

if (survivors.length) {
  console.error(`✗ ${survivors.length}/${MUTATIONS.length} mutation(s) survived:\n  ${survivors.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ ${killed}/${MUTATIONS.length} mutations killed - the tests can fail`);
