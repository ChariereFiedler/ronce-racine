#!/usr/bin/env tsx
/**
 * Grades the subjective residue of a finished trial, after the mechanical
 * gates have had their say.
 *
 *   npx tsx tools/eval-judge.ts <trial-dir> [--skill name] [--scenario s] [--model id]
 *
 * It runs OUTSIDE the container, once the trial is over, because the judge
 * needs an API the sandbox does not have. It reads what the verifier left
 * behind - the artifacts the agent produced and its trajectory - and writes
 * `judge.json` next to them.
 *
 * The prompt is built from the manifest alone and never mentions which arm
 * produced the run: a judge that could tell would be grading the label.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { applyTrajectoryCheck, readTrajectory } from "./eval-trajectory.js";
import type { EvalGate } from "./eval.js";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  parseEvalManifest, buildJudgePrompt, parseJudgeVerdicts, judgePassed,
  unwrapClaudeJsonEnvelope, type EvalManifest, type JudgeVerdict, type ManifestRef,
} from "./eval.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface TrajectoryToolCall { function_name?: string; arguments?: Record<string, unknown> }
export interface TrajectoryStep { source?: string; message?: string; tool_calls?: TrajectoryToolCall[] }

export interface JudgeReport {
  skill: string;
  verdicts: JudgeVerdict[];
  passed: boolean;
  score: number;
}

/** One trajectory check and what it found. Same contract as a gate's. */
export interface TrajectoryResult { kind: string; label: string; passed: boolean; detail: string | null }

/**
 * Grades the manifest's trajectory checks. Runs here rather than in the
 * container because Harbor writes the trajectory after the agent phase ends -
 * the reason `transcript_*` gates were always dead on the paired path.
 */
export function gradeTrajectory(m: EvalManifest, trajectoryPath: string): TrajectoryResult[] {
  if (!m.trajectory.length) return [];
  const t = readTrajectory(trajectoryPath);
  return m.trajectory.map((check: EvalGate) => {
    const detail = applyTrajectoryCheck(check, t);
    const subject = check.args.name ?? (check.args.first ? `${check.args.first} -> ${check.args.then}` : check.args.max ?? "");
    return { kind: check.kind, label: subject ? `${check.kind}: ${subject}` : check.kind, passed: detail === null, detail };
  });
}

/** ATIF trajectories carry one entry per step; the judge only needs the text. */
export function transcriptFromTrajectory(raw: string): string {
  try {
    const t = JSON.parse(raw) as { steps?: TrajectoryStep[] };
    if (!Array.isArray(t.steps)) return raw;
    return t.steps.map(renderStep).filter((line) => line !== "").join("\n");
  } catch {
    // Not a trajectory document - hand it over untouched rather than lose it.
    return raw;
  }
}

/**
 * One step, prose and actions together.
 *
 * The actions used to be dropped: the renderer kept `message` and nothing else,
 * so the judge read what the agent SAID and never what it did. Measured over
 * the 12 trials of the 2026-09-03 anchor run: 598 tool calls across 480 steps,
 * none of them visible. A skill prescribes a protocol, a context to gather
 * before acting and a set of tools, and a criterion like "refutes a hypothesis
 * with evidence it produced" cannot be answered from prose - claiming to have
 * run a command and running it read identically.
 *
 * Arguments are rendered because they carry the discrimination: which file was
 * opened, which pattern was searched, which flag was passed. They are truncated
 * per argument rather than per step, so one long file body cannot push the rest
 * of a step's actions out of the judge's budget.
 */
function renderStep(s: TrajectoryStep): string {
  const who = s.source ?? "?";
  const said = typeof s.message === "string" ? s.message.trim() : "";
  const did = (s.tool_calls ?? []).map(renderCall);
  if (!said && did.length === 0) return "";
  const head = said ? `[${who}] ${said}` : `[${who}]`;
  return [head, ...did.map((d) => `  → ${d}`)].join("\n");
}

const ARG_CHARS = 300;

function renderCall(c: TrajectoryToolCall): string {
  const name = c.function_name ?? "?";
  const args = Object.entries(c.arguments ?? {})
    .map(([k, v]) => {
      const flat = typeof v === "string" ? v : JSON.stringify(v);
      const text = flat ?? "";
      return `${k}=${text.length > ARG_CHARS ? `${text.slice(0, ARG_CHARS)}… (${text.length} chars)` : text}`;
    })
    .join(" ");
  return args ? `${name}(${args})` : `${name}()`;
}

/**
 * The share of criteria met. Deliberately separate from `passed`: the threshold
 * decides whether a run is acceptable, but comparing arms needs the gradient,
 * not the cliff - "2 of 3" and "0 of 3" both fail pass_all and are not the same
 * result.
 */
export function scoreVerdicts(verdicts: JudgeVerdict[]): number {
  return verdicts.length === 0 ? 1 : verdicts.filter((v) => v.verdict === "pass").length / verdicts.length;
}

export function judgeTrial(
  manifestYaml: string,
  ref: ManifestRef | string,
  transcript: string,
  artifacts: string,
  run: (prompt: string) => { stdout: string; ok: boolean },
): JudgeReport {
  const m = parseEvalManifest(ref, manifestYaml);
  const skill = m.skill;
  if (!m.judge) return { skill, verdicts: [], passed: true, score: 1 };

  const result = run(buildJudgePrompt(m, transcript, artifacts));
  // Fail closed: a judge that did not run is an infrastructure problem, never
  // a score of zero for the agent.
  if (!result.ok) throw new Error("judge did not run");

  const verdicts = parseJudgeVerdicts(unwrapClaudeJsonEnvelope(result.stdout), m.judge.criteria);
  return { skill, verdicts, passed: judgePassed(verdicts, m.judge.threshold), score: scoreVerdicts(verdicts) };
}

/** What the verifier recorded about the run it graded, as read from checks.json. */
export interface TrialChecks { skill?: string; scenario?: string | null }
export type ManifestResolution = { ok: true; ref: ManifestRef } | { ok: false; error: string };

/**
 * Names the manifest that graded this trial, or says why it cannot.
 *
 * Grading a scenario against another scenario's criteria is silent - the judge
 * still returns verdicts, they just answer a different question - so every
 * ambiguity is an error rather than a fallback to `skills/<skill>/eval.yaml`.
 * A trial recorded before scenarios existed carries no `scenario` key at all;
 * that is only judgeable while the skill has no `evals/` directory.
 */
export function resolveTrialManifest(
  checks: TrialChecks | null,
  overrides: { skill?: string; scenario?: string },
  root: string = ROOT,
): ManifestResolution {
  const skill = overrides.skill ?? checks?.skill;
  if (!skill) return { ok: false, error: "cannot tell which skill this trial ran: pass --skill" };

  const recorded = checks !== null && "scenario" in checks;
  if (overrides.scenario === undefined && !recorded && existsSync(join(root, "skills", skill, "evals"))) {
    return {
      ok: false,
      error: `${skill} has scenarios under skills/${skill}/evals/ and this trial does not record which one it ran: pass --scenario <name> (empty for the default manifest)`,
    };
  }

  // An empty --scenario is how the default manifest is named explicitly.
  const scenario = (overrides.scenario ?? checks?.scenario) || null;
  const path = scenario
    ? join(root, "skills", skill, "evals", `${scenario}.eval.yaml`)
    : join(root, "skills", skill, "eval.yaml");
  const id = scenario ? `${skill}/${scenario}` : skill;
  if (!existsSync(path)) return { ok: false, error: `no manifest for ${id}: ${path}` };
  return { ok: true, ref: { skill, scenario, id, path } };
}

const flag = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const args = process.argv.slice(2);
  const trialDir = args[0];
  if (!trialDir || !existsSync(trialDir)) {
    console.error("usage: eval-judge.ts <trial-dir> [--skill name] [--scenario s] [--model id]");
    process.exit(2);
  }

  const checksPath = join(trialDir, "verifier", "checks.json");
  const checks: TrialChecks | null = existsSync(checksPath)
    ? JSON.parse(readFileSync(checksPath, "utf8"))
    : null;
  const resolved = resolveTrialManifest(checks, { skill: flag(args, "--skill"), scenario: flag(args, "--scenario") });
  if (!resolved.ok) {
    console.error(resolved.error);
    process.exit(2);
  }
  const ref = resolved.ref;

  const artifactsPath = join(trialDir, "verifier", "artifacts.md");
  const trajectoryPath = join(trialDir, "agent", "trajectory.json");
  const artifacts = existsSync(artifactsPath) ? readFileSync(artifactsPath, "utf8") : "";
  const transcript = existsSync(trajectoryPath) ? transcriptFromTrajectory(readFileSync(trajectoryPath, "utf8")) : "";

  if (!artifacts && !transcript) {
    console.error("nothing to judge: no artifacts and no trajectory in this trial");
    process.exit(2);
  }

  // What the agent DID. Deterministic, free, and graded FIRST on purpose: this
  // used to sit after the judge call, so the one dimension that costs nothing
  // could only be had by paying for the one that costs the most. With rendered
  // actions the judge prompt runs to ~200 KB and a call takes minutes; twelve
  // trials did not finish in ten. It is also the pass you re-run while writing
  // a manifest's trajectory section, which is reason enough on its own.
  const manifest = parseEvalManifest(ref, readFileSync(ref.path, "utf8"));
  const trajectory = gradeTrajectory(manifest, trajectoryPath);
  if (trajectory.length) {
    for (const r of trajectory) console.log(`${r.passed ? "\u2713" : "\u2717"} ${r.label}${r.detail ? ` - ${r.detail}` : ""}`);
    const score = trajectory.filter((r) => r.passed).length / trajectory.length;
    console.log(`trajectory ${score.toFixed(2)} (${trajectory.length} check(s))`);
    writeFileSync(join(trialDir, "verifier", "trajectory.json"),
      `${JSON.stringify({ skill: manifest.skill, checks: trajectory, score }, null, 2)}\n`);
  }

  // Skipping the judge is the normal mode while writing a manifest's
  // trajectory section: everything above is free and deterministic.
  if (!args.includes("--no-judge")) {
  const bin = process.env.EVAL_CLAUDE_BIN ?? "claude";
  const model = flag(args, "--model");
  const report = judgeTrial(readFileSync(ref.path, "utf8"), ref, transcript, artifacts, (prompt) => {
    const r = spawnSync(bin, ["-p", prompt, "--output-format", "json", ...(model ? ["--model", model] : [])], {
      encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024,
    });
    return { stdout: r.stdout ?? "", ok: !r.error && r.status === 0 };
  });

  for (const v of report.verdicts) {
    console.log(`${v.verdict === "pass" ? "✓" : "✗"} ${v.criterion}`);
    if (v.evidence) console.log(`      "${v.evidence.slice(0, 120)}"`);
  }
  console.log(`judge ${report.score.toFixed(2)} (${report.passed ? "passed" : "failed"})`);
  writeFileSync(join(trialDir, "verifier", "judge.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
}
