#!/usr/bin/env tsx
/**
 * Test procedure for audit-entry-points.ts (frontend-spec-call-site-audit skill).
 * Standalone: npx tsx skills/frontend-spec-call-site-audit/scripts/audit-entry-points.test.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, contains, skillScript, initWork, finish, WORK, ROOT } from "../../../tests/helpers.js";

initWork();

test("exit 2 without args (usage)", () => {
  const r = skillScript("frontend-spec-call-site-audit/scripts/audit-entry-points.ts", [], ROOT);
  assert(r.status === 2, `no args must exit 2 (got ${r.status})`);
});

test("finds a component's call site", () => {
  const dir = join(WORK, "entry-points");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Page.vue"), "<script>import WebhookList from './WebhookList.vue'</script>\n");
  const r = skillScript("frontend-spec-call-site-audit/scripts/audit-entry-points.ts", ["WebhookList", "-", dir], ROOT);
  assert(r.status === 0, `audit exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "Page.vue", "the importing file must be listed");
});

finish("audit-entry-points");
