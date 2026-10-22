#!/usr/bin/env tsx
/**
 * Format-gate probe for the eval manifests.
 *
 * Grades a deliverable that carries the skill's OWN output format and no
 * content whatsoever against the manifest's gates. Every gate that still goes
 * green scores vocabulary rather than work: the deliverable knows nothing
 * about the fixture, so however the words got there cannot matter. That is the
 * mechanism behind the two measurements this tool exists to explain - a
 * monolithic skill and a thin one delegating to a reference file scoring
 * EXACTLY the same over six pairs, and audit-security separating its arms 0.33
 * against 1.00 on gates that grep for "confidence" and "non-auditable".
 *
 *   npx tsx tools/eval-probe.ts [--only <skill>] [--strict]
 *
 * Deliberately NOT part of tools/eval-lint.ts: that lint runs inside
 * `npm test` and its findings must stay a property of the manifest alone,
 * while this one reads the SKILL.md next door and moves whenever the skill's
 * template does. Zero dependencies and no agent call all the same.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SUBJECT, applyGate, discoverManifests, parseEvalManifest, snapshotRepo, type EvalGate, type EvalManifest, type EvalTier, type GateContext } from "./eval.js";
import { withPristineFixture } from "./eval-lint.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * What the probe concluded about one gate.
 *
 * - `format`   a content-free deliverable passes it; it cannot measure a skill
 * - `shallow`  the gate keys on a path and never reads content, so an empty
 *              artifact at the right place passes it. That is a real weakness
 *              and it is NOT the format disease: creating the file is an act,
 *              not a word. Reported apart because folding it into `format`
 *              contradicted a measurement - "a BLOCKING guardrail exists" went
 *              0/7 unaided against 7/7 aided over 14 paired trials on
 *              2026-08-24, so the act is demonstrably not free.
 * - `content`  it survives the probe, so something beyond the template earns it
 * - `trivial`  an absence the probe satisfies by not overstepping - eval-lint's
 *              do-nothing check owns that failure mode, not this one
 * - `unprobed` the probe could not put the gate in a fair position; silence
 *              beats crediting a manifest with signal nothing tested
 */
export type ProbeVerdict = "format" | "shallow" | "content" | "trivial" | "unprobed";

export interface ProbedGate { kind: string; label: string; verdict: ProbeVerdict; failure: string | null }

export interface ProbeReport { id: string; skill: string; fixture: string; skeleton: number; gates: ProbedGate[]; tier: EvalTier }

/**
 * The reports whose format gates must fail the run, as opposed to be reported.
 *
 * Severity follows the tier, the same way the citation lint's does, and for the
 * same reason: 43 of the 58 gates in the base as it stands are format gates.
 * That is the finding which justifies rebuilding the base, not a reason to keep
 * the check out of CI until the rebuild lands. A `probed` manifest publishes no
 * causal verdict, so its format gates are information; a manifest that claims
 * `measured` or `anchor` claims the right to a verdict, and a gate a
 * content-free deliverable passes cannot underwrite one.
 */
export function blocking(reports: ProbeReport[]): ProbeReport[] {
  return reports.filter((r) => VERDICT_TIERS.has(r.tier) && r.gates.some((g) => g.verdict === "format"));
}

/** The tiers a manifest can publish a causal verdict from. */
const VERDICT_TIERS = new Set<EvalTier>(["anchor", "measured"]);

/**
 * Gates that demand something be PRODUCED. The rest assert an absence, and a
 * deliverable made of template lines satisfies those the way any well-behaved
 * run does. The set is restated rather than imported from eval-lint.ts, which
 * keeps its own for a different question (what a pristine fixture already
 * satisfies) and does not export it; `transcript_contains` belongs here and
 * not there, because the probe feeds the skeleton as the transcript too.
 */
const PRODUCTION_GATES = new Set(["file_exists", "file_matching", "grep_min", "grep_count", "transcript_contains"]);

/** Sections whose fenced blocks ARE the deliverable's shape. */
const FORMAT_HEADING = /^#{2,4}\s+.*\b(output|format|template|templates|skeleton|structure|report)\b/i;
const EXIT_HEADING = /^#{2,4}\s+exit condition/i;
const CHECKLIST_ITEM = /^\s*- \[ \]\s+(.+)$/;
const FENCE = /^\s*```/;

/**
 * The lines a skill PRESCRIBES for its deliverable: the bodies of the fenced
 * blocks under its format/template headings, and its exit-condition checklist.
 * Prose is left out on purpose - a skill's overview names its domain (TLS,
 * webhooks, flaky tests), and harvesting that would indict gates that do
 * measure work.
 */
function harvestFormat(md: string): string[] {
  const out: string[] = [];
  let section: "" | "format" | "exit" = "";
  let fenced = false;

  for (const line of md.split("\n")) {
    if (/^#{1,6}\s/.test(line) && !fenced) {
      section = FORMAT_HEADING.test(line) ? "format" : EXIT_HEADING.test(line) ? "exit" : "";
      continue;
    }
    if (section === "format" && FENCE.test(line)) { fenced = !fenced; continue; }
    if (section === "format" && fenced) out.push(line);
    const item = section === "exit" ? CHECKLIST_ITEM.exec(line) : null;
    if (item) out.push(`- [ ] ${item[1]}`);
  }
  return out;
}

/** Markdown links to a sibling `.md`, resolved against the skill directory. */
function linkedDocs(skillDir: string, md: string): string[] {
  const skillsRoot = dirname(skillDir);
  const seen = new Set<string>();
  for (const link of md.matchAll(/\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
    const target = join(skillDir, link[1]);
    // A skill may point at a shared apparatus one directory over (audit-* all
    // do), but never outside the catalog.
    if (!target.startsWith(`${skillsRoot}/`) || !existsSync(target)) continue;
    seen.add(target);
  }
  return [...seen];
}

/**
 * The synthetic deliverable: the skill's own prescribed lines, verbatim.
 *
 * Built mechanically rather than by asking a model for "the format with no
 * content", for two reasons. A model's answer varies run to run, so the same
 * gate could be called a format gate on Tuesday and not on Wednesday, and this
 * list is meant to be evidence. And a model asked for an empty report writes
 * plausible findings anyway - the one thing the probe must not contain.
 */
export function formatSkeleton(skillDir: string): string {
  const skillMd = join(skillDir, SUBJECT.doc);
  if (!existsSync(skillMd)) return "";
  const md = readFileSync(skillMd, "utf8");
  const lines = harvestFormat(md);
  // One hop only: the apparatus a skill points at is prescribed format, the
  // grids IT points at are domain content.
  for (const doc of linkedDocs(skillDir, md)) lines.push(...harvestFormat(readFileSync(doc, "utf8")));
  // A file under templates/ is the deliverable's shape and nothing else -
  // placeholders and empty table cells - so it is taken whole. Ten skills keep
  // their format there instead of in a fenced block, and reading only SKILL.md
  // would call their gates measured.
  const templates = join(skillDir, "templates");
  if (existsSync(templates)) {
    for (const file of readdirSync(templates).sort()) {
      if (file.endsWith(".md")) lines.push(readFileSync(join(templates, file), "utf8"));
    }
  }
  return lines.join("\n");
}

/** Splits `(a|b)` at the top level, ignoring `|` nested in a group or class. */
function splitBranches(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cls = false;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\") { current += body.slice(i, i + 2); i++; continue; }
    if (c === "[") cls = true;
    else if (c === "]") cls = false;
    else if (!cls && c === "(") depth++;
    else if (!cls && c === ")") depth--;
    else if (!cls && !depth && c === "|") { parts.push(current); current = ""; continue; }
    current += c;
  }
  parts.push(current);
  return parts;
}

function closingParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

const CANDIDATE_CAP = 24;

const cross = (prefixes: string[], parts: string[]): string[] =>
  prefixes.flatMap((p) => parts.map((s) => p + s)).slice(0, CANDIDATE_CAP);

/**
 * Strings a path pattern could match, or none when the pattern is past what a
 * dozen lines of expansion can invert (counted quantifiers, lookarounds). Only
 * a candidate the real regex accepts is ever used, so being crude here costs
 * an abstention, never a wrong verdict.
 */
function expandPattern(src: string): string[] {
  let out = [""];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "{" || c === "(" && src.startsWith("(?=", i)) return [];
    if (c === "(") {
      const end = closingParen(src, i);
      if (end < 0) return [];
      const branches = splitBranches(src.slice(i + 1, end).replace(/^\?:/, "")).flatMap(expandPattern);
      if (!branches.length) return [];
      i = end + 1;
      const quantifier = "?*+".includes(src[i] ?? "") ? src[i] : "";
      if (quantifier) i++;
      out = cross(out, quantifier === "?" || quantifier === "*" ? ["", ...branches] : branches);
      continue;
    }
    let literal: string;
    if (c === "\\") { literal = src[i + 1] ?? ""; i += 2; }
    else if (c === "[") {
      const end = src.indexOf("]", i + 1);
      if (end < 0) return [];
      literal = src.slice(i + 1, end).replace(/^\^/, "")[0] ?? "";
      i = end + 1;
    } else if (c === ".") { literal = "x"; i++; }
    else if (c === "^" || c === "$") { i++; continue; }
    else if ("*?+".includes(c)) { i++; continue; }
    else { literal = c; i++; }
    const quantifier = "?*+".includes(src[i] ?? "") ? src[i] : "";
    if (quantifier) i++;
    out = cross(out, quantifier === "?" || quantifier === "*" ? ["", literal] : [literal]);
  }
  return out;
}

const PROBE_FILE = "PROBE.md";

/** A repo-relative file path, for an entry that may name a file or a directory. */
function asFilePath(entry: string): string {
  // A glob stands for names the eval author could not know upfront (one ticket
  // per finding); any concrete name inside it does.
  const concrete = entry.replace(/\*/g, "probe").replace(/\/$/, "");
  // No extension means a directory here even when it could be a file: a
  // directory write satisfies file_exists, a `in:` scope and a repo_clean
  // `except` prefix alike, where `<name>.md` would trip the last one.
  return basename(concrete).includes(".") ? concrete : join(concrete, PROBE_FILE);
}

/** Where a manifest's checks say the deliverable lives. */
export function deliverablePaths(m: EvalManifest): string[] {
  const entries: string[] = [];
  for (const gate of [...m.preconditions, ...m.gates]) {
    if (gate.kind.startsWith("transcript_") || gate.kind === "exit_ok" || gate.kind === "file_matching") continue;
    // file_absent names a path that must NOT appear: writing there would fail
    // the gate for a reason that has nothing to do with format.
    if (gate.args.value && gate.kind !== "file_absent") entries.push(gate.args.value);
    // repo_clean's `in` is the tree that must NOT move - the opposite of a deliverable.
    if (gate.args.in && gate.kind !== "repo_clean") entries.push(gate.args.in);
    for (const except of (gate.args.except ?? "").split(",")) if (except.trim()) entries.push(except.trim());
  }
  return [...new Set(entries.map(asFilePath))];
}

/** The first path a `file_matching` pattern accepts, or null when none is found. */
function matchingPath(pattern: string): string | null {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return null;
  }
  for (const candidate of expandPattern(pattern)) {
    if (!candidate || candidate.startsWith("/") || candidate.includes("..")) continue;
    const paths = candidate.endsWith("/")
      ? [candidate + PROBE_FILE]
      : [candidate, `${candidate}/${PROBE_FILE}`, `${candidate}.md`];
    for (const path of paths) if (re.test(path)) return path;
  }
  return null;
}

const gateLabel = (gate: EvalGate): string => {
  const subject = gate.args.value ?? gate.args.pattern
    ?? (gate.args.except ? `except ${gate.args.except}` : undefined) ?? gate.args.in ?? "";
  return subject ? `${gate.kind}: ${subject}` : gate.kind;
};

function write(dir: string, rel: string, content: string): void {
  const path = join(dir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Writes the content-free deliverable into `dir` and grades the manifest's
 * gates against it, through `applyGate` itself: a probe that counted hits its
 * own way would prove nothing about the gate it probes.
 *
 * `dir` is written to - hand it a throwaway copy of the fixture.
 */
export function probeManifest(m: EvalManifest, dir: string, skeleton: string): ProbedGate[] {
  const baseline = snapshotRepo(dir);
  // An absence gate can fail for two opposite reasons, and only one of them is
  // the manifest's: the fixture plants what the gate forbids (real signal - the
  // agent has to remove it), or the probe's own deliverable landed where the
  // gate said nothing may. Grading each gate before writing tells them apart.
  const pristine: GateContext = { repoDir: dir, transcript: "", exitCode: 0, baseline };
  const failedPristine = new Set(m.gates.filter((g) => applyGate(g, pristine) !== null));

  for (const path of deliverablePaths(m)) write(dir, path, `${skeleton}\n`);
  for (const gate of m.gates) {
    if (gate.kind !== "file_matching") continue;
    const path = matchingPath(gate.args.pattern ?? "");
    if (path) write(dir, path, `${skeleton}\n`);
  }

  // The agent that writes a deliverable also says it, so the transcript carries
  // the same vocabulary; a transcript gate keyed on template wording has the
  // same disease as a grep on the file.
  const ctx: GateContext = { repoDir: dir, transcript: skeleton, exitCode: 0, baseline };

  return m.gates.map((gate) => {
    const label = gateLabel(gate);
    if (gate.kind === "file_matching" && !matchingPath(gate.args.pattern ?? "")) {
      return { kind: gate.kind, label, verdict: "unprobed" as const, failure: `no path synthesizable from /${gate.args.pattern}/` };
    }
    const failure = applyGate(gate, ctx);
    const production = PRODUCTION_GATES.has(gate.kind);
    // A path-keyed gate that passes is shallow, not format: an empty artifact
    // in the right place satisfies it, but putting it there is an act rather
    // than a word, and the acts these gates ask for are measurably not free.
    const passedKind: ProbeVerdict = gate.kind === "file_matching" ? "shallow" : "format";
    const verdict: ProbeVerdict = failure === null
      ? (production ? passedKind : "trivial")
      : (production || failedPristine.has(gate) ? "content" : "unprobed");
    return { kind: gate.kind, label, verdict, failure };
  });
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const reports: ProbeReport[] = [];
  let unchecked = 0;

  for (const ref of discoverManifests(ROOT)) {
    if (only && ref.skill !== only) continue;
    const m = parseEvalManifest(ref, readFileSync(ref.path, "utf8"));
    const fixtureDir = join(ROOT, "playground", "fixtures", m.fixture);
    if (!existsSync(fixtureDir)) { unchecked++; continue; }
    const skeleton = formatSkeleton(join(ROOT, SUBJECT.dir, m.skill));
    const gates = withPristineFixture(fixtureDir, (dir) => probeManifest(m, dir, skeleton));
    reports.push({ id: m.id, skill: m.skill, fixture: m.fixture, skeleton: skeleton.length, gates, tier: m.tier });
  }

  const formatGates = reports.flatMap((r) => r.gates.filter((g) => g.verdict === "format"));
  for (const report of reports) {
    const format = report.gates.filter((g) => g.verdict === "format");
    if (!format.length) continue;
    console.log(`${report.id}  (${report.skeleton} B of template)`);
    for (const gate of format) console.log(`  ✗ ${gate.label}`);
  }

  const shallow = reports.flatMap((r) => r.gates.filter((g) => g.verdict === "shallow"));
  for (const gate of shallow) console.log(`~ shallow  ${gate.label} - an empty artifact at the right path passes it`);
  const content = reports.flatMap((r) => r.gates.filter((g) => g.verdict === "content")).length;
  const unprobed = reports.flatMap((r) => r.gates.filter((g) => g.verdict === "unprobed"));
  // A skill with no template of its own leaves the probe nothing to write, so
  // its gates come back "content" for want of a deliverable rather than on
  // merit. Say how many manifests are in that position instead of counting
  // their gates as measured.
  const templateless = reports.filter((r) => r.skeleton === 0).map((r) => r.id);
  console.log(`\n${formatGates.length} format gate(s) across ${reports.length} manifest(s), ${content} gate(s) survive the probe`);
  if (unprobed.length) console.log(`! ${unprobed.length} gate(s) unprobed: ${unprobed.map((g) => g.label).join(", ")}`);
  if (templateless.length) console.log(`! ${templateless.length} skill(s) prescribe no format, so their gates were probed against an empty deliverable: ${templateless.join(", ")}`);
  if (unchecked) console.log(`! ${unchecked} manifest(s) skipped - run playground/setup.ts`);

  const mustBlock = blocking(reports);
  if (mustBlock.length) {
    console.log(`\n✗ ${mustBlock.length} manifest(s) claim a tier that may publish a verdict while carrying a format gate: ${mustBlock.map((r) => r.id).join(", ")}`);
  }
  if (args.includes("--strict") && mustBlock.length) process.exit(1);
}
