#!/usr/bin/env tsx
/**
 * Vacuity checks of the eval lint: a manifest whose checks all hold before the
 * agent runs measures nothing, and a gate keyed on a path the fixture does not
 * have passes for free whatever the agent did. Plus the two ways a manifest
 * looks measured while measuring nothing: an answer-only exemption taken
 * without the tier that admits it, and a gate that cites no exit condition.
 */
import { test, assert, contains, initWork, finish, WORK } from "./helpers.js";
import { parseEvalManifest } from "../tools/eval.js";
import { citationFindings, deadCommitRefs, doNothingFindings, exitConditionLines, exitCoverage, vacuousGates, withPristineFixture, type LeakFinding } from "../tools/eval-lint.js";
import type { EvalTier } from "../tools/eval.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

/** A throwaway git repo standing in for a materialised fixture. */
const pristine = (name: string): string => {
  const dir = join(WORK, `fixture-${name}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
import { join } from "node:path";

initWork();

/** A tiny pristine repo: one source file, no deliverable, no answer key. */
function tinyFixture(name: string): string {
  const dir = join(WORK, name);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "app.ts"), "export const app = 1\n");
  return dir;
}

const RAW = (yaml: string) => `fixture: a\nprompt: >\n  p\n${yaml}`;
const manifest = (yaml: string) => parseEvalManifest("x", RAW(yaml));
/** A manifest kept beside the text it was parsed from: citations live in the comments. */
const withRaw = (yaml: string) => ({ m: manifest(yaml), raw: RAW(yaml) });

test("doNothingFindings errors when every check holds on the pristine fixture", () => {
  const dir = tinyFixture("do-nothing-all");
  const m = manifest('gates:\n  - grep_zero: { pattern: "zzz", in: "src" }\n  - repo_clean: { except: "R.md" }\n');

  const errors = doNothingFindings(m, dir).filter((f) => f.severity === "error");
  assert(errors.length === 1, `one manifest-level error expected, got ${JSON.stringify(errors)}`);
  contains(errors[0].message, "the do-nothing agent passes x", "names the skill it indicts");
  contains(errors[0].message, "grep_zero", "lists the gates that passed for free");
});

test("doNothingFindings stays silent when a gate fails on the pristine fixture", () => {
  const dir = tinyFixture("do-nothing-measured");
  const m = manifest('gates:\n  - grep_zero: { pattern: "zzz", in: "src" }\n  - grep_min: { pattern: "describe", in: "src", count: "1" }\n');

  assert(doNothingFindings(m, dir).length === 0, `a failing gate makes the manifest measure something: ${JSON.stringify(doNothingFindings(m, dir))}`);
});

test("doNothingFindings stays silent when a precondition fails on the pristine fixture", () => {
  // The deliverable is missing, so the run is not indistinguishable from work.
  const dir = tinyFixture("do-nothing-precondition");
  const m = manifest('preconditions:\n  - file_exists: "REPORT.md"\ngates:\n  - repo_clean: { except: "REPORT.md" }\n');

  assert(doNothingFindings(m, dir).length === 0, `an unmet precondition is not a do-nothing pass: ${JSON.stringify(doNothingFindings(m, dir))}`);
});

test("doNothingFindings warns on an absence gate keyed on a path the fixture lacks", () => {
  const dir = tinyFixture("guessed-path-warn");
  writeFileSync(join(dir, "REPORT.md"), "already here\n");
  const m = manifest('gates:\n  - grep_zero: { pattern: "@nestjs", in: "src/users/domain" }\n  - file_exists: "REPORT.md"\n');

  const warnings = doNothingFindings(m, dir).filter((f) => f.severity === "warn");
  assert(warnings.length === 1, `the guessed path must warn, got ${JSON.stringify(doNothingFindings(m, dir))}`);
  contains(warnings[0].message, "src/users/domain", "names the path the fixture does not have");
});

test("doNothingFindings errors when that guessed path is the manifest's only gate", () => {
  const dir = tinyFixture("guessed-path-only");
  const m = manifest('gates:\n  - grep_zero: { pattern: "@nestjs", in: "src/users/domain" }\n');

  const findings = doNothingFindings(m, dir);
  assert(findings.every((f) => f.severity === "error"), `the sole gate leaves no other signal: ${JSON.stringify(findings)}`);
  assert(findings.some((f) => f.message.includes("passes for free")), "the guessed path is reported as an error");
});

test("doNothingFindings leaves alone an absence gate scoped to a path the fixture has", () => {
  const dir = tinyFixture("scoped-path");
  const m = manifest('gates:\n  - grep_zero: { pattern: "console\\\\.log", in: "src" }\n  - grep_min: { pattern: "app", in: "src", count: "5" }\n');

  assert(doNothingFindings(m, dir).length === 0, `a real fixture path is not a guessed one: ${JSON.stringify(doNothingFindings(m, dir))}`);
});

/**
 * The answer-only exemption. A skill whose deliverable is a VERDICT - is this
 * diff ready to commit, can this ticket be closed - produces no file to grep,
 * so no gate of its own can fail on the untouched fixture. The annotation
 * makes that visible and states what the judge carries instead; it must not
 * buy anything else, and it only buys that much alongside the tier that admits
 * the manifest has no mechanical signal.
 */
const ANSWER_ONLY = "tier: probed\n# answer-only: the deliverable is a verdict - repo_clean is the invariant\n";

test("an answer-only annotation exempts the whole-manifest do-nothing error", () => {
  const dir = tinyFixture("answer-only-exempt");
  const m = manifest('gates:\n  - repo_clean: { except: "" }\n');

  const findings = doNothingFindings(m, dir, ANSWER_ONLY);
  assert(findings.length === 0, `the annotated manifest measures its invariant: ${JSON.stringify(findings)}`);
  assert(doNothingFindings(m, dir).length === 1, "the same manifest without the annotation still errors");
});

test("an answer-only annotation with no stated reason exempts nothing", () => {
  const dir = tinyFixture("answer-only-bare");
  const m = manifest('gates:\n  - repo_clean: { except: "" }\n');

  const findings = doNothingFindings(m, dir, "# answer-only:\n");
  assert(findings.length === 1, `an unjustified annotation is not an exemption: ${JSON.stringify(findings)}`);
});

test("an answer-only annotation does not silence a gate keyed on a missing path", () => {
  const dir = tinyFixture("answer-only-guessed");
  const m = manifest('gates:\n  - grep_zero: { pattern: "@nestjs", in: "src/users/domain" }\n');

  const findings = doNothingFindings(m, dir, ANSWER_ONLY);
  assert(findings.length === 1, `the guessed path survives the exemption: ${JSON.stringify(findings)}`);
  contains(findings[0].message, "passes for free", "the guessed-path finding is the one left standing");
});

test("an answer-only annotation does not silence a vacuous production gate", () => {
  const dir = tinyFixture("answer-only-vacuous");
  const m = manifest('gates:\n  - grep_min: { pattern: "app", in: "src", count: "1" }\n');

  const vacuity = vacuousGates(m, dir);
  assert(vacuity.length === 1, `vacuousGates ignores the annotation entirely: ${JSON.stringify(vacuity)}`);
  assert(doNothingFindings(m, dir, ANSWER_ONLY).length === 0, "only the do-nothing error is exempted");
});

test("an answer-only annotation on a manifest claiming a causal tier is no exemption", () => {
  const dir = tinyFixture("answer-only-measured");
  const m = manifest('gates:\n  - repo_clean: { except: "" }\n');

  for (const tier of ["measured", "anchor"]) {
    const raw = ANSWER_ONLY.replace("tier: probed", `tier: ${tier}`);
    const findings = doNothingFindings(m, dir, raw);
    assert(findings.length === 1, `${tier} + answer-only must be reported: ${JSON.stringify(findings)}`);
    assert(findings[0].severity === "error", `${tier} publishes a causal verdict from no mechanical signal`);
    contains(findings[0].message, tier, "names the tier that contradicts the annotation");
    contains(findings[0].message, "the do-nothing agent passes x", "still says what the manifest fails to separate");
  }
});

test("an answer-only annotation with no declared tier exempts, but warns", () => {
  const dir = tinyFixture("answer-only-untiered");
  const m = manifest('gates:\n  - repo_clean: { except: "" }\n');

  const findings = doNothingFindings(m, dir, "# answer-only: the deliverable is a verdict\n");
  assert(findings.length === 1 && findings[0].severity === "warn", `an untiered exemption is visible, not silent: ${JSON.stringify(findings)}`);
  contains(findings[0].message, "tier: probed", "says exactly what the manifest owes");
});

test("file_absent raises no guessed-path finding: the missing path IS the gate", () => {
  const dir = tinyFixture("file-absent-scope");
  const m = manifest('gates:\n  - file_absent: "GLOSSARY.md"\n  - grep_min: { pattern: "describe", in: "src", count: "1" }\n');

  const findings = doNothingFindings(m, dir);
  assert(findings.length === 0, `a file_absent gate is green by construction, not by accident: ${JSON.stringify(findings)}`);
});

test("the do-nothing error names the scenario id, not the bare skill", () => {
  const dir = tinyFixture("do-nothing-scenario");
  const ref = { skill: "x", scenario: "s", id: "x/s", path: "skills/x/evals/s.eval.yaml" };
  const m = parseEvalManifest(ref, 'fixture: a\nprompt: >\n  p\ngates:\n  - repo_clean: { except: "R.md" }\n');

  const findings = doNothingFindings(m, dir);
  contains(findings[0].message, "x/s", "two scenarios of one skill must produce distinguishable findings");
});

test("withPristineFixture hides the ground truth the trial image strips", () => {
  const dir = tinyFixture("pristine-copy");
  writeFileSync(join(dir, "EXPECTED.md"), "the answer key\n");

  const seen = withPristineFixture(dir, (copy) => ({
    expected: existsSync(join(copy, "EXPECTED.md")),
    source: existsSync(join(copy, "src", "app.ts")),
  }));
  assert(!seen.expected, "EXPECTED.md never enters the image, so the lint must not see it");
  assert(seen.source, "the rest of the fixture is copied verbatim");
});

test("withPristineFixture cleans up its copy", () => {
  const dir = tinyFixture("pristine-cleanup");
  const copy = withPristineFixture(dir, (d) => d);
  assert(!existsSync(copy), "the temporary copy is removed once the checks are done");
});


/**
 * Gate citations. docs/evaluating-skills.md makes it a rule that a gate keys on
 * the skill's own exit condition; until now nothing checked it. Each gate names
 * the line it derives from, and the lint reads that line back out of SKILL.md -
 * no model call, so it runs inside `npm test`.
 */
const SKILL_MD = [
  "## Workflow",
  "- [ ] Zero code changes here belong to another section",
  "",
  "## Exit condition",
  "",
  "- [ ] **Zero code changes**, zero commits during the sweep",
  '- [ ] Report filled with evidence - verdict given (never "it should work")',
  "",
  "## Tooling",
  "- [ ] gitleaks installed",
].join("\n");
const EXIT = exitConditionLines(SKILL_MD);

test("exitConditionLines reads the exit condition and nothing around it", () => {
  assert(EXIT.length === 2, `only the two checklist lines of the section: ${JSON.stringify(EXIT)}`);
  assert(EXIT.some((l) => l.includes("zero commits during the sweep")), "the checkbox and the bold markers are stripped");
  assert(!EXIT.some((l) => l.includes("gitleaks")), "a later section is not part of the exit condition");
});

test("a line introducing the checklist is not one of its promises", () => {
  const md = ["## Exit condition", "", "The audit is complete when:", "", "- [ ] All 15 questions scored", "- [ ] Report saved"].join("\n");

  const lines = exitConditionLines(md);
  assert(lines.length === 2, `a lead-in promises nothing: ${JSON.stringify(lines)}`);
  assert(!lines.some((l) => l.includes("complete when")), "the sentence that introduces the list is not a line to cover");
});

test("a promise stated as prose is still a promise", () => {
  const md = ["## Exit condition", "", "- [ ] Every box ticked", "", "A missing box = no commit."].join("\n");

  const lines = exitConditionLines(md);
  assert(lines.length === 2 && lines[1] === "a missing box = no commit", `only a trailing colon marks a lead-in: ${JSON.stringify(lines)}`);
});

test("a gate citing a line of the exit condition raises nothing", () => {
  const { m, raw } = withRaw('gates:\n  # from-exit: Zero code changes, zero commits during the sweep\n  - repo_clean: { except: "" }\n');

  const findings = citationFindings(m, raw, EXIT);
  assert(findings.length === 0, `the citation checks out: ${JSON.stringify(findings)}`);
});

test("a gate citing nothing warns while the manifest claims no causal tier", () => {
  const { m, raw } = withRaw('gates:\n  - repo_clean: { except: "" }\n');

  const findings = citationFindings(m, raw, EXIT);
  assert(findings.length === 1 && findings[0].severity === "warn", `untiered, so a warning: ${JSON.stringify(findings)}`);
  contains(findings[0].message, "from-exit", "says how to cite");
});

test("the same uncited gate is an error once the manifest declares a causal tier", () => {
  const { m, raw } = withRaw('tier: measured\ngates:\n  - repo_clean: { except: "" }\n');

  const findings = citationFindings(m, raw, EXIT);
  assert(findings.length === 1 && findings[0].severity === "error", `a measured verdict must show where its gate comes from: ${JSON.stringify(findings)}`);
});

test("a citation attaches to the gate below it, not to the block", () => {
  const { m, raw } = withRaw('tier: measured\ngates:\n  # from-exit: Zero code changes, zero commits during the sweep\n  - repo_clean: { except: "" }\n  - grep_min: { pattern: "verdict", in: "src", count: "1" }\n');

  const findings = citationFindings(m, raw, EXIT);
  assert(findings.length === 1, `the second gate is uncited: ${JSON.stringify(findings)}`);
  contains(findings[0].message, "grep_min", "names the gate that cites nothing");
  assert(!findings[0].message.includes("repo_clean"), "the cited gate is not reported");
});

test("a citation naming no line of the exit condition is an error whatever the tier", () => {
  const { m, raw } = withRaw('gates:\n  # from-exit: every finding carries a severity and an owner\n  - repo_clean: { except: "" }\n');

  const findings = citationFindings(m, raw, EXIT);
  assert(findings.length === 1 && findings[0].severity === "error", `an invented citation is a false claim: ${JSON.stringify(findings)}`);
  contains(findings[0].message, "severity and an owner", "quotes what was cited");
});

test("a citation too short to identify a line is an error", () => {
  const { m, raw } = withRaw('gates:\n  # from-exit: zero\n  - repo_clean: { except: "" }\n');

  const findings = citationFindings(m, raw, EXIT);
  assert(findings.length === 1 && findings[0].severity === "error", `one word cites a word, not a line: ${JSON.stringify(findings)}`);
});

test("a skill stating no exit condition says the check cannot answer, not that it passed", () => {
  const { m, raw } = withRaw('gates:\n  - repo_clean: { except: "" }\n');

  const findings = citationFindings(m, raw, []);
  assert(findings.length === 1, `still one finding: ${JSON.stringify(findings)}`);
  contains(findings[0].message, "no exit condition", "the missing section is the reason, and it is stated");
});



/**
 * Exit-condition coverage. A manifest CITES the line a check derives from, and
 * nothing asked the reverse question: is every line of the promise checked by
 * something. So an author picked what to gate and the uncovered promises went
 * invisible - `writing-robust-tests` had "seen red then green" counted by a
 * gate that a suite run twice green satisfies exactly as well.
 */
const ROBUST_MD = [
  "## Exit condition",
  "",
  "- [ ] Project conventions reused (neighboring test read)",
  "- [ ] data-testid added to the components touched, page object created/updated",
  "- [ ] ZERO hard waits, zero fragile locator, zero timing coupling",
  "- [ ] Each test seen red (mutation) then green",
  '- [ ] Suite run, output pasted in the summary - never "it should pass"',
  "",
  "## Tooling",
  "- [ ] npm test",
].join("\n");
const ROBUST_EXIT = exitConditionLines(ROBUST_MD);

const source = (id: string, raw: string, tier: EvalTier = "probed") => ({ id, tier, raw });
const uncovered = (findings: LeakFinding[]) => findings.filter((f) => f.check.startsWith("exit line"));

test("exitConditionLines reads all five promises of the worked example", () => {
  assert(ROBUST_EXIT.length === 5, `five lines expected: ${JSON.stringify(ROBUST_EXIT)}`);
});

test("every exit line no check cites is reported, one finding per line", () => {
  const raw = 'gates:\n  # from-exit: Suite run, output pasted in the summary\n  - grep_min: { pattern: "pass [0-9]+", in: "TESTING.md", count: "1" }\n';

  const findings = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]).findings;
  assert(uncovered(findings).length === 4, `four of five promises are unchecked: ${JSON.stringify(findings)}`);
  assert(findings.every((f) => f.severity === "warn"), "a probed manifest publishes no verdict, so this is information");
  contains(uncovered(findings).map((f) => f.message).join("\n"), "each test seen red (mutation) then green", "names the line nobody checks");
});

test("a citation cut short of the line it quotes still covers it", () => {
  const raw = 'gates:\n  # from-exit: Suite run, output pasted in the summary\n  - grep_min: { pattern: "pass [0-9]+", in: "TESTING.md", count: "1" }\n';

  const lines = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]).lines;
  const suite = lines.find((l) => l.line.startsWith("suite run"));
  assert(suite?.covered, `the truncated quote is the same promise: ${JSON.stringify(lines)}`);
});

test("a citation quoting the line inside a longer passage covers it", () => {
  // The shape the base actually writes: a trajectory check cites a Protocol
  // step and names the exit line it serves, on a continuation comment line.
  const raw = [
    "trajectory:",
    "  # from-skill(tooling): 5. Mandatory evidence: the test can fail - run ->",
    "  # green; break the code under test -> red; restore -> green",
    "  # (exit: Each test seen red (mutation) then green)",
    '  - observed: { of: "test", matches: "fail [1-9]", then_matches: "fail 0" }',
  ].join("\n");

  const lines = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]).lines;
  const mutation = lines.find((l) => l.line.startsWith("each test seen red"));
  assert(mutation?.covered, `a multi-line citation is one citation: ${JSON.stringify(lines)}`);
});

test("a paraphrase sharing no wording covers nothing - the false negative this rule accepts", () => {
  const raw = 'trajectory:\n  # from-skill(trap): tests never run = tests not written\n  - tool_used: { name: "Bash", arg: "npm test" }\n';

  const findings = uncovered(exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]).findings);
  assert(findings.length === 5, `a reworded citation is not read as a quote: ${JSON.stringify(findings)}`);
});

test("half a line covers the whole line - the false positive this rule accepts", () => {
  // "Project conventions reused" is three significant words and a real prefix
  // of the promise, so it counts; "neighboring test read" goes unchecked and
  // this rule cannot see it. Over-reporting coverage stops here, at the price
  // of a citation floor, and the alternative - demanding the whole line - would
  // reject every truncated quote in the base.
  const raw = 'gates:\n  # from-exit: Project conventions reused\n  - grep_min: { pattern: "helper", in: "test", count: "1" }\n';

  const lines = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]).lines;
  assert(lines.find((l) => l.line.startsWith("project conventions"))?.covered, "a substantial truncation covers");
});

test("a citation of fewer than three significant words covers nothing", () => {
  const raw = 'gates:\n  # from-exit: Suite run\n  - grep_min: { pattern: "pass [0-9]+", in: "TESTING.md", count: "1" }\n';

  const lines = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]).lines;
  assert(!lines.find((l) => l.line.startsWith("suite run"))?.covered, "two words name a word, not a promise");
});

test("a promise below the citation floor is covered by quoting it whole", () => {
  // "Argued priority" carries two significant words; the floor that stops one
  // word from citing any line would otherwise make such a promise permanently
  // unchecked, which is a rule nobody can obey rather than a rule.
  const exitLines = exitConditionLines("## Exit condition\n- [ ] Argued priority\n- [ ] Report saved");
  const whole = 'gates:\n  # from-exit: Argued priority\n  - grep_min: { pattern: "priority", in: "T.md", count: "1" }\n';
  const half = 'gates:\n  # from-exit: priority\n  - grep_min: { pattern: "priority", in: "T.md", count: "1" }\n';

  assert(exitCoverage(exitLines, [source("x/core", whole)]).lines[0].covered, "the whole line is unambiguous");
  assert(!exitCoverage(exitLines, [source("x/core", half)]).lines[0].covered, "one word of it is still one word");
});

test("coverage is computed per skill: three scenarios share one exit condition", () => {
  const core = 'gates:\n  # from-exit: Suite run, output pasted in the summary\n  - grep_min: { pattern: "pass [0-9]+", in: "T.md", count: "1" }\n';
  const hard = 'gates:\n  # from-exit: Each test seen red (mutation) then green\n  - repo_clean: { in: "src" }\n';

  const findings = uncovered(exitCoverage(ROBUST_EXIT, [source("wrt/core", core), source("wrt/hard", hard)]).findings);
  assert(findings.length === 3, `neither scenario alone has to carry all five: ${JSON.stringify(findings)}`);
  assert(!findings.some((f) => f.message.includes("suite run")), "a line covered by one scenario is covered for the skill");
});

test("an uncovered promise is an error once any scenario claims a causal tier", () => {
  const raw = 'gates:\n  # from-exit: Suite run, output pasted in the summary\n  - grep_min: { pattern: "pass [0-9]+", in: "T.md", count: "1" }\n';

  const findings = uncovered(exitCoverage(ROBUST_EXIT, [source("wrt/core", raw), source("wrt/hard", raw, "measured")]).findings);
  assert(findings.length === 4 && findings.every((f) => f.severity === "error"), `a verdict about the skill owes its promises: ${JSON.stringify(findings)}`);
  contains(findings[0].message, "measured", "says which claim raised the bar");
});

test("an uncoverable annotation carrying a reason retires the line", () => {
  const raw = [
    "# uncoverable(data-testid added to the components touched): the world is a",
    "# Node service - it has no components and no page objects",
    'gates:\n  # from-exit: Suite run, output pasted in the summary\n  - grep_min: { pattern: "pass [0-9]+", in: "T.md", count: "1" }',
  ].join("\n");

  const { lines, findings } = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]);
  const testid = lines.find((l) => l.line.startsWith("data-testid"));
  assert(testid?.exempt, `the annotation retires the line: ${JSON.stringify(lines)}`);
  contains(testid?.exempt ?? "", "Node service", "the reason travels with the exemption");
  assert(!uncovered(findings).some((f) => f.message.includes("data-testid")), "an admitted line is not reported as a gap");
  assert(uncovered(findings).length === 3, `the other three are still owed: ${JSON.stringify(findings)}`);
});

test("an uncoverable annotation with no reason exempts nothing", () => {
  const raw = "# uncoverable(data-testid added to the components touched):\ngates:\n  - repo_clean: { in: \"src\" }\n";

  const { lines, findings } = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]);
  assert(!lines.find((l) => l.line.startsWith("data-testid"))?.exempt, "a bare marker is not an argument");
  assert(findings.some((f) => f.severity === "error" && f.check.startsWith("uncoverable")), `the empty annotation is reported: ${JSON.stringify(findings)}`);
});

test("an uncoverable annotation naming no exit line is an error", () => {
  const raw = "# uncoverable(every finding carries an owner): nobody owns anything here\ngates:\n  - repo_clean: { in: \"src\" }\n";

  const findings = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]).findings;
  const invented = findings.filter((f) => f.check.startsWith("uncoverable"));
  assert(invented.length === 1 && invented[0].severity === "error", `an exemption for a promise the skill never made: ${JSON.stringify(findings)}`);
  contains(invented[0].message, "every finding carries an owner", "quotes what was claimed uncoverable");
});

test("prose below a citation block is not part of the citation", () => {
  const raw = [
    "gates:",
    "  # from-exit: Suite run, output pasted in the summary",
    "  #",
    "  # Not gated here: ZERO hard waits, zero fragile locator, zero timing coupling",
    '  - grep_min: { pattern: "pass [0-9]+", in: "T.md", count: "1" }',
  ].join("\n");

  const lines = exitCoverage(ROBUST_EXIT, [source("wrt/core", raw)]).lines;
  assert(!lines.find((l) => l.line.startsWith("zero hard waits"))?.covered, "commentary about a line is not a check on it");
});

test("a skill stating no exit condition yields no coverage finding", () => {
  const findings = exitCoverage([], [source("x/core", 'gates:\n  - repo_clean: { in: "src" }\n')]).findings;
  assert(findings.length === 0, `nothing to cover, and citationFindings already says so: ${JSON.stringify(findings)}`);
});

finish("eval-lint");

test("a prompt naming a commit the fixture cannot resolve is an error, not a warning", () => {
  // Found on 2026-09-04: all three `merge-request-review` manifests opened with
  // "Commit 8f22028 is the change under review". No such object exists in the
  // materialised world - `setup.ts` pins the commit author but not the date, so
  // every regeneration produces different ids. The agent would have searched
  // for something that is not there and returned a null result, which reads
  // exactly like "the skill does not help".
  //
  // That is the expensive failure mode: an unrunnable scenario costs a full
  // paired run to discover and looks like a finding when it arrives.
  const repo = pristine("commit-ref");
  execSync("git init -q && git commit -q --allow-empty -m 'feat: the change'", { cwd: repo, stdio: "ignore" });
  const real = execSync("git rev-parse --short HEAD", { cwd: repo, encoding: "utf8" }).trim();

  const dead = deadCommitRefs(`prompt: >\n  Commit 8f22028 is the change under review.\n`, repo);
  assert(dead.length === 1, `one dead reference expected, got ${JSON.stringify(dead)}`);
  contains(dead[0], "8f22028", "the failure names the id nobody can resolve");

  assert(deadCommitRefs(`prompt: >\n  Commit ${real} is the change.\n`, repo).length === 0,
    "an id the fixture does resolve is fine");
  assert(deadCommitRefs(`prompt: >\n  Write the outcome to REVIEW.md, 1234567 lines at most.\n`, repo).length === 1,
    "a bare seven-digit number reads as an id and must be reported rather than guessed at");
});

test("only the prompt is searched for commit ids, never the comments", () => {
  // A comment block legitimately quotes the id it is talking about while the
  // prompt names the commit by subject. Reading comments would make the fix
  // impossible to write.
  const repo = pristine("commit-ref-comments");
  execSync("git init -q && git commit -q --allow-empty -m 'feat: x'", { cwd: repo, stdio: "ignore" });
  const manifest = `# The subject is 8f22028 refactor(payroll): pull it out\nprompt: >\n  The commit "refactor(payroll): pull it out" is the change under review.\n`;
  assert(deadCommitRefs(manifest, repo).length === 0, "a commit id in a comment is documentation, not an instruction");
});
