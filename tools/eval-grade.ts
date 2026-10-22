#!/usr/bin/env tsx
/**
 * Deterministic grader: applies an eval manifest's checks to a finished repo
 * and emits scores. No model call - the judge is a separate, later pass.
 *
 * It runs INSIDE the trial container as the Harbor verifier, which is why it
 * takes the repo state as an argument rather than orchestrating a run:
 *
 *   npx tsx tools/eval-grade.ts snapshot <repoDir> <out.json>
 *   npx tsx tools/eval-grade.ts grade <eval.yaml> <repoDir> [--baseline f] [--out f]
 *
 * `snapshot` runs at image build time, before the agent touches anything, so
 * `repo_clean` has a baseline to diff against.
 *
 * Every check is evaluated - a failing one never short-circuits the rest.
 * Partial scores are the whole point: a verdict of "0" and a verdict of "3 of 4
 * checks held" say very different things when comparing two arms.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEvalManifest, applyGate, snapshotRepo, type EvalGate, type GateContext } from "./eval.js";

export interface CheckResult { id: string; kind: "precondition" | "gate"; passed: boolean; detail: string }

export interface GradeReport {
  skill: string;
  /** Null for the skill's default manifest, the scenario name otherwise. */
  scenario: string | null;
  checks: CheckResult[];
  /** One entry per named reward; Harbor accepts a dict, so dimensions stay apart. */
  rewards: Record<string, number>;
}

const ratio = (checks: CheckResult[]): number =>
  checks.length === 0 ? 1 : checks.filter((c) => c.passed).length / checks.length;

/**
 * `id` is `<skill>` or `<skill>/<scenario>`. It is split back apart in the
 * report because the later, out-of-container judge pass resolves the manifest
 * from those two fields - checks.json is the only channel it has.
 */
export function grade(manifestYaml: string, id: string, ctx: GateContext): GradeReport {
  const slash = id.indexOf("/");
  const skill = slash === -1 ? id : id.slice(0, slash);
  const scenario = slash === -1 ? null : id.slice(slash + 1);
  const m = parseEvalManifest(id, manifestYaml);

  const run = (gates: EvalGate[], kind: "precondition" | "gate"): CheckResult[] =>
    gates.map((g) => {
      const detail = applyGate(g, ctx);
      return { id: `${kind}:${g.kind}:${g.args.value ?? g.args.pattern ?? ""}`, kind, passed: detail === null, detail: detail ?? "" };
    });

  const preconditions = run(m.preconditions, "precondition");
  const gates = run(m.gates, "gate");

  // The headline reward is the gates alone: preconditions are a floor everyone
  // clears, so folding them in would dilute the very difference we measure.
  //
  // `n_gates` travels with the score because a manifest with no gate scores a
  // vacuous 1.0 - nothing to fail. Read as a reward that is indistinguishable
  // from a perfect run, and it would mark both arms saturated and hide the
  // real finding: that eval has no mechanical signal and rests on its judge.
  return {
    skill,
    scenario,
    checks: [...preconditions, ...gates],
    rewards: {
      reward: ratio(gates),
      gates: ratio(gates),
      preconditions: ratio(preconditions),
      n_gates: gates.length,
    },
  };
}

/**
 * File boundary in a collected artifact bundle. Deliberately not markdown: the
 * deliverables ARE markdown, full of `### Summary` and `### Weaknesses`, and a
 * `###` separator would be indistinguishable from a heading inside a report.
 */
const ARTIFACT_MARK = "===== ronce-racine artifact:";

/**
 * The files the agent added or changed, in the shape the judge prompt expects.
 * Untouched fixture files are left out: the judge grades deliverables, and its
 * prompt budget is better spent on them than on the scenery.
 */
export function collectArtifacts(baseline: Map<string, string>, repoDir: string): string {
  return [...snapshotRepo(repoDir)]
    .filter(([rel, content]) => !baseline.has(rel) || baseline.get(rel) !== content)
    .map(([rel, content]) => `${ARTIFACT_MARK} ${rel} =====\n${content}`)
    .join("\n");
}

/** Inverse of collectArtifacts, so a bundle can be read back file by file. */
export function splitArtifacts(bundle: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  let current: { path: string; content: string[] } | null = null;

  for (const line of bundle.split("\n")) {
    const boundary = line.startsWith(ARTIFACT_MARK)
      ? line.slice(ARTIFACT_MARK.length).replace(/=+\s*$/, "").trim() : null;
    if (boundary !== null) {
      if (current) out.push({ path: current.path, content: current.content.join("\n") });
      current = { path: boundary, content: [] };
    } else if (current) {
      current.content.push(line);
    }
  }
  if (current) out.push({ path: current.path, content: current.content.join("\n") });
  return out;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const flag = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const isMain = import.meta.url === pathToFileURL(process.argv[2] ?? "").href
  || import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const args = process.argv.slice(2);
  const usage = "usage: eval-grade.ts snapshot <repoDir> <out.json> | grade <eval.yaml> <repoDir> [--baseline f] [--out f] [--skill name] [--scenario name]";

  if (args[0] === "snapshot") {
    const [, repoDir, out] = args;
    if (!repoDir || !out) { console.error(usage); process.exit(2); }
    writeJson(out, [...snapshotRepo(repoDir)]);
    console.log(`✓ baseline: ${snapshotRepo(repoDir).size} file(s)`);
  } else if (args[0] === "grade") {
    const [, manifestPath, repoDir] = args;
    if (!manifestPath || !repoDir) { console.error(usage); process.exit(2); }

    const baselineFile = flag(args, "--baseline");
    const baseline = new Map<string, string>(
      baselineFile ? (JSON.parse(readFileSync(baselineFile, "utf8")) as [string, string][]) : [],
    );
    const skill = flag(args, "--skill") ?? "unknown";
    // The generated verifier always passes --scenario, empty for a default
    // manifest, so an empty value means "the skill's own eval.yaml".
    const scenario = flag(args, "--scenario") || null;
    const id = scenario ? `${skill}/${scenario}` : skill;
    const ctx: GateContext = { repoDir, transcript: "", exitCode: 0, baseline };
    const report = grade(readFileSync(manifestPath, "utf8"), id, ctx);

    for (const c of report.checks) console.log(`${c.passed ? "✓" : "✗"} ${c.id}${c.detail ? `  ${c.detail}` : ""}`);
    console.log(`gates ${report.rewards.gates.toFixed(2)} · preconditions ${report.rewards.preconditions.toFixed(2)}`);

    const out = flag(args, "--out");
    if (out) {
      writeJson(out, report.rewards);
      writeJson(out.replace(/reward\.json$/, "checks.json"), report);
    }

    // The container is destroyed after the verifier, so anything the judge will
    // need has to be written out now or it is gone.
    const artifactsOut = flag(args, "--artifacts");
    if (artifactsOut) {
      const artifacts = collectArtifacts(baseline, repoDir);
      mkdirSync(dirname(artifactsOut), { recursive: true });
      writeFileSync(artifactsOut, artifacts);
      console.log(`artifacts: ${artifacts.length} bytes`);
    }
  } else {
    console.error(usage);
    process.exit(2);
  }
}
