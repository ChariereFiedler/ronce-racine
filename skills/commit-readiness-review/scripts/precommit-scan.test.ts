#!/usr/bin/env tsx
/**
 * Test procedure for precommit-scan.ts (commit-readiness-review skill).
 * Standalone: npx tsx skills/commit-readiness-review/scripts/precommit-scan.test.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, assert, skillScript, freshRepo, initWork, finish } from "../../../tests/helpers.js";

initWork();

test("exit 1 on a staged secret, 0 on a clean diff", () => {
  const repo = freshRepo("scan-secret");
  // Built by concatenation so this test file never contains a secret-shaped literal.
  const fakeKey = "AKIA" + "ABCDEFGHIJKLMNOP";
  writeFileSync(join(repo, "config.ts"), `const k = "${fakeKey}";\n`);
  spawnSync("git", ["add", "."], { cwd: repo });
  const bad = skillScript("commit-readiness-review/scripts/precommit-scan.ts", [], repo);
  assert(bad.status === 1, `staged secret must exit 1 (got ${bad.status}): ${bad.stdout}`);

  const clean = freshRepo("scan-clean");
  writeFileSync(join(clean, "config.ts"), "export const x = 1;\n");
  spawnSync("git", ["add", "."], { cwd: clean });
  const ok = skillScript("commit-readiness-review/scripts/precommit-scan.ts", [], clean);
  assert(ok.status === 0, `clean diff must exit 0 (got ${ok.status}): ${ok.stdout}`);
});

finish("precommit-scan");
