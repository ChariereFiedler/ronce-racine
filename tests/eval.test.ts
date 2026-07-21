#!/usr/bin/env tsx
/** Unit tests of the skill-eval harness: manifest parser, gates, judge parsing. */
import { test, assert, contains, initWork, finish, WORK, TSX, ROOT } from "./helpers.js";
import { parseEvalManifest, applyGate, snapshotRepo, runOne, parseJudgeVerdicts, judgePassed, buildJudgePrompt, type GateContext } from "../tools/eval.js";
import { mkdirSync, writeFileSync, unlinkSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

initWork();

const FULL = `fixture: flawed-app
prompt: >
  Run a detection sweep on this project.
  Do not create tracker tickets.
gates:
  - file_exists: "SWEEP-REPORT.md"
  - grep_zero: { pattern: "console\\\\.log", in: "src/" }
  - repo_clean: { except: "SWEEP-REPORT.md" }
judge:
  criteria:
    - "The report groups findings by cause"
  threshold: pass_all
`;

test("parseEvalManifest reads fixture, folded prompt, gates and judge", () => {
  const m = parseEvalManifest("detection-sweep", FULL);
  assert(m.fixture === "flawed-app", "fixture");
  assert(m.prompt === "Run a detection sweep on this project. Do not create tracker tickets.", `folded prompt, got ${JSON.stringify(m.prompt)}`);
  assert(m.gates.length === 3, "3 gates");
  assert(m.gates[0].kind === "file_exists" && m.gates[0].args.value === "SWEEP-REPORT.md", "scalar gate");
  assert(m.gates[1].kind === "grep_zero" && m.gates[1].args.pattern === "console\\.log" && m.gates[1].args.in === "src/", "inline-object gate");
  assert(m.judge?.criteria.length === 1 && m.judge.threshold === "pass_all", "judge block");
});

test("parseEvalManifest rejects unknown gates and missing fields", () => {
  let threw = "";
  try { parseEvalManifest("x", "fixture: a\nprompt: >\n  p\ngates:\n  - frobnicate: \"y\"\n"); } catch (e) { threw = (e as Error).message; }
  contains(threw, "frobnicate", "unknown gate kind must throw");
  try { parseEvalManifest("x", "prompt: >\n  p\n"); threw = ""; } catch (e) { threw = (e as Error).message; }
  contains(threw, "fixture", "missing fixture must throw");
});

test("parseEvalManifest accepts a numeric judge threshold", () => {
  const m = parseEvalManifest("x", "fixture: a\nprompt: >\n  p\njudge:\n  criteria:\n    - \"c1\"\n  threshold: 0.8\n");
  assert(m.judge?.threshold === 0.8, "ratio threshold");
  assert(m.gates.length === 0, "gates optional");
});

function gateCtx(dir: string, transcript = "", exitCode = 0): GateContext {
  return { repoDir: dir, transcript, exitCode, baseline: snapshotRepo(dir) };
}

test("gates: file_exists / file_absent / transcript / exit_ok", () => {
  const dir = join(WORK, "gates1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "REPORT.md"), "found TODO\n");
  const ctx = gateCtx(dir, "the agent said EXPECTED.md", 0);
  assert(applyGate({ kind: "file_exists", args: { value: "REPORT.md" } }, ctx) === null, "existing file passes");
  assert(applyGate({ kind: "file_exists", args: { value: "MISSING.md" } }, ctx) !== null, "missing file fails");
  assert(applyGate({ kind: "file_absent", args: { value: "MISSING.md" } }, ctx) === null, "absent passes");
  assert(applyGate({ kind: "transcript_contains", args: { value: "EXPECTED.md" } }, ctx) === null, "transcript hit");
  assert(applyGate({ kind: "transcript_absent", args: { value: "rm -rf" } }, ctx) === null, "transcript absence");
  assert(applyGate({ kind: "exit_ok", args: {} }, { ...ctx, exitCode: 1 }) !== null, "exit 1 fails exit_ok");
});

test("gates: grep_zero and grep_count walk the tree", () => {
  const dir = join(WORK, "gates2");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "console.log('x')\nconsole.log('y')\n");
  const ctx = gateCtx(dir);
  assert(applyGate({ kind: "grep_zero", args: { pattern: "console\\.log", in: "src/" } }, ctx) !== null, "2 hits fail grep_zero");
  assert(applyGate({ kind: "grep_count", args: { pattern: "console\\.log", in: "src/", count: "2" } }, ctx) === null, "exact count passes");
  assert(applyGate({ kind: "grep_zero", args: { pattern: "debugger" } }, ctx) === null, "no hit passes (whole repo)");
});

test("gates: grep_min asserts a floor, not an exact count", () => {
  // For agent-authored output an exact count is unknowable; a floor is not.
  const dir = join(WORK, "gates-min");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.test.js"), "priceWithTax(1)\npriceWithTax(2)\n");
  const ctx = gateCtx(dir);
  assert(applyGate({ kind: "grep_min", args: { pattern: "priceWithTax", in: "src/", count: "2" } }, ctx) === null,
    "exactly the floor passes");
  assert(applyGate({ kind: "grep_min", args: { pattern: "priceWithTax", in: "src/", count: "1" } }, ctx) === null,
    "above the floor passes");
  const under = applyGate({ kind: "grep_min", args: { pattern: "priceWithTax", in: "src/", count: "3" } }, ctx);
  assert(under !== null, "below the floor fails");
  contains(under, "at least 3", "the message states the floor");
});

test("gates: repo_clean detects additions and modifications, honors except", () => {
  const dir = join(WORK, "gates3");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "kept.ts"), "original\n");
  const ctx = gateCtx(dir);                       // baseline snapshot here
  writeFileSync(join(dir, "kept.ts"), "TAMPERED\n");
  writeFileSync(join(dir, "NEW.md"), "added\n");
  assert(applyGate({ kind: "repo_clean", args: {} }, ctx) !== null, "changes fail a bare repo_clean");
  assert(applyGate({ kind: "repo_clean", args: { except: "NEW.md" } }, ctx) !== null, "modification still fails without except");
  const ok = applyGate({ kind: "repo_clean", args: { except: "NEW.md, kept.ts" } }, ctx);
  assert(ok === null, `except list must allow both: ${ok}`);
});

test("gates: repo_clean except accepts a trailing * as a name prefix", () => {
  // A skill that produces one ticket per action cannot name its files upfront.
  const dir = join(WORK, "gates-glob");
  mkdirSync(dir, { recursive: true });
  const ctx = gateCtx(dir);
  writeFileSync(join(dir, "ticket-first.md"), "a\n");
  writeFileSync(join(dir, "ticket-second.md"), "b\n");
  assert(applyGate({ kind: "repo_clean", args: { except: "ticket-" } }, ctx) !== null,
    "a bare prefix must NOT match file names (directory semantics)");
  const ok = applyGate({ kind: "repo_clean", args: { except: "ticket-*" } }, ctx);
  assert(ok === null, `trailing * must allow every ticket-* file: ${ok}`);

  writeFileSync(join(dir, "unrelated.md"), "c\n");
  assert(applyGate({ kind: "repo_clean", args: { except: "ticket-*" } }, ctx) !== null,
    "the glob must not allow unrelated files");
});

test("gates: repo_clean detects file deletions", () => {
  const dir = join(WORK, "gates4");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "to-delete.ts"), "original\n");
  const ctx = gateCtx(dir);                       // baseline snapshot here
  // Delete the file
  unlinkSync(join(dir, "to-delete.ts"));
  const result = applyGate({ kind: "repo_clean", args: {} }, ctx);
  assert(result !== null, "deletion should fail repo_clean");
  contains(result, "-to-delete.ts", "error message should contain the deleted filename with -");
});

test("gates: grep_zero with invalid regex pattern returns failure message", () => {
  const dir = join(WORK, "gates5");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "src.ts"), "some code\n");
  const ctx = gateCtx(dir);
  // Invalid regex pattern with unclosed paren
  const result = applyGate({ kind: "grep_zero", args: { pattern: "([unclosed", in: "src/" } }, ctx);
  assert(result !== null, "invalid regex should return failure message, not throw");
  contains(result, "grep_zero", "error message should reference grep_zero");
});

test("gates: grep_count with invalid regex pattern returns failure message", () => {
  const dir = join(WORK, "gates6");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "src.ts"), "some code\n");
  const ctx = gateCtx(dir);
  // Invalid regex pattern with bad escape
  const result = applyGate({ kind: "grep_count", args: { pattern: "(?P<invalid", count: "1", in: "src/" } }, ctx);
  assert(result !== null, "invalid regex should return failure message, not throw");
  contains(result, "grep_count", "error message should reference grep_count");
});

/** A stub claude binary: creates REPORT.md in cwd, echoes a transcript line. */
function stubClaude(behavior: "good" | "dirty"): string {
  const p = join(WORK, `stub-${behavior}.sh`);
  const body = behavior === "good"
    ? '#!/bin/sh\necho \'{"type":"result","result":"sweep done, see EXPECTED.md"}\'\nprintf "found TODO\\n" > REPORT.md\n'
    : '#!/bin/sh\necho \'{"type":"result","result":"oops"}\'\nprintf "TAMPERED\\n" > main.go\n';
  writeFileSync(p, body);
  chmodSync(p, 0o755);
  return p;
}

test("runOne: gates verdict a stubbed agent run (PASS and FAIL)", () => {
  const manifest = parseEvalManifest("recording-decisions",
    'fixture: minimal-go\nprompt: >\n  Record the decision.\ngates:\n  - file_exists: "REPORT.md"\n  - repo_clean: { except: "REPORT.md" }\n  - transcript_contains: "EXPECTED.md"\n');
  spawnSync(TSX, [join(ROOT, "playground", "setup.ts")], { cwd: ROOT });
  const good = runOne(manifest, { claudeBin: stubClaude("good"), timeoutMs: 30_000 });
  assert(good.verdict === "PASS", `expected PASS, got ${good.verdict}: ${good.details.join("; ")}`);
  const bad = runOne(manifest, { claudeBin: stubClaude("dirty"), timeoutMs: 30_000 });
  assert(bad.verdict === "FAIL", `expected FAIL, got ${bad.verdict}`);
  assert(bad.details.some((d) => d.includes("repo_clean")), "repo_clean must be the failing gate");
});

test("runOne: a missing claude binary is ERROR, not FAIL", () => {
  const manifest = parseEvalManifest("x", "fixture: minimal-go\nprompt: >\n  p\n");
  const r = runOne(manifest, { claudeBin: join(WORK, "no-such-bin"), timeoutMs: 5_000 });
  assert(r.verdict === "ERROR", `expected ERROR, got ${r.verdict}`);
});

test("dry-run validates manifests without running anything", () => {
  const r = spawnSync(TSX, [join(ROOT, "tools", "eval.ts"), "run", "--dry-run"], { cwd: ROOT, encoding: "utf8" });
  assert(r.status === 0, `dry-run exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "manifest(s) valid", "dry-run must report validation");
});

test("runOne cleans up tmp dir after execution", () => {
  const manifest = parseEvalManifest("minimal-cleanup",
    `fixture: minimal-go
prompt: >
  Test cleanup.
gates:
  - exit_ok: ""`);
  spawnSync(TSX, [join(ROOT, "playground", "setup.ts")], { cwd: ROOT });
  const stubBin = stubClaude("good");
  const r = runOne(manifest, { claudeBin: stubBin, timeoutMs: 30_000 });
  assert(r.verdict === "PASS", `runOne should pass: ${r.details.join("; ")}`);

  // Check that tmp dir does not exist - will be at ronce-racine-eval/minimal-cleanup-{pid}
  const expectedDir = join(tmpdir(), "ronce-racine-eval", `minimal-cleanup-${process.pid}`);
  assert(!existsSync(expectedDir), `tmp dir should be cleaned up: ${expectedDir}`);
});

test("eval.ts run --only without value exits 2 with usage", () => {
  const r = spawnSync(TSX, [join(ROOT, "tools", "eval.ts"), "run", "--only"], { cwd: ROOT, encoding: "utf8" });
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  contains(r.stderr, "usage", "stderr must contain usage message");
});

test("eval.ts run --only before another flag exits 2 with usage", () => {
  const r = spawnSync(TSX, [join(ROOT, "tools", "eval.ts"), "run", "--only", "--dry-run"], { cwd: ROOT, encoding: "utf8" });
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  contains(r.stderr, "usage", "stderr must contain usage message");
});

test("judge parsing enforces evidence (anti-leniency) and thresholds", () => {
  const crits = ["c1", "c2"];
  const ok = parseJudgeVerdicts('[{"criterion":"c1","verdict":"pass","evidence":"quote from transcript"},{"criterion":"c2","verdict":"pass","evidence":"another quote"}]', crits);
  assert(judgePassed(ok, "pass_all"), "all evidenced passes must pass");

  const lazy = parseJudgeVerdicts('[{"criterion":"c1","verdict":"pass","evidence":""},{"criterion":"c2","verdict":"pass","evidence":"q"}]', crits);
  assert(lazy[0].verdict === "fail", "a pass without evidence must be downgraded to fail");
  assert(!judgePassed(lazy, "pass_all"), "downgrade must break pass_all");
  assert(judgePassed(lazy, 0.5), "ratio threshold counts the remaining passes");

  let threw = false;
  try { parseJudgeVerdicts('[{"criterion":"c1","verdict":"pass","evidence":"q"}]', crits); } catch { threw = true; }
  assert(threw, "missing criterion must throw (ERROR upstream)");
});

/**
 * A stub claude binary that plays BOTH roles runOne calls it for: the agent
 * (writes REPORT.md, echoes a realistic result envelope) and the judge
 * (detected by "You are grading" in the prompt arg, echoes a result envelope
 * whose .result is an ESCAPED STRING containing the verdict JSON array - the
 * same shape `claude -p --output-format json` actually emits).
 */
function stubJudge(verdict: "pass" | "fail"): string {
  const p = join(WORK, `stub-judge-${verdict}.sh`);
  const escapedVerdicts = verdict === "pass"
    ? '[{\\"criterion\\":\\"c1\\",\\"verdict\\":\\"pass\\",\\"evidence\\":\\"quote\\"}]'
    : '[{\\"criterion\\":\\"c1\\",\\"verdict\\":\\"fail\\",\\"evidence\\":\\"quote\\"}]';
  const body = `#!/bin/sh
case "$2" in
  *"You are grading"*)
    echo '{"type":"result","result":"${escapedVerdicts}"}'
    ;;
  *)
    printf "done\\n" > REPORT.md
    echo '{"type":"result","result":"agent finished, see REPORT.md"}'
    ;;
esac
`;
  writeFileSync(p, body);
  chmodSync(p, 0o755);
  return p;
}

const JUDGE_MANIFEST = `fixture: minimal-go
prompt: >
  Do the thing.
gates:
  - file_exists: "REPORT.md"
judge:
  criteria:
    - "c1"
  threshold: pass_all
`;

test("runOne: judge branch unwraps the claude json envelope before parsing verdicts (PASS)", () => {
  const manifest = parseEvalManifest("judge-demo", JUDGE_MANIFEST);
  spawnSync(TSX, [join(ROOT, "playground", "setup.ts")], { cwd: ROOT });
  const r = runOne(manifest, { claudeBin: stubJudge("pass"), timeoutMs: 30_000 });
  assert(r.verdict === "PASS", `expected PASS, got ${r.verdict}: ${r.details.join("; ")}`);
});

test("runOne: judge branch reports JUDGE-FAIL with the failing criterion detail", () => {
  const manifest = parseEvalManifest("judge-demo", JUDGE_MANIFEST);
  spawnSync(TSX, [join(ROOT, "playground", "setup.ts")], { cwd: ROOT });
  const r = runOne(manifest, { claudeBin: stubJudge("fail"), timeoutMs: 30_000 });
  assert(r.verdict === "JUDGE-FAIL", `expected JUDGE-FAIL, got ${r.verdict}: ${r.details.join("; ")}`);
  assert(r.details.some((d) => d.includes("~c1")), `details should include ~c1, got ${r.details.join("; ")}`);
});

test("buildJudgePrompt embeds criteria, exit conditions and artifacts", () => {
  const m = parseEvalManifest("writing-robust-tests", 'fixture: frontend-vue\nprompt: >\n  p\njudge:\n  criteria:\n    - "tests were seen red"\n  threshold: pass_all\n');
  const p = buildJudgePrompt(m, "TRANSCRIPT_MARK", "ARTIFACTS_MARK");
  contains(p, "tests were seen red", "criteria embedded");
  contains(p, "TRANSCRIPT_MARK", "transcript embedded");
  contains(p, "evidence", "must demand evidence");
});

test("parseEvalManifest: inline-object value with an internal comma as the only key", () => {
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  p\ngates:\n  - repo_clean: { except: "docs/, .claude/" }\n');
  assert(m.gates[0].kind === "repo_clean", "gate kind");
  assert(m.gates[0].args.except === "docs/, .claude/", `except should keep the comma, got ${JSON.stringify(m.gates[0].args.except)}`);
});

test("parseEvalManifest: inline-object with two keys, one value containing a comma", () => {
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  p\ngates:\n  - grep_zero: { pattern: "a, b", in: "src/" }\n');
  assert(m.gates[0].args.pattern === "a, b", `pattern should keep the comma, got ${JSON.stringify(m.gates[0].args.pattern)}`);
  assert(m.gates[0].args.in === "src/", "in arg");
});

finish("eval");
