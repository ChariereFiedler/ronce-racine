#!/usr/bin/env tsx
/**
 * Test procedure for sweep-call-sites.ts (refactoring-shared-component-api skill).
 * Standalone: npx tsx skills/refactoring-shared-component-api/scripts/sweep-call-sites.test.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, contains, skillScript, initWork, finish, WORK, ROOT } from "../../../tests/helpers.js";

initWork();

test("exit 2 without args (usage)", () => {
  const r = skillScript("refactoring-shared-component-api/scripts/sweep-call-sites.ts", [], ROOT);
  assert(r.status === 2, `no args must exit 2 (got ${r.status})`);
});

test("lists PascalCase and kebab-case usages", () => {
  const dir = join(WORK, "call-sites");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "A.vue"), "<template><BaseButton /></template>\n");
  writeFileSync(join(dir, "B.vue"), "<template><base-button /></template>\n");
  const r = skillScript("refactoring-shared-component-api/scripts/sweep-call-sites.ts", ["BaseButton", dir], ROOT);
  assert(r.status === 0, `sweep exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "A.vue", "PascalCase call site must be listed");
  contains(r.stdout, "B.vue", "kebab-case call site must be listed");
});

finish("sweep-call-sites");
