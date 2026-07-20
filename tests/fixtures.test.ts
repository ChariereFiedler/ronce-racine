#!/usr/bin/env tsx
/**
 * Locks the flawed-app fixture contract: every detector finds EXACTLY the
 * planted defects listed in its EXPECTED.md (1 per detector) - a miss is a
 * detector regression, an extra is a false positive.
 */
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, assert, contains, skillScript, initWork, finish, ROOT, TSX } from "./helpers.js";

initWork();

const FLAWED = join(ROOT, "playground", "fixtures", "flawed-app");

test("playground setup regenerates the fixtures", () => {
  const r = spawnSync(TSX, [join(ROOT, "playground", "setup.ts")], { cwd: ROOT, encoding: "utf8" });
  assert(r.status === 0, `setup exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "flawed-app", "the known-defect fixture must be generated");
});

test("sweep finds exactly the planted defects (1 per detector)", () => {
  const r = skillScript("detection-sweep/scripts/sweep.ts", [FLAWED], ROOT);
  assert(r.status === 0, `sweep exit ${r.status}`);
  for (const row of ["TODO/FIXME/HACK", "Debug statements", "Hardcoded waits", "Disabled tests", "Swallowed errors / unwrap", "Secret patterns"]) {
    assert(new RegExp(`${row.replace(/[/()]/g, (c) => "\\" + c)}\\s+1\\b`).test(r.stdout), `"${row}" must count exactly 1: ${r.stdout.slice(0, 400)}`);
  }
});

test("subscription-leak-scan flags the planted leak in the staged fixture", () => {
  const r = spawnSync(TSX, [join(ROOT, "scripts", "subscription-leak-scan.ts"), "--strict"], { cwd: FLAWED, encoding: "utf8" });
  assert(r.status === 1, `--strict must exit 1 on the planted leak (got ${r.status}): ${r.stdout}`);
  contains(r.stdout, "subscribe without teardown", "the planted subscription must be named");
});

finish("fixtures");
