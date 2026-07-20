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
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
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
    find: '{ recursive: true, filter: (s) => !s.endsWith(".test.ts") && !s.endsWith("eval.yaml") }',
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
    file: "eval.ts",
    find: "else if (ctx.baseline.get(rel) !== content) dirty.push(`~${rel}`);",
    replace: "",
    test: "tests/eval.test.ts",
  },
  {
    name: "eval: judge anti-leniency downgrade removed",
    file: "eval.ts",
    find: 'verdict: v.verdict === "pass" && v.evidence?.trim() ? "pass" : "fail",',
    replace: "verdict: v.verdict,",
    test: "tests/eval.test.ts",
  },
  {
    name: "eval: inline-object pair matching broken",
    file: "eval.ts",
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
];

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
