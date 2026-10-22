#!/usr/bin/env tsx
/**
 * Leakage lint for the eval manifests.
 *
 * A gate only measures a skill if an agent could plausibly miss it. When the
 * prompt already hands over what the gate keys on - the deliverable path, the
 * literal a grep looks for - the check is satisfiable by reading the prompt,
 * so it stays green with or without the skill and can carry no signal about it.
 * Declared `preconditions:` are exempt: giving them away is their purpose.
 *
 *   npx tsx tools/eval-lint.ts
 *
 * It also checks the two ways a manifest can look measured while measuring
 * nothing: an `# answer-only:` exemption taken without the tier that admits the
 * manifest has no mechanical signal, and a gate that cites no line of the
 * skill's exit condition.
 *
 * Zero dependencies, no agent call: this runs in CI like any other lint.
 */
import { readFileSync, existsSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
import { parseEvalManifest, discoverManifests, applyGate, snapshotRepo, type EvalGate, type EvalManifest, type EvalTier, type GateContext } from "./eval.js";

/**
 * The tiers a manifest can publish a causal verdict from - the same pair
 * `tools/eval-report.ts` grades by, restated here because a lint must not
 * import the reporting stack to know what "measured" costs.
 */
const CAUSAL_TIERS: EvalTier[] = ["anchor", "measured"];

export interface LeakFinding {
  severity: "error" | "warn";
  check: string;
  message: string;
}

/** Words too common to mean anything when a prompt and a criterion share them. */
const STOP = new Set(["the", "and", "for", "with", "that", "this", "each", "from", "into",
  "every", "any", "not", "all", "are", "its", "their", "must", "should", "when", "then",
  "src", "docs", "test", "tests", "file", "files"]);

const significantWords = (s: string): string[] =>
  [...new Set((s.toLowerCase().match(/[\p{L}\d_]{4,}/gu) ?? []).filter((w) => !STOP.has(w)))];

/** Share of a criterion's distinctive words the prompt already contains. */
const CRITERION_OVERLAP_WARN = 0.5;

/**
 * Whether a gate can be satisfied by copying the prompt. `grep_zero` and
 * `grep_min` cannot: they assert an outcome - an absence to produce, a floor to
 * reach - that naming the subject in the prompt does not hand over. Gating on
 * repo state (`repo_clean`, `exit_ok`) is likewise unleakable.
 */
const LEAKABLE = new Set(["file_exists", "file_absent", "file_matching", "grep_count", "transcript_contains", "transcript_absent"]);

interface Literal { text: string; exactOnly: boolean }

/** The literal a gate keys on, or null when nothing about it can leak. */
function gateLiteral(gate: EvalGate): Literal | null {
  if (!LEAKABLE.has(gate.kind)) return null;
  if (gate.kind === "file_exists" || gate.kind === "file_absent") {
    // A path leaks only when written out: a prompt asking to "build the domain
    // glossary" has not handed over GLOSSARY.md.
    return { text: basename(gate.args.value ?? ""), exactOnly: true };
  }
  if (gate.kind === "grep_count" || gate.kind === "file_matching") {
    // Strip the regex machinery: what could leak is the plain text inside it.
    return { text: (gate.args.pattern ?? "").replace(/\\+/g, "").replace(/[.*+?^${}()|[\]]/g, " ").trim(), exactOnly: false };
  }
  return { text: gate.args.value ?? "", exactOnly: false };
}

/**
 * Walks the `gates:` block, yielding each comment line and then the gate item
 * it sits above, so an annotation is always read against one gate.
 */
function* gateSectionLines(raw: string): Generator<{ line: string; index: number; isGate: boolean }> {
  let section = "";
  let index = -1;

  for (const line of raw.split("\n")) {
    if (/^\w[\w-]*:/.test(line)) section = line.split(":")[0];
    if (section !== "gates") continue;
    if (/^\s*#/.test(line)) { yield { line, index, isGate: false }; continue; }
    if (!/^ {2}- /.test(line)) continue;
    index++;
    yield { line, index, isGate: true };
  }
}

/**
 * Indices of gates carrying a `# leak-ok: <reason>` comment on the line above.
 * Some leaks are irreducible - the prop to rename, the required data-testid -
 * and an annotated exception keeps them visible instead of silencing the lint.
 */
function annotatedGates(raw: string): Set<number> {
  const exempt = new Set<number>();
  let annotated = false;

  for (const { line, index, isGate } of gateSectionLines(raw)) {
    if (!isGate) { annotated ||= /#\s*leak-ok\b/.test(line); continue; }
    if (annotated) exempt.add(index);
    annotated = false;
  }
  return exempt;
}

/**
 * Whether the manifest declares itself answer-only, with a reason.
 *
 * A skill whose deliverable is a VERDICT rather than a file - "is this diff
 * ready to commit", "can this ticket be closed" - has nothing to grep, so no
 * gate of its own can fail on the untouched fixture, and `doNothingFindings`
 * indicts it forever. The annotation is the sanctioned way to say so:
 *
 *     tier: probed
 *     # answer-only: the deliverable is a verdict, not a file - repo_clean is the invariant
 *
 * It must carry a reason (a bare `# answer-only:` exempts nothing), it exempts
 * ONLY the whole-manifest do-nothing error, and it leaves the per-gate guessed
 * path, the vacuity check and the leakage check untouched. Anything wider would
 * be silencing the lint rather than answering it.
 */
export function answerOnly(raw: string): boolean {
  return raw.split("\n").some((line) => /^\s*#\s*answer-only:\s*\S/.test(line));
}

/**
 * The tier the manifest states, or null when it states none. Read from the text
 * rather than from the parsed manifest on purpose: the parser defaults an
 * untiered manifest to `probed`, which is the right thing to grade by and the
 * wrong thing to accept as an admission - the question here is whether somebody
 * said it. An unknown value never reaches here: the parser rejects it first.
 */
export function declaredTier(raw: string): EvalTier | null {
  const declared = /^tier:\s*(\S+)\s*$/m.exec(raw);
  return declared ? (declared[1] as EvalTier) : null;
}

/** What the answer-only annotation is worth on this manifest, if anything. */
type AnswerOnlyVerdict = "none" | "admitted" | "undeclared" | "contradicted";

/**
 * An answer-only annotation says the manifest has no mechanical signal. Used
 * alone it silenced the do-nothing error three times in one session, on the
 * three manifests whose only gate is `repo_clean` - a green lint over checks
 * that cannot separate the arms (found 2026-09-02). So the exemption now costs
 * the matching admission in the grammar the report grades by: `tier: probed`,
 * which withholds the causal verdict the annotation cannot support.
 *
 * Declaring `measured` or `anchor` alongside it is the contradiction the
 * incident was made of, and errors. Declaring nothing still exempts - an
 * untiered manifest publishes no verdict either - but warns, so the annotation
 * is never invisible, and it turns into an error the day a tier is claimed.
 */
function answerOnlyVerdict(raw: string): AnswerOnlyVerdict {
  if (!answerOnly(raw)) return "none";
  const tier = declaredTier(raw);
  if (!tier) return "undeclared";
  return CAUSAL_TIERS.includes(tier) ? "contradicted" : "admitted";
}

export function leakageFindings(m: EvalManifest, raw = ""): LeakFinding[] {
  const prompt = m.prompt.toLowerCase();
  const exempt = raw ? annotatedGates(raw) : new Set<number>();
  const findings: LeakFinding[] = [];

  for (const [index, gate] of m.gates.entries()) {
    const literal = gateLiteral(gate);
    if (!literal || literal.text.length < 4 || exempt.has(index)) continue;

    // Whole-string containment misses a literal the regex stripping reshaped
    // (`console\.log` becomes `console log`), so fall back to its own words -
    // except for paths, where only the name written out counts.
    const parts = significantWords(literal.text);
    const given = prompt.includes(literal.text.toLowerCase())
      || (!literal.exactOnly && parts.length > 0 && parts.every((w) => prompt.includes(w)));
    if (!given) continue;

    findings.push({
      severity: "error",
      check: `${gate.kind}: ${literal.text}`,
      message: `the prompt already names "${literal.text}" - move it to preconditions, annotate it with "# leak-ok: <reason>", or stop naming it in the prompt`,
    });
  }

  for (const { text: criterion } of m.judge?.criteria ?? []) {
    const words = significantWords(criterion);
    if (!words.length) continue;
    const shared = words.filter((w) => prompt.includes(w));
    if (shared.length / words.length < CRITERION_OVERLAP_WARN) continue;
    findings.push({
      severity: "warn",
      check: `judge: ${criterion}`,
      message: `the prompt echoes ${shared.length}/${words.length} of its words (${shared.join(", ")})`,
    });
  }

  return findings;
}

/**
 * Gates that demand something be PRODUCED. The others assert an absence -
 * `repo_clean`, `file_absent`, `grep_zero` hold on a pristine fixture by
 * design, because they check that the agent did not overstep.
 */
const PRODUCTION_GATES = new Set(["file_exists", "file_matching", "grep_min", "grep_count"]);

/**
 * Gates already satisfied by the fixture before the agent runs. Such a gate
 * cannot separate anything: it is green whatever happens, which is the static
 * twin of a saturated baseline and costs nothing to detect.
 */
export function vacuousGates(m: EvalManifest, fixtureDir: string): LeakFinding[] {
  const ctx: GateContext = { repoDir: fixtureDir, transcript: "", exitCode: 0, baseline: snapshotRepo(fixtureDir) };
  return m.gates
    .filter((g) => PRODUCTION_GATES.has(g.kind) && applyGate(g, ctx) === null)
    .map((g) => ({
      severity: "error" as const,
      check: `${g.kind}: ${g.args.value ?? g.args.pattern ?? ""}`,
      message: "already true of the fixture before the agent runs - it cannot measure anything",
    }));
}

/**
 * The fixture's ground truth, written for the eval author. `eval-tasks.ts`
 * strips it from the image, so a lint reading the fixture must not see it
 * either - a grep that only hits the answer key is not a hit the agent faces.
 */
const GROUND_TRUTH = "EXPECTED.md";

/** Runs `fn` against a throwaway copy of the fixture, shaped like the image. */
/**
 * Commit ids a manifest's PROMPT names that its fixture cannot resolve.
 *
 * All three `merge-request-review` manifests opened with "Commit 8f22028 is the
 * change under review" and no such object existed: `setup.ts` pins the commit
 * author but not the date, so every regeneration produces different ids. The
 * agent searches for something that is not there and returns a null result,
 * which reads exactly like "the skill does not help" - the expensive failure,
 * because it costs a full paired run to find and arrives looking like a result.
 *
 * Only the prompt is read. A comment block legitimately quotes the id it
 * discusses while the prompt names the commit by its subject, which is the
 * stable way to point at one and the shape the fix took.
 */
export function deadCommitRefs(raw: string, fixtureDir: string): string[] {
  const prompt = /^prompt: >\n((?:[ \t]+.*\n)+)/m.exec(raw)?.[1] ?? "";
  const candidates = new Set(prompt.match(/\b[0-9a-f]{7,40}\b/g) ?? []);
  const dead: string[] = [];
  for (const id of candidates) {
    const r = spawnSync("git", ["-C", fixtureDir, "cat-file", "-t", id], { encoding: "utf8" });
    if (r.status !== 0) dead.push(`${id}: no such object in the fixture`);
  }
  return dead;
}

export function withPristineFixture<T>(fixtureDir: string, fn: (dir: string) => T): T {
  const dir = join(mkdtempSync(join(tmpdir(), "ronce-racine-lint-")), basename(fixtureDir));
  cpSync(fixtureDir, dir, { recursive: true, filter: (src) => basename(src) !== GROUND_TRUTH });
  try {
    return fn(dir);
  } finally {
    rmSync(dirname(dir), { recursive: true, force: true });
  }
}

/**
 * Gates asserting an ABSENCE over a SCOPE. They hold on a pristine fixture by
 * design, so they are exempt from `vacuousGates` - and are exactly the ones
 * that can hide a guessed path, since a scope that does not exist has nothing
 * to match. `file_absent` is not one of them: the path it names must be
 * missing for the gate to mean anything, so warning about it would fire on
 * every legitimate use.
 */
const ABSENCE_GATES = new Set(["grep_zero", "repo_clean"]);

/** Gates whose scope is a fixture path, so a wrong guess is detectable. */
const SCOPED_GATES = new Set(["grep_zero", "grep_count", "grep_min", "repo_clean"]);

/** The fixture path a gate keys on, or null when it names none. */
function keyedPath(gate: EvalGate): string | null {
  return SCOPED_GATES.has(gate.kind) ? (gate.args.in ?? null) : null;
}

/** A gate in one line, whichever of its argument shapes carries the meaning. */
const gateLabel = (gate: EvalGate): string => {
  const subject = gate.args.value ?? gate.args.pattern
    ?? (gate.args.except ? `except ${gate.args.except}` : undefined) ?? gate.args.in ?? "";
  return subject ? `${gate.kind}: ${subject}` : gate.kind;
};

/**
 * Checks that hold on the untouched fixture, taken as a whole. A manifest whose
 * preconditions AND gates all pass before anything runs scores an agent that
 * produced no file at all exactly like one that did the work: it separates
 * nothing, and no amount of paired trials will make it.
 *
 * The per-gate warning catches the same disease one gate at a time: an absence
 * gate scoped to a path the fixture does not have is green for free, because
 * a run that never creates that path has nothing to match. `grep_zero` on
 * `src/users/domain` in a fixture with no such directory is the shape that
 * passed a do-nothing agent in a real paired run (found 2026-09-02).
 */
export function doNothingFindings(m: EvalManifest, repoDir: string, raw = ""): LeakFinding[] {
  const ctx: GateContext = { repoDir, transcript: "", exitCode: 0, baseline: snapshotRepo(repoDir) };
  const passes = (gate: EvalGate): boolean => applyGate(gate, ctx) === null;
  const findings: LeakFinding[] = [];

  if (m.gates.length > 0 && [...m.preconditions, ...m.gates].every(passes)) {
    const passing = `the do-nothing agent passes ${m.id}: ${m.gates.map(gateLabel).join(", ")}`;
    const verdict = answerOnlyVerdict(raw);
    if (verdict === "none") {
      findings.push({
        severity: "error",
        check: `do-nothing: ${m.gates.length} gate(s)`,
        message: `${passing} - the manifest cannot distinguish work from no work`,
      });
    } else if (verdict === "contradicted") {
      findings.push({
        severity: "error",
        check: `answer-only: tier ${declaredTier(raw)}`,
        message: `${passing}, and the answer-only annotation admits it has no mechanical signal - "tier: ${declaredTier(raw)}" publishes a causal verdict from that; declare "tier: probed" or give the manifest a gate that can fail`,
      });
    } else if (verdict === "undeclared") {
      findings.push({
        severity: "warn",
        check: `answer-only: ${m.gates.length} gate(s)`,
        message: `${passing}, exempted by the answer-only annotation - declare "tier: probed" so the admission is in the grammar the report grades by; an error the day this manifest claims ${CAUSAL_TIERS.join(" or ")}`,
      });
    }
  }

  for (const gate of m.gates) {
    if (!ABSENCE_GATES.has(gate.kind) || !passes(gate)) continue;
    const path = keyedPath(gate);
    if (!path || existsSync(join(repoDir, path))) continue;
    findings.push({
      // Another gate carrying real signal makes this a smell; alone, it is the
      // whole verdict, and the manifest measures nothing at all.
      severity: m.gates.length === 1 ? "error" : "warn",
      check: gateLabel(gate),
      message: `gate keys on a path the fixture does not have (${path}); a run that never creates it passes for free`,
    });
  }
  return findings;
}

/**
 * Markdown stripped down to its words, so a citation and the line it claims to
 * come from compare on content rather than on formatting: the checkbox, the
 * bold markers and the trailing punctuation are not part of the promise.
 */
const flatten = (s: string): string =>
  s.replace(/^\s*[-*]\s*\[[ xX]\]\s*/, "").replace(/[`*_"]/g, "").replace(/\s+/g, " ").trim().toLowerCase().replace(/[.:;,]+$/, "");

/**
 * The lines of a skill's `## Exit condition` section, flattened for comparison.
 * Empty when the skill states none - the citation check then has nothing to
 * check against and says so, rather than passing every gate for free.
 */
export function exitConditionLines(skillMarkdown: string): string[] {
  const lines: string[] = [];
  let inside = false;

  for (const line of skillMarkdown.split("\n")) {
    if (/^##\s/.test(line)) { inside = /^##\s+exit condition/i.test(line); continue; }
    if (!inside || !line.trim()) continue;
    // "The audit is complete when:" introduces the checklist and promises
    // nothing, so it is not a line a check can be owed for. A trailing colon is
    // the whole tell - a promise written as prose ("A missing box = no commit")
    // keeps its place, and four of them are live lines in this base.
    if (line.trim().endsWith(":")) continue;
    lines.push(flatten(line));
  }
  return lines;
}

/** How a gate names the exit-condition line it derives from. */
const CITATION = /#\s*from-exit:\s*(\S.*?)\s*$/;

/** The citation attached to each gate, by gate index. */
function gateCitations(raw: string): Map<number, string> {
  const cited = new Map<number, string>();
  let pending: string | null = null;

  for (const { line, index, isGate } of gateSectionLines(raw)) {
    if (!isGate) { pending ??= CITATION.exec(line)?.[1] ?? null; continue; }
    if (pending) cited.set(index, pending);
    pending = null;
  }
  return cited;
}

/**
 * A citation shorter than this names a word, not a line: "zero" appears in half
 * the checklists in the base and would let any gate cite any skill.
 */
const MIN_CITATION_WORDS = 3;

/**
 * Whether each gate says which promise it comes from.
 *
 * docs/evaluating-skills.md already rules that a gate must key on the skill's
 * own exit condition, and nothing enforced it: a gate can be green, unleaked,
 * non-vacuous, and still measure something the skill never promised. Each gate
 * names the line it derives from, and the lint reads that line back out of the
 * skill - no model call, so it runs inside `npm test`:
 *
 *     gates:
 *       # from-exit: Zero code changes, zero commits during the sweep
 *       - repo_clean: { except: "" }
 *
 * Severity follows the tier, because that is what the citation underwrites: a
 * manifest publishing a causal verdict (`anchor`, `measured`) must show where
 * its gates come from, while a probed or untiered one - which publishes no
 * verdict - is warned. That is what keeps the requirement landable on a base
 * where no manifest cites anything yet: it starts biting per manifest, the day
 * that manifest claims a tier. An invented citation errors at any tier: it is
 * a false statement about the skill, not a missing one.
 */
export function citationFindings(m: EvalManifest, raw: string, exitLines: readonly string[]): LeakFinding[] {
  if (!m.gates.length) return [];
  const cited = gateCitations(raw);
  const findings: LeakFinding[] = [];
  const uncited: string[] = [];

  for (const [index, gate] of m.gates.entries()) {
    const citation = cited.get(index);
    if (!citation) { uncited.push(gateLabel(gate)); continue; }
    if (!exitLines.length) continue;

    const vague = significantWords(citation).length < MIN_CITATION_WORDS;
    const found = exitLines.some((line) => line.includes(flatten(citation)));
    if (!vague && found) continue;
    findings.push({
      severity: "error",
      check: gateLabel(gate),
      message: vague
        ? `cites "${citation}", too short to identify a line of the exit condition`
        : `cites "${citation}", which no line of the skill's exit condition contains - a gate must key on what the skill promises`,
    });
  }

  if (uncited.length) {
    const causal = CAUSAL_TIERS.includes(m.tier);
    const missing = exitLines.length
      ? `no "# from-exit: <exit-condition line>" above ${uncited.join(", ")}`
      : `${uncited.join(", ")} cite nothing, and the skill states no exit condition to cite - the check cannot answer its question`;
    findings.push({
      severity: causal ? "error" : "warn",
      check: `citations: ${uncited.length}/${m.gates.length} gate(s)`,
      message: `${missing}: a gate that cites nothing cannot be shown to measure what the skill promises${causal ? "" : ` (an error once this manifest declares tier: ${CAUSAL_TIERS.join(" or ")})`}`,
    });
  }
  return findings;
}

/**
 * A check saying which line it derives from: `# from-exit: <line>` above a
 * gate, `# from-skill(<dimension>): <line>` above a trajectory check. Both are
 * read here, and the tag decides nothing - what makes a citation cover an exit
 * line is whether it names that line, not which section its author had in mind.
 */
const CITATION_MARKER = /#\s*from-(?:exit|skill\([a-z]+\)):\s*(\S.*)$/;

/**
 * The sanctioned way to say a promise cannot be checked HERE:
 *
 *     # uncoverable(data-testid added to the components touched): the world is
 *     # a Node service - it has no components and no page objects
 *
 * It names the line and carries a REASON, like `# leak-ok:` and
 * `# answer-only:`. A bare marker retires nothing, and a marker naming a line
 * the skill never promised errors at any tier: `visual-regression-check` needs
 * a browser the container has not got and `ci-pipeline-orchestration` acts on a
 * live pipeline, which are arguments; "this one is hard" is not one.
 */
const UNCOVERABLE_MARKER = /#\s*uncoverable\((.*)\):\s*(.*)$/;

const COMMENT_LINE = /^\s*#\s?(.*)$/;

interface CommentBlock { kind: "citation" | "uncoverable"; subject: string; reason: string }

/**
 * The citation and exemption blocks of a manifest, each continued over the
 * contiguous comment lines below it and ENDING at a bare `#` - which is how the
 * base already separates a citation from the commentary that argues it. Prose
 * below that separator is not a citation, so a comment merely MENTIONING a
 * promise never counts as checking it.
 */
function commentBlocks(raw: string): CommentBlock[] {
  const blocks: CommentBlock[] = [];
  let open: CommentBlock | null = null;

  for (const line of raw.split("\n")) {
    const comment = COMMENT_LINE.exec(line);
    const uncoverable = comment ? UNCOVERABLE_MARKER.exec(line) : null;
    const citation = comment && !uncoverable ? CITATION_MARKER.exec(line) : null;

    if (uncoverable) open = { kind: "uncoverable", subject: uncoverable[1], reason: uncoverable[2] };
    else if (citation) open = { kind: "citation", subject: citation[1], reason: "" };
    else if (open && comment?.[1].trim()) {
      // A citation wraps onto the next comment line as often as not, and the
      // exit line it names is sometimes on that continuation.
      if (open.kind === "citation") open.subject += ` ${comment[1].trim()}`;
      else open.reason += ` ${comment[1].trim()}`;
      continue;
    } else { open = null; continue; }
    blocks.push(open);
  }
  return blocks;
}

/**
 * Whether a citation names a given exit-condition line.
 *
 * The same relation `citationFindings` validates, read from the other side:
 * containment either way, over flattened text, above the citation floor. A
 * quote cut short of its line still names it (`Suite run, output pasted in the
 * summary` for a line that goes on `- never "it should pass"`), and a line
 * quoted inside a longer passage - a trajectory check citing a Protocol step
 * and naming the exit line it serves - names it too.
 *
 * Both error directions are real and deliberately asymmetric:
 *
 * - FALSE NEGATIVE (reports a covered line as uncovered): a citation that
 *   REWORDS its line shares no substring with it and covers nothing. That is
 *   the direction to be wrong in - the cost is a visible complaint an author
 *   answers by quoting the line, and word-overlap scoring was rejected because
 *   it makes any citation cover any line of the same skill.
 * - FALSE POSITIVE (reports an unchecked promise as checked): a citation of
 *   HALF a line covers the whole line. `Project conventions reused` clears the
 *   three-word floor and retires a line whose second half - `(neighboring test
 *   read)` - nothing checks. Demanding the whole line would reject most of the
 *   314 citations in this base, which is how a rule gets weakened instead of
 *   obeyed; the floor is what bounds the damage.
 */
function citationNames(citation: string, exitLine: string): boolean {
  const quote = flatten(citation);
  // Five lines in this base carry two significant words once the stop list is
  // applied - "Argued priority", "No application file modified", "A missing box
  // = no commit". The floor would make them uncoverable BY CONSTRUCTION, and a
  // requirement nobody can satisfy is a requirement that gets weakened. Quoting
  // such a line whole is unambiguous, which is what the floor was protecting.
  if (significantWords(quote).length < MIN_CITATION_WORDS) return quote === exitLine;
  return exitLine.includes(quote) || quote.includes(exitLine);
}

/** One manifest, as exit coverage reads it: what it claims, and what it says. */
export interface ScenarioSource { id: string; tier: EvalTier; raw: string }

/** One promise of a skill, and what became of it. */
export interface CoveredLine { line: string; covered: boolean; exempt: string | null }

export interface ExitCoverageReport { lines: CoveredLine[]; findings: LeakFinding[] }

/**
 * Whether every line of a skill's `## Exit condition` is checked by something.
 *
 * The citation rule asks whether a check comes from the skill; this asks the
 * reverse, and only the pair makes the exit condition the source of truth. The
 * asymmetry was load-bearing in practice: `writing-robust-tests` counted "each
 * test seen red then green" with a gate a suite run twice green passes just as
 * well, and nothing said which of its other four promises were measured,
 * because nothing asked.
 *
 * COVERAGE IS PER SKILL, not per scenario. `core`, `hard` and `limit` are three
 * questions against ONE exit condition, and a `limit` scenario is about
 * restraint - requiring it to cover five lines alone would push gates into the
 * scenario that exists to measure their absence, which is the Goodhart move
 * this repository forbids. The union is also what the claim being made is
 * about: a verdict is published about a SKILL.
 *
 * SEVERITY FOLLOWS THE TIER, as the citation and answer-only rules do. A
 * A check is anything carrying a citation - a gate, a trajectory check, or a
 * judge criterion with a `# from-exit:` line above it. The grammar is the same
 * everywhere, so a promise the judge carries is recorded the same way as one a
 * grep carries.
 *
 * `anchor` it claims the right to a verdict about that skill, and a promise
 * nobody checks undermines it.
 */
export function exitCoverage(exitLines: readonly string[], sources: readonly ScenarioSource[]): ExitCoverageReport {
  // No section to be the source of truth: `citationFindings` already says the
  // check cannot answer its question, and saying it twice adds nothing.
  if (!exitLines.length) return { lines: [], findings: [] };

  const findings: LeakFinding[] = [];
  const citations: string[] = [];
  const exempt = new Map<string, string>();

  for (const source of sources) {
    for (const block of commentBlocks(source.raw)) {
      if (block.kind === "citation") { citations.push(block.subject); continue; }
      const reason = block.reason.trim();
      const named = exitLines.filter((line) => citationNames(block.subject, line));
      if (!reason) {
        findings.push({
          severity: "error",
          check: `uncoverable: ${block.subject}`,
          message: `${source.id} retires a promise without saying why - "# uncoverable(<line>): <reason>" carries the argument, a bare marker exempts nothing`,
        });
      } else if (!named.length) {
        findings.push({
          severity: "error",
          check: `uncoverable: ${block.subject}`,
          message: `${source.id} exempts "${block.subject}", which no line of the skill's exit condition contains - an exemption for a promise the skill never made`,
        });
      } else {
        for (const line of named) exempt.set(line, reason);
      }
    }
  }

  const lines = exitLines.map((line) => ({
    line,
    covered: citations.some((citation) => citationNames(citation, line)),
    exempt: exempt.get(line) ?? null,
  }));

  const causal = sources.find((s) => CAUSAL_TIERS.includes(s.tier));
  for (const [index, entry] of lines.entries()) {
    if (entry.covered || entry.exempt) continue;
    const claim = causal ? ` - ${causal.id} declares tier: ${causal.tier}, so this promise is owed` : "";
    findings.push({
      severity: causal ? "error" : "warn",
      check: `exit line ${index + 1}/${lines.length}`,
      message: `no gate and no trajectory check cites "${entry.line}": ${sources.length} manifest(s) measure nothing about it${claim} - cite it from a check, or retire it with "# uncoverable(<the line>): <reason>"`,
    });
  }
  return { lines, findings };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  let errors = 0;
  let warnings = 0;
  let vacuousSkills = 0;
  let uncitedSkills = 0;
  let unchecked = 0;
  /** Every scenario of a skill, plus its promises: coverage is a per-skill question. */
  const bySkill = new Map<string, { exitLines: string[]; sources: ScenarioSource[] }>();

  for (const ref of discoverManifests()) {
    const raw = readFileSync(ref.path, "utf8");
    const manifest = parseEvalManifest(ref, raw);
    const findings = leakageFindings(manifest, raw);

    const skillMd = join(ROOT, "skills", manifest.skill, "SKILL.md");
    const exitLines = existsSync(skillMd) ? exitConditionLines(readFileSync(skillMd, "utf8")) : [];
    const citations = citationFindings(manifest, raw, exitLines);
    const skillEntry = bySkill.get(manifest.skill) ?? { exitLines, sources: [] };
    skillEntry.sources.push({ id: manifest.id, tier: manifest.tier, raw });
    bySkill.set(manifest.skill, skillEntry);
    // The whole base is uncited until the fixtures are rebuilt, so the per-gate
    // warning is counted and summarized rather than printed: thirty-six
    // identical blocks would bury the errors this lint exists to show. An
    // errored citation - invented, or owed by a manifest claiming a tier -
    // still prints in full, under its own manifest.
    const owed = citations.filter((f) => f.severity === "warn");
    if (owed.length) uncitedSkills++;
    warnings += owed.length;
    findings.push(...citations.filter((f) => f.severity === "error"));

    // Needs the materialized fixture; skip rather than fail when the playground
    // has not been generated, so the leak check still runs on its own.
    const fixtureDir = join(ROOT, "playground", "fixtures", manifest.fixture);
    if (existsSync(fixtureDir)) {
      const vacuity = withPristineFixture(fixtureDir, (dir) => [
        ...vacuousGates(manifest, dir),
        ...doNothingFindings(manifest, dir, raw),
      ]);
      if (vacuity.length) vacuousSkills++;
      findings.push(...vacuity);

      // An unrunnable scenario at any tier: the agent is sent after an object
      // that is not there, and the null result it returns reads as a finding.
      // Checked against the materialised fixture rather than the definition,
      // because ids only exist once the history has been replayed.
      for (const dead of deadCommitRefs(raw, fixtureDir)) {
        findings.push({ severity: "error", check: "prompt", message: `the prompt names a commit this fixture cannot resolve - ${dead}` });
      }
    } else {
      unchecked++;
    }

    if (!findings.length) continue;
    console.log(ref.id);
    for (const f of findings) {
      console.log(`  ${f.severity === "error" ? "✗" : "!"} ${f.check}\n      ${f.message}`);
      if (f.severity === "error") errors++;
      else warnings++;
    }
  }

  // The reverse of the citation rule, and the half that was missing: a gate
  // cites a line, and until now nothing asked whether every line had a check.
  // Reported per skill, after the per-manifest pass, because the three
  // scenarios of a skill answer three questions against one exit condition.
  let skillsWithGaps = 0;
  let uncoveredLines = 0;
  let exitConditions = 0;
  for (const [skill, { exitLines, sources }] of bySkill) {
    if (!exitLines.length) continue;
    exitConditions++;
    const { lines, findings } = exitCoverage(exitLines, sources);
    const gaps = lines.filter((l) => !l.covered && !l.exempt).length;
    uncoveredLines += gaps;
    if (gaps) skillsWithGaps++;
    if (!findings.length) continue;
    console.log(`${skill} (exit condition)`);
    for (const f of findings) {
      console.log(`  ${f.severity === "error" ? "✗" : "!"} ${f.check}\n      ${f.message}`);
      if (f.severity === "error") errors++;
      else warnings++;
    }
  }
  console.log(uncoveredLines
    ? `! ${skillsWithGaps}/${exitConditions} exit condition(s) have line(s) no check cites - ${uncoveredLines} line(s) in total`
    : `✓ every line of all ${exitConditions} exit condition(s) is cited by a check`);

  // A missing fixture silently disables the vacuity check, which is the one
  // check whose absence looks exactly like a pass. Say so instead.
  const skipped = unchecked ? ` (${unchecked} skipped - run playground/setup.ts)` : "";
  console.log(vacuousSkills
    ? `! ${vacuousSkills} manifest(s) contain a check the untouched fixture already satisfies${skipped}`
    : `✓ no manifest passes on its own untouched fixture${skipped}`);
  console.log(uncitedSkills
    ? `! ${uncitedSkills} manifest(s) have gate(s) citing no exit-condition line - a warning until the manifest declares tier: ${CAUSAL_TIERS.join(" or ")}, an error after`
    : "✓ every gate cites the exit-condition line it derives from");

  if (errors) {
    console.error(`\n✗ ${errors} check(s) measure nothing${warnings ? `, ${warnings} warning(s)` : ""}`);
    process.exit(1);
  }
  console.log(`✓ no gate leaks its oracle into the prompt${warnings ? ` (${warnings} warning(s))` : ""}`);
}
