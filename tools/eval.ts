#!/usr/bin/env tsx
/**
 * Skill evaluation harness (testability tier 4).
 * Plays a prose skill through headless `claude -p` against a fixture and
 * verdicts it: mechanical gates first, adjunct LLM judge when declared.
 * Spec: docs/superpowers/specs/2026-07-20-skill-eval-harness-design.md
 *
 *   npx tsx eval.ts run [--only <skill>] [--dry-run]
 *
 * Zero dependencies. Manifests: skills/<name>/eval.yaml (closed YAML subset).
 */
import { readFileSync, existsSync, readdirSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GATE_KINDS = ["file_exists", "file_absent", "file_matching", "grep_zero", "grep_count", "grep_min", "repo_clean", "transcript_contains", "transcript_absent", "exit_ok"];

/**
 * The one convention this harness has that is not about evaluation.
 *
 * Measuring how much a document added to an agent's context moves the work is
 * generic. What is specific to THIS repository is where that document lives: a
 * directory under `skills/`, holding a `SKILL.md`, whose `## Exit condition`
 * section is what a check must cite. Hardcoded, that convention was the only
 * thing keeping the harness from serving a second consumer; declared here, a
 * different layout is a config change rather than a fork.
 *
 * Mutable on purpose, and exercised by a test that points it elsewhere: an
 * extraction nobody can move is a comment pretending to be a seam.
 */
export const SUBJECT = {
  /** Directory holding the artifacts under evaluation. */
  dir: "skills",
  /** The artifact's own text: read for its exit condition and its output format. */
  doc: "SKILL.md",
  /** The section a gate cites, and the probe harvests to build its skeleton. */
  contract: "Exit condition",
};

export interface EvalGate { kind: string; args: Record<string, string> }

/**
 * Checks read from the agent's trajectory rather than from the tree it left.
 *
 * A skill prescribes six surfaces and only one of them - the exit condition -
 * survives into the repository. Its tooling, the context to gather BEFORE
 * acting, its protocol, its named traps and its guardrails are all claims about
 * what the agent DID, and a snapshot cannot hold any of them: the final tree is
 * identical whether the history was read first or last.
 *
 * `before` is the one with no equivalent anywhere in the gate vocabulary, and
 * the one the skills need most: "context to gather (before acting)" is an
 * ordering claim, and ordering is precisely what a snapshot erases.
 *
 * They are graded in the POST-PASS, beside the judge, never in the container:
 * Harbor writes the trajectory after the agent phase ends, which is why the two
 * `transcript_*` gate kinds have always been dead on the paired path. They were
 * not unavailable, they were in the wrong grading moment.
 */
export const TRAJECTORY_KINDS = ["tool_used", "tool_absent", "read_file", "wrote_file", "observed", "before", "step_budget"];

/**
 * How seriously a manifest's numbers are meant to be taken. Nothing else in the
 * grammar can say it, so without `tier:` every manifest reads as equally
 * load-bearing - a five-minute smoke scenario beside one re-measured at full
 * power every release.
 *
 * - `anchor`   measured at full power, re-measured every release
 * - `measured` carries a real paired verdict
 * - `probed`   only ever gets the cheap admission checks, and its gap must
 *              never be read as a causal claim, however large
 */
export const EVAL_TIERS = ["anchor", "measured", "probed"] as const;
export type EvalTier = (typeof EVAL_TIERS)[number];

/**
 * What an untiered manifest is worth. The weakest level is the safe direction
 * to be wrong in: defaulting to `measured` would let a scenario nobody vetted
 * publish a causal verdict, which is the exact failure the tier exists to
 * prevent, while defaulting to `probed` costs at worst a withheld verdict on a
 * scenario that deserved one - visible, and fixed by declaring the tier.
 */
export const DEFAULT_TIER: EvalTier = "probed";

/**
 * Where a manifest lives and what to call it. A skill's default manifest is
 * `skills/<skill>/eval.yaml` and answers to the skill name; extra scenarios
 * live in `skills/<skill>/evals/<scenario>.eval.yaml` and answer to
 * `<skill>/<scenario>`. The `.eval.yaml` suffix is load-bearing: install.ts
 * and the tarball both exclude a manifest by `endsWith("eval.yaml")`, so a
 * plain `<scenario>.yaml` would be staged into the container and hand the
 * agent the gates that grade it.
 */
export interface ManifestRef { skill: string; scenario: string | null; id: string; path: string }

/**
 * Which of a skill's surfaces a criterion grades. The report groups by this, so
 * "the skill moved sequence and not outcome" becomes a statement it can make -
 * the single gate/judge pair could only say whether a skill helped, never where.
 */
export const EVAL_DIMENSIONS = ["outcome", "tooling", "sequence", "trap", "restraint"] as const;
export type EvalDimension = (typeof EVAL_DIMENSIONS)[number];

/** One rubric item: one judgment call, one verdict, one dimension. */
export interface JudgeCriterion { text: string; dimension: EvalDimension }

export interface EvalManifest {
  skill: string;
  /** Declared obligation level; `probed` when the manifest says nothing. */
  tier: EvalTier;
  /** Null for the default manifest, the scenario name otherwise. */
  scenario: string | null;
  /** `skill` or `skill/scenario` - the key every layer groups and names by. */
  id: string;
  fixture: string;
  prompt: string;
  /**
   * Checks that must hold for the gates to mean anything, but that carry no
   * signal about the skill: typically the deliverable path the prompt had to
   * name because the fixture has no tracker. An agent without the skill
   * produces those too, so scoring them would dilute any measured lift.
   */
  preconditions: EvalGate[];
  gates: EvalGate[];
  /** Checks graded from the trajectory in the post-pass. Empty, never absent. */
  trajectory: EvalGate[];
  judge?: { criteria: JudgeCriterion[]; threshold: "pass_all" | number };
}

const unquote = (s: string): string => {
  const trimmed = s.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    // One pass, not two: unescaping `\\` first turns `\\"` into `\"`, which the
    // second pass then reads as an escaped quote and unescapes AGAIN.
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return trimmed;
};

/** Parses `{ k: "v", k2: "v2" }` inline objects and bare scalars. */
function parseGateValue(kind: string, rest: string): EvalGate {
  const t = rest.trim();
  if (t.startsWith("{")) {
    const args: Record<string, string> = {};
    for (const pair of t.replace(/^\{|\}$/g, "").matchAll(/([\w-]+):\s*("(?:[^"\\]|\\.)*"|[^,}]+)/g)) {
      args[pair[1]] = unquote(pair[2].trim());
    }
    return { kind, args };
  }
  return { kind, args: { value: unquote(t) } };
}

/**
 * A criterion is either a bare string or `{ dimension: <d>, text: "…" }`.
 *
 * The bare form defaults to `outcome`, which is what every criterion written
 * before this field existed was in fact grading: the deliverable. Defaulting
 * the other way would relabel a corpus of criteria as measuring something they
 * never looked at.
 */
function parseCriterion(raw: string, fail: (m: string) => never): JudgeCriterion {
  const structured = /^\{\s*dimension:\s*([\w-]+)\s*,\s*text:\s*(.+?)\s*\}$/.exec(raw.trim());
  if (!structured) return { text: unquote(raw), dimension: "outcome" };
  const dimension = structured[1] as EvalDimension;
  if (!EVAL_DIMENSIONS.includes(dimension)) {
    fail(`unknown dimension "${dimension}" (allowed: ${EVAL_DIMENSIONS.join(", ")})`);
  }
  return { text: unquote(structured[2]), dimension };
}

/** Strict line-based subset: fixture, prompt (folded >), gates, judge. */
export function parseEvalManifest(ref: string | ManifestRef, raw: string): EvalManifest {
  const { skill, scenario, id } = typeof ref === "string"
    ? { skill: ref, scenario: null, id: ref }
    : ref;
  const lines = raw.split("\n");
  let fixture = "";
  let tier: EvalTier = DEFAULT_TIER;
  const promptLines: string[] = [];
  const preconditions: EvalGate[] = [];
  const gates: EvalGate[] = [];
  const trajectory: EvalGate[] = [];
  const criteria: JudgeCriterion[] = [];
  let threshold: "pass_all" | number | undefined;
  let section: "" | "prompt" | "preconditions" | "gates" | "trajectory" | "judge" | "criteria" = "";

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const fail = (msg: string): never => { throw new Error(`${skill}/eval.yaml:${n + 1}: ${msg}`); };

    if (section === "prompt" && /^ {2,}\S/.test(line)) { promptLines.push(line.trim()); continue; }
    if (section === "prompt") section = "";

    const fixtureLine = /^fixture:\s*(\S+)\s*$/.exec(line);
    const tierLine = /^tier:\s*(\S+)\s*$/.exec(line);
    const inGateList = section === "gates" || section === "preconditions";
    const gateLine = inGateList ? /^ {2}- ([\w-]+):\s*(.+)$/.exec(line) : null;
    const trajectoryLine = section === "trajectory" ? /^ {2}- ([\w-]+):\s*(.+)$/.exec(line) : null;
    const criterionLine = section === "criteria" ? /^ {4}- (.+)$/.exec(line) : null;
    const inJudge = section === "judge" || section === "criteria";
    const thresholdLine = inJudge ? /^ {2}threshold:\s*(\S+)\s*$/.exec(line) : null;

    if (fixtureLine) fixture = fixtureLine[1];
    else if (tierLine) {
      const declared = tierLine[1] as EvalTier;
      if (!EVAL_TIERS.includes(declared)) fail(`unknown tier "${declared}" (allowed: ${EVAL_TIERS.join(", ")})`);
      tier = declared;
    } else if (/^prompt:\s*>\s*$/.test(line)) section = "prompt";
    else if (/^preconditions:\s*$/.test(line)) section = "preconditions";
    else if (/^gates:\s*$/.test(line)) section = "gates";
    else if (/^trajectory:\s*$/.test(line)) section = "trajectory";
    else if (/^judge:\s*$/.test(line)) section = "judge";
    else if (gateLine) {
      const [, kind, value] = gateLine;
      if (!GATE_KINDS.includes(kind)) fail(`unknown gate "${kind}" (allowed: ${GATE_KINDS.join(", ")})`);
      (section === "preconditions" ? preconditions : gates).push(parseGateValue(kind, value));
    } else if (trajectoryLine) {
      const [, kind, value] = trajectoryLine;
      if (!TRAJECTORY_KINDS.includes(kind)) fail(`unknown trajectory check "${kind}" (allowed: ${TRAJECTORY_KINDS.join(", ")})`);
      trajectory.push(parseGateValue(kind, value));
    } else if (section === "judge" && /^ {2}criteria:\s*$/.test(line)) section = "criteria";
    else if (criterionLine) criteria.push(parseCriterion(criterionLine[1], fail));
    else if (thresholdLine) threshold = thresholdLine[1] === "pass_all" ? "pass_all" : Number(thresholdLine[1]);
    else fail(`unparseable line: ${JSON.stringify(line)}`);
  }

  if (!fixture) throw new Error(`${skill}/eval.yaml: missing "fixture:"`);
  if (!promptLines.length) throw new Error(`${skill}/eval.yaml: missing "prompt: >"`);
  const judge = criteria.length ? { criteria, threshold: threshold ?? ("pass_all" as const) } : undefined;
  if (threshold !== undefined && !judge) throw new Error(`${skill}/eval.yaml: threshold without criteria`);
  return { skill, scenario, id, tier, fixture, prompt: promptLines.join(" "), preconditions, gates, trajectory, judge };
}

export interface GateContext {
  repoDir: string;
  transcript: string;
  exitCode: number;
  baseline: Map<string, string>;
}

// Dependency lock files (package-lock.json, yarn.lock, pnpm-lock.yaml) are environment
// noise produced by an incidental install, not a deliverable of the skill under test;
// they masked real signal in two runs.
// Compiled output is in the same category: a skill whose exit condition demands a
// green build legitimately produces dist/, and grading it on that is grading the
// compiler, not the skill.
const SNAP_PRUNE = new Set([
  ".git",
  ".claude",
  "node_modules",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "target",
]);

export function snapshotRepo(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string, rel: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (SNAP_PRUNE.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else out.set(r, readFileSync(join(d, e.name), "utf8"));
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

function grepHits(ctx: GateContext, pattern: string, sub?: string): number {
  const re = new RegExp(pattern);
  let hits = 0;
  for (const [rel, content] of snapshotRepo(ctx.repoDir)) {
    if (sub && !rel.startsWith(`${sub.replace(/\/$/, "")}/`) && rel !== sub) continue;
    for (const line of content.split("\n")) if (re.test(line)) hits++;
  }
  return hits;
}

export function applyGate(gate: EvalGate, ctx: GateContext): string | null {
  const a = gate.args;
  switch (gate.kind) {
    case "file_exists":
      return existsSync(join(ctx.repoDir, a.value)) ? null : `file_exists: ${a.value} not found`;
    case "file_absent":
      return existsSync(join(ctx.repoDir, a.value)) ? `file_absent: ${a.value} exists` : null;
    // For exit conditions that demand a KIND of file rather than a named one -
    // "a blocking guardrail" is a git hook or a CI job, and the agent chooses
    // where it lives. Matches on the path, not the contents.
    case "file_matching": {
      try {
        const re = new RegExp(a.pattern);
        const hit = [...snapshotRepo(ctx.repoDir).keys()].some((rel) => re.test(rel));
        return hit ? null : `file_matching: no path matches /${a.pattern}/`;
      } catch (e) {
        return `file_matching: invalid pattern /${a.pattern}/: ${(e as Error).message}`;
      }
    }
    case "grep_zero": {
      try {
        const n = grepHits(ctx, a.pattern, a.in);
        return n === 0 ? null : `grep_zero: ${n} hit(s) for /${a.pattern}/ in ${a.in ?? "."}`;
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return `grep_zero: invalid pattern /${a.pattern}/: ${err}`;
      }
    }
    // Use grep_min over agent-authored output, where an exact count is
    // unknowable; reserve grep_count for values computed against the fixture.
    case "grep_min": {
      try {
        const n = grepHits(ctx, a.pattern, a.in);
        return n >= Number(a.count) ? null : `grep_min: expected at least ${a.count}, got ${n} for /${a.pattern}/`;
      } catch (e) {
        return `grep_min: invalid pattern /${a.pattern}/: ${(e as Error).message}`;
      }
    }
    case "grep_count": {
      try {
        const n = grepHits(ctx, a.pattern, a.in);
        return n === Number(a.count) ? null : `grep_count: expected ${a.count}, got ${n} for /${a.pattern}/`;
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return `grep_count: invalid pattern /${a.pattern}/: ${err}`;
      }
    }
    case "repo_clean": {
      const except = (a.except ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      // An entry is an exact path, a `dir/` prefix, or a `name-*` glob - the last
      // one for skills whose deliverables cannot be named upfront (one ticket per
      // finding, one migration per change).
      const allowed = (rel: string): boolean => except.some((e) =>
        e.endsWith("*") ? rel.startsWith(e.slice(0, -1)) : rel === e || rel.startsWith(`${e.replace(/\/$/, "")}/`));
      // `in` narrows the check to the tree that must not move, for skills whose
      // job IS to change things elsewhere. Listing everything such a skill may
      // legitimately touch never converges; naming what it must not does.
      const scope = a.in?.replace(/\/$/, "");
      const inScope = (rel: string): boolean => !scope || rel === scope || rel.startsWith(`${scope}/`);
      const now = snapshotRepo(ctx.repoDir);
      const dirty: string[] = [];
      for (const [rel, content] of now) {
        if (!inScope(rel) || allowed(rel)) continue;
        if (!ctx.baseline.has(rel)) dirty.push(`+${rel}`);
        else if (ctx.baseline.get(rel) !== content) dirty.push(`~${rel}`);
      }
      for (const rel of ctx.baseline.keys()) if (inScope(rel) && !now.has(rel) && !allowed(rel)) dirty.push(`-${rel}`);
      return dirty.length ? `repo_clean: ${dirty.join(" ")}` : null;
    }
    case "transcript_contains":
      return ctx.transcript.includes(a.value) ? null : `transcript_contains: ${JSON.stringify(a.value)} not found`;
    case "transcript_absent":
      return ctx.transcript.includes(a.value) ? `transcript_absent: ${JSON.stringify(a.value)} found` : null;
    case "exit_ok":
      return ctx.exitCode === 0 ? null : `exit_ok: claude exited ${ctx.exitCode}`;
    default:
      return `unknown gate kind ${gate.kind}`;
  }
}

export interface SkillResult { skill: string; verdict: "PASS" | "FAIL" | "JUDGE-FAIL" | "ERROR"; details: string[] }

export interface JudgeVerdict { criterion: string; verdict: "pass" | "fail"; evidence: string }

/**
 * How many bytes of artifacts the judge prompt carries.
 *
 * Sized against the fixtures it has to grade, not against the model: a fixture
 * is 20+ files of several hundred lines, so an agent that rewrote twenty ~4 KB
 * files still arrives whole - where the previous 10 KB held about four small
 * files and graded everything after them unseen. 80 KB of artifacts plus the
 * 30 KB transcript is ~30k tokens, a fraction of any judge model's window: the
 * cap bounds attention and cost, not context. Whatever it does cut is named in
 * the prompt, so a verdict resting on partial evidence says so.
 */
export const JUDGE_ARTIFACTS_BUDGET = 80_000;

/**
 * Under this many bytes, the head of a file quotes nothing a criterion could
 * rest on, so the file is reported as unseen rather than shown as a stub.
 */
const JUDGE_ARTIFACT_MIN_SLICE = 2_000;

/** Marks a gap in the evidence. Not markdown, for the same reason as the artifact boundary. */
const JUDGE_CUT_NOTE = "===== ronce-racine judge note:";

/**
 * The file boundary `collectArtifacts` writes (tools/eval-grade.ts). Recognised
 * here rather than imported: the grader already imports this module, and making
 * it a dependency in return would point the manifest layer outward. A bundle in
 * any other shape stays one nameless chunk, so it is budgeted and announced
 * like the rest instead of being mis-split.
 */
const ARTIFACT_BOUNDARY = /^===== ronce-racine artifact: (.+?) =+$/;

interface ArtifactChunk { path: string; text: string }

function splitArtifactBundle(bundle: string): ArtifactChunk[] {
  const chunks: ArtifactChunk[] = [];
  for (const line of bundle.split("\n")) {
    const boundary = ARTIFACT_BOUNDARY.exec(line);
    if (boundary) chunks.push({ path: boundary[1], text: line });
    else if (chunks.length) chunks[chunks.length - 1].text += `\n${line}`;
    else chunks.push({ path: "", text: line });
  }
  return chunks;
}

/**
 * The paths a manifest's own checks point at - `file_exists: AUDIT.md`,
 * `grep_min: { in: docs/ }`, `repo_clean: { except: TICKETS/ }`, and for
 * `file_matching` a pattern over paths. Those are the files the criteria are
 * about. Two arg names are left out on purpose: a transcript gate's `value` is
 * prose, not a path, and `repo_clean`'s `in` names the tree that must NOT move,
 * which is the opposite of a deliverable.
 */
function deliverableMatchers(m: EvalManifest): { paths: string[]; patterns: RegExp[] } {
  const paths: string[] = [];
  const patterns: RegExp[] = [];
  for (const gate of [...m.preconditions, ...m.gates]) {
    if (gate.kind.startsWith("transcript_") || gate.kind === "exit_ok") continue;
    if (gate.kind === "file_matching") {
      try {
        patterns.push(new RegExp(gate.args.pattern));
      } catch {
        // An unusable pattern only costs ordering here; applyGate reports it as a failed gate.
      }
      continue;
    }
    if (gate.args.value) paths.push(gate.args.value);
    if (gate.args.in && gate.kind !== "repo_clean") paths.push(gate.args.in);
    for (const entry of (gate.args.except ?? "").split(",")) if (entry.trim()) paths.push(entry.trim());
  }
  return { paths, patterns };
}

/**
 * Deliverables first, everything else after, each group in bundle order.
 *
 * The collector walks the repo in directory order, so which file the budget
 * reaches was alphabetical luck: on a 40-file fixture the judge could be shown
 * twenty source files and have the deliverable cut off the end. What the gates
 * name is what the criteria ask about, so it goes first and the scenery can
 * never crowd it out.
 */
function deliverablesFirst(m: EvalManifest, chunks: ArtifactChunk[]): ArtifactChunk[] {
  const { paths, patterns } = deliverableMatchers(m);
  // Same shape as repo_clean's `except`: an exact path, a `dir/` prefix, or a `name-*` glob.
  const named = (rel: string): boolean =>
    paths.some((p) => (p.endsWith("*")
      ? rel.startsWith(p.slice(0, -1))
      : rel === p || rel.startsWith(`${p.replace(/\/$/, "")}/`)))
    || patterns.some((re) => re.test(rel));
  return [...chunks.filter((c) => named(c.path)), ...chunks.filter((c) => !named(c.path))];
}

/**
 * Fills the budget in order and states what did not fit. A file too big for
 * what is left is shown as a marked slice rather than dropped whole, so an
 * oversized deliverable is still gradeable on its head.
 */
function fitArtifacts(chunks: ArtifactChunk[]): string {
  const shown: string[] = [];
  const unseen: ArtifactChunk[] = [];
  let left = JUDGE_ARTIFACTS_BUDGET;

  for (const chunk of chunks) {
    if (chunk.text.length <= left) {
      shown.push(chunk.text);
      left -= chunk.text.length;
    } else if (left >= JUDGE_ARTIFACT_MIN_SLICE) {
      const cut = chunk.text.length - left;
      shown.push(`${chunk.text.slice(0, left)}\n${JUDGE_CUT_NOTE} ${cut} byte(s) of ${chunk.path || "this artifact"} not shown =====`);
      left = 0;
    } else {
      unseen.push(chunk);
    }
  }
  if (!unseen.length) return shown.join("\n");

  const listed = unseen.map((c) => `${c.path || "(unnamed)"} (${c.text.length} B)`).join(", ");
  return [
    ...shown,
    `${JUDGE_CUT_NOTE} ${unseen.length} artifact(s) not shown, over the ${JUDGE_ARTIFACTS_BUDGET}-byte budget: ${listed} =====`,
    `Grade only on what is shown above; do not assume what an artifact you were not shown contains.`,
  ].join("\n");
}

/**
 * How many bytes of the rendered trajectory the judge prompt carries.
 *
 * This replaced a 30 KB TAIL window, and the shape of the fix matters more than
 * the number. A tail was defensible while the transcript was prose; it stopped
 * being defensible the day tool calls were rendered with their arguments. The
 * twelve trajectories of the 2026-09-03 anchor run went from 95 KB to 213 KB -
 * ~18 KB each - and the added half is the actions. 120 KB therefore carries a
 * trial of that run whole several times over, so a cut is the exception rather
 * than the rule, and 120 KB of transcript beside 80 KB of artifacts is ~50k
 * tokens: the cap bounds attention and cost, not context.
 */
export const JUDGE_TRANSCRIPT_BUDGET = 120_000;

/**
 * The share of the budget spent on the OPENING of the run.
 *
 * A trajectory has two ends and they answer different criteria. The start
 * carries the ordering evidence - "context gathered BEFORE acting" is the
 * `sequence` dimension, and the whole point of grading a trajectory rather than
 * a tree is that a tree cannot hold an ordering. The end carries the
 * deliverable and the claims made about it, which is where `outcome` and `trap`
 * live. A tail window scored the second and deleted the first, silently.
 *
 * Not half: the opening establishes an ordering in a few steps and is compact,
 * while the closing steps carry the deliverable plus the reasoning about it,
 * and most criteria in the base are still `outcome`. The middle - the grind of
 * a long investigation - is what a cut should take, and it is announced.
 */
const JUDGE_TRANSCRIPT_HEAD_SHARE = 0.4;

/**
 * Cuts back to a line boundary. `transcriptFromTrajectory` renders one action
 * per line, and the judge is required to quote verbatim: half a rendered call -
 * `nd=git commit -m` - is a quote of an act that never happened in that form,
 * which is worse evidence than none.
 */
function headLines(text: string, bytes: number): string {
  const raw = text.slice(0, bytes);
  const at = raw.lastIndexOf("\n");
  return at === -1 ? raw : raw.slice(0, at);
}

function tailLines(text: string, bytes: number): string {
  const raw = text.slice(-bytes);
  const at = raw.indexOf("\n");
  return at === -1 ? raw : raw.slice(at + 1);
}

interface TranscriptView { header: string; body: string }

/** Spends the budget on both ends and states, by position and size, what fell out of the middle. */
function fitTranscript(transcript: string): TranscriptView {
  if (transcript.length <= JUDGE_TRANSCRIPT_BUDGET) return { header: "## Transcript", body: transcript };

  const head = headLines(transcript, Math.floor(JUDGE_TRANSCRIPT_BUDGET * JUDGE_TRANSCRIPT_HEAD_SHARE));
  const tail = tailLines(transcript, JUDGE_TRANSCRIPT_BUDGET - head.length);
  const cut = transcript.length - head.length - tail.length;
  return {
    header: `## Transcript (opening ${head.length} B + closing ${tail.length} B of ${transcript.length} B; ${cut} byte(s) from the middle not shown)`,
    body: [
      head,
      `${JUDGE_CUT_NOTE} ${cut} byte(s) from the MIDDLE of the run not shown; the run resumes below =====`,
      tail,
    ].join("\n"),
  };
}

/**
 * What each dimension asks the judge to look for, and what may stand as its
 * evidence. The dimension travels with the criterion; left implicit, a judge
 * handed a `sequence` criterion goes looking for the ordering in the final
 * document, where no ordering exists.
 *
 * Only the dimensions a manifest actually declares are rendered: teaching the
 * judge about a kind of criterion it is not grading is four more paragraphs of
 * prompt competing for attention with the evidence.
 */
const DIMENSION_GUIDE: Record<EvalDimension, string> = {
  outcome: "a property of the DELIVERABLE. Evidence: a quote from the artifacts.",
  tooling: "an ACTION the agent took. Evidence: the rendered tool call, and nothing else.",
  sequence: "an ORDERING between two actions. Evidence: both rendered calls, the earlier one first; say which came first.",
  trap: "a named RATIONALIZATION, and whether the agent took it. Evidence: the step where it was available, and what the agent chose there.",
  restraint: "an ABSENCE - something the agent had to NOT do. Evidence: quote what it did instead at the step where the forbidden act belonged; \"I found nothing\" is not a quote.",
};

/**
 * One prompt carrying every criterion, rather than one call per rubric item.
 *
 * RubricEval (arXiv 2603.25133) and Step-wise Rubric Rewards (arXiv 2605.17291)
 * hand the judge one rubric item at a time, and this prompt deliberately does
 * not. The argument is cost against what per-item prompting actually buys here:
 *
 * - The expensive half of a judge call is the prompt, and the prompt is now
 *   ~200 KB of transcript and artifacts. Per-item multiplies THAT by the
 *   criterion count, on top of a quorum that already multiplies it: 12 trials x
 *   3 criteria x a 3-judge quorum is 108 large calls where the batch is 36.
 * - What per-item prompting buys is that one item cannot be blurred into
 *   another. The mechanical part of that is already enforced here: the
 *   anti-leniency parser makes the judge echo each criterion verbatim and
 *   requires a per-criterion quote, and `parseJudgeVerdicts` downgrades a pass
 *   with an empty quote to a fail.
 * - What the batch was genuinely missing is the other half of those papers -
 *   attribution to the step that earns the verdict. That costs nothing to add
 *   to the output shape, so it is added rather than bought with 3x the calls.
 *
 * The honest limit: `where` is asked for and not enforced - the parser accepts
 * a verdict without it. Enforcing it belongs with the quorum work, which is
 * where a criterion whose attribution the judges disagree about becomes
 * readable as a badly written criterion rather than a result.
 */
export function buildJudgePrompt(m: EvalManifest, transcript: string, artifacts: string): string {
  const docPath = join(ROOT, SUBJECT.dir, m.skill, SUBJECT.doc);
  const skillMd = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
  const exit = new RegExp(`## ${SUBJECT.contract}[\\s\\S]*?(?=\\n## |$)`).exec(skillMd)?.[0] ?? "";
  const criteria = m.judge?.criteria ?? [];
  const view = fitTranscript(transcript);
  const dimensions = [...new Set(criteria.map((c) => c.dimension))];
  return [
    `You are grading whether an agent correctly followed the "${m.skill}" skill.`,
    `Judge ONLY against the criteria below, one at a time, in the order given.`,
    `For each: a one-sentence rationale, then a binary verdict, then the evidence.`,
    `Output STRICTLY a JSON array and nothing else:`,
    `[{"criterion": "<echoed verbatim>", "verdict": "pass"|"fail", "evidence": "<short verbatim quote>", "where": "<the step or artifact line it comes from>"}]`,
    ``, `## Evidence rules`,
    `- The quote is verbatim, from the transcript or the artifacts. A pass with no quote is invalid.`,
    // The 598-tool-call defect turned into a rule the judge is held to: until
    // the actions were rendered, running a command and claiming to have run it
    // reached the judge identically. Now that they are rendered, prose may no
    // longer stand in for an act - which is exactly what a criterion like
    // "produced the evidence, did not claim it" has always been asking.
    `- A rendered tool call is a quote: the lines shaped "  → Bash(command=git log --oneline)" are things the agent DID.`,
    `  For a tooling or sequence criterion they are the only admissible evidence - an agent SAYING it ran a command is not proof that it ran.`,
    `- "where" attributes the verdict to the one step that earns it. Quote that step's line, not a summary of the run.`,
    ``, `## What each dimension asks for`,
    ...dimensions.map((d) => `- ${d}: ${DIMENSION_GUIDE[d]}`),
    ``, `## Criteria`, ...criteria.map((c) => `- (${c.dimension}) ${c.text}`),
    ``, `## Skill exit conditions`, exit,
    ``, view.header, view.body,
    ``, `## Artifacts produced (deliverables first)`, fitArtifacts(deliverablesFirst(m, splitArtifactBundle(artifacts))),
  ].join("\n");
}

/**
 * `claude -p --output-format json` emits {"type":"result","result":"<text>"} -
 * the model's actual text is an escaped string inside .result. Unwrap it so
 * callers parse the model's output, not the envelope. Non-JSON stdout (e.g.
 * --output-format text stubs) passes through unchanged.
 */
export function unwrapClaudeJsonEnvelope(raw: string): string {
  try {
    const envelope = JSON.parse(raw);
    if (envelope && typeof envelope === "object" && typeof envelope.result === "string") return envelope.result;
  } catch {
    // raw stdout is not a JSON envelope - fall through and use it as-is
  }
  return raw;
}

export function parseJudgeVerdicts(raw: string, criteria: (string | JudgeCriterion)[]): JudgeVerdict[] {
  const jsonMatch = /\[[\s\S]*\]/.exec(raw);
  if (!jsonMatch) throw new Error("judge output contains no JSON array");
  const arr = JSON.parse(jsonMatch[0]) as JudgeVerdict[];
  for (const c of criteria) {
    const text = typeof c === "string" ? c : c.text;
    if (!arr.some((v) => v.criterion === text)) throw new Error(`judge skipped criterion: ${text}`);
  }
  return arr.map((v) => ({
    ...v,
    verdict: v.verdict === "pass" && v.evidence?.trim() ? "pass" : "fail",
  }));
}

export function judgePassed(verdicts: JudgeVerdict[], threshold: "pass_all" | number): boolean {
  const passes = verdicts.filter((v) => v.verdict === "pass").length;
  return threshold === "pass_all" ? passes === verdicts.length : passes / verdicts.length >= threshold;
}

export function discoverManifests(root: string = ROOT): ManifestRef[] {
  const out: ManifestRef[] = [];
  for (const skill of readdirSync(join(root, SUBJECT.dir)).sort()) {
    const dflt = join(root, SUBJECT.dir, skill, "eval.yaml");
    if (existsSync(dflt)) out.push({ skill, scenario: null, id: skill, path: dflt });

    const evals = join(root, SUBJECT.dir, skill, "evals");
    if (!existsSync(evals)) continue;
    for (const f of readdirSync(evals).sort()) {
      if (!f.endsWith(".eval.yaml")) continue;
      const scenario = f.slice(0, -".eval.yaml".length);
      out.push({ skill, scenario, id: `${skill}/${scenario}`, path: join(evals, f) });
    }
  }
  return out;
}

const TSX_BIN = join(ROOT, "node_modules", ".bin", "tsx");

export function runOne(m: EvalManifest, opts: { claudeBin: string; timeoutMs: number }): SkillResult {
  const fixtureSrc = join(ROOT, "playground", "fixtures", m.fixture);
  if (!existsSync(fixtureSrc)) return { skill: m.skill, verdict: "ERROR", details: [`fixture ${m.fixture} missing - run playground/setup.ts`] };

  const dir = join(tmpdir(), "ronce-racine-eval", `${m.skill}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  cpSync(fixtureSrc, dir, { recursive: true });

  try {
    // Install the skill under test through the real distribution path.
    // Skip when the skill is not in the catalog (used by ERROR-path tests with synthetic names).
    const skillExists = existsSync(join(ROOT, SUBJECT.dir, m.skill, SUBJECT.doc));
    if (skillExists) {
      const inst = spawnSync(TSX_BIN, [join(ROOT, "install.ts"), "install", dir, "--yes", "--pick", `skill:${m.skill}`], { encoding: "utf8" });
      if (inst.status !== 0) return { skill: m.skill, verdict: "ERROR", details: [`install --pick failed: ${inst.stderr}`] };
    }

    const baseline = snapshotRepo(dir);
    const run = spawnSync(opts.claudeBin, ["-p", m.prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"], {
      cwd: dir, encoding: "utf8", timeout: opts.timeoutMs, maxBuffer: 64 * 1024 * 1024,
    });
    if (run.error) return { skill: m.skill, verdict: "ERROR", details: [`claude did not run: ${run.error.message}`] };

    const ctx: GateContext = { repoDir: dir, transcript: run.stdout ?? "", exitCode: run.status ?? 1, baseline };
    const check = (gs: EvalGate[], label: string): string[] =>
      gs.map((g) => applyGate(g, ctx)).filter((f): f is string => f !== null).map((f) => `${label}${f}`);

    // A missing deliverable makes every gate below it uninterpretable, so report
    // the preconditions alone rather than drowning them in downstream noise.
    const unmet = check(m.preconditions, "precondition ");
    if (unmet.length) return { skill: m.skill, verdict: "FAIL", details: unmet };

    const failures = check(m.gates, "");
    if (failures.length) return { skill: m.skill, verdict: "FAIL", details: failures };

    if (m.judge) {
      const after = snapshotRepo(dir);
      const artifacts = [...after]
        .filter(([rel, content]) => !baseline.has(rel) || baseline.get(rel) !== content)
        .map(([rel, content]) => `### ${rel}\n${content}`).join("\n");
      const judge = spawnSync(opts.claudeBin, ["-p", buildJudgePrompt(m, ctx.transcript, artifacts), "--output-format", "json"], {
        cwd: ROOT, encoding: "utf8", timeout: opts.timeoutMs, maxBuffer: 16 * 1024 * 1024,
      });
      if (judge.error || judge.status !== 0) return { skill: m.skill, verdict: "ERROR", details: [`judge did not run: ${judge.error?.message ?? judge.status}`] };
      try {
        // `claude -p --output-format json` wraps the model's text in an envelope
        // ({"type":"result","result":"<escaped text>"}); the actual verdict JSON
        // lives inside .result. Fall back to raw stdout for plain-text output
        // (e.g. --output-format text, or stubs that skip the envelope).
        const judgeOutput = unwrapClaudeJsonEnvelope(judge.stdout ?? "");
        const verdicts = parseJudgeVerdicts(judgeOutput, m.judge.criteria);
        if (!judgePassed(verdicts, m.judge.threshold))
          return { skill: m.skill, verdict: "JUDGE-FAIL", details: verdicts.filter((v) => v.verdict === "fail").map((v) => `~${v.criterion}`) };
      } catch (e) {
        return { skill: m.skill, verdict: "ERROR", details: [`judge unparseable: ${(e as Error).message}`] };
      }
    }
    return { skill: m.skill, verdict: "PASS", details: [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] !== "run") { console.error("usage: eval.ts run [--only <skill>] [--dry-run]"); process.exit(2); }

  let only: string | undefined;
  if (args.includes("--only")) {
    const idx = args.indexOf("--only");
    const next = args[idx + 1];
    if (!next || next.startsWith("-")) {
      console.error("usage: eval.ts run [--only <skill>] [--dry-run]");
      process.exit(2);
    }
    only = next;
  }

  const manifests = discoverManifests()
    .filter((m) => !only || m.skill === only)
    .map((m) => parseEvalManifest(m.skill, readFileSync(m.path, "utf8")));
  if (args.includes("--dry-run")) {
    console.log(`✓ ${manifests.length} manifest(s) valid${only ? ` (only ${only})` : ""}`);
    process.exit(0);
  }
  const claudeBin = process.env.EVAL_CLAUDE_BIN ?? "claude";
  const results = manifests.map((m) => {
    const r = runOne(m, { claudeBin, timeoutMs: 15 * 60_000 });
    console.log(`${r.verdict.padEnd(10)} ${r.skill}${r.details.length ? `  ${r.details.join(" | ")}` : ""}`);
    return r;
  });
  const errs = results.filter((r) => r.verdict === "ERROR").length;
  const fails = results.filter((r) => r.verdict === "FAIL" || r.verdict === "JUDGE-FAIL").length;
  console.log(`\n${results.length - errs - fails} PASS, ${fails} FAIL, ${errs} ERROR`);
  process.exit(errs ? 2 : fails ? 1 : 0);
}
