#!/usr/bin/env tsx
/**
 * Report-level tests: what a job holding several SCENARIOS of one skill reads
 * as. Two scenarios of the same skill answer two different questions, so their
 * trials must never average into one number.
 */
import { test, assert, contains, absent, initWork, finish, WORK, ROOT, cli } from "./helpers.js";
import {
  summarizeLift, summaryLabel, summaryLines, readManifestTiers, readManifestDimensions,
  dimensionLines, DEFAULT_CONTRAST, SUMMARY_LABEL_WIDTH, type TrialRecord,
} from "../tools/eval-report.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

initWork();

const trial = (task: string, skills: string[], reward: number): TrialRecord => ({
  task, arm: null, skills, reward, judgeScore: null, nGates: 2, inputTokens: 100, outputTokens: 10,
  costUsd: 0.01, durationMs: 1000, errored: false, skillRead: null, referenceRead: null,
});

const SIX = 6;
const sixOf = (task: string, skills: string[], reward: number): TrialRecord[] =>
  Array.from({ length: SIX }, () => trial(task, skills, reward));

test("two scenarios of one skill are two reports, not one pooled average", () => {
  // The grouping key is the task name, which carries the scenario slug. Were it
  // the skill, these two would merge and their opposite lifts would cancel to
  // a flat 0.00 - a skill that helps one scenario and harms the other would
  // read as no effect at all.
  const a = "ronce-racine/audit-security--runtime-out-of-reach";
  const b = "ronce-racine/audit-security--external-gateway-surface";
  const reports = summarizeLift([
    ...sixOf(a, [], 0), ...sixOf(a, ["s"], 1),
    ...sixOf(b, [], 1), ...sixOf(b, ["s"], 0),
  ]);

  assert(reports.length === 2, `one report per scenario, got ${reports.length}`);
  const byTask = new Map(reports.map((r) => [r.task, r]));
  assert(byTask.get(a)?.lift === 1, `first scenario keeps its own lift, got ${byTask.get(a)?.lift}`);
  assert(byTask.get(b)?.lift === -1, `second scenario keeps its own lift, got ${byTask.get(b)?.lift}`);
  assert(byTask.get(a)?.pairs === SIX, `pairs are counted within a scenario, got ${byTask.get(a)?.pairs}`);
});

test("the default scenario of a skill stays apart from its named scenarios", () => {
  const base = "ronce-racine/audit-security";
  const named = "ronce-racine/audit-security--runtime-out-of-reach";
  // Both declared `measured`: the question here is which trials feed which
  // report, and a tier that withholds verdicts would answer it for us.
  const tiers = new Map([["audit-security", "measured" as const], ["audit-security/runtime-out-of-reach", "measured" as const]]);
  const reports = summarizeLift([
    ...sixOf(base, [], 0.5), ...sixOf(base, ["s"], 0.5),
    ...sixOf(named, [], 0), ...sixOf(named, ["s"], 1),
  ], DEFAULT_CONTRAST, tiers);

  assert(reports.length === 2, `the base manifest is its own report, got ${reports.length}`);
  const flat = reports.find((r) => r.task === base);
  assert(flat?.verdict === "no-lift", `the base scenario reads on its own trials, got ${flat?.verdict}`);
});

test("summaryLabel renders skill · scenario, and the widest one still fits its column", () => {
  assert(
    summaryLabel("ronce-racine/audit-security--runtime-out-of-reach") === "audit-security · runtime-out-of-reach",
    `got ${JSON.stringify(summaryLabel("ronce-racine/audit-security--runtime-out-of-reach"))}`,
  );
  assert(
    summaryLabel("ronce-racine/detection-sweep") === "detection-sweep",
    "a skill with no scenario keeps its bare name",
  );
  // The longest id the scenario set produces. The column has to hold it whole:
  // a truncated id names no manifest, and two scenarios of one skill can share
  // every character up to the cut.
  const widest = summaryLabel("ronce-racine/audit-performance-frontend--client-not-in-checkout");
  assert(widest === "audit-performance-frontend · client-not-in-checkout", `got ${JSON.stringify(widest)}`);
  assert(widest.length < SUMMARY_LABEL_WIDTH, `${widest.length} chars must fit in ${SUMMARY_LABEL_WIDTH}`);
});

test("--summary prints one line per scenario, labelled and column-aligned", () => {
  const job = join(WORK, "job-scenarios");
  const write = (dir: string, task: string, skills: string[], reward: number) => {
    mkdirSync(join(job, dir), { recursive: true });
    writeFileSync(join(job, dir, "result.json"), JSON.stringify({
      task_name: task, config: { agent: { name: "claude-code", skills } },
      verifier_result: { rewards: { reward, n_gates: 2 } }, agent_result: {}, exception_info: null,
    }));
  };
  const long = "ronce-racine/audit-performance-frontend--client-not-in-checkout";
  const short = "ronce-racine/audit-security--runtime-out-of-reach";
  for (let i = 0; i < SIX; i++) {
    write(`long-without-${i}`, long, [], 0);
    write(`long-with-${i}`, long, ["/skills/audit-performance-frontend"], 1);
    write(`short-without-${i}`, short, [], 1);
    write(`short-with-${i}`, short, ["/skills/audit-security"], 0);
  }

  const r = cli([join(ROOT, "tools", "eval-report.ts"), job, "--summary"]);
  assert(r.status === 0, `--summary must succeed, got ${r.status}: ${r.stderr}`);
  contains(r.stdout, "audit-security · runtime-out-of-reach", "the scenario is named, not the raw slug");
  contains(r.stdout, "audit-performance-frontend · client-not-in-checkout", "the longest label is printed whole");

  const rows = r.stdout.split("\n").filter((l) => l.includes(" · ") && /[+-][0-9]\.[0-9]{2}/.test(l));
  assert(rows.length === 2, `one row per scenario, got ${rows.length}: ${JSON.stringify(rows)}`);
  // Padding, not truncation: the widest label must still be followed by blanks,
  // or its numbers run into the name and the sweep stops being readable.
  for (const row of rows) {
    assert(/ {2,}[+-]?[0-9]/.test(row), `columns stay separated: ${JSON.stringify(row)}`);
  }
  const gatesColumn = (row: string): number => row.indexOf(row.trim().split(/ {2,}/)[1] ?? "");
  assert(
    new Set(rows.map(gatesColumn)).size === 1,
    `both rows start their numbers at the same column: ${JSON.stringify(rows)}`,
  );
});

finish("eval-report");

// --- Obligation tier ---------------------------------------------------------
//
// The three levels differ in what their numbers are allowed to claim. A probed
// scenario only ever gets the cheap admission checks, so its gap - however
// large - is not evidence of anything, and a summary that prints it beside an
// anchor's gap in one undifferentiated block invites exactly that reading.

const ANCHOR_TASK = "ronce-racine/audit-security--runtime-out-of-reach";
const PROBED_TASK = "ronce-racine/domain-glossary";

const tieredTrials = (): TrialRecord[] => [
  ...sixOf(ANCHOR_TASK, [], 0), ...sixOf(ANCHOR_TASK, ["s"], 1),
  ...sixOf(PROBED_TASK, [], 0), ...sixOf(PROBED_TASK, ["s"], 1),
];
const TIERS = new Map([
  ["audit-security/runtime-out-of-reach", "anchor" as const],
  ["domain-glossary", "probed" as const],
]);

test("a probed scenario carries no causal verdict, however large the gap", () => {
  const reports = summarizeLift(tieredTrials(), DEFAULT_CONTRAST, TIERS);
  const probed = reports.find((r) => r.task === PROBED_TASK);
  assert(probed?.tier === "probed", `tier was ${probed?.tier}`);
  assert(probed?.lift === 1, `the gap is still reported, got ${probed?.lift}`);
  assert(probed?.verdict === "inconclusive", `a probed gate gap must not read as a cause, got ${probed?.verdict}`);
  assert(probed?.judgeVerdict === "inconclusive", `nor a probed judge gap, got ${probed?.judgeVerdict}`);
  contains(probed?.flags.join(",") ?? "", "probed", "the row must say why it has no verdict");
});

test("an anchor states the verdict the very same evidence supports", () => {
  const reports = summarizeLift(tieredTrials(), DEFAULT_CONTRAST, TIERS);
  const anchor = reports.find((r) => r.task === ANCHOR_TASK);
  assert(anchor?.tier === "anchor", `tier was ${anchor?.tier}`);
  assert(anchor?.verdict === "helps", `identical trials at anchor tier must verdict, got ${anchor?.verdict}`);
});

test("a task no manifest tiers falls to probed, flagged as untiered", () => {
  // Safe direction: an unannotated manifest withholds a claim it may not have
  // earned, instead of publishing one nobody vetted.
  const reports = summarizeLift(tieredTrials(), DEFAULT_CONTRAST, new Map());
  for (const r of reports) {
    assert(r.tier === "probed", `${r.task} was ${r.tier}`);
    assert(r.verdict === "inconclusive", `${r.task} verdicted ${r.verdict} with no tier declared`);
    contains(r.flags.join(","), "untiered", `${r.task} must say the tier is missing, not merely weak`);
  }
});

test("the summary groups by tier, so no probed row sits beside an anchor row", () => {
  const reports = summarizeLift(tieredTrials(), DEFAULT_CONTRAST, TIERS);
  const lines = summaryLines(reports, DEFAULT_CONTRAST);
  const at = (needle: string): number => lines.findIndex((l) => l.includes(needle));
  const anchorHeader = at("anchor");
  const probedHeader = at("probed ");
  assert(anchorHeader !== -1 && probedHeader !== -1, `both groups need a header: ${JSON.stringify(lines)}`);
  assert(anchorHeader < probedHeader, "anchors come first - they are the numbers that must hold");
  const anchorRow = at("audit-security · runtime-out-of-reach");
  const probedRow = at("domain-glossary");
  assert(anchorHeader < anchorRow && anchorRow < probedHeader, `the anchor row sits under its own header: ${JSON.stringify(lines)}`);
  assert(probedHeader < probedRow, `the probed row sits under its own header: ${JSON.stringify(lines)}`);
});

test("readManifestTiers reads the declared tier off each manifest on disk", () => {
  const root = join(WORK, "tiers-tree");
  const write = (rel: string, body: string) => {
    mkdirSync(join(root, "skills", rel, ".."), { recursive: true });
    writeFileSync(join(root, "skills", rel), body);
  };
  const body = (tier: string) => `${tier}fixture: minimal-go\nprompt: >\n  p\n`;
  write("alpha/eval.yaml", body("tier: anchor\n"));
  write("alpha/evals/beta.eval.yaml", body("tier: measured\n"));
  write("gamma/eval.yaml", body(""));

  const tiers = readManifestTiers(root);
  assert(tiers.get("alpha") === "anchor", `alpha was ${tiers.get("alpha")}`);
  assert(tiers.get("alpha/beta") === "measured", `alpha/beta was ${tiers.get("alpha/beta")}`);
  // An untiered manifest is absent from the map, so the report can tell "not
  // declared" from "declared probed" - two different things to say to a reader.
  assert(!tiers.has("gamma"), "an untiered manifest declares nothing");
});

test("the report CLI states no verdict for a probed scenario, whatever the gap", () => {
  // End to end, on the real manifest set: a 0.70 gate gap over the full pair
  // floor, on a scenario no manifest tiers. The gap is printed; the cause is
  // not claimed.
  const job = join(WORK, "job-probed");
  for (let i = 0; i < SIX; i++) {
    for (const [dir, skills, reward] of [[`without-${i}`, [], 0.2], [`with-${i}`, ["/skills/detection-sweep"], 0.9]] as const) {
      mkdirSync(join(job, dir), { recursive: true });
      writeFileSync(join(job, dir, "result.json"), JSON.stringify({
        task_name: "ronce-racine/detection-sweep", config: { agent: { name: "claude-code", skills } },
        verifier_result: { rewards: { reward, n_gates: 2 } }, agent_result: {}, exception_info: null,
      }));
    }
  }

  const r = cli([join(ROOT, "tools", "eval-report.ts"), job]);
  assert(r.status === 0, `the report must run, got ${r.status}: ${r.stderr}`);
  contains(r.stdout, "+0.70", "the gap is still reported in full");
  const verdictLine = r.stdout.split("\n").find((l) => l.startsWith("  verdict")) ?? "";
  contains(verdictLine, "inconclusive", `no causal verdict may be stated: ${JSON.stringify(verdictLine)}`);
  assert(!/\bhelps\b/.test(r.stdout), `nothing may read as a cause: ${JSON.stringify(r.stdout)}`);
});

// --- The third dimension, and where the judge gap actually sits ---------------
//
// The report could say whether a skill helped, never where. On the anchor's own
// numbers - gates 0.33 against 0.33, judge 0.72 against 0.94 - which dimension
// carried that judge gap was the open question, and a skill that moves
// `sequence` and not `outcome` is a different finding from one that moves
// neither. Two things answer it: a trajectory score beside gates and judge, and
// the judge split by the surface each criterion grades.

const TRAJ_TASK = "ronce-racine/recurring-bug-root-cause";
const ANCHORED = new Map([["recurring-bug-root-cause", "anchor" as const]]);

/** Six trials of one arm, all carrying the same extra fields. */
const armOf6 = (skills: string[], over: Partial<TrialRecord>): TrialRecord[] =>
  Array.from({ length: SIX }, () => ({ ...trial(TRAJ_TASK, skills, 1), ...over }));

test("a trial whose manifest declared no trajectory check is absent, not a zero", () => {
  // Pooling the silence as a zero would drag the arm down for something the
  // manifest never asked - the same conflation of "nobody checked" with
  // "everybody failed" that this rebuild exists to undo.
  const scored = Array.from({ length: 3 }, () => ({ ...trial(TRAJ_TASK, ["s"], 1), trajectoryScore: 1 }));
  const silent = Array.from({ length: 3 }, () => trial(TRAJ_TASK, ["s"], 1));
  const [r] = summarizeLift(
    [...armOf6([], { trajectoryScore: 0.5 }), ...scored, ...silent],
    DEFAULT_CONTRAST, ANCHORED,
  );
  assert(r.with.meanTrajectory === 1, `the three silent trials must not count, got ${r.with.meanTrajectory}`);
  assert(r.trajectoryLift === 0.5, `the lift reads on the trials that measured, got ${r.trajectoryLift}`);
  contains(r.flags.join(","), "trajectory-partial", "an arm only half of whose trials were graded says so");
});

test("the trajectory dimension carries its own lift, saturation and verdict", () => {
  const [helps] = summarizeLift(
    [...armOf6([], { trajectoryScore: 0.5 }), ...armOf6(["s"], { trajectoryScore: 1 })],
    DEFAULT_CONTRAST, ANCHORED,
  );
  assert(helps.trajectoryLift === 0.5, `got ${helps.trajectoryLift}`);
  assert(helps.trajectoryVerdict === "helps", `six pairs at anchor tier must verdict, got ${helps.trajectoryVerdict}`);

  // Its own baseline, its own flag: gates can separate while the trajectory
  // checks are passed by everyone, and one saturation flag for the whole report
  // could not say which.
  const [sat] = summarizeLift(
    [...armOf6([], { trajectoryScore: 1 }), ...armOf6(["s"], { trajectoryScore: 1 })],
    DEFAULT_CONTRAST, ANCHORED,
  );
  contains(sat.flags.join(","), "trajectory-saturated", "a trajectory baseline at the ceiling is a fact about the eval");
  assert(sat.trajectoryVerdict === "inconclusive", `a saturated baseline states no cause, got ${sat.trajectoryVerdict}`);
});

const OUTCOME_CRITERION = "Names the workload as the cause";
const TRAP_CRITERION = "Does not settle for a documentation-only guardrail";
const SEQUENCE_CRITERION = "Reads the history before touching the config";
const DIMS = new Map([[
  "recurring-bug-root-cause",
  new Map([
    [OUTCOME_CRITERION, "outcome" as const],
    [TRAP_CRITERION, "trap" as const],
    [SEQUENCE_CRITERION, "sequence" as const],
  ]),
]]);
const answered = (outcome: boolean, trap: boolean) => [
  { criterion: OUTCOME_CRITERION, passed: outcome },
  { criterion: TRAP_CRITERION, passed: trap },
];

test("the judge breakdown names the dimension that carried the gap", () => {
  const [r] = summarizeLift([
    ...armOf6([], { judgeScore: 0, judgeVerdicts: answered(false, false) }),
    ...armOf6(["s"], { judgeScore: 0.5, judgeVerdicts: answered(false, true) }),
  ], DEFAULT_CONTRAST, ANCHORED, DIMS);

  const by = new Map(r.dimensions.map((d) => [d.dimension, d]));
  assert(by.get("outcome")?.lift === 0, `outcome is untouched, got ${by.get("outcome")?.lift}`);
  assert(by.get("outcome")?.verdict === "no-lift", `got ${by.get("outcome")?.verdict}`);
  assert(by.get("trap")?.lift === 1, `trap is what moved, got ${by.get("trap")?.lift}`);
  assert(by.get("trap")?.verdict === "helps", `got ${by.get("trap")?.verdict}`);
  // The order is the dimension order, not the order the criteria happened to
  // be written in: two manifests must produce comparable blocks.
  assert(r.dimensions[0].dimension === "outcome", `got ${r.dimensions[0].dimension}`);
});

test("a dimension nothing measured reads n/a, never 0.00", () => {
  const [r] = summarizeLift([
    ...armOf6([], { judgeScore: 0, judgeVerdicts: answered(false, false) }),
    ...armOf6(["s"], { judgeScore: 0.5, judgeVerdicts: answered(false, true) }),
  ], DEFAULT_CONTRAST, ANCHORED, DIMS);

  const sequence = r.dimensions.find((d) => d.dimension === "sequence");
  assert(sequence !== undefined, "a declared dimension is reported even when no verdict answered it");
  assert(sequence?.without === null && sequence?.with === null, `no verdict is not a zero: ${JSON.stringify(sequence)}`);
  assert(sequence?.lift === null, `and no lift can be computed from it, got ${sequence?.lift}`);
  assert(sequence?.verdict === "inconclusive", `got ${sequence?.verdict}`);

  const line = dimensionLines(r).find((l) => l.includes("sequence")) ?? "";
  contains(line, "n/a", `an unmeasured dimension prints n/a: ${JSON.stringify(line)}`);
  assert(!line.includes("0.00"), `and never a zero: ${JSON.stringify(line)}`);
});

test("the pair floor applies per dimension, not once for the whole report", () => {
  // Six pairs on the report, two on this dimension: a criterion only two trials
  // of each arm were ever asked cannot carry a causal claim the other four
  // never contributed to.
  const rare = (skills: string[], passed: boolean, n: number) =>
    Array.from({ length: n }, () => ({
      ...trial(TRAJ_TASK, skills, 1),
      judgeVerdicts: [{ criterion: OUTCOME_CRITERION, passed: false }, { criterion: TRAP_CRITERION, passed }],
    }));
  const [r] = summarizeLift([
    ...armOf6([], { judgeVerdicts: [{ criterion: OUTCOME_CRITERION, passed: false }] }),
    ...armOf6(["s"], { judgeVerdicts: [{ criterion: OUTCOME_CRITERION, passed: false }] }),
    ...rare([], false, 2), ...rare(["s"], true, 2),
  ], DEFAULT_CONTRAST, ANCHORED, DIMS);

  const trap = r.dimensions.find((d) => d.dimension === "trap");
  assert(trap?.lift === 1, `the gap is still reported in full, got ${trap?.lift}`);
  assert(trap?.verdict === "inconclusive", `two pairs cannot verdict, got ${trap?.verdict}`);
  assert(r.dimensions.find((d) => d.dimension === "outcome")?.verdict === "no-lift", "the well-covered dimension still verdicts");
});

test("readManifestDimensions reads each criterion's dimension off the manifest", () => {
  const root = join(WORK, "dims-tree");
  const write = (rel: string, body: string) => {
    mkdirSync(join(root, "skills", rel, ".."), { recursive: true });
    writeFileSync(join(root, "skills", rel), body);
  };
  write("alpha/eval.yaml", [
    "tier: anchor", "fixture: minimal-go", "prompt: >", "  p", "judge:", "  criteria:",
    `    - { dimension: trap, text: "${TRAP_CRITERION}" }`,
    `    - ${OUTCOME_CRITERION}`, "",
  ].join("\n"));

  const dims = readManifestDimensions(root);
  assert(dims.get("alpha")?.get(TRAP_CRITERION) === "trap", `got ${dims.get("alpha")?.get(TRAP_CRITERION)}`);
  // A bare criterion is `outcome` - what every criterion written before the
  // field existed was in fact grading. Leaving it unmapped would drop it out of
  // the breakdown entirely.
  assert(dims.get("alpha")?.get(OUTCOME_CRITERION) === "outcome", `got ${dims.get("alpha")?.get(OUTCOME_CRITERION)}`);
});

test("the report CLI prints the trajectory beside the gates and the judge", () => {
  const job = join(WORK, "job-trajectory");
  for (let i = 0; i < SIX; i++) {
    const arms = [["without", [] as string[], 0.2, 0.4], ["with", ["/skills/detection-sweep"], 0.9, 1]] as const;
    for (const [name, skills, reward, traj] of arms) {
      const dir = join(job, `${name}-${i}`);
      mkdirSync(join(dir, "verifier"), { recursive: true });
      writeFileSync(join(dir, "result.json"), JSON.stringify({
        task_name: "ronce-racine/detection-sweep", config: { agent: { name: "claude-code", skills } },
        verifier_result: { rewards: { reward, n_gates: 2 } }, agent_result: {}, exception_info: null,
      }));
      writeFileSync(join(dir, "verifier", "trajectory.json"), JSON.stringify({ skill: "detection-sweep", checks: [], score: traj }));
      writeFileSync(join(dir, "verifier", "judge.json"), JSON.stringify({
        skill: "detection-sweep", score: reward, passed: false,
        verdicts: [{ criterion: "a criterion no manifest declares", verdict: "pass", evidence: "x" }],
      }));
    }
  }

  const r = cli([join(ROOT, "tools", "eval-report.ts"), job]);
  assert(r.status === 0, `the report must run, got ${r.status}: ${r.stderr}`);
  contains(r.stdout, "trajectory 0.40", "the baseline arm's trajectory score is printed");
  contains(r.stdout, "trajectory 1.00", "and the measured arm's");
  const verdictLine = r.stdout.split("\n").find((l) => l.startsWith("  verdict")) ?? "";
  contains(verdictLine, "trajectory", `the trajectory gets a verdict of its own: ${JSON.stringify(verdictLine)}`);
  // A verdict whose criterion no manifest maps is not silently folded into
  // `outcome`: the report says the breakdown is incomplete instead.
  contains(r.stdout, "judge-undimensioned", "an unmapped criterion is admitted, not guessed");
});

// --- What the run cost, and what that bought --------------------------------

test("an arm reports how long its trials took, not only what they cost", () => {
  // Duration was collected per trial from the start and displayed nowhere. It
  // is the least reproducible number the harness holds - on this machine the
  // same scenario ran between three and forty-seven minutes depending on how
  // many agents shared the box - so it is reported as a RATIO between the two
  // arms of one job, measured in the same conditions, exactly as cost already
  // is. "2.7x the money" is a fact; "51 cents" is an artefact of the day.
  const report = summarizeLift([
    ...armOf6([], { durationMs: 120_000, costUsd: 0.1 }),
    ...armOf6(["s"], { durationMs: 320_000, costUsd: 0.3 }),
  ])[0];
  assert(report.without.meanDurationMs === 120_000, `without was ${report.without.meanDurationMs}`);
  assert(report.with.meanDurationMs === 320_000, `with was ${report.with.meanDurationMs}`);
});

test("paying materially more for nothing measurable is a flag, not a footnote", () => {
  // The report showed cost beside the scores and never let it reach a
  // conclusion. A skill that triples the bill and moves no dimension is a fact
  // worth stating; leaving it as two numbers in a row asks every reader to
  // notice it for themselves.
  //
  // The flag needs no threshold on the lift, which is what keeps it honest:
  // it fires only when NO dimension helps, so it never argues that a small
  // gain was not worth its price - that trade is the reader's call.
  // Anchored, because a scenario that may not publish a verdict may not be
  // accused of buying nothing either - that distinction is the whole rule.
  const costly = summarizeLift([
    ...armOf6([], { reward: 0.5, judgeScore: 0.5, trajectoryScore: 0.5, costUsd: 0.1 }),
    ...armOf6(["s"], { reward: 0.5, judgeScore: 0.5, trajectoryScore: 0.5, costUsd: 0.4 }),
  ], DEFAULT_CONTRAST, ANCHORED)[0];
  contains(costly.flags.join(","), "costly-no-lift", "four times the price for nothing must be said");

  const earning = summarizeLift([
    ...armOf6([], { reward: 0, judgeScore: 0, trajectoryScore: 0, costUsd: 0.1 }),
    ...armOf6(["s"], { reward: 1, judgeScore: 1, trajectoryScore: 1, costUsd: 0.4 }),
  ], DEFAULT_CONTRAST, ANCHORED)[0];
  absent(earning.flags.join(","), "costly-no-lift", "the same price with a real gain is a trade, not a flag");
});
