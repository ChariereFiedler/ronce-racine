#!/usr/bin/env tsx
/** Unit tests of the skill-eval harness: manifest parser, gates, judge parsing. */
import { test, assert, contains, initWork, finish, WORK, TSX, ROOT } from "./helpers.js";
import { parseEvalManifest, discoverManifests, SUBJECT, applyGate, snapshotRepo, runOne, parseJudgeVerdicts, judgePassed, buildJudgePrompt, JUDGE_ARTIFACTS_BUDGET, JUDGE_TRANSCRIPT_BUDGET, DEFAULT_TIER, type GateContext } from "../tools/eval.js";
import { leakageFindings, vacuousGates } from "../tools/eval-lint.js";
import { grade, collectArtifacts, splitArtifacts } from "../tools/eval-grade.js";
import { summarizeLift, rankBySignal, readJobTrials, readsFromTrajectory, DEFAULT_CONTRAST, type TrialRecord } from "../tools/eval-report.js";
import { judgeTrial, transcriptFromTrajectory, resolveTrialManifest } from "../tools/eval-judge.js";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, chmodSync, existsSync } from "node:fs";
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

const WITH_PRECONDITIONS = `fixture: audit-target
prompt: >
  Audit the security of this project and write the findings down.
preconditions:
  - file_exists: "AUDIT-SECURITY.md"
gates:
  - grep_min: { pattern: "CVE-", in: "AUDIT-SECURITY.md", count: "1" }
`;

test("parseEvalManifest reads preconditions with the same grammar as gates", () => {
  // A deliverable the prompt had to name is a precondition, not a signal: an
  // agent without the skill produces it too, so it can never carry any lift.
  const m = parseEvalManifest("audit-security", WITH_PRECONDITIONS);
  assert(m.preconditions.length === 1, `1 precondition, got ${m.preconditions.length}`);
  assert(m.preconditions[0].kind === "file_exists" && m.preconditions[0].args.value === "AUDIT-SECURITY.md", "scalar precondition");
  assert(m.gates.length === 1 && m.gates[0].kind === "grep_min", "gates stay separate from preconditions");
});

test("parseEvalManifest defaults preconditions to empty and keeps fail-closed", () => {
  const m = parseEvalManifest("detection-sweep", FULL);
  assert(m.preconditions.length === 0, "a manifest without the section has no preconditions");

  let threw = "";
  try { parseEvalManifest("x", "fixture: a\nprompt: >\n  p\npreconditions:\n  - frobnicate: \"y\"\n"); } catch (e) { threw = (e as Error).message; }
  contains(threw, "frobnicate", "an unknown kind must throw inside preconditions too");
});

test("parseEvalManifest accepts a numeric judge threshold", () => {
  const m = parseEvalManifest("x", "fixture: a\nprompt: >\n  p\njudge:\n  criteria:\n    - \"c1\"\n  threshold: 0.8\n");
  assert(m.judge?.threshold === 0.8, "ratio threshold");
  assert(m.gates.length === 0, "gates optional");
});

test("leakageFindings flags a gate whose literal the prompt already gives away", () => {
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  Write the audit to REPORT.md, tagging each finding with console.log.\ngates:\n  - file_exists: "REPORT.md"\n  - grep_count: { pattern: "console\\\\.log", in: "src/", count: "1" }\n');
  const f = leakageFindings(m);
  assert(f.some((x) => x.severity === "error" && x.check.includes("REPORT.md")), `path leak must be an error, got ${JSON.stringify(f)}`);
  assert(f.some((x) => x.severity === "error" && x.check.includes("console")), `pattern leak must be an error, got ${JSON.stringify(f)}`);
});

test("vacuousGates flags a gate the pristine fixture already satisfies", () => {
  // A gate demanding something be PRODUCED, that holds before the agent has
  // done anything, measures nothing at all - the static twin of a saturated
  // baseline, and free to detect.
  const dir = join(WORK, "vacuous");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "already here\n");
  writeFileSync(join(dir, "src", "a.ts"), "const x = 1\n");

  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  p\ngates:\n  - file_exists: "README.md"\n  - file_exists: "REPORT.md"\n');
  const found = vacuousGates(m, dir);
  assert(found.length === 1, `only the pre-satisfied gate is vacuous, got ${JSON.stringify(found)}`);
  contains(found[0].check, "README.md", "the pre-existing file is the vacuous one");
});

test("vacuousGates leaves alone the checks that assert an absence", () => {
  // repo_clean and file_absent hold on a pristine fixture BY DESIGN: they
  // assert the agent did not overstep, not that it produced something.
  const dir = join(WORK, "vacuous2");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "a.ts"), "x\n");
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  p\ngates:\n  - repo_clean: { except: "R.md" }\n  - file_absent: "NOPE.md"\n  - grep_zero: { pattern: "zzz" }\n');
  assert(vacuousGates(m, dir).length === 0, `absence checks are not vacuous: ${JSON.stringify(vacuousGates(m, dir))}`);
});

test("leakageFindings exempts preconditions, which exist to be given away", () => {
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  Write the audit to REPORT.md.\npreconditions:\n  - file_exists: "REPORT.md"\n');
  assert(leakageFindings(m).length === 0, "a declared precondition is not a leak");
});

test("leakageFindings stays silent on a prompt that states the need, not the oracle", () => {
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  This project feels unsafe under load - audit it and record what you find.\ngates:\n  - grep_zero: { pattern: "apiKey", in: "src/" }\n');
  assert(leakageFindings(m).length === 0, `clean prompt must not be flagged: ${JSON.stringify(leakageFindings(m))}`);
});

test("leakageFindings ignores grep_zero and grep_min, which state outcomes", () => {
  // "the domain never imports infrastructure" is not made true by the prompt
  // saying "infrastructure" - the agent still has to produce the absence.
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  Follow DDD layering with infrastructure adapters.\ngates:\n  - grep_zero: { pattern: "infrastructure", in: "src/domain" }\n  - grep_min: { pattern: "infrastructure", in: "docs/", count: "1" }\n');
  assert(leakageFindings(m).length === 0, `outcome gates must not be flagged: ${JSON.stringify(leakageFindings(m))}`);
});

test("leakageFindings matches a deliverable path exactly, not by word", () => {
  // "Build the domain glossary" does not hand over the file name GLOSSARY.md.
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  The naming here is inconsistent. Build the domain glossary.\ngates:\n  - file_exists: "GLOSSARY.md"\n');
  assert(leakageFindings(m).length === 0, `a themed word is not a path leak: ${JSON.stringify(leakageFindings(m))}`);
});

test("leakageFindings honors a # leak-ok annotation above the gate", () => {
  // Some leaks are irreducible: a prop to rename, a required data-testid.
  const raw = 'fixture: a\nprompt: >\n  Rename the kind prop to variant everywhere, then log it with console.log.\ngates:\n  # leak-ok: the prop to rename has to be named in the prompt\n  - grep_count: { pattern: "variant=", in: "src/", count: "2" }\n  - grep_count: { pattern: "console\\\\.log", in: "src/", count: "1" }\n';
  const m = parseEvalManifest("x", raw);
  assert(leakageFindings(m).length === 2, "unannotated, both are leaks");

  const annotated = leakageFindings(m, raw);
  assert(annotated.length === 1, `the annotation must clear only its own gate, got ${JSON.stringify(annotated)}`);
  assert(annotated[0].check.includes("console"), "the unannotated gate below must still be reported");
});

test("leakageFindings warns, not errors, on judge criteria echoed by the prompt", () => {
  // The criterion heuristic is word overlap, which is too coarse to block on.
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  Separate domain, application and infrastructure layers cleanly.\njudge:\n  criteria:\n    - "Domain, application and infrastructure stay separated"\n  threshold: pass_all\n');
  const f = leakageFindings(m);
  assert(f.length === 1 && f[0].severity === "warn", `criterion overlap must warn, got ${JSON.stringify(f)}`);
});

test("grade scores every check and never lets a failure short-circuit the rest", () => {
  // Comparing two arms needs partial credit: "0" and "2 of 3 held" differ.
  const dir = join(WORK, "grade1");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "REPORT.md"), "done\n");
  writeFileSync(join(dir, "src", "a.ts"), "const bug = items.length - 1\n");

  const yaml = 'fixture: a\nprompt: >\n  p\npreconditions:\n  - file_exists: "REPORT.md"\ngates:\n  - grep_zero: { pattern: "items.length - 1", in: "src/" }\n  - file_exists: "src/a.ts"\n';
  const r = grade(yaml, "demo", { repoDir: dir, transcript: "", exitCode: 0, baseline: new Map() });

  assert(r.checks.length === 3, `all checks evaluated, got ${r.checks.length}`);
  assert(r.rewards.preconditions === 1, "precondition held");
  assert(r.rewards.gates === 0.5, `one of two gates held, got ${r.rewards.gates}`);
  assert(r.rewards.reward === r.rewards.gates, "the headline reward is the gates alone");
});

test("grade keeps preconditions out of the headline reward", () => {
  // Everyone clears them, so folding them in would dilute the measured gap.
  const dir = join(WORK, "grade2");
  mkdirSync(dir, { recursive: true });
  const yaml = 'fixture: a\nprompt: >\n  p\npreconditions:\n  - file_exists: "MISSING.md"\ngates:\n  - file_absent: "MISSING.md"\n';
  const r = grade(yaml, "demo", { repoDir: dir, transcript: "", exitCode: 0, baseline: new Map() });

  assert(r.rewards.preconditions === 0, "unmet precondition scores 0");
  assert(r.rewards.reward === 1, `a passing gate still scores 1, got ${r.rewards.reward}`);
});

test("grade reports gate count so a manifest with no gates is not read as perfect", () => {
  // performance-profiling has no mechanical gate left after the precondition
  // split. Its vacuous 1.0 must stay distinguishable from an earned one, or
  // both arms look saturated and the real finding is hidden.
  const dir = join(WORK, "grade3");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "PROFILING.md"), "notes\n");
  const yaml = 'fixture: a\nprompt: >\n  p\npreconditions:\n  - file_exists: "PROFILING.md"\n';
  const r = grade(yaml, "demo", { repoDir: dir, transcript: "", exitCode: 0, baseline: new Map() });

  assert(r.rewards.reward === 1, "no gate means nothing to fail");
  assert(r.rewards.n_gates === 0, `n_gates must expose the absence, got ${r.rewards.n_gates}`);
});

test("collectArtifacts keeps what the agent produced and drops what it left alone", () => {
  // The judge grades deliverables, so untouched fixture files are noise that
  // would crowd out the real output within the prompt budget.
  const dir = join(WORK, "artifacts1");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "untouched.ts"), "original\n");
  const baseline = snapshotRepo(dir);

  writeFileSync(join(dir, "POSTMORTEM.md"), "root cause: off-by-one\n");
  writeFileSync(join(dir, "src", "untouched.ts"), "edited\n");

  const out = collectArtifacts(baseline, dir);
  const paths = splitArtifacts(out).map((a) => a.path).sort();
  assert(paths.join(",") === "POSTMORTEM.md,src/untouched.ts", `added and modified files, got ${paths}`);
  contains(out, "root cause: off-by-one", "content is included");
  assert(!out.includes("original"), "the pre-agent content must not appear");
});

test("collectArtifacts uses a delimiter its own payload cannot forge", () => {
  // Observed on the audit-security run: the deliverable is a markdown report
  // full of `### Summary`, `### Weaknesses`. With `### <path>` as separator the
  // judge cannot tell a file boundary from a heading inside one.
  const dir = join(WORK, "artifacts3");
  mkdirSync(dir, { recursive: true });
  const baseline = snapshotRepo(dir);
  writeFileSync(join(dir, "AUDIT.md"), "# Report\n### Summary\nfine\n### Weaknesses\nbad\n");
  writeFileSync(join(dir, "NOTES.md"), "### Summary\nother file\n");

  const parsed = splitArtifacts(collectArtifacts(baseline, dir));
  assert(parsed.length === 2, `two files in, two files out, got ${parsed.length}: ${parsed.map((p) => p.path).join(", ")}`);
  assert(parsed.map((p) => p.path).sort().join(",") === "AUDIT.md,NOTES.md", `paths: ${parsed.map((p) => p.path)}`);
  contains(parsed.find((p) => p.path === "AUDIT.md")?.content ?? "", "### Weaknesses", "headings stay inside their file");
});

test("collectArtifacts returns nothing when the agent changed nothing", () => {
  const dir = join(WORK, "artifacts2");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "a.ts"), "x\n");
  assert(collectArtifacts(snapshotRepo(dir), dir) === "", "an idle agent produces no artifacts");
});

test("the judge prompt is identical across arms, so it cannot tell them apart", () => {
  // Blindness is not a convention here, it is checkable: the same manifest and
  // the same artifacts must produce byte-identical prompts whether the skill
  // was installed or not. Anything arm-specific would bias the grading.
  const m = parseEvalManifest("recurring-bug-root-cause",
    'fixture: buggy-app\nprompt: >\n  p\njudge:\n  criteria:\n    - "A blocking guardrail is added"\n  threshold: pass_all\n');
  const artifacts = "### POSTMORTEM.md\nroot cause\n";
  const withArm = buildJudgePrompt(m, "transcript", artifacts);
  const withoutArm = buildJudgePrompt(m, "transcript", artifacts);

  assert(withArm === withoutArm, "same inputs must yield the same prompt");
  assert(!/with_skill|without_skill|\barm\b/i.test(withArm), "the prompt must never name an arm");
});

const JUDGED = 'fixture: buggy-app\nprompt: >\n  p\njudge:\n  criteria:\n    - "c1"\n    - "c2"\n  threshold: pass_all\n';

test("judgeTrial scores the gradient, not just pass or fail", () => {
  // pass_all makes "1 of 2" and "0 of 2" both failures; comparing arms needs
  // to tell them apart.
  const half = '[{"criterion":"c1","verdict":"pass","evidence":"quote"},{"criterion":"c2","verdict":"fail","evidence":"none"}]';
  const r = judgeTrial(JUDGED, "demo", "t", "a", () => ({ stdout: half, ok: true }));
  assert(r.score === 0.5, `expected 0.5, got ${r.score}`);
  assert(!r.passed, "pass_all is not met");
});

test("judgeTrial treats a judge that did not run as infra, never as a zero", () => {
  let threw = "";
  try { judgeTrial(JUDGED, "demo", "t", "a", () => ({ stdout: "", ok: false })); } catch (e) { threw = (e as Error).message; }
  contains(threw, "did not run", "a dead judge must throw, not score 0");
});

test("judgeTrial keeps the anti-leniency rule: a pass without evidence fails", () => {
  const lazy = '[{"criterion":"c1","verdict":"pass","evidence":""},{"criterion":"c2","verdict":"pass","evidence":"q"}]';
  const r = judgeTrial(JUDGED, "demo", "t", "a", () => ({ stdout: lazy, ok: true }));
  assert(r.score === 0.5, `unevidenced pass must be downgraded, got ${r.score}`);
});

test("transcriptFromTrajectory flattens ATIF steps and survives anything else", () => {
  const atif = JSON.stringify({ schema_version: "ATIF-v1.7", steps: [
    { source: "user", message: "fix the bug" }, { source: "assistant", message: "reading cart.ts" }] });
  const flat = transcriptFromTrajectory(atif);
  contains(flat, "[user] fix the bug", "user step");
  contains(flat, "[assistant] reading cart.ts", "assistant step");
  assert(transcriptFromTrajectory("not json at all") === "not json at all", "non-trajectory input passes through");
});

const trial = (skills: string[], reward: number, over: Partial<TrialRecord> = {}): TrialRecord => ({
  task: "t", arm: null, skills, reward, judgeScore: null, nGates: 2, inputTokens: 100, outputTokens: 10,
  costUsd: 0.01, durationMs: 1000, errored: false, skillRead: null, referenceRead: null, ...over,
});

/**
 * The synthetic task above, declared `measured`. Every case below that asks
 * what a verdict does with the numbers has to say so: a probed - or untiered -
 * task withholds its verdict by construction, which would make each of them
 * pass for a reason it never meant to test.
 */
const MEASURED_T = new Map([["t", "measured" as const]]);

test("a saturated gate baseline does not silence the judge verdict", () => {
  // Measured 2026-08-24 on 6 pairs: gates tied at 1.00 (saturated) while the
  // judge split 1.00 against 0.29. A single verdict driven by the gates read
  // "inconclusive" and buried a clean separation.
  const many = (skills: string[], judge: number) =>
    Array.from({ length: 6 }, () => trial(skills, 1, { judgeScore: judge }));
  const [r] = summarizeLift([...many([], 0.29), ...many(["s"], 1)], DEFAULT_CONTRAST, MEASURED_T);

  assert(r.verdict === "inconclusive", "the gate dimension is saturated, so it cannot conclude");
  assert(r.judgeVerdict === "helps", `the judge dimension can, got ${r.judgeVerdict}`);
});

test("summarizeLift reports the judge gap separately from the gate gap", () => {
  // Measured on the first real paired run: gates tied at 1.00 while the judge
  // split 1.00 against 0.33. Averaging the two would have erased the finding.
  const many = (skills: string[], reward: number, judge: number) =>
    Array.from({ length: 6 }, () => trial(skills, reward, { judgeScore: judge }));
  const [r] = summarizeLift([...many([], 1, 0.33), ...many(["s"], 1, 1)]);

  assert(r.lift === 0, `gate lift is flat, got ${r.lift}`);
  assert(r.judgeLift !== null && Math.abs(r.judgeLift - 0.67) < 0.01, `judge lift ~0.67, got ${r.judgeLift}`);
  assert(r.flags.includes("saturated"), "the gate baseline is still saturated");
});

test("rankBySignal puts the skills that show least first", () => {
  // Sweeping 36 skills produces a wall of numbers. What matters is the order:
  // which ones move nothing, or move the wrong way, are the ones to work on.
  const six = (task: string, skills: string[], judge: number) =>
    Array.from({ length: 6 }, () => ({ ...trial(skills, 1, { judgeScore: judge }), task }));

  const reports = summarizeLift([
    ...six("strong", [], 0.2), ...six("strong", ["s"], 1.0),
    ...six("weak", [], 0.5), ...six("weak", ["s"], 0.5),
    ...six("harmful", [], 0.8), ...six("harmful", ["s"], 0.3),
  ]);
  const order = rankBySignal(reports).map((r) => r.task);
  assert(order[0] === "harmful", `the regression comes first, got ${order.join(" < ")}`);
  assert(order[order.length - 1] === "strong", `the clear win comes last, got ${order.join(" < ")}`);
});

test("summarizeLift pools trials of the same task across separate runs", () => {
  // A lost trial leaves a job one pair short of the floor. Topping it up must
  // not mean rerunning the eleven that worked.
  const five = (skills: string[], judge: number) =>
    Array.from({ length: 5 }, () => trial(skills, 1, { judgeScore: judge }));
  const topUp = [trial([], 1, { judgeScore: 0.33 }), trial(["s"], 1, { judgeScore: 1 })];

  const [r] = summarizeLift([...five([], 0.33), ...five(["s"], 1), ...topUp]);
  assert(r.pairs === 6, `pooled runs must reach 6 pairs, got ${r.pairs}`);
  assert(r.without.n === 6 && r.with.n === 6, "both arms pooled");
});

test("summarizeLift refuses a causal verdict below the pair floor", () => {
  // One pair is a coin flip. Reporting it as "helps" is how an eval harness
  // starts publishing noise.
  const [r] = summarizeLift([trial([], 0.0), trial(["s"], 1.0)], DEFAULT_CONTRAST, MEASURED_T);
  assert(r.lift === 1, `lift is still computed, got ${r.lift}`);
  assert(r.pairs === 1, "one pair");
  assert(r.verdict === "inconclusive", `expected inconclusive, got ${r.verdict}`);
});

test("summarizeLift calls it only with enough pairs", () => {
  const many = (skills: string[], reward: number) => Array.from({ length: 6 }, () => trial(skills, reward));
  const [helps] = summarizeLift([...many([], 0.2), ...many(["s"], 0.9)], DEFAULT_CONTRAST, MEASURED_T);
  assert(helps.verdict === "helps", `expected helps, got ${helps.verdict}`);

  const [harms] = summarizeLift([...many([], 0.9), ...many(["s"], 0.2)], DEFAULT_CONTRAST, MEASURED_T);
  assert(harms.verdict === "harms", `expected harms, got ${harms.verdict}`);
});

test("summarizeLift flags saturation per dimension, not just on the gates", () => {
  // audit-industrialisation, 2026-08-25: gates moved (+0.50) while its single
  // judge criterion passed in all four runs. No flag was raised because only
  // the gate baseline was checked, so a judge measuring nothing looked fine.
  const many = (skills: string[], reward: number, judge: number) =>
    Array.from({ length: 6 }, () => trial(skills, reward, { judgeScore: judge }));
  const [r] = summarizeLift([...many([], 0.5, 1.0), ...many(["s"], 1.0, 1.0)], DEFAULT_CONTRAST, MEASURED_T);

  assert(!r.flags.includes("saturated"), "the gate baseline is not at the ceiling");
  assert(r.flags.includes("judge-saturated"), `the judge baseline is, got ${r.flags.join(",")}`);
  assert(r.judgeVerdict === "inconclusive", "a saturated judge cannot conclude either");
});

test("summarizeLift flags a saturated baseline rather than calling it no-lift", () => {
  // A baseline at the ceiling means the fixture is too easy - a fact about the
  // eval, not about the skill.
  const many = (skills: string[], reward: number) => Array.from({ length: 6 }, () => trial(skills, reward));
  const [r] = summarizeLift([...many([], 1.0), ...many(["s"], 1.0)], DEFAULT_CONTRAST, MEASURED_T);
  assert(r.flags.includes("saturated"), `expected saturated, got ${r.flags.join(",")}`);
  assert(r.verdict === "inconclusive", `saturated must not read as a verdict, got ${r.verdict}`);
});

test("summarizeLift excludes errored trials and flags them", () => {
  const r = summarizeLift([trial([], 0.5), trial(["s"], 1, { errored: true, reward: null })])[0];
  assert(r.flags.includes("errored-trials"), "errored trials must be flagged");
  assert(r.with.n === 0, "an errored trial is not counted as an arm sample");
});

test("summarizeLift contrasts two named arms of the same job", () => {
  // A three-arm job (nothing / mono / thin) cannot be read by skills.length:
  // mono and thin both install something. The arm name is the identity, and
  // the contrast picks which two to pair.
  const armed = (arm: string, reward: number) =>
    Array.from({ length: 6 }, () => trial(arm === "nothing" ? [] : ["/s"], reward, { arm }));
  const trials = [...armed("nothing", 0.0), ...armed("mono", 0.75), ...armed("thin", 0.25)];

  const [bc] = summarizeLift(trials, { a: "mono", b: "thin" }, MEASURED_T);
  assert(bc.contrast.a === "mono" && bc.contrast.b === "thin", "the report says what it compared");
  assert(bc.pairs === 6, `6 pairs between mono and thin, got ${bc.pairs}`);
  assert(bc.lift === -0.5, `thin against mono, got ${bc.lift}`);
  assert(bc.verdict === "harms", `got ${bc.verdict}`);

  const [ac] = summarizeLift(trials, { a: "nothing", b: "thin" }, MEASURED_T);
  assert(ac.lift === 0.25 && ac.verdict === "helps", `thin against nothing, got ${ac.lift} ${ac.verdict}`);
});

test("summarizeLift keeps the saturation flags per contrast", () => {
  const armed = (arm: string, reward: number) =>
    Array.from({ length: 6 }, () => trial(arm === "nothing" ? [] : ["/s"], reward, { arm }));
  const trials = [...armed("nothing", 0.0), ...armed("mono", 1.0), ...armed("thin", 1.0)];
  const [bc] = summarizeLift(trials, { a: "mono", b: "thin" }, MEASURED_T);
  assert(bc.flags.includes("saturated"), "mono at the ceiling is a saturated baseline for the mono:thin contrast");
  assert(bc.verdict === "inconclusive", `a saturated baseline cannot conclude, got ${bc.verdict}`);
  const [ab] = summarizeLift(trials, { a: "nothing", b: "mono" });
  assert(!ab.flags.includes("saturated"), "the same trials are not saturated for nothing:mono");
});

test("summarizeLift default contrast still reads unnamed arms by their skills list", () => {
  // Every recorded run names both arms claude-code; the report must keep
  // reading those, and must not silently pool named arms into "with".
  const [r] = summarizeLift([...Array.from({ length: 6 }, () => trial([], 0)), ...Array.from({ length: 6 }, () => trial(["s"], 1))]);
  assert(r.pairs === 6 && r.lift === 1, `unnamed arms pair as before, got ${r.pairs} ${r.lift}`);

  const named = [trial([], 0, { arm: "nothing" }), trial(["s"], 1, { arm: "mono" }), trial(["s"], 1, { arm: "thin" })];
  const [n] = summarizeLift(named);
  assert(n.flags.includes("unpaired"), `named arms need an explicit contrast, got ${n.flags.join(",")}`);
});

test("readJobTrials takes the arm from config.agent.name, and none from the default agent", () => {
  // Shape of a real trial: config.agent.name is the job's agent name, which
  // is claude-code unless the job gave the arm its own name.
  const job = join(WORK, "job-arms");
  const write = (name: string, agent: string, skills: string[]) => {
    mkdirSync(join(job, name), { recursive: true });
    writeFileSync(join(job, name, "result.json"), JSON.stringify({
      task_name: "ronce-racine/x", config: { agent: { name: agent, skills } },
      verifier_result: { rewards: { reward: 1, n_gates: 2 } }, agent_result: {}, exception_info: null,
    }));
  };
  write("x__1", "claude-code", []);
  write("x__2", "thin", ["/s/a", "/s/b"]);
  const byName = new Map(readJobTrials(job).map((t) => [t.skills.length, t.arm]));
  assert(byName.get(0) === null, "the default agent name carries no arm identity");
  assert(byName.get(2) === "thin", `a named arm survives into the record, got ${byName.get(2)}`);
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

test("gates: file_matching keys on paths, where file_exists needs one name", () => {
  // Some exit conditions demand a KIND of file, not a named one: "a blocking
  // guardrail" is a git hook or a CI job, and the agent picks where it lives.
  const dir = join(WORK, "gates-matching");
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(join(dir, ".github", "workflows", "ci.yml"), "on: [push]\n");
  const ctx = gateCtx(dir);

  assert(applyGate({ kind: "file_matching", args: { pattern: "\\.github/workflows/" } }, ctx) === null,
    "a matching path passes");
  const missing = applyGate({ kind: "file_matching", args: { pattern: "\\.githooks/" } }, ctx);
  assert(missing !== null, "no matching path fails");
  contains(missing, "file_matching", "the message names the gate");

  assert(applyGate({ kind: "file_matching", args: { pattern: "([unclosed" } }, ctx) !== null,
    "an invalid pattern fails rather than throwing");
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

test("gates: repo_clean can be scoped to the tree that must not move", () => {
  // daily-workflow-optimization, 2026-08-25: its prompt says "act on tooling
  // and process", its gate allowed only the report, so the skill was penalised
  // for doing what it was asked and the passive arm scored better. Listing
  // every tooling file an agent might touch never converges; scoping the check
  // to the code that must stay untouched does.
  const dir = join(WORK, "gates-scoped");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "app.ts"), "original\n");
  writeFileSync(join(dir, ".gitignore"), "node_modules\n");
  const ctx = gateCtx(dir);

  writeFileSync(join(dir, ".gitignore"), "node_modules\ndist\n");
  writeFileSync(join(dir, "ci.yml"), "jobs: []\n");
  assert(applyGate({ kind: "repo_clean", args: { in: "src/" } }, ctx) === null,
    "tooling changes outside the scope are none of this gate's business");

  writeFileSync(join(dir, "src", "app.ts"), "TAMPERED\n");
  const dirty = applyGate({ kind: "repo_clean", args: { in: "src/" } }, ctx);
  assert(dirty !== null, "a change inside the scope must fail");
  contains(dirty, "src/app.ts", "the message names the offending file");
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

test("runOne: a failing precondition is reported as such, not as a gate", () => {
  // Reading "precondition" in the output tells the author the deliverable never
  // landed, so the gate failures below it say nothing about the skill.
  const manifest = parseEvalManifest("precondition-demo",
    'fixture: minimal-go\nprompt: >\n  Do the thing.\npreconditions:\n  - file_exists: "NEVER-WRITTEN.md"\ngates:\n  - file_exists: "REPORT.md"\n');
  spawnSync(TSX, [join(ROOT, "playground", "setup.ts")], { cwd: ROOT });
  const r = runOne(manifest, { claudeBin: stubClaude("good"), timeoutMs: 30_000 });
  assert(r.verdict === "FAIL", `expected FAIL, got ${r.verdict}`);
  assert(r.details.some((d) => d.startsWith("precondition ")), `details must mark the precondition, got ${r.details.join("; ")}`);
  assert(!r.details.some((d) => d.includes("REPORT.md")), `the satisfied gate must not be reported, got ${r.details.join("; ")}`);
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

/** The two shapes a real ATIF trajectory uses to show a skill being opened. */
const trajectory = (calls: { function_name: string; arguments: unknown }[]): string =>
  JSON.stringify({ steps: [{ source: "user", message: "do it" }, { source: "agent", tool_calls: calls }] });

test("readsFromTrajectory sees the skill loaded by the Skill tool, not by a Read", () => {
  // Observed on the 2026-09-02 sweep: SKILL.md never appears in a Read call -
  // the agent invokes `Skill{skill: "<name>"}` and the runtime pastes the body.
  const loaded = trajectory([{ function_name: "Skill", arguments: { skill: "audit-security" } }]);
  const r = readsFromTrajectory(loaded, ["audit-security"]);
  assert(r.skill, "a Skill call naming the skill is the skill being read");
  assert(!r.reference, "loading the skill is not reading its reference material");

  const other = readsFromTrajectory(loaded, ["audit-report"]);
  assert(!other.skill, "another skill's invocation does not count");
});

test("readsFromTrajectory counts a reference file under a skill dir separately", () => {
  // The option-C question: the pointer is only worth something if the sibling
  // file is actually opened. Real path shape, from the same sweep.
  const raw = trajectory([
    { function_name: "Skill", arguments: { skill: "audit-security" } },
    { function_name: "Read", arguments: { file_path: "/logs/agent/sessions/skills/audit-report/reference/apparatus.md" } },
  ]);
  const r = readsFromTrajectory(raw, ["audit-security", "audit-report"]);
  assert(r.skill && r.reference, `both must be seen, got ${JSON.stringify(r)}`);
});

test("readsFromTrajectory says nothing on a trajectory it cannot parse", () => {
  const r = readsFromTrajectory("not json at all", ["audit-security"]);
  assert(!r.skill && !r.reference, "an unparseable trajectory is no evidence of a read");
});

test("summarizeLift reports a read rate per arm and flags an unread skill", () => {
  // "skill not read" and "skill read but useless" score the same; only the
  // trajectory tells them apart. A flag, never a gate.
  const armed = (arm: string, read: boolean) =>
    Array.from({ length: 6 }, () => trial(arm === "nothing" ? [] : ["/s"], 1, { arm, skillRead: arm === "nothing" ? null : read, referenceRead: false }));
  const [r] = summarizeLift([...armed("nothing", false), ...armed("thin", false)], { a: "nothing", b: "thin" });

  assert(r.with.reads?.skill === 0 && r.with.reads?.trials === 6, `read rate on the measured arm, got ${JSON.stringify(r.with.reads)}`);
  assert(r.flags.includes("skill-unread"), `an arm that never opened its skill must be flagged, got ${r.flags.join(",")}`);

  const [ok] = summarizeLift([...armed("nothing", false), ...armed("thin", true)], { a: "nothing", b: "thin" });
  assert(!ok.flags.includes("skill-unread"), "an arm that always opened it is not flagged");
});

test("readJobTrials reads the skill flags from the trial's trajectory", () => {
  const job = join(WORK, "job-reads");
  const write = (name: string, skills: string[], calls: { function_name: string; arguments: unknown }[] | null) => {
    mkdirSync(join(job, name, "agent"), { recursive: true });
    writeFileSync(join(job, name, "result.json"), JSON.stringify({
      task_name: "ronce-racine/x", config: { agent: { name: "thin", skills } },
      verifier_result: { rewards: { reward: 1, n_gates: 2 } }, agent_result: {}, exception_info: null,
    }));
    if (calls) writeFileSync(join(job, name, "agent", "trajectory.json"), trajectory(calls));
  };
  write("x__1", ["/staging/.claude/skills/audit-security"], [{ function_name: "Skill", arguments: { skill: "audit-security" } }]);
  write("x__2", ["/staging/.claude/skills/audit-security"], [{ function_name: "Bash", arguments: { command: "ls" } }]);
  write("x__3", [], [{ function_name: "Bash", arguments: { command: "ls" } }]);
  write("x__4", ["/staging/.claude/skills/audit-security"], null);

  const flags = readJobTrials(job).map((t) => t.skillRead);
  assert(flags.filter((f) => f === true).length === 1, "the trial that invoked the skill reads true");
  assert(flags.filter((f) => f === false).length === 1, "a trajectory without a skill call reads false");
  assert(flags.filter((f) => f === null).length === 2, "no skill installed, or no trajectory, reads null");
});

finish("eval");

// --- Multi-scenario manifests -------------------------------------------
//
// A skill grows a second eval when one fixture cannot ask two questions of it.
// The extra manifests live in `skills/<skill>/evals/<scenario>.eval.yaml`, and
// the suffix is load-bearing: install.ts and the tarball both exclude a
// manifest by `endsWith("eval.yaml")`, so a plain `<scenario>.yaml` would be
// staged into the container and let the agent read the gates grading it.

const skillsTree = (spec: Record<string, string>): string => {
  const root = join(WORK, `skills-tree-${Math.random().toString(36).slice(2)}`);
  for (const [rel, body] of Object.entries(spec)) {
    mkdirSync(join(root, "skills", rel, ".."), { recursive: true });
    writeFileSync(join(root, "skills", rel), body);
  }
  return root;
};

const MINIMAL = "fixture: minimal-go\nprompt: >\n  p\n";

test("discoverManifests ids a skills/<skill>/eval.yaml by the skill alone", () => {
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL });
  const found = discoverManifests(root);
  assert(found.length === 1, `expected 1 manifest, got ${found.length}`);
  assert(found[0].id === "alpha", `id was ${found[0].id}`);
  assert(found[0].scenario === null, `scenario was ${found[0].scenario}`);
});

test("discoverManifests ids an evals/<scenario>.eval.yaml as skill/scenario", () => {
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL, "alpha/evals/out-of-reach.eval.yaml": MINIMAL });
  const ids = discoverManifests(root).map((m) => m.id);
  assert(ids.join(" ") === "alpha alpha/out-of-reach", `ids were ${ids.join(" ")}`);
});

test("discoverManifests skips a file under evals/ that is not *.eval.yaml", () => {
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL, "alpha/evals/notes.yaml": MINIMAL });
  const ids = discoverManifests(root).map((m) => m.id);
  assert(ids.join(" ") === "alpha", `ids were ${ids.join(" ")}`);
});

test("discoverManifests finds a scenario for a skill with no default manifest", () => {
  const root = skillsTree({ "alpha/evals/only.eval.yaml": MINIMAL });
  const ids = discoverManifests(root).map((m) => m.id);
  assert(ids.join(" ") === "alpha/only", `ids were ${ids.join(" ")}`);
});

test("parseEvalManifest carries the scenario id given a ManifestRef", () => {
  const m = parseEvalManifest({ skill: "alpha", scenario: "out-of-reach", id: "alpha/out-of-reach", path: "x" }, MINIMAL);
  assert(m.skill === "alpha", `skill was ${m.skill}`);
  assert(m.scenario === "out-of-reach", `scenario was ${m.scenario}`);
  assert(m.id === "alpha/out-of-reach", `id was ${m.id}`);
});

test("parseEvalManifest still accepts a bare skill name, id equal to it", () => {
  const m = parseEvalManifest("alpha", MINIMAL);
  assert(m.scenario === null, `scenario was ${m.scenario}`);
  assert(m.id === "alpha", `id was ${m.id}`);
});

// --- T3: the judge grades against the manifest that graded the trial ---------
// Judging a scenario against another scenario's criteria is silent: the run
// still produces verdicts, they just answer a different question. So every
// path that cannot name the manifest with certainty is an error, never a
// fallback to skills/<skill>/eval.yaml.


test("the judge resolves a scenario trial to that scenario's manifest", () => {
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL, "alpha/evals/beta.eval.yaml": MINIMAL });
  const r = resolveTrialManifest({ skill: "alpha", scenario: "beta" }, {}, root);
  assert(r.ok, `expected a resolution, got ${r.ok ? "" : r.error}`);
  assert(r.ref.path === join(root, "skills", "alpha", "evals", "beta.eval.yaml"), `path was ${r.ref.path}`);
  assert(r.ref.id === "alpha/beta", `id was ${r.ref.id}`);
});

test("the judge resolves an explicit null scenario to the default manifest", () => {
  // The skill HAS scenarios; the trial recorded that it ran the default one.
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL, "alpha/evals/beta.eval.yaml": MINIMAL });
  const r = resolveTrialManifest({ skill: "alpha", scenario: null }, {}, root);
  assert(r.ok, `expected a resolution, got ${r.ok ? "" : r.error}`);
  assert(r.ref.path === join(root, "skills", "alpha", "eval.yaml"), `path was ${r.ref.path}`);
  assert(r.ref.scenario === null, `scenario was ${r.ref.scenario}`);
});

test("a checks.json with no scenario field for a skill with evals/ refuses to guess", () => {
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL, "alpha/evals/beta.eval.yaml": MINIMAL });
  const fromChecks = resolveTrialManifest({ skill: "alpha" }, {}, root);
  assert(!fromChecks.ok, "an unrecorded scenario must not resolve to eval.yaml");
  contains(fromChecks.ok ? "" : fromChecks.error, "--scenario", "the error must say how to disambiguate");
  const fromFlag = resolveTrialManifest(null, { skill: "alpha" }, root);
  assert(!fromFlag.ok, "--skill alone is just as ambiguous once the skill has scenarios");
});

test("a checks.json with no scenario field still resolves a skill that has no evals/", () => {
  // Trials recorded before scenarios existed stay judgeable.
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL });
  const r = resolveTrialManifest({ skill: "alpha" }, {}, root);
  assert(r.ok, `expected a resolution, got ${r.ok ? "" : r.error}`);
  assert(r.ref.id === "alpha", `id was ${r.ref.id}`);
});

test("--scenario overrides what the trial recorded, and empty means the default", () => {
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL, "alpha/evals/beta.eval.yaml": MINIMAL, "alpha/evals/gamma.eval.yaml": MINIMAL });
  const other = resolveTrialManifest({ skill: "alpha", scenario: "beta" }, { scenario: "gamma" }, root);
  assert(other.ok && other.ref.id === "alpha/gamma", "--scenario must win over checks.json");
  const dflt = resolveTrialManifest({ skill: "alpha" }, { scenario: "" }, root);
  assert(dflt.ok && dflt.ref.scenario === null, "an empty --scenario names the default manifest");
});

test("a scenario with no manifest on disk is an error, not a fallback to eval.yaml", () => {
  const root = skillsTree({ "alpha/eval.yaml": MINIMAL });
  const r = resolveTrialManifest({ skill: "alpha", scenario: "ghost" }, {}, root);
  assert(!r.ok, "a missing scenario manifest must not silently grade against the default");
  contains(r.ok ? "" : r.error, "ghost.eval.yaml", "the error must name the manifest it looked for");
});

test("eval-judge.ts exits 2 rather than judge a scenario against eval.yaml", () => {
  // detection-sweep has a default manifest and no evals/ directory, so a trial
  // claiming to have run a scenario of it can only be judged against criteria
  // that graded something else.
  const trialDir = join(WORK, "judge-trial-unresolvable");
  mkdirSync(join(trialDir, "verifier"), { recursive: true });
  writeFileSync(join(trialDir, "verifier", "checks.json"), JSON.stringify({ skill: "detection-sweep", scenario: "beta" }));
  writeFileSync(join(trialDir, "verifier", "artifacts.md"), "an artifact");
  const r = spawnSync(TSX, [join(ROOT, "tools", "eval-judge.ts"), trialDir], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, EVAL_CLAUDE_BIN: join(WORK, "no-such-bin") },
  });
  assert(r.status === 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
  contains(r.stderr, "beta.eval.yaml", "stderr must name the manifest it looked for");
  assert(!existsSync(join(trialDir, "verifier", "judge.json")), "no judgement may be written when the manifest is unknown");
});

// --- Obligation tier ---------------------------------------------------------
//
// A manifest cannot say how seriously it is meant to be taken, so every one of
// them reads as equally load-bearing. `tier:` says it: an `anchor` is measured
// at full power and re-measured every release, a `measured` scenario carries a
// real paired verdict, a `probed` one only ever gets the cheap admission checks
// and must never carry a causal verdict.

test("parseEvalManifest reads the obligation tier", () => {
  for (const tier of ["anchor", "measured", "probed"] as const) {
    const m = parseEvalManifest("alpha", `tier: ${tier}\n${MINIMAL}`);
    assert(m.tier === tier, `tier was ${m.tier}, expected ${tier}`);
  }
});

test("an unknown tier is an error, not a silent default", () => {
  // Same strictness as an unknown gate: a typo that quietly became the default
  // would downgrade a scenario nobody meant to downgrade, and the run would
  // still look healthy.
  let threw = "";
  try { parseEvalManifest("alpha", `tier: gold\n${MINIMAL}`); } catch (e) { threw = (e as Error).message; }
  contains(threw, "gold", "the error must name the value it rejected");
  contains(threw, "anchor", "the error must list what is allowed");
});

test("a manifest with no tier: parses, and lands on the tier that claims least", () => {
  const m = parseEvalManifest("alpha", MINIMAL);
  assert(m.tier === "probed", `an untiered manifest must not claim more than probed, got ${m.tier}`);
  assert(DEFAULT_TIER === "probed", `the default must be the weakest claim, got ${DEFAULT_TIER}`);
});

// --- The judge prompt at fixture scale ---------------------------------------
//
// A realistic fixture is 20+ files of several hundred lines, so the bundle the
// judge is handed stops fitting in the prompt. Three properties have to hold
// from then on: nothing is cut in silence, the deliverable is never what gets
// cut, and the budget is sized for those fixtures rather than for a four-file
// toy. A verdict built on evidence the judge never saw is worse than no verdict.

const REPORT_MANIFEST = 'fixture: big-app\nprompt: >\n  p\ngates:\n  - file_exists: "zz-report.md"\njudge:\n  criteria:\n    - "The report names a root cause"\n  threshold: pass_all\n';

/** A bundle in the collected format, built by the real collector. */
const bundleOf = (name: string, files: Record<string, string>): string => {
  const dir = join(WORK, `bundle-${name}`);
  mkdirSync(dir, { recursive: true });
  const baseline = snapshotRepo(dir);
  for (const [rel, body] of Object.entries(files)) writeFileSync(join(dir, rel), body);
  return collectArtifacts(baseline, dir);
};

/** `n` source files the agent touched, each big enough to matter to the budget. */
const scenery = (n: number, bytes: number): Record<string, string> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`mod-${i}.ts`, `// module ${i}\n${"x".repeat(bytes)}\n`]));

test("the judge prompt names every artifact it could not fit", () => {
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const files = 12;
  const bundle = bundleOf("dropped", scenery(files, Math.floor(JUDGE_ARTIFACTS_BUDGET / 6)));
  const p = buildJudgePrompt(m, "t", bundle);

  const unseen = [...Array(files).keys()].filter((i) => !p.includes(`// module ${i}`));
  assert(unseen.length > 0, "the premise: twice the budget cannot fit whole");
  for (const i of unseen) contains(p, `mod-${i}.ts`, `an artifact the judge never saw must be named, mod-${i}.ts was not`);
  contains(p, "not shown", "the prompt must say that evidence is missing");
});

test("the deliverable is shown before the files the agent merely touched", () => {
  // The collector walks the tree in directory order, so the deliverable can
  // arrive last in the bundle. Alphabetical luck must not decide what is graded.
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const touched = bundleOf("order-src", scenery(12, Math.floor(JUDGE_ARTIFACTS_BUDGET / 6)));
  const deliverable = bundleOf("order-report", { "zz-report.md": "# Report\nroot cause: OFF_BY_ONE_MARK\n" });

  const p = buildJudgePrompt(m, "t", `${touched}\n${deliverable}`);
  contains(p, "OFF_BY_ONE_MARK", "the file the gates name must survive the budget");
  assert(p.indexOf("OFF_BY_ONE_MARK") < p.indexOf("// module"), "the deliverable must be presented first");
});

test("an artifact larger than the whole budget is graded on a marked slice", () => {
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const body = `# Report\nHEAD_MARK\n${"a finding\n".repeat(JUDGE_ARTIFACTS_BUDGET / 5)}TAIL_MARK\n`;
  const p = buildJudgePrompt(m, "t", bundleOf("huge", { "zz-report.md": body }));

  contains(p, "HEAD_MARK", "the head of an oversized deliverable is still evidence");
  assert(!p.includes("TAIL_MARK"), "the budget still holds");
  contains(p, "zz-report.md", "the cut must name the file it happened in");
  contains(p, "not shown", "a sliced file must say what is missing from it");
});

test("a transcript that fits arrives whole and claims no cut", () => {
  // This test used to assert the opposite of its own name: it required the head
  // of a 100 KB transcript to be DROPPED, which is the defect, not the contract.
  // What survives of it is the half that was always right - a prompt that cut
  // nothing must not say it did. The cutting half is below, under the budget.
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const whole = buildJudgePrompt(m, "short transcript", "");
  assert(!/not shown|truncated/i.test(whole), "nothing was cut, so nothing may claim it was");
  contains(whole, "short transcript", "a transcript under budget is handed over untouched");
});

test("a bundle in another shape is cut with a notice, never in silence", () => {
  // runOne still delimits with `### <path>`, the shape eval-grade.ts abandoned.
  // Whatever arrives, the prompt must never pretend it carried the whole of it.
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const legacy = `### zz-report.md\nHEAD_MARK\n${"x".repeat(JUDGE_ARTIFACTS_BUDGET)}\nTAIL_MARK\n`;
  const p = buildJudgePrompt(m, "t", legacy);

  contains(p, "HEAD_MARK", "an unrecognised bundle is still evidence");
  assert(!p.includes("TAIL_MARK"), "the budget holds whatever the shape");
  contains(p, "not shown", "the cut must be announced");
});

test("the artifacts budget is sized for a fixture of 20 changed files", () => {
  // The cap this replaced was 10 KB: four small files, and everything after
  // them was graded unseen. A 20-file fixture whose agent rewrote every file at
  // ~2 KB is the size the harness now has to carry whole.
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const bundle = bundleOf("realistic", scenery(20, 2_000));
  const p = buildJudgePrompt(m, "t", bundle);
  for (const i of [...Array(20).keys()]) contains(p, `// module ${i}`, `mod-${i}.ts must reach the judge whole`);
});

// --- The trajectory is evidence, not prose ---------------------------------

test("transcriptFromTrajectory renders the tool calls, not only what the agent said", () => {
  // Measured 2026-09-03 over the 12 trials of the anchor run: 598 tool calls
  // across 480 steps, and the judge saw none of them. It received the `message`
  // of each step and nothing else, so a criterion like "refutes a hypothesis
  // with evidence it PRODUCED, not with a claim" was unjudgeable by
  // construction - the only difference between running a command and saying you
  // ran it lives in the part that was dropped.
  //
  // A skill prescribes a protocol, a context to gather before acting and a set
  // of tools; none of that is visible in prose alone.
  const atif = JSON.stringify({ steps: [
    { source: "user", message: "the nightly job keeps failing" },
    { source: "agent", message: "checking the history", tool_calls: [
      { function_name: "Bash", arguments: { command: "git log --oneline -20" } },
      { function_name: "Read", arguments: { file_path: "build.config.json" } },
    ] },
    { source: "agent", message: "I refuted the pool hypothesis" },
  ] });

  const flat = transcriptFromTrajectory(atif);
  contains(flat, "git log --oneline -20", "the command the agent ran must reach the judge");
  contains(flat, "build.config.json", "the file it opened must reach the judge");
  contains(flat, "Bash", "the tool it chose must be named");
  contains(flat, "the nightly job keeps failing", "the prose must survive alongside");
});

test("transcriptFromTrajectory keeps a step with tool calls and no message", () => {
  // The common shape in a real trajectory: the agent acts without narrating.
  // Rendering it as an empty line loses the only evidence that step carries.
  const atif = JSON.stringify({ steps: [
    { source: "agent", message: "", tool_calls: [{ function_name: "Grep", arguments: { pattern: "retentionBudgetKb" } }] },
  ] });
  contains(transcriptFromTrajectory(atif), "retentionBudgetKb", "a silent step is still an action");
});

// --- The trajectory section ------------------------------------------------
//
// Five of the six surfaces a skill prescribes - its tooling, the context to
// gather BEFORE acting, its protocol, its named traps, its guardrails - are
// claims about what the agent did, not about the tree it left behind. A repo
// snapshot cannot hold any of them: the final tree is identical whether the
// history was read first or last.

const TRAJ = `fixture: incident
prompt: >
  p
trajectory:
  - tool_used: { name: "detect-recurring-fixes", min: "1" }
  - tool_absent: { name: "git commit" }
  - before: { first: "git log", then: "edit:build.config.json" }
  - step_budget: { max: "60" }
`;

test("parseEvalManifest reads a trajectory section", () => {
  const m = parseEvalManifest("x", TRAJ);
  assert(m.trajectory.length === 4, `expected 4 checks, got ${m.trajectory.length}`);
  assert(m.trajectory[0].kind === "tool_used", `first kind was ${m.trajectory[0].kind}`);
  assert(m.trajectory[0].args.name === "detect-recurring-fixes", "the tool name is carried");
  assert(m.trajectory[2].args.first === "git log", "an ordering check carries both sides");
  assert(m.trajectory[2].args.then === "edit:build.config.json", "and the action that must come after");
});

test("parseEvalManifest rejects an unknown trajectory check", () => {
  let threw = "";
  try { parseEvalManifest("x", "fixture: a\nprompt: >\n  p\ntrajectory:\n  - frobnicate: \"y\"\n"); }
  catch (e) { threw = (e as Error).message; }
  contains(threw, "unknown trajectory check", "an unknown check must fail the parse, never be ignored");
});

test("a manifest with no trajectory section parses to an empty list", () => {
  // Additive by construction: every scenario written before this section
  // existed keeps its verdict shape.
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  p\ngates:\n  - file_exists: "R.md"\n');
  assert(Array.isArray(m.trajectory) && m.trajectory.length === 0, "absent means empty, never undefined");
});

test("a judge criterion may declare the dimension it grades", () => {
  // One rubric item, one judgment call, attributed - and the dimension is what
  // lets a report say WHERE a skill helped rather than only whether it did.
  const m = parseEvalManifest("x", 'fixture: a\nprompt: >\n  p\njudge:\n  criteria:\n    - { dimension: trap, text: "Does not settle for a documentation-only guardrail" }\n    - "A bare criterion still parses"\n');
  assert(m.judge?.criteria.length === 2, `expected 2 criteria, got ${m.judge?.criteria.length}`);
  assert(m.judge?.criteria[0].dimension === "trap", `dimension was ${m.judge?.criteria[0].dimension}`);
  contains(m.judge?.criteria[0].text ?? "", "documentation-only", "the text survives");
  assert(m.judge?.criteria[1].dimension === "outcome", "a bare criterion defaults to the dimension graded today");
});

// --- The transcript budget: a tail window deletes the ordering evidence -----
//
// `JUDGE_TRANSCRIPT_TAIL` kept the LAST 30 KB, which was defensible while the
// transcript was prose. Since the tool calls are rendered it is not: the same
// twelve trajectories of the 2026-09-03 anchor run went from 95 KB to 213 KB,
// and the evidence for a `sequence` criterion - "context gathered BEFORE
// acting" - sits at the START of a trajectory. A tail window drops the one
// dimension the trajectory framework was built to measure, and drops it in
// silence: nothing in the prompt said the beginning of the run was missing.

/** The transcript section alone, so a cut inside it cannot be confused with an artifact's. */
const transcriptSection = (prompt: string): string => {
  const start = prompt.indexOf("## Transcript");
  const end = prompt.indexOf("## Artifacts produced", start);
  return prompt.slice(start, end === -1 ? undefined : end);
};

/** A rendered trajectory in the shape `transcriptFromTrajectory` emits: prose, then its actions. */
const renderedSteps = (n: number): string =>
  Array.from({ length: n }, (_, i) => `[agent] step ${i}\n  → Bash(command=grep -rn marker-${i} src/)`).join("\n");

test("both ends of an oversized transcript reach the judge", () => {
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const long = `[agent] FIRST_ACTION_MARK\n${renderedSteps(6_000)}\n[agent] LAST_ACTION_MARK`;
  assert(long.length > JUDGE_TRANSCRIPT_BUDGET, `the premise: ${long.length} B cannot fit in ${JUDGE_TRANSCRIPT_BUDGET}`);

  const p = buildJudgePrompt(m, long, "");
  contains(p, "FIRST_ACTION_MARK", "the ordering evidence sits at the START of the run and must survive");
  contains(p, "LAST_ACTION_MARK", "the deliverable sits at the end and must survive too");
});

test("a cut transcript accounts for every byte, by position and size", () => {
  // The artifact budget names each file it could not fit. The transcript owes
  // the same: a judge grading a partial run has to know a part is missing and
  // WHICH part, or it reads an absence at the start as a thing that never
  // happened. Announced head + announced tail + announced cut = the whole.
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const long = renderedSteps(6_000);
  const section = transcriptSection(buildJudgePrompt(m, long, ""));

  const counts = /opening (\d+) B \+ closing (\d+) B of (\d+) B; (\d+) byte/.exec(section);
  assert(counts !== null, `the header must state head, tail, total and cut; got: ${section.slice(0, 200)}`);
  const [head, tail, total, cut] = counts!.slice(1).map(Number);
  assert(total === long.length, `the header must state the real size, said ${total} for ${long.length}`);
  assert(head + tail + cut === total, `nothing may vanish unaccounted: ${head} + ${tail} + ${cut} != ${total}`);
  assert(head > 0 && tail > 0, "a budget spent on one end only is the defect this replaces");
  contains(section, "middle", "the cut must say WHERE it happened, not only that it happened");
});

test("the transcript is cut on line boundaries, so a quoted action is whole", () => {
  // The judge is required to quote verbatim and a rendered tool call is now an
  // admissible quote. Half a line - `nd=git commit -m` - is a quote of an act
  // that never happened in that form, which is worse than no evidence.
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const long = renderedSteps(6_000);
  const originals = new Set(long.split("\n"));
  const body = transcriptSection(buildJudgePrompt(m, long, "")).split("\n");

  for (const line of body) {
    if (line === "" || line.startsWith("## Transcript") || line.startsWith("=====")) continue;
    assert(originals.has(line), `every shown line must be a whole line of the trajectory, got ${JSON.stringify(line)}`);
  }
});

test("the transcript budget carries a whole trajectory from the anchor run", () => {
  // 12 trials rendered to 213 KB once the actions were included - ~18 KB each.
  // A budget that cut at that scale would cut every real trial, so it is sized
  // above it rather than at it, the way the artifact budget was.
  const m = parseEvalManifest("demo", REPORT_MANIFEST);
  const typical = renderedSteps(720);
  assert(typical.length > 35_000, `the premise: ${typical.length} B is twice the anchor average`);
  const section = transcriptSection(buildJudgePrompt(m, typical, ""));
  assert(!/not shown/.test(section), "a trajectory twice the anchor average must arrive whole");
});

// --- One rubric item, one judgment call ------------------------------------

const DIM_MANIFEST = `fixture: incident
prompt: >
  p
judge:
  criteria:
    - { dimension: sequence, text: "Read the history before editing the config" }
    - { dimension: trap, text: "Does not settle for a documentation-only guardrail" }
  threshold: pass_all
`;

test("the prompt tells the judge what KIND of evidence each dimension needs", () => {
  const m = parseEvalManifest("recurring-bug-root-cause", DIM_MANIFEST);
  const p = buildJudgePrompt(m, "t", "");

  contains(p, "(sequence)", "the dimension travels with the criterion it belongs to");
  contains(p, "(trap)", "and with the next one");
  // Matched case-insensitively: the prompt shouts the noun that names the kind
  // of thing to look for, and which case it shouts in is not what is under test.
  assert(/ordering/i.test(p), "a sequence criterion must be told it is asking about an ordering");
  assert(/rationalization/i.test(p), "a trap criterion must be told it is asking about a named excuse");
  assert(!/restraint/i.test(p), "a dimension no criterion declares must not be taught to the judge");
});

test("a rendered tool call is evidence, and a claim to have acted is not", () => {
  // The 598-tool-call defect, turned into a rule the judge is held to: until the
  // actions were rendered, running a command and saying you ran it read
  // identically. Now that they are, prose may no longer stand in for an act.
  const m = parseEvalManifest("recurring-bug-root-cause", DIM_MANIFEST);
  const p = buildJudgePrompt(m, "t", "");
  contains(p, "→ Bash(", "the prompt must show the judge what a rendered action looks like");
  contains(p, "only admissible", "for tooling and sequence, the action IS the evidence");
});

test("each verdict is attributed to the step that earns it", () => {
  // RubricEval and Step-wise Rubric Rewards: a rationale plus a binary verdict,
  // attributed to a step. The batch shape is kept - see the comment on
  // buildJudgePrompt - so attribution is what has to carry that weight.
  const m = parseEvalManifest("recurring-bug-root-cause", DIM_MANIFEST);
  const p = buildJudgePrompt(m, "t", "");
  contains(p, '"where"', "the requested verdict shape must carry the step it is attributed to");
});

test("an absence criterion is told how to evidence an absence", () => {
  // `restraint` grades a thing that did NOT happen, and "a pass without a
  // concrete quote is invalid" is unsatisfiable against nothing: the parser
  // turns an empty quote into a fail, so every restraint criterion would fail
  // for the wrong reason. What is quotable is what the agent did instead.
  const m = parseEvalManifest("recurring-bug-root-cause",
    'fixture: incident\nprompt: >\n  p\njudge:\n  criteria:\n    - { dimension: restraint, text: "Does not commit" }\n  threshold: pass_all\n');
  const p = buildJudgePrompt(m, "t", "");
  assert(/absence/i.test(p), "the judge must be told this criterion grades an absence");
  contains(p, "instead", "and that the quote is what the agent did in place of the forbidden act");
});

test("the layout this harness assumes lives in one place, and moving it moves discovery", () => {
  // The harness measures whether a document added to an agent's context moves
  // the work. Nothing in that question is specific to this repository - what is
  // specific is the convention that the document under test is a directory
  // under `skills/` holding a `SKILL.md`. That convention was hardcoded in four
  // files; it is now one declaration, so a second consumer with another layout
  // is a config change rather than a fork.
  //
  // The check is not cosmetic: pointing SUBJECT at another directory has to
  // actually move discovery, or the extraction is a comment pretending to be a
  // seam.
  const root = join(WORK, `subject-layout-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "playbooks", "alpha"), { recursive: true });
  writeFileSync(join(root, "playbooks", "alpha", "eval.yaml"), MINIMAL);
  mkdirSync(join(root, "skills", "beta"), { recursive: true });
  writeFileSync(join(root, "skills", "beta", "eval.yaml"), MINIMAL);

  assert(discoverManifests(root).map((m) => m.id).join() === "beta", "the declared directory is the one read");

  const previous = SUBJECT.dir;
  try {
    SUBJECT.dir = "playbooks";
    assert(discoverManifests(root).map((m) => m.id).join() === "alpha", "moving the declaration moves discovery");
  } finally {
    SUBJECT.dir = previous;
  }
});

test("the trajectory grade does not depend on paying for a judge", () => {
  // Found while validating the chain end to end: trajectory grading was wired
  // AFTER the judge call in eval-judge's main, so the one dimension that is
  // deterministic and free could only be obtained by buying the one that is
  // neither. With the prompt now carrying rendered actions, a judge call runs
  // for minutes; twelve trials did not finish in ten.
  //
  // The order is now the other way round and the judge is skippable, which is
  // also the right default for iterating on a manifest's trajectory section.
  const src = readFileSync(join(ROOT, "tools", "eval-judge.ts"), "utf8");
  const gradeAt = src.indexOf("const trajectory = gradeTrajectory(");
  const judgeAt = src.indexOf("const report = judgeTrial(");
  assert(gradeAt > 0 && judgeAt > 0, "both passes must exist in main");
  assert(gradeAt < judgeAt, "the free deterministic pass must not sit behind the paid one");
  contains(src, "--no-judge", "and the paid pass must be skippable");
});
