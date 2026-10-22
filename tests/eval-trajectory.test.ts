#!/usr/bin/env tsx
/**
 * The trajectory checker: what an agent DID, graded from the ATIF trajectory.
 *
 * Every case here corresponds to a claim a skill makes that a repository
 * snapshot cannot hold. The final tree is identical whether the history was
 * read first or last, whether the prescribed script was run or skipped, whether
 * fifty steps were spent or five.
 */
import { test, assert, contains, initWork, finish } from "./helpers.js";
import { applyTrajectoryCheck, parseTrajectory, type Trajectory } from "../tools/eval-trajectory.js";
import { parseEvalManifest } from "../tools/eval.js";

initWork();

const traj = (steps: unknown[]): Trajectory => parseTrajectory(JSON.stringify({ steps }));

const step = (name: string, args: Record<string, unknown>, message = "") =>
  ({ source: "agent", message, tool_calls: [{ function_name: name, arguments: args }] });

/**
 * A `before` check, built through one factory rather than inline.
 *
 * `then` is the manifest grammar's own key for the second act - the design
 * writes `before: { first: "git log", then: "edit:build.config.json" }` - so it
 * cannot be renamed here without the test asserting a shape no manifest uses.
 * Written inline it trips `noThenProperty`, which reads any literal `then:` as
 * a thenable; through the shorthand it does not, and the key stays the one the
 * 93 manifests declare.
 */
const before = (first: string, then: string) => ({ kind: "before", args: { first, then } });

const RUN: Trajectory = traj([
  { source: "user", message: "the nightly job keeps failing" },
  step("Bash", { command: "npx tsx scripts/detect-recurring-fixes.ts ." }),
  step("Bash", { command: "git log --oneline -20 -- content/markets/" }),
  step("Read", { file_path: "build.config.json" }),
  step("Edit", { file_path: "build.config.json", new_string: '"markets": ["cs-CZ"]' }),
  { source: "agent", message: "done" },
]);

test("tool_used sees a script the skill prescribes, wherever it was invoked from", () => {
  // The skill's `Tooling` section names a script. Whether it ran is invisible in
  // the tree - the script only reads.
  assert(applyTrajectoryCheck({ kind: "tool_used", args: { name: "detect-recurring-fixes" } }, RUN) === null,
    "the prescribed script was run");
  const missed = applyTrajectoryCheck({ kind: "tool_used", args: { name: "sweep.ts" } }, RUN);
  assert(missed !== null, "a script that never ran must fail");
  contains(missed ?? "", "sweep.ts", "the failure names what was looked for");
});

test("tool_used counts, so 'ran it once while flailing' is separable from 'used it'", () => {
  assert(applyTrajectoryCheck({ kind: "tool_used", args: { name: "git log", min: "2" } }, RUN) !== null,
    "one occurrence must not satisfy a floor of two");
});

test("tool_absent catches the forbidden act, which leaves no trace in the tree", () => {
  // `detection-sweep` forbids commits outright; a commit is invisible in a
  // snapshot diff taken against the same baseline.
  assert(applyTrajectoryCheck({ kind: "tool_absent", args: { name: "git commit" } }, RUN) === null,
    "no commit was made");
  const committed = traj([step("Bash", { command: "git commit -m 'wip'" })]);
  assert(applyTrajectoryCheck({ kind: "tool_absent", args: { name: "git commit" } }, committed) !== null,
    "a commit must fail the check");
});

test("before is the check no snapshot can replace: it grades the ORDER", () => {
  // "Context to gather (before acting)" is an ordering claim. Both runs below
  // end with the same tree.
  const ok = before("git log", "build.config.json");
  assert(applyTrajectoryCheck(ok, RUN) === null, "history read before the edit");

  const backwards = traj([
    step("Edit", { file_path: "build.config.json", new_string: "x" }),
    step("Bash", { command: "git log --oneline" }),
  ]);
  const failure = applyTrajectoryCheck(ok, backwards);
  assert(failure !== null, "acting first must fail, though the tree is identical");
  contains(failure ?? "", "after", "the failure says which way round it went");
});

test("before fails loudly when the first action never happened at all", () => {
  // Silence would read as "the order was respected", which is the opposite of
  // what a never-gathered context means.
  const never = traj([step("Edit", { file_path: "build.config.json", new_string: "x" })]);
  const failure = applyTrajectoryCheck(before("git log", "build.config.json"), never);
  assert(failure !== null, "a missing first action fails rather than passes");
  contains(failure ?? "", "never", "and says it never happened");
});

test("step_budget bounds the flailing a skill is supposed to prevent", () => {
  assert(applyTrajectoryCheck({ kind: "step_budget", args: { max: "10" } }, RUN) === null, "6 steps is under 10");
  const over = applyTrajectoryCheck({ kind: "step_budget", args: { max: "3" } }, RUN);
  assert(over !== null, "6 steps must fail a budget of 3");
  contains(over ?? "", "6", "the failure states the count");
});

test("a trajectory that could not be read fails every check rather than passing them", () => {
  // The silent-pass failure mode: a trial whose trajectory is missing must not
  // score as a trial that did everything right.
  const empty = parseTrajectory("not json at all");
  assert(applyTrajectoryCheck({ kind: "tool_absent", args: { name: "git commit" } }, empty) !== null,
    "even an absence check fails on an unreadable trajectory");
});

test("the anchor manifest's trajectory checks parse and run against a real shape", () => {
  const m = parseEvalManifest("x", `fixture: incident
prompt: >
  p
trajectory:
  - tool_used: { name: "detect-recurring-fixes", min: "1" }
  - tool_absent: { name: "git commit" }
`);
  for (const check of m.trajectory) {
    assert(applyTrajectoryCheck(check, RUN) === null, `${check.kind} should hold on the model run`);
  }
});

// --- Reading a file is an act, and the fixture plants its evidence in files ---

test("read_file sees the dedicated tool and a shell read alike", () => {
  // The `incident` world puts the refutation of its decoys in two documents.
  // Whether the agent opened them is the discriminator no gate can reach: the
  // tree is identical either way, and a report can cite a document it never
  // read. An agent reads with Read, and just as often with cat, grep, sed or
  // head - a check that only knows the tool measures the harness, not the work.
  const withTool = traj([step("Read", { file_path: "ops/publish-runs.md" })]);
  const withShell = traj([step("Bash", { command: "sed -n 1,40p ops/publish-runs.md" })]);
  const withGrep = traj([step("Bash", { command: "grep -n held ops/publish-runs.md" })]);
  const check = { kind: "read_file", args: { path: "ops/publish-runs.md" } };

  for (const [label, t] of [["Read", withTool], ["sed", withShell], ["grep", withGrep]] as const) {
    assert(applyTrajectoryCheck(check, t) === null, `a ${label} read must count`);
  }
  const never = traj([step("Read", { file_path: "build.config.json" })]);
  const failure = applyTrajectoryCheck(check, never);
  assert(failure !== null, "a file never opened must fail");
  contains(failure ?? "", "publish-runs.md", "the failure names the file");
});

test("read_file does not count a mere mention of the path in prose", () => {
  // The trajectory version of the format gate: an agent that writes the
  // filename into its postmortem has not read it. Only an action counts.
  const talked = traj([{ source: "agent", message: "per ops/publish-runs.md the peak has risen" }]);
  assert(applyTrajectoryCheck({ kind: "read_file", args: { path: "ops/publish-runs.md" } }, talked) !== null,
    "naming a file is not opening it");
});

test("read_file does not count writing to the file as reading it", () => {
  // Writing is a different act and often the wrong one - `detection-sweep`
  // forbids touching code at all while requiring it be read.
  const wrote = traj([step("Write", { file_path: "ops/backlog.md", content: "x" })]);
  assert(applyTrajectoryCheck({ kind: "read_file", args: { path: "ops/backlog.md" } }, wrote) !== null,
    "a write is not a read");
});

test("wrote_file sees an edit through any of the writing tools", () => {
  for (const s of [
    step("Write", { file_path: "POSTMORTEM.md", content: "x" }),
    step("Edit", { file_path: "POSTMORTEM.md", new_string: "x" }),
  ]) {
    assert(applyTrajectoryCheck({ kind: "wrote_file", args: { path: "POSTMORTEM.md" } }, traj([s])) === null,
      "every writing tool counts");
  }
  assert(applyTrajectoryCheck({ kind: "wrote_file", args: { path: "POSTMORTEM.md" } }, RUN) !== null,
    "a file never written must fail");
});

test("tool_used can require a tool AND what it was pointed at", () => {
  // "Ran grep" and "ran grep for the thing that matters" are different claims.
  const scoped = { kind: "tool_used", args: { name: "Bash", arg: "detect-recurring-fixes" } };
  assert(applyTrajectoryCheck(scoped, RUN) === null, "the tool and its argument both matched");
  const wrong = { kind: "tool_used", args: { name: "Read", arg: "detect-recurring-fixes" } };
  assert(applyTrajectoryCheck(wrong, RUN) !== null, "the right argument under the wrong tool must not count");
});

// --- What a command RETURNED, not only that it ran ------------------------

const outcome = (cmd: string, out: string) => ({
  source: "agent", message: "",
  tool_calls: [{ tool_call_id: cmd + out, function_name: "Bash", arguments: { command: cmd } }],
  observation: { results: [{ source_call_id: cmd + out, content: out }] },
});

test("observed reads the output of a command, so a red run is separable from a green one", () => {
  // `writing-robust-tests` promises "each test seen red (mutation) then green".
  // The tree cannot hold that: it shows a passing suite either way. Counting
  // two runs of the suite - what the manifest did - does not hold it either: a
  // run twice green counts the same as red then green.
  const red = traj([outcome("npm test", "# fail 1\n# pass 3")]);
  assert(applyTrajectoryCheck({ kind: "observed", args: { of: "npm test", matches: "# fail [1-9]" } }, red) === null,
    "a failing run is visible in what the command returned");
  const green = traj([outcome("npm test", "# fail 0\n# pass 4")]);
  assert(applyTrajectoryCheck({ kind: "observed", args: { of: "npm test", matches: "# fail [1-9]" } }, green) !== null,
    "a passing run must not satisfy a check for a failing one");
});

test("observed with then_matches is the red-then-green claim, in order", () => {
  const redThenGreen = traj([
    outcome("npm test", "# fail 1\n# pass 3"),
    outcome("npm test", "# fail 0\n# pass 4"),
  ]);
  const check = { kind: "observed", args: { of: "npm test", matches: "# fail [1-9]", then_matches: "# fail 0" } };
  assert(applyTrajectoryCheck(check, redThenGreen) === null, "red then green holds");

  const greenOnly = traj([outcome("npm test", "# fail 0"), outcome("npm test", "# fail 0")]);
  const never = applyTrajectoryCheck(check, greenOnly);
  assert(never !== null, "a suite that was never seen failing must fail the check");
  contains(never ?? "", "never", "and the failure says the red run never happened");

  const backwards = traj([
    outcome("npm test", "# fail 0\n# pass 4"),
    outcome("npm test", "# fail 1\n# pass 3"),
  ]);
  const wrongWay = applyTrajectoryCheck(check, backwards);
  assert(wrongWay !== null, "green then red is not the discipline, it is a regression");
});

test("observed ignores the output of a different command", () => {
  // A `git log` that happens to print the word "fail" is not a test run.
  const noise = traj([outcome("git log --oneline", "abc123 fix: 1 failing test")]);
  assert(applyTrajectoryCheck({ kind: "observed", args: { of: "npm test", matches: "fail" } }, noise) !== null,
    "the output is only read for the command the check names");
});

finish("eval-trajectory");
