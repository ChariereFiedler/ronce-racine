#!/usr/bin/env tsx
/**
 * Test procedure for detect-recurring-fixes.ts (recurring-bug-root-cause skill).
 * Standalone: npx tsx skills/recurring-bug-root-cause/scripts/detect-recurring-fixes.test.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, assert, contains, skillScript, freshRepo, gitCommit, initWork, finish, ROOT } from "../../../tests/helpers.js";

initWork();

test("exit 1 on 3 fix(scope) commits within the window, names the scope", () => {
  const repo = freshRepo("recurring");
  for (let i = 1; i <= 3; i++) {
    writeFileSync(join(repo, `f${i}.txt`), String(i));
    spawnSync("git", ["add", "."], { cwd: repo });
    gitCommit(repo, `fix(auth): patch ${i}`);
  }
  const hot = skillScript("recurring-bug-root-cause/scripts/detect-recurring-fixes.ts", [repo], ROOT);
  assert(hot.status === 1, `3 fixes on one scope must exit 1 (got ${hot.status}): ${hot.stdout}`);
  contains(hot.stdout, "auth", "the recurring scope must be named");
});

test("exit 0 on a calm repo", () => {
  const calm = freshRepo("calm");
  const r = skillScript("recurring-bug-root-cause/scripts/detect-recurring-fixes.ts", [calm], ROOT);
  assert(r.status === 0, `calm repo must exit 0 (got ${r.status})`);
});

finish("detect-recurring-fixes");
