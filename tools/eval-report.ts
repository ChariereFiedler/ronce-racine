#!/usr/bin/env tsx
/**
 * Reads a Harbor job directory and reports what the paired arms actually show.
 *
 *   npx tsx tools/eval-report.ts <jobs-dir>/<job-name>
 *
 * The two arms differ by one field in the job config - the `skills` list - so
 * the gap between their scores is attributable to the skill. This tool does the
 * attribution and, just as importantly, refuses to when the evidence is thin.
 *
 * A job with named arms (eval-tasks.ts --arms) can hold more than two; pass
 * `--contrast <a>:<b>` to say which pair to read.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import {
  discoverManifests, parseEvalManifest, DEFAULT_TIER, EVAL_DIMENSIONS,
  type EvalDimension, type EvalTier,
} from "./eval.js";

/** One judge criterion and how it went, kept per trial so the report can group by dimension. */
export interface CriterionVerdict { criterion: string; passed: boolean }

export interface TrialRecord {
  task: string;
  /** The job's arm name; null when the job used Harbor's default agent name. */
  arm: string | null;
  /** Empty when the arm ran without the skill installed. */
  skills: string[];
  reward: number | null;
  /** Share of judge criteria met, from a later out-of-container pass. */
  judgeScore: number | null;
  /**
   * Per-criterion outcomes from that same pass. The manifest says which
   * dimension each criterion grades, which is how the report answers WHERE a
   * skill helped rather than only whether it did.
   */
  judgeVerdicts?: CriterionVerdict[];
  /**
   * Share of trajectory checks met, from `verifier/trajectory.json`.
   *
   * Absent - never zero - for a trial whose manifest declared no trajectory
   * check. Pooling that silence as a zero would drag the arm down for something
   * nobody asked, which is the conflation of "nobody checked" with "everybody
   * failed" that the whole dimension split exists to undo.
   */
  trajectoryScore?: number | null;
  nGates: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  errored: boolean;
  /** Did the agent open the skill at all? null when the arm installed none, or left no trajectory. */
  skillRead: boolean | null;
  /** Same, for a `reference/` file under a skill directory - what a pointer-based skill lives on. */
  referenceRead: boolean | null;
}

/** What one arm's trajectories show about the skills it was given. */
export interface ReadCounts { skill: number; reference: number; trials: number }

/** Beyond this, the aided arm is not "a little" more expensive. */
const COSTLY_RATIO = 2;

function costlyForNothing(without: ArmSummary, withSkill: ArmSummary, verdicts: Verdict[]): boolean {
  // "No dimension helps" and "no dimension is ENTITLED to say it helps" are
  // different things. A probed scenario, or one below the pair floor, returns
  // `inconclusive` however large its gap, and flagging it as costly for nothing
  // would turn a withheld verdict into an accusation.
  if (verdicts.some((v) => v === "helps" || v === "inconclusive")) return false;
  const before = without.meanCostUsd;
  const after = withSkill.meanCostUsd;
  if (before === null || after === null || before <= 0) return false;
  return after / before >= COSTLY_RATIO;
}

export interface ArmSummary {
  n: number;
  meanReward: number | null;
  meanJudge: number | null;
  /** Over the trials that carried a trajectory grade, not over the arm. */
  meanTrajectory: number | null;
  /** How many of the arm's trials that was - `n` minus the ones nobody graded. */
  nTrajectory: number;
  meanCostUsd: number | null;
  /**
   * Wall-clock per trial. The least reproducible number this harness holds -
   * the same scenario ran between three and forty-seven minutes on one machine
   * depending on how many agents shared it - so it is read as a RATIO between
   * the two arms of one job, measured in the same conditions, exactly as cost
   * already is. "2.7x the time" is a fact; "eleven minutes" is the day's load.
   */
  meanDurationMs: number | null;
  meanTokens: number | null;
  /** null when no trial of the arm could say - an arm with no skill, or no trajectory. */
  reads: ReadCounts | null;
}

export type Verdict = "inconclusive" | "helps" | "harms" | "no-lift";

/** Which two arms a report pairs: `a` is the baseline, `b` what is measured against it. */
export interface Contrast { a: string; b: string }

/**
 * One surface of the skill, scored from the judge criteria that grade it.
 *
 * Everything the report does once for the whole run - the pair floor, the
 * saturation flag, the tier rule - it does again here, per dimension: a
 * dimension whose baseline sits at the ceiling is saturated on that dimension
 * alone, and a criterion only two trials were ever asked cannot carry a claim
 * the other four never contributed to.
 */
export interface DimensionReport {
  dimension: EvalDimension;
  /** null when no trial of the arm was asked a criterion of this dimension. */
  without: number | null;
  with: number | null;
  lift: number | null;
  /** Trials of each arm that answered at least one criterion of it. */
  n: { without: number; with: number };
  saturated: boolean;
  verdict: Verdict;
}

export interface LiftReport {
  task: string;
  contrast: Contrast;
  /** What the manifest claims its numbers are worth. See `EvalTier`. */
  tier: EvalTier;
  without: ArmSummary;
  with: ArmSummary;
  lift: number | null;
  /** Kept apart from `lift`: a skill can tie on gates and split on judgement. */
  judgeLift: number | null;
  /** The third dimension: what the agent DID, graded from the trajectory. */
  trajectoryLift: number | null;
  /**
   * One verdict per dimension, for the same reason the scores stay apart: a
   * saturated gate baseline says nothing about whether the judge could tell
   * the arms apart, and folding them into one verdict loses whichever
   * dimension actually carried signal.
   */
  judgeVerdict: Verdict;
  trajectoryVerdict: Verdict;
  /**
   * The judge again, split by the surface each criterion grades. Empty when no
   * manifest said - a criterion of unknown dimension is left out rather than
   * filed under `outcome`, and the `judge-undimensioned` flag says so.
   */
  dimensions: DimensionReport[];
  pairs: number;
  /** Diagnostics that hold regardless of sample size. */
  flags: string[];
  /** Absent whenever the evidence cannot support a causal claim. */
  verdict: "inconclusive" | "helps" | "harms" | "no-lift";
}

/** Below this, a difference is one roll of the dice, not a finding. */
const MIN_PAIRS_FOR_CAUSAL_CLAIM = 6;
const SATURATION = 0.95;

/**
 * The tiers whose scenarios were run in a way that can support a causal claim.
 * A probed scenario bought the cheap admission checks and nothing else - nobody
 * paid for the paired trials that would make its gap mean something - so it
 * reports its gap and withholds the verdict, however wide the gap looks.
 */
const CAUSAL_TIERS: EvalTier[] = ["anchor", "measured"];

/** Strongest obligation first: the anchors are the numbers that must hold. */
const TIER_ORDER: EvalTier[] = ["anchor", "measured", "probed"];

/** What each group of the summary announces itself as. */
const TIER_HEADLINE: Record<EvalTier, string> = {
  anchor: "anchor · full power, re-measured every release",
  measured: "measured · paired verdict",
  probed: "probed · admission checks only, never a causal verdict",
};

/** Harbor records `ronce-racine/<skill>--<scenario>`; a manifest answers to `<skill>/<scenario>`. */
export const manifestIdOfTask = (task: string): string =>
  task.replace(/^ronce-racine\//, "").replace("--", "/");

/** What a manifest tells the report about itself. */
interface ManifestFacts {
  /**
   * Undefined when the manifest declares none, so a report can tell "nobody
   * said" from "said probed" - the first is a gap to close, the second a
   * decision.
   */
  tier: EvalTier | undefined;
  /** Criterion text -> the surface it grades, which is what the breakdown groups by. */
  dimensions: Map<string, EvalDimension>;
}

/** One pass over the manifests on disk; the two readers below project it. */
function readManifestFacts(root?: string): Map<string, ManifestFacts> {
  const out = new Map<string, ManifestFacts>();
  for (const ref of discoverManifests(root)) {
    const raw = readFileSync(ref.path, "utf8");
    const m = parseEvalManifest(ref, raw);
    // Pre-scan for the tier rather than read the parsed value: the parser
    // defaults an untiered manifest to probed, which is the right thing to
    // grade by and the wrong thing to remember here.
    const declared = /^tier:/m.test(raw) ? m.tier : undefined;
    const criteria = m.judge?.criteria ?? [];
    out.set(ref.id, { tier: declared, dimensions: new Map(criteria.map((c) => [c.text, c.dimension])) });
  }
  return out;
}

const tiersOf = (facts: ReadonlyMap<string, ManifestFacts>): Map<string, EvalTier> => {
  const out = new Map<string, EvalTier>();
  for (const [id, f] of facts) if (f.tier) out.set(id, f.tier);
  return out;
};

const dimensionsOf = (facts: ReadonlyMap<string, ManifestFacts>): Map<string, ReadonlyMap<string, EvalDimension>> =>
  new Map([...facts].map(([id, f]) => [id, f.dimensions]));

/** The tier each manifest declares, by manifest id. */
export const readManifestTiers = (root?: string): Map<string, EvalTier> => tiersOf(readManifestFacts(root));

/**
 * The dimension each judge criterion grades, by manifest id then criterion text.
 *
 * A trial's `judge.json` records the criterion it answered and nothing about
 * what that criterion was for; the manifest is the only place that says. Match
 * them here and the report can state that a skill moved `trap` and not
 * `outcome` - which the single gate/judge pair could never express.
 */
export const readManifestDimensions = (root?: string): Map<string, ReadonlyMap<string, EvalDimension>> =>
  dimensionsOf(readManifestFacts(root));

/** Harbor's own agent name: a job that kept it tells its arms apart by skills alone. */
const DEFAULT_AGENT_NAME = "claude-code";
/** Arm identities inferred from the skills list when the job named none. */
const INFERRED_WITHOUT = "without";
const INFERRED_WITH = "with";
export const DEFAULT_CONTRAST: Contrast = { a: INFERRED_WITHOUT, b: INFERRED_WITH };

/** A named arm is its name; an unnamed one is read by whether it installed anything. */
export const armOf = (t: TrialRecord): string =>
  t.arm ?? (t.skills.length ? INFERRED_WITH : INFERRED_WITHOUT);

export function parseContrast(spec: string): Contrast {
  const [a, b, ...rest] = spec.split(":");
  if (!a || !b || rest.length) throw new Error(`--contrast expects <arm>:<arm>, got ${JSON.stringify(spec)}`);
  return { a, b };
}

const mean = (xs: (number | null)[]): number | null => {
  const ok = xs.filter((x): x is number => x !== null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
};

const countReads = (trials: TrialRecord[]): ReadCounts | null => {
  const known = trials.filter((t) => t.skillRead !== null);
  if (!known.length) return null;
  return {
    skill: known.filter((t) => t.skillRead).length,
    reference: known.filter((t) => t.referenceRead).length,
    trials: known.length,
  };
};

const summarize = (trials: TrialRecord[]): ArmSummary => {
  // An absent trajectory grade is a manifest that declared no trajectory check,
  // not a failed one, so it stays out of both the mean and the count.
  const graded = trials.map((t) => t.trajectoryScore ?? null);
  return {
    n: trials.length,
    meanReward: mean(trials.map((t) => t.reward)),
    meanJudge: mean(trials.map((t) => t.judgeScore)),
    meanTrajectory: mean(graded),
    nTrajectory: graded.filter((x) => x !== null).length,
    meanCostUsd: mean(trials.map((t) => t.costUsd)),
    meanDurationMs: mean(trials.map((t) => t.durationMs)),
    meanTokens: mean(trials.map((t) => (t.inputTokens ?? 0) + (t.outputTokens ?? 0))),
    reads: countReads(trials),
  };
};

/**
 * Wall-clock per trial, in minutes, for reading as a ratio between two arms of
 * one job. The absolute value is the day's machine load rather than a property
 * of the run - the same scenario took three minutes and forty-seven on one box
 * depending on how many agents shared it - so it is printed beside the cost it
 * belongs with and never enters a verdict.
 */
const minutes = (ms: number | null): string =>
  ms === null ? "time n/a" : `${(ms / 60_000).toFixed(1)} min`;

export function summarizeLift(
  trials: TrialRecord[],
  contrast: Contrast = DEFAULT_CONTRAST,
  tiers: ReadonlyMap<string, EvalTier> = new Map(),
  dimensions: ReadonlyMap<string, ReadonlyMap<string, EvalDimension>> = new Map(),
): LiftReport[] {
  const byTask = new Map<string, TrialRecord[]>();
  for (const t of trials) byTask.set(t.task, [...(byTask.get(t.task) ?? []), t]);

  return [...byTask].map(([task, all]) => {
    const usable = all.filter((t) => !t.errored);
    const baselineArm = usable.filter((t) => armOf(t) === contrast.a);
    const measuredArm = usable.filter((t) => armOf(t) === contrast.b);
    const without = summarize(baselineArm);
    const withSkill = summarize(measuredArm);
    const pairs = Math.min(without.n, withSkill.n);
    const manifestId = manifestIdOfTask(task);

    const gap = (a: number | null, b: number | null): number | null =>
      a !== null && b !== null ? b - a : null;
    const lift = gap(without.meanReward, withSkill.meanReward);
    const judgeLift = gap(without.meanJudge, withSkill.meanJudge);
    const trajectoryLift = gap(without.meanTrajectory, withSkill.meanTrajectory);

    const flags: string[] = [];
    if (all.some((t) => t.errored)) flags.push("errored-trials");
    if (usable.some((t) => t.nGates === 0)) flags.push("no-mechanical-signal");
    // Per dimension, like the scores and the verdicts: a judge whose criteria
    // everyone passes measures nothing, even when the gates are separating the
    // arms cleanly.
    if (without.meanReward !== null && without.meanReward >= SATURATION) flags.push("saturated");
    if (without.meanJudge !== null && without.meanJudge >= SATURATION) flags.push("judge-saturated");
    if (without.meanTrajectory !== null && without.meanTrajectory >= SATURATION) flags.push("trajectory-saturated");
    // Every trial of a task shares one manifest, so a partial coverage is not a
    // manifest that declared checks for some runs only - it is a post-pass that
    // did not finish. Worth seeing before reading the score it produced.
    const partlyGraded = (a: ArmSummary): boolean => a.nTrajectory > 0 && a.nTrajectory < a.n;
    if (partlyGraded(without) || partlyGraded(withSkill)) flags.push("trajectory-partial");
    if (pairs === 0) flags.push("unpaired");
    // A skill the agent never opened cannot have helped or harmed: the trial
    // measures the model, not the text. A flag, never a gate - the arm still
    // scores whatever it scored.
    const reads = withSkill.reads;
    if (reads && reads.skill < reads.trials) flags.push("skill-unread");
    // The obligation level rides along as a flag whenever it is the reason no
    // verdict follows, so a reader scanning the rows sees why a gap this wide
    // still claims nothing - and "untiered" says the manifest never chose.
    const declaredTier = tiers.get(manifestId);
    const tier = declaredTier ?? DEFAULT_TIER;
    if (!declaredTier) flags.push("untiered");
    else if (!CAUSAL_TIERS.includes(tier)) flags.push(tier);

    // A verdict is a causal claim. Below the pair floor, or with a baseline
    // already at the ceiling, the numbers may be real but cannot carry one.
    // Every dimension is judged on its own baseline and its own pairs: gates
    // can be saturated while the judge separates the arms cleanly, and a
    // criterion only two trials were ever asked cannot carry a claim the other
    // four never contributed to.
    const verdictOn = (gap: number | null, baseline: number | null, pairs: number): Verdict => {
      if (!CAUSAL_TIERS.includes(tier)) return "inconclusive";
      if (pairs < MIN_PAIRS_FOR_CAUSAL_CLAIM || gap === null) return "inconclusive";
      if (baseline !== null && baseline >= SATURATION) return "inconclusive";
      return gap > 0 ? "helps" : gap < 0 ? "harms" : "no-lift";
    };
    /** Gates and judge are asked of every usable trial, so they read on the task's own pairs. */
    const verdictFor = (gap: number | null, baseline: number | null): Verdict =>
      verdictOn(gap, baseline, pairs);

    // The judge, split by what each criterion was for. A criterion no manifest
    // maps is left out rather than filed under `outcome`: guessing would report
    // a dimension nobody graded, and the flag says the breakdown is partial.
    const criterionDimensions = dimensions.get(manifestId) ?? new Map<string, EvalDimension>();
    const answers = usable.flatMap((t) => t.judgeVerdicts ?? []);
    if (answers.some((v) => !criterionDimensions.has(v.criterion))) flags.push("judge-undimensioned");

    /** One trial on one dimension: null when it was asked no criterion of it. */
    const scoreOn = (t: TrialRecord, d: EvalDimension): number | null => {
      const asked = (t.judgeVerdicts ?? []).filter((v) => criterionDimensions.get(v.criterion) === d);
      return asked.length ? asked.filter((v) => v.passed).length / asked.length : null;
    };
    const declared = new Set(criterionDimensions.values());
    // Fixed order, not the order the criteria happened to be written in: two
    // manifests have to produce blocks a reader can compare line for line.
    const dimensionReports = EVAL_DIMENSIONS.filter((d) => declared.has(d)).map((d) => {
      const a = baselineArm.map((t) => scoreOn(t, d));
      const b = measuredArm.map((t) => scoreOn(t, d));
      const n = { without: a.filter((x) => x !== null).length, with: b.filter((x) => x !== null).length };
      const baseline = mean(a);
      const measured = mean(b);
      const dimensionLift = gap(baseline, measured);
      return {
        dimension: d, without: baseline, with: measured, lift: dimensionLift, n,
        saturated: baseline !== null && baseline >= SATURATION,
        verdict: verdictOn(dimensionLift, baseline, Math.min(n.without, n.with)),
      };
    });

    const verdict = verdictFor(lift, without.meanReward);
    const judgeVerdict = verdictFor(judgeLift, without.meanJudge);
    const trajectoryVerdict = verdictOn(
      trajectoryLift, without.meanTrajectory, Math.min(without.nTrajectory, withSkill.nTrajectory),
    );

    // Cost used to sit beside the scores and never reach a conclusion, which
    // asked every reader to notice for themselves that a skill had tripled the
    // bill for nothing. Computed here rather than with the other flags because
    // it needs the verdicts, and it fires only when NO dimension helps - that is
    // what keeps it honest. It never argues a small gain was not worth its
    // price; that trade is the reader's, and both numbers are printed.
    if (costlyForNothing(without, withSkill, [verdict, judgeVerdict, trajectoryVerdict])) {
      flags.push("costly-no-lift");
    }

    return {
      task, contrast, tier, without, with: withSkill, lift, judgeLift, trajectoryLift, pairs, flags,
      dimensions: dimensionReports, verdict, judgeVerdict, trajectoryVerdict,
    };
  });
}

/**
 * Weakest signal first. A sweep produces a wall of numbers; the useful order is
 * the one that surfaces what to work on - regressions, then flat results, then
 * clear wins. The three dimensions count equally: a skill that moves none of
 * them is as much of a problem as one that moves the wrong way.
 */
export function rankBySignal(reports: LiftReport[]): LiftReport[] {
  const signal = (r: LiftReport): number => (r.lift ?? 0) + (r.judgeLift ?? 0) + (r.trajectoryLift ?? 0);
  return [...reports].sort((a, b) => signal(a) - signal(b));
}

/**
 * The `--summary` name column. Wide enough for the longest id the scenario set
 * produces (`audit-performance-frontend · client-not-in-checkout`, 51 chars):
 * a cut label names no manifest, and two scenarios of one skill share every
 * character up to the cut.
 */
export const SUMMARY_LABEL_WIDTH = 56;

/** The task name Harbor recorded, read back as the id that produced it. */
export const summaryLabel = (task: string): string =>
  task.replace(/^ronce-racine\//, "").replace("--", " · ");

/** Where Harbor mounts an installed skill inside the container. */
const skillDir = (skill: string): string => `/skills/${skill}/`;
/**
 * SKILL.md is never read with the Read tool: the agent calls `Skill{skill: "<name>"}`
 * and the runtime pastes the body in. Only the skill's other files - reference/,
 * templates/ - show up as ordinary reads, under the mount path above.
 */
const SKILL_TOOL = "Skill";
const REFERENCE_DIR = "reference/";

interface ToolCall { function_name?: string; arguments?: Record<string, unknown> }

function toolCallsOf(rawTrajectory: string): ToolCall[] {
  try {
    const t = JSON.parse(rawTrajectory) as { steps?: { tool_calls?: ToolCall[] }[] };
    return (t.steps ?? []).flatMap((s) => s.tool_calls ?? []);
  } catch {
    // Not a trajectory document: no evidence either way, which is what an
    // empty call list says.
    return [];
  }
}

/**
 * What the trajectory shows of the skills the arm was given: whether the agent
 * opened one at all, and whether it followed a pointer into a `reference/` file
 * - the read a skill that delegates its apparatus to a sibling depends on.
 */
export function readsFromTrajectory(rawTrajectory: string, skills: string[]): { skill: boolean; reference: boolean } {
  const calls = toolCallsOf(rawTrajectory);
  const invoked = calls.some(
    (c) => c.function_name === SKILL_TOOL && skills.includes(String(c.arguments?.skill ?? "")),
  );
  const pathsOf = (c: ToolCall): string => JSON.stringify(c.arguments ?? {});
  const opened = (suffix: string): boolean =>
    calls.some((c) => skills.some((name) => pathsOf(c).includes(skillDir(name) + suffix)));
  return { skill: invoked || opened(""), reference: opened(REFERENCE_DIR) };
}

export function readJobTrials(jobDir: string): TrialRecord[] {
  const out: TrialRecord[] = [];
  for (const entry of readdirSync(jobDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const resultPath = join(jobDir, entry.name, "result.json");
    if (!existsSync(resultPath)) continue;

    const r = JSON.parse(readFileSync(resultPath, "utf8"));
    const rewards = r.verifier_result?.rewards ?? {};

    // Both written by a later out-of-container pass, so both are routinely
    // absent. `trajectory.json` is absent for a second reason too - a manifest
    // that declared no trajectory check - and the two are indistinguishable
    // here, which is why an absent grade is null and never a zero.
    const judgePath = join(jobDir, entry.name, "verifier", "judge.json");
    const judge = existsSync(judgePath) ? JSON.parse(readFileSync(judgePath, "utf8")) : null;
    const judgeVerdicts: CriterionVerdict[] = (judge?.verdicts ?? []).map(
      (v: { criterion: string; verdict: string }) => ({ criterion: v.criterion, passed: v.verdict === "pass" }),
    );
    const gradePath = join(jobDir, entry.name, "verifier", "trajectory.json");
    const trajectoryScore = existsSync(gradePath)
      ? (JSON.parse(readFileSync(gradePath, "utf8")).score ?? null) : null;
    const agent = r.agent_result ?? {};
    const started = r.agent_execution?.started_at;
    const finished = r.agent_execution?.finished_at;

    const agentName = r.config?.agent?.name;
    // The arm's skills are host directories; the container knows them by name.
    const skillNames: string[] = (r.config?.agent?.skills ?? []).map((d: string) => basename(d));
    const trajectoryPath = join(jobDir, entry.name, "agent", "trajectory.json");
    const reads = skillNames.length && existsSync(trajectoryPath)
      ? readsFromTrajectory(readFileSync(trajectoryPath, "utf8"), skillNames)
      : null;

    out.push({
      task: r.task_name ?? entry.name,
      arm: agentName && agentName !== DEFAULT_AGENT_NAME ? agentName : null,
      skills: r.config?.agent?.skills ?? [],
      reward: rewards.reward ?? null,
      judgeScore: judge?.score ?? null,
      judgeVerdicts,
      trajectoryScore,
      nGates: rewards.n_gates ?? null,
      inputTokens: agent.n_input_tokens ?? null,
      outputTokens: agent.n_output_tokens ?? null,
      costUsd: agent.cost_usd ?? null,
      durationMs: started && finished ? Date.parse(finished) - Date.parse(started) : null,
      errored: r.exception_info != null,
      skillRead: reads?.skill ?? null,
      referenceRead: reads?.reference ?? null,
    });
  }
  return out;
}

const fmt = (x: number | null, digits = 2): string => (x === null ? "n/a" : x.toFixed(digits));

/** "skill read 5/6 · reference read 3/6", or nothing for an arm that had no skill. */
const readRate = (a: ArmSummary): string =>
  a.reads ? `  skill read ${a.reads.skill}/${a.reads.trials} · reference read ${a.reads.reference}/${a.reads.trials}` : "";

const signedPad = (x: number | null, width = 8): string =>
  (x === null ? "n/a" : `${x > 0 ? "+" : ""}${x.toFixed(2)}`).padStart(width);

/** Wide enough for `restraint`, the longest dimension name. */
const DIM_LABEL_WIDTH = 10;

/**
 * The judge, one line per dimension it graded.
 *
 * The scores are printed even where no verdict follows, and a dimension no
 * trial answered reads `n/a` rather than `0.00`: "nobody checked" and
 * "everybody failed" are the two things this report exists not to conflate.
 * The trial counts are on the line because a dimension can be graded on fewer
 * pairs than the task has, which is what withholds its verdict.
 */
export function dimensionLines(r: LiftReport): string[] {
  return r.dimensions.map((d) =>
    `  judge · ${d.dimension.padEnd(DIM_LABEL_WIDTH)}${fmt(d.without).padStart(5)} → ${fmt(d.with).padStart(5)}` +
    `  lift ${signedPad(d.lift, 6)}  ${d.verdict}${d.saturated ? " (saturated)" : ""}` +
    `  (${d.n.without} vs ${d.n.with} trials)`);
}

/** Reports split by obligation tier, strongest first; empty tiers stay out. */
export function groupByTier(reports: LiftReport[]): { tier: EvalTier; reports: LiftReport[] }[] {
  return TIER_ORDER
    .map((tier) => ({ tier, reports: reports.filter((r) => r.tier === tier) }))
    .filter((g) => g.reports.length);
}

/**
 * The `--summary` block: one line per scenario, weakest signal first WITHIN a
 * tier. The grouping is the point - printed as one flat table, a probed gap
 * sits column-aligned beside an anchor's and reads as the same kind of number,
 * which is exactly the claim the tier exists to deny.
 */
export function summaryLines(reports: LiftReport[], contrast: Contrast): string[] {
  const costRatio = (r: LiftReport): string => {
    const a = r.without.meanCostUsd;
    const b = r.with.meanCostUsd;
    return a && b ? `${(b / a).toFixed(1)}x` : "n/a";
  };
  const readRatio = (r: LiftReport): string => (r.with.reads ? `${r.with.reads.skill}/${r.with.reads.trials}` : "n/a");
  // Which dimension carried the gap, for the rows a reader then opens in full.
  // Only the ones that moved: a list of five zeroes says nothing and costs the
  // width the flags need.
  const moved = (r: LiftReport): string => {
    const parts: string[] = [];
    for (const d of r.dimensions) {
      if (d.lift === null || d.lift === 0) continue;
      parts.push(`${d.dimension}${d.lift > 0 ? "+" : ""}${d.lift.toFixed(2)}`);
    }
    return parts.length ? `judge: ${parts.join(" ")}` : "";
  };
  const row = (r: LiftReport): string =>
    `${summaryLabel(r.task).padEnd(SUMMARY_LABEL_WIDTH)}${signedPad(r.lift)}${signedPad(r.judgeLift)}${signedPad(r.trajectoryLift)}` +
    `${costRatio(r).padStart(6)}${String(r.pairs).padStart(7)}${readRatio(r).padStart(7)}  ` +
    `${[r.flags.join(","), moved(r)].filter(Boolean).join("  ")}`;

  const lines = [`${contrast.b} against ${contrast.a}`];
  for (const group of groupByTier(reports)) {
    lines.push("", TIER_HEADLINE[group.tier]);
    lines.push(`${"skill · scenario".padEnd(SUMMARY_LABEL_WIDTH)}gates   judge    traj   cost  pairs   read  flags`);
    for (const r of rankBySignal(group.reports)) lines.push(row(r));
  }
  return lines;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  // Several job directories pool into one comparison: a lost trial leaves a run
  // short of the pair floor, and topping it up should not mean rerunning the
  // trials that already worked.
  const argv = process.argv.slice(2);
  const contrastAt = argv.indexOf("--contrast");
  const contrastSpec = contrastAt === -1 ? undefined : argv[contrastAt + 1];
  const isContrastValue = (i: number): boolean => contrastAt !== -1 && i === contrastAt + 1;
  const jobDirs = argv.filter((a, i) => !a.startsWith("--") && !isContrastValue(i));
  const missing = jobDirs.filter((d) => !existsSync(d));
  if (!jobDirs.length || missing.length) {
    console.error(missing.length ? `no such job directory: ${missing.join(", ")}` : "usage: eval-report.ts <job-dir> [<job-dir>...] [--summary] [--contrast <arm>:<arm>]");
    process.exit(2);
  }

  const trials = jobDirs.flatMap(readJobTrials);
  const contrast = contrastSpec ? parseContrast(contrastSpec) : DEFAULT_CONTRAST;
  // A job with named arms is not readable by skills alone; say which arms it
  // has rather than report an unpaired nothing.
  const named = [...new Set(trials.map((t) => t.arm).filter((a): a is string => a !== null))];
  if (!contrastSpec && named.length) {
    console.error(`this job names its arms (${named.join(", ")}); pick two with --contrast <a>:<b>`);
    process.exit(2);
  }
  const facts = readManifestFacts();
  const reports = summarizeLift(trials, contrast, tiersOf(facts), dimensionsOf(facts));

  // --summary: one line per skill, weakest first, for reading a whole sweep.
  if (process.argv.includes("--summary")) {
    for (const line of summaryLines(reports, contrast)) console.log(line);
    process.exit(0);
  }

  const ARM_LABEL_WIDTH = 16;
  const label = (arm: string): string =>
    (arm === INFERRED_WITHOUT ? "without skill" : arm === INFERRED_WITH ? "with skill" : arm).padEnd(ARM_LABEL_WIDTH);
  for (const r of reports) {
    console.log(`\n${r.task}`);
    const signed = (x: number | null): string => (x === null ? "n/a" : `${x > 0 ? "+" : ""}${x.toFixed(2)}`);
    const arm = (a: ArmSummary): string =>
      `gates ${fmt(a.meanReward)}  judge ${fmt(a.meanJudge)}  trajectory ${fmt(a.meanTrajectory)}` +
      `  tokens ${fmt(a.meanTokens, 0)}  cost ${fmt(a.meanCostUsd, 4)}  ${minutes(a.meanDurationMs)}  (n=${a.n})${readRate(a)}`;
    console.log(`  ${label(r.contrast.a)}${arm(r.without)}`);
    console.log(`  ${label(r.contrast.b)}${arm(r.with)}`);
    console.log(`  lift            gates ${signed(r.lift)}  judge ${signed(r.judgeLift)}  trajectory ${signed(r.trajectoryLift)}   pairs ${r.pairs}`);
    for (const line of dimensionLines(r)) console.log(line);
    // "none declared" up front: a defaulted tier must not read as a claimed one.
    const declared = r.flags.includes("untiered") ? "none declared - " : "";
    console.log(`  tier            ${declared}${TIER_HEADLINE[r.tier]}`);
    if (r.flags.length) console.log(`  flags           ${r.flags.join(", ")}`);
    // Why a verdict is withheld, in the reader's terms: a tier that never
    // claims causality, a tier nobody declared, or simply too few pairs.
    const why = (v: Verdict): string => {
      if (v !== "inconclusive") return "";
      if (r.flags.includes("untiered")) return " (no tier declared - graded as probed)";
      if (!CAUSAL_TIERS.includes(r.tier)) return ` (${r.tier}: this tier states no cause)`;
      return r.pairs < MIN_PAIRS_FOR_CAUSAL_CLAIM ? ` (needs ${MIN_PAIRS_FOR_CAUSAL_CLAIM} pairs, has ${r.pairs})` : "";
    };
    console.log(`  verdict         gates ${r.verdict}${why(r.verdict)}  ·  judge ${r.judgeVerdict}${why(r.judgeVerdict)}  ·  trajectory ${r.trajectoryVerdict}${why(r.trajectoryVerdict)}`);
  }
}
