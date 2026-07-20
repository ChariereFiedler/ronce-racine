#!/usr/bin/env tsx
/**
 * Test procedure for sweep.ts (detection-sweep skill).
 * Standalone: npx tsx skills/detection-sweep/scripts/sweep.test.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, skillScript, initWork, finish, WORK, ROOT } from "../../../tests/helpers.js";

initWork();

test("reports planted debt signals with exact counts", () => {
  const dir = join(WORK, "sweep-dirty");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "a.ts"), "// TODO fix this\nconsole.log('debug');\n");
  const r = skillScript("detection-sweep/scripts/sweep.ts", [dir], ROOT);
  assert(r.status === 0, `sweep must not fail (${r.status})`);
  assert(/TODO\/FIXME\/HACK\s+1\b/.test(r.stdout), `debt row should count exactly the planted TODO: ${r.stdout.slice(0, 300)}`);
  assert(/Debug statements\s+1\b/.test(r.stdout), "debug row should count the planted console.log");
});

test("counts nothing on a clean tree", () => {
  const dir = join(WORK, "sweep-clean");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "a.ts"), "export const x = 1;\n");
  const r = skillScript("detection-sweep/scripts/sweep.ts", [dir], ROOT);
  assert(r.status === 0, `sweep must not fail (${r.status})`);
  assert(/TODO\/FIXME\/HACK\s+0\b/.test(r.stdout), "clean tree must count zero debt");
});

finish("sweep");
