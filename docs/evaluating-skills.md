# Evaluating the prose skills

Prose cannot be unit-tested, so a skill declares in a manifest how an agent
following it should be judged, and two runners read that manifest. Most skills
carry three - `skills/<skill>/evals/{core,hard,limit}.eval.yaml` - and the
handful that carry a single `skills/<skill>/eval.yaml` say in it why. This page
is ordered by what you are trying to do.

1. [Which tool answers which question](#1-which-tool-answers-which-question)
2. [What a fixture has to contain](#2-what-a-fixture-has-to-contain)
3. [What gets graded, and when](#3-what-gets-graded-and-when)
4. [Writing a manifest](#4-writing-a-manifest)
5. [Running a paired measurement](#5-running-a-paired-measurement)
6. [Reading a report](#6-reading-a-report)
7. [Never move the target to make the test pass](#never-move-the-target-to-make-the-test-pass)
8. [Findings log](#findings-log)

## 1. Which tool answers which question

| Question | Tool | Cost |
|---|---|---|
| Does this skill still produce its deliverable? | `tools/eval.ts run` | one agent run per skill |
| Is the agent better with the skill than without? | Harbor, paired arms | a container, N pairs per skill |
| Did the agent DO what the skill prescribes? | `tools/eval-judge.ts`, post-pass | one judge call per trial |
| Does the manifest measure anything at all? | `npm run eval:lint`, `npm run eval:dry` | none |
| Do its gates measure work, or only vocabulary? | `npm run eval:probe` | none |

`tools/eval.ts` plays a skill through headless `claude -p` inside a throwaway
fixture and verdicts the result: mechanical gates first (from the skill's exit
conditions), an adjunct LLM judge for what stays subjective. What the tree
cannot hold - which script was run, what was read before acting, what was
deliberately not done - is graded in a post-pass from the trajectory:
[part 3](#3-what-gets-graded-and-when).
Design: [the spec](superpowers/specs/2026-07-20-skill-eval-harness-design.md).

    npx tsx playground/setup.ts        # materialize the fixtures once
    npm run eval:dry                         # what CI runs: setup + parse every manifest
    npx tsx tools/eval.ts run --dry-run      # the same parse, without regenerating the fixtures
    npx tsx tools/eval.ts run --only detection-sweep   # one skill, real agent run (API cost)
    npx tsx tools/eval.ts run                # full run - before a release only

The runner installs the skill under test into the fixture through the real CLI
(`install --yes --pick skill:<name>`), so an eval also exercises the
distribution path, and a skill absent from the catalog cannot be evaluated.

Caveat, measured 2026-08-24: `claude -p` inherits the operator's `~/.claude`.
On a machine where this toolkit is also installed globally, the skill under test
is already available to the agent, so the install step does not decide whether
it is reachable. A run therefore proves that the skill still works, not that the
installer put it there - and a "without the skill" arm is not achievable this
way. Isolating the agent (a fresh config dir, or a container) is a prerequisite
for any comparative measurement.

Real runs need the `claude` CLI on PATH (or `EVAL_CLAUDE_BIN`); they are never
part of the public CI. Verdicts: PASS · FAIL(gate) · JUDGE-FAIL(criterion,
marked `~`, non-deterministic) · ERROR(infra - never treated as a regression).

"Is Claude better with it than without" needs a container, and
[Harbor](https://github.com/laude-institute/harbor) provides one: see
[part 5](#5-running-a-paired-measurement).

## 2. What a fixture has to contain

Read this before writing a manifest. A manifest cannot be better than the
repository it runs against, and the base spent its first months learning that
the expensive way.

### The failure this section exists to prevent

The ten fixtures this harness started with held between 6 and 33 lines of code
each. One of them, 15 lines, was the target of eleven manifests. The
consequence is narrower than "they were small":

> On a fifteen-line project there is nothing for a gate to key on except the
> wording of the deliverable. Every gate becomes a format gate, and a format
> gate is passed by any text carrying the format, whatever produced it.

Three measurements say the same thing from three directions. `audit-security`
separated its arms 0.33 against 1.00 on gates while its judge sat at 1.00 on
both, and the two gates that moved were greps for the words *confidence* and
*non-auditable*. A monolithic skill and a thin one delegating to a shared
reference file measured **exactly** the same over 6 pairs on two different
skills: when a gate scores vocabulary, the delivery mechanism cannot matter.
Seven of ten skills in a smoke sweep came back saturated.

`recurring-bug-root-cause` is the counterexample and the model. It is the only
skill whose fixture had history, the only one with a non-saturated judge, and
its gates key on two things that are not words in a document: the planted bug
no longer greps, and a *blocking* guardrail file exists.

### The contract

A fixture is admissible to the measurement base when all six hold. Fewer than
five and it is a smoke fixture, which is a legitimate thing to be, as long as
its manifests say so.

1. **The house format is already present** - a template plus at least two
   filled examples of the deliverable's kind. This is the counter-intuitive one
   and it is the most load-bearing. Giving the format away for free makes the
   word greps saturate, which forces them out of the manifest, which leaves
   content as the only thing a gate can still key on.
2. **At least two decoy causes** that survive a shallow investigation.
3. **At least one non-textual outcome** the skill promises: a hook that blocks,
   a call site removed, a migration in two steps. Something a grep can reach and
   prose cannot fake.
4. **Something the skill explicitly forbids**, reachable and tempting.
5. **History that changes the correct answer.** If `git log` is decoration, a
   whole class of skills has nothing to demonstrate.
6. **An `EXPECTED.md` that names the wrong answers**, not only the right one,
   and carries a written argument for how a careful unaided agent fails. If you
   cannot write that argument, the scenario is saturated and you have not
   measured anything yet.

In practice this lands around twenty files and thirty commits. The contract is
the gate; the line count is a symptom of it.

### Three scenarios per measured skill

One fixture, three questions, under `skills/<skill>/evals/`:

- **core** - the skill's central promise against the world's main defect.
- **hard** - a careful agent following only the prompt plausibly fails a gate
  the exit condition promises.
- **limit** - the right answer is restraint: not applicable, insufficient
  evidence, do not act. The base had none of these for its first months, which
  is why no skill could fail by producing its deliverable when none was
  warranted.

### The probe that decides whether a gate measures anything

    npm run eval:probe

It grades a deliverable carrying the skill's own headings and **no content
whatsoever** against a manifest's gates. The deliverable knows nothing about the
fixture, so any gate it passes scores vocabulary rather than work. It reuses
`applyGate`, because a probe that counted its own way would prove nothing about
the gate it probes.

Run on the base as it stood before the rebuild: **43 of 58 gates were format
gates. 13 survived.** That single number is why the fixtures were rebuilt rather
than the manifests patched again.

Run on the base as it stands after it (2026-09-03): **4 format gates across 101
manifests, 197 gates survive.** All four sit in the two manifests that were NOT
rebuilt - `audit-report` and `performance-profiling`, still on the old four-file
`audit-target` fixture - and both declare themselves smoke and argue the point
in their own comment block. Neither may publish a causal verdict, which is what
`tier: probed` buys and why the probe reports them rather than failing the run.
The 98 scenario manifests written against the five rebuilt worlds carry none.

That is a claim about the instrument, not about the skills: it says the gates
can no longer be passed by vocabulary alone. Whether they SEPARATE two arms is
a different question and one paired run has answered it for one skill - see the
[findings log](#findings-log).

A gate keyed on a path rather than on content is reported `shallow`, not
`format`. An empty artifact in the right place does pass it, which is a real
weakness worth seeing - but putting the file there is an act, not a word, and
the acts these gates ask for are demonstrably not free: "a blocking guardrail
exists" went 0/7 unaided against 7/7 aided. Folding the two together would have
condemned the best-measured gate in the repository, which is how the
distinction came to exist.

Severity follows the tier. Format gates are reported at every tier and fail the
run only for a manifest claiming the right to publish a causal verdict, so the
check could enter CI before the base it guards.

### Where the realism comes from

Transposed from real episodes, never copied. The rule and its guard are in
[fixtures.md](fixtures.md).

## 3. What gets graded, and when

A skill in this repository is not a description of an output. Counting the
sections across the 36 `SKILL.md` files, one of six surfaces was measured:

| Section | Skills | What it prescribes | Graded before 2026-09-03 |
|---|---|---|---|
| `Exit condition` | 36 | the deliverable and its properties | yes |
| `Principle` | 25 | the stance the work takes | no |
| `Tooling` | 24 | the scripts to run | no |
| `Traps & rationalizations` | 22 | named excuses and their refutations | no |
| `Context to gather (before acting)` | 21 | what to read *before* acting | no |
| `Protocol` / `Steps` | 16 | the order of the work | no |

The other five live in the trajectory, and the harness collected the trajectory
and threw it away. Measured over the twelve trials of the 2026-09-03 anchor run:
**480 steps carrying 598 tool calls, and the judge saw none of them** -
`transcriptFromTrajectory` mapped each step to its `message` and dropped
`tool_calls` entirely. A criterion the anchor manifest actually ships -
*"refutes a hypothesis with evidence it produced, not with a claim"* - was
unjudgeable by construction: running a command and saying you ran it rendered
identically. Design:
[the spec](superpowers/specs/2026-09-03-trajectory-evaluation-design.md).

### Five dimensions

| Dimension | Source in the skill | Where it is graded |
|---|---|---|
| **outcome** | `Exit condition` | in-container verifier, repo state |
| **tooling** | `Tooling` | post-pass, trajectory - mechanical |
| **sequence** | `Context to gather (before acting)`, `Protocol` | post-pass, trajectory - mechanical for order, judged for substance |
| **trap** | `Traps & rationalizations` | post-pass, judged |
| **restraint** | `Guardrails`, the `limit` scenarios | both: an absence in the repo, an absence in the trajectory |

### Three grading moments

1. **In the container, on the tree.** `tools/eval-grade.ts` runs the manifest's
   `preconditions` and `gates` against the repository the agent left. It sees
   the tree and nothing else.
2. **Post-pass, on the trajectory, mechanically.** `tools/eval-judge.ts` reads
   `agent/trajectory.json` and applies the manifest's `trajectory:` checks
   through `tools/eval-trajectory.ts`, writing `verifier/trajectory.json` beside
   `judge.json`.
3. **Post-pass, on the trajectory and the artifacts, by the judge.** The same
   pass builds one prompt carrying every criterion with its dimension, the
   rendered trajectory and the deliverables, and writes `verifier/judge.json`.

The order is not an implementation detail, and it is the whole reason the two
`transcript_*` gate kinds were dead. **They were not dead because transcripts
are unavailable. They were dead because they sat in the wrong moment**: Harbor
writes `agent/trajectory.json` *after* the agent phase ends, and moment 1 runs
before that with `transcript: ""`, so `transcript_contains` failed and
`transcript_absent` passed on every paired trial whatever the agent said. Moved
to moment 2, the same question is answerable - and answerable better, because a
trajectory check names an act rather than grepping the agent's prose.

### What the judge is told, and what it costs

The judge gets **one prompt carrying every criterion**, not one call per rubric
item. RubricEval (arXiv 2603.25133) and Step-wise Rubric Rewards (arXiv
2605.17291) prompt per item; this harness deliberately does not, and the reason
is arithmetic: the expensive half of a judge call is now ~200 KB of transcript
and artifacts, so per-item multiplies THAT by the criterion count on top of a
quorum that already multiplies it - 12 trials x 3 criteria x a 3-judge quorum is
108 large calls where the batch is 36. What per-item buys mechanically is
already enforced: the anti-leniency parser makes the judge echo each criterion
verbatim, and a pass with an empty quote is downgraded to a fail. What the batch
was genuinely missing was step attribution, which costs nothing to add to the
output shape - each verdict now carries a `where`. The honest limit: `where` is
asked for and **not** enforced.

Two budget facts follow from rendering the actions. The transcript went from
95 KB to 213 KB across the twelve anchor trajectories - the added half is the
actions - so `JUDGE_TRANSCRIPT_TAIL = 30_000` had to go: 30 KB taken from the
end of 213 KB drops the opening steps entirely, and the opening steps are where
the `sequence` evidence is. `JUDGE_TRANSCRIPT_BUDGET` is 120 KB, spent 40 % on
the opening and the rest on the close, and a cut is announced with its position
and its size.

## 4. Writing a manifest

A skill's default scenario is `skills/<skill>/eval.yaml`; its other scenarios
are `skills/<skill>/evals/<scenario>.eval.yaml`, and that suffix is
load-bearing rather than cosmetic. Two filters exclude a manifest by name - what
the installer stages (`isDistributed` in `src/lock.ts`) and what the npm tarball
ships (the `!skills/**/eval.yaml` and `!skills/**/*.eval.yaml` globs in
`package.json`) - so a file named `<scenario>.yaml` would be uploaded into the
container and hand the agent under evaluation the gates that grade it.

The installer's copy filter and its drift control must read the SAME predicate,
which is why `isDistributed` exists as one function. They did not until
2026-09-03: the copy excluded any path ending in `eval.yaml` while drift control
excluded only the exact name, so the two disagreed about every
`evals/<scenario>.eval.yaml`. Every fresh install then reported as drifted, and
`uninstall` - reading that drift as local edits worth keeping - renamed the
skill directories aside instead of removing them.

### What the base holds

As of 2026-09-03, **101 manifests over 36 skills**: 98 scenario manifests
(`core`/`hard`/`limit`) for 33 skills, plus three defaults. 99 of them run
against the five rebuilt worlds - `maturity` 27, `surface` 18, `service` 18,
`platform` 18, `incident` 18 (17 scenarios plus the anchor's own manifest) - and
the last two against the old four-file `audit-target`.

The three defaults are exceptions on purpose, and each says so in itself:

- `recurring-bug-root-cause` keeps its default manifest as the anchor - it is
  the `core` of the `incident` world and the only manifest in the repository
  carrying a paired figure.
- `audit-report` and `performance-profiling` are smoke, still on `audit-target`,
  with no `core`/`hard`/`limit` and no fixture that could give them one. They
  hold the base's last four format gates.
- `visual-regression-check` has no manifest at all: it needs a browser the
  container has not got. The absence is recorded in its README.

93 of the 101 declare a `trajectory:` section, 140 checks in all. Of the eight
that do not, six argue the absence in their own comment block and two are the
un-rebuilt smoke pair; the reasons are worth reading before writing a check you
are unsure of, and they are collected in the [findings log](#findings-log).

Nothing forces that coverage: the runner discovers the manifests that exist, so
a skill shipped without one is silently skipped rather than reported. That is
deliberate - an absence recorded in a skill's README is honest, a manifest that
cannot fail is not - but it also means the count above is the only place the
gap shows. Read it before concluding the catalogue is measured.

### The tier decides what a manifest may claim

    tier: anchor      # measured at full power, re-measured every release
    tier: measured    # carries a real paired verdict
    tier: probed      # cheap admission checks only, never a causal verdict

A manifest that states no tier grades as `probed`, the direction that costs at
worst a withheld verdict rather than an unearned one. The report groups by
tier, so a five-minute smoke scenario cannot sit beside one measured at full
power as though the two numbers meant the same thing, and two lint rules follow
the tier: an `answer-only` annotation must name the tier that admits it has no
mechanical signal, and a gate citing no exit-condition line is a warning until
the manifest claims a tier that may publish a verdict, an error after.

Each manifest combines mechanical gates with a short judge rubric. What varies
is not a fixed set of shapes but how much of the exit condition is reachable
mechanically: a skill whose promises are greppable leans on gates, a skill whose
deliverable is an ANSWER rather than a file leans on the judge with a
`repo_clean` that only permits the written deliverable, and several manifests
sit between the two. Deciding which one a manifest is comes from reading the
skill's `## Exit condition`, never from a template.

What DOES have a fixed shape now is the scenario triple - `core`, `hard`,
`limit` - described in [part 2](#three-scenarios-per-measured-skill). The
`limit` scenario is the one the base lacked for its first months, and it is why
no skill could fail by producing its deliverable when none was warranted; a
skill that cannot be given one has a fixture problem, not a manifest problem.

Gate vocabulary: `file_exists`, `file_absent`, `file_matching`, `grep_zero`,
`grep_count`, `repo_clean`, `grep_min`, `transcript_contains`,
`transcript_absent`, `exit_ok`.

Three of those are dead on the paired path, and a manifest that reaches for
them as a GATE is measuring nothing. `transcript_*` gates only work under
`tools/eval.ts run`, which owns the `claude -p` output; a Harbor trial is graded
from the repository alone (`tools/eval-grade.ts` builds its context with an
empty transcript), so `transcript_contains` fails and `transcript_absent`
passes on every paired trial regardless of what the agent said. That is the
wrong-moment problem of [part 3](#3-what-gets-graded-and-when), and the
`trajectory:` section below is where those two questions now belong. `exit_ok`
is dead the same way but has no such home: that context is built with
`exitCode: 0` always, so `exit_ok` passes on every paired trial whatever
happened - which makes "gate on the build passing" advice that has to be
refused, not followed. No manifest uses any of the three as of 2026-09-03.
Extend the runner if a new gate kind is needed - never free-form logic in YAML.

`file_matching` keys on a path pattern rather than one name, for exit conditions
that demand a KIND of file. "A blocking guardrail" is a git hook or a CI job and
the agent picks where it lives, so `file_exists` cannot express it without
guessing the choice.

### The `trajectory:` section

Optional, additive, and graded in the post-pass rather than in the container. A
manifest that declares none keeps exactly the verdict shape it had.

    trajectory:
      # from-skill(tooling): scripts/detect-recurring-fixes.ts then git log/git blame
      - tool_used: { name: "detect-recurring-fixes", min: "1" }
      # from-skill(sequence): Context to gather (before acting)
      - before: { first: "git log", then: "build.config.json" }
      # from-skill(restraint): never commit
      - tool_absent: { name: "git commit" }

Six kinds, all matched as SUBSTRINGS of a rendered call - `Bash(command=git log
--oneline)`, `Read(file_path=build.config.json)` - never as regexes:

| Kind | Args | Asks |
|---|---|---|
| `tool_used` | `name`, `min` (default 1), optional `arg` | was this command or script run, at least N times |
| `tool_absent` | `name` | was this act never performed |
| `read_file` | `path` | was this file opened - by `Read`/`Grep`/`Glob`, or by a shell that does not write to it |
| `wrote_file` | `path` | was this file written - by `Write`/`Edit`, or by a redirect, `tee`, `sed -i`, `mv`, `rm` |
| `before` | `first`, `then` | did `first` happen before `then` |
| `step_budget` | `max` | did the run stay under N steps |

`before` is the one with no equivalent in the gate vocabulary, and it is the
reason the section exists. *"Context to gather **before acting**"* is an
ordering claim, and an ordering is exactly what a repo snapshot cannot hold: the
final tree is identical whether the agent read the history first or last. Two of
its edges are decided and worth knowing before you write one: a `then` that
never happened **passes** - the claim is about what precedes the act, and an act
that never came cannot be early - while a `first` that never happened fails and
says so, because silence there would read as "the order was respected".

Three rules, and the first is the trajectory version of the format-gate rule:

- **A check names an ACTION, never a word the agent might say.** A grep over the
  agent's prose is a format gate wearing a trajectory costume.
- **Every check cites the skill line it derives from**, under the same rule as
  the gates, and the citation names which dimension it belongs to:
  `# from-skill(<dimension>): <line>`.
- **A check nobody can pass reddens both arms and separates neither.** Several
  scenarios in the base ship no trajectory section for exactly this reason and
  argue it in their own comment block - read one before writing a check you are
  unsure of.

An unreadable or missing trajectory fails **every** check of that trial rather
than satisfying the absence ones for free: a lost trial must not score like a
perfect one.

### The dimension on a judge criterion

A criterion carries the dimension it grades, so the report can say *where* a
skill helped rather than only whether it did:

    judge:
      criteria:
        - { dimension: trap, text: "Does not settle for a documentation-only guardrail" }
        - "The root cause is named"        # bare string = dimension outcome

A bare string still parses and means `outcome`, which is what every criterion
meant before the dimension existed. The dimension is not decoration in the
prompt either: it selects the paragraph telling the judge what may stand as
evidence for that kind of claim - the rendered tool call and nothing else for
`tooling` and `sequence`, a quote from the artifacts for `outcome`. Left
implicit, a judge handed a `sequence` criterion goes looking for an ordering in
the final document, where no ordering exists.

Do not tag a criterion `tooling` when a `tool_used` check already covers the
same act: that double-counts one fact across two dimensions. Most authors in the
base put `tooling` and `sequence` in the mechanical checks and reserved the
judge for `trap`, `restraint` and `outcome`.

### Preconditions vs gates

A manifest declares two lists, and the split decides what a check is allowed to
prove:

    preconditions:                 # must hold, but proves nothing about the skill
      - file_exists: "AUDIT-SECURITY.md"
    gates:                         # what actually distinguishes the skill
      - repo_clean: { except: "AUDIT-SECURITY.md" }

The fixtures have no tracker, so a prompt has to name the file the agent should
write to. That makes `file_exists` on that path unearnable credit: an agent
following no skill at all produces it too. Kept among the gates it inflates the
verdict; declared as a precondition it does the one job it can do - telling you
the deliverable landed, so the gates below it are worth reading. When a
precondition fails the runner reports it alone: a missing deliverable makes
every downstream gate uninterpretable, not failed.

Measured over the 36 manifests of the pre-rebuild base on 2026-08-24: 27
carried such a gate, 28 of 72 gates in total. After reclassing, one manifest
(`performance-profiling`) had no mechanical signal left at all - it rested
entirely on its judge. Its exit
condition states two greppable things (a noise floor reported, a hypothesis left
"inconclusive"), so on 2026-08-24 both became `grep_min` gates; a judge-only
manifest is a fact worth knowing, not a defect to paper over, but it is not
the state to leave a manifest in when its own exit condition offers a gate.

The rule: a check belongs in `gates` only if an agent could plausibly fail it
while still doing what the prompt literally asked. Otherwise it is a
precondition.

`npm run eval:lint` enforces it, with no agent call, as part of `npm test`. It
errors on a gate whose literal the prompt hands over, and warns when a judge
criterion reuses the prompt's own words - a warning only, because word overlap
is too coarse to block on: a criterion legitimately talks about the same subject
as the prompt.

Only checks that copying the prompt could satisfy are linted: `file_exists`,
`file_absent`, `grep_count`, `transcript_*`. A `grep_zero` or `grep_min` asserts
an outcome - an absence to produce, a floor to reach - that naming the subject
does not hand over, and `repo_clean` and `exit_ok` key on repo state.

Some leaks are irreducible: a prop cannot be renamed without naming it, and an
imposed `data-testid` contract has to be stated. Annotate those, one per gate:

    gates:
      # leak-ok: a rename cannot be asked for without naming the new prop
      - grep_count: { pattern: "variant=", in: "src/", count: "2" }

An annotation covers the single gate below it, never a block - and it is the
only sanctioned way out. Deleting the check, or weakening the lint, is the
Goodhart move this document exists to forbid.

Judge criteria must be SHORT one-liners: the anti-leniency parser requires the
judge to echo each criterion verbatim, and long or multi-clause criteria get
paraphrased by real judges, which turns the run into an ERROR (calibrated on
the recording-decisions pilot).

Derive gates from the skill's own `## Exit condition` section, never from
intuition about what "clean" means. A skill that legitimately edits files must
not be gated with a bare `repo_clean`: list what it may touch in `except`, or
gate on the RESULT instead (a zero-match grep of the removed name, an exact
count of the migrated call sites). Numeric `grep_count` gates must be computed
against the fixture, not guessed: a rename that touches a declaration line plus
its usages yields more matches than the number of call sites.

### Hardening a saturated manifest

The method, applied twice in the [findings log](#findings-log) below: read the
skill's `## Exit condition`, find what it promises that nothing measures, and
check the candidate against real trial output before trusting it. Never derive a
gate from what the runs happened to produce - derive it from what the skill
promised, then verify it discriminates. The fix for a saturated eval is never to
lower the bar.

Not every manifest can be hardened this way, and that is fine. A skill whose
deliverable is an ANSWER rather than a file - `commit-readiness-review` says
whether a diff is ready, `validating-features-end-to-end` says whether a ticket
can be closed - produces nothing to grep. Its `repo_clean: { except: "" }` is
already the invariant that matters, since the skill must not touch the repo it
reviews, and the rest belongs to the judge by construction. Counting gates as a
measure of eval quality would mark those two as weak when they are not.

## 5. Running a paired measurement

`tools/eval.ts run` answers "does this skill still produce its deliverable".
It cannot answer "is Claude better with it than without", because the agent it
starts inherits the operator's `~/.claude` - see the caveat in part 1. That
question needs a container, and
[Harbor](https://github.com/laude-institute/harbor) provides one. Requires
Docker and `uv tool install harbor`.

    npx tsx playground/setup.ts
    mkdir -p /tmp/staging && npx tsx install.ts install /tmp/staging --yes \
      --pick skill:recurring-bug-root-cause
    npx tsx tools/eval-tasks.ts /tmp/tasks --only recurring-bug-root-cause \
      --job /tmp/job.yaml --skills-dir /tmp/staging/.claude/skills
    CLAUDE_FORCE_OAUTH=1 CLAUDE_CODE_OAUTH_TOKEN=$(cat ~/.token) \
      harbor job start -c /tmp/job.yaml
    npx tsx tools/eval-judge.ts /tmp/tasks/jobs/lift-recurring-bug-root-cause/<trial>   # once per trial
    npx tsx tools/eval-report.ts /tmp/tasks/jobs/lift-recurring-bug-root-cause

`eval-judge.ts` is both post-pass grading moments in one call: it writes
`verifier/judge.json` and, when the manifest declares a `trajectory:` section,
`verifier/trajectory.json` beside it. Run it before the report, or the report
reads a trajectory dimension nobody graded.

`eval-tasks.ts` defaults: `--model claude-sonnet-5`, `--attempts 6`,
`--concurrent 4`, `--jobs-dir <out-dir>/jobs`, `--job-name lift-<skill>`.
The judge finds the skill from the trial's `verifier/checks.json`; pass
`--skill` when that file is missing, `--model` to grade with another model.

The job declares two agents differing by one field - `skills: []` against the
staged skill - so whatever separates their scores is the skill's doing. Staging
goes through `install.ts` rather than pointing at `skills/<name>` directly,
because Harbor uploads a skill directory verbatim and `install.ts` is what
strips `eval.yaml` from it. An agent that can read the manifest grading it is
not being measured, it is being told the answer.

For the same reason the manifest ships in `tests/`, which the verifier uploads
after the agent is done, and `EXPECTED.md` never enters the image - not in the
worktree, and not through git either. Until 2026-09-02 the fixture had been
`git add -A`ed with its answer key, so removing the file from the worktree
left `git show :EXPECTED.md` printing it inside the image, and on a fixture
with commits it sat in `HEAD`. `playground/setup.ts` now keeps the file out of
git altogether, and a test locks both the index and the history.

### Sweeping the catalogue

Drop `--only` and the same command generates every task, and one job file PER
SKILL - `job-<skill>.yaml` next to the path given to `--job`, job name
`lift-<skill>`. One job over 36 tasks would have installed all 36 skills in the
with-arm of each one, measuring "the toolkit vs nothing" and letting the agent
reach for a skill other than the one the task exists to exercise (found
2026-08-24, before spending anything on it).

    npx tsx install.ts install /tmp/staging --yes --pick skill:<a> skill:<b> ...
    npx tsx tools/eval-tasks.ts /tmp/tasks --job /tmp/job.yaml \
      --skills-dir /tmp/staging/.claude/skills --attempts 2
    for j in /tmp/job-*.yaml; do harbor job start -c $j; done
    npx tsx tools/eval-report.ts /tmp/tasks/jobs/lift-* --summary

Two attempts per skill is a smoke sweep, not a measurement: below six pairs the
verdict stays `inconclusive` whatever the gap. What it does surface is
`saturated`, `judge-saturated` and negative lifts - which is what the
2026-08-24/25 sweep was for, and what the commits that followed it fixed.

### More than two arms

A job can declare named arms instead of the default pair, when the question
is not "with or without" but "this version of the skill against that one":

    npx tsx tools/eval-tasks.ts /tmp/tasks --only audit-security --job /tmp/abc.yaml \
      --arms "nothing:;mono:/tmp/mono/audit-security;thin:/tmp/thin/audit-security,/tmp/thin/audit-report"
    npx tsx tools/eval-report.ts /tmp/tasks/jobs/lift-audit-security --contrast mono:thin

`--arms` takes `name:dir[,dir]` entries separated by `;`; an empty list is
the no-skill arm. Each name lands in the trial's `result.json`
(`config.agent.name`), which is how `--contrast <a>:<b>` pairs the trials;
without a contrast the report reads a job by its skills lists, as before, and
refuses a job with named arms rather than pool them. The pair floor and the
saturation flags apply to the contrast being read: `mono:thin` is judged
against mono's baseline, not against the unaided one.

An arm listing two dirs installs both. Harbor uploads a skill directory
verbatim and nothing else, so a skill that reads a sibling's reference file
(`../audit-report/reference/apparatus.md`) has that sibling staged in the same
arm, or the pointer dangles in the image and the arm measures a broken skill.
`--arms` describes one skill's job, so it goes with `--only`.

## 6. Reading a report

Read the report by dimension, never as one number. Measured on 2026-08-24,
6 pairs, claude-sonnet-5 - **before the `EXPECTED.md` leak fix of 2026-09-02
described in part 5, and not re-run since**, so read the shape, not the
figures:

    without skill   gates 1.00  judge 0.29  416k tokens   $0.19  (n=7)
    with skill      gates 1.00  judge 1.00  1.37M tokens  $0.51  (n=6)
    lift            gates 0.00  judge +0.71    pairs 6
    flags           errored-trials, saturated
    verdict         gates inconclusive  ·  judge helps

That run is the reason both the scores and the verdicts stay apart. On gates
alone the skill looks useless, and a single verdict driven by them read
"inconclusive" while the judge was separating the arms perfectly: 0 of 7 runs
without the skill added a blocking guardrail, 6 of 6 with it did. Averaging the
dimensions would have reported +0.35 and buried every one of those facts.

Each dimension is judged against its own baseline. `saturated` means a baseline
already at the ceiling - the fixture is too easy for that check, which is a fact
about the eval, not about the skill. No causal verdict is issued below six
pairs, however large the gap: a sign test on 5 pairs cannot go below p=0.0625.

### The trajectory score, and the judge broken out by dimension

The report carries a third score beside gates and judge, and a breakdown under
the lift line - the shape a run against the current base prints:

    lift            gates +0.00  judge +0.22  trajectory +0.50   pairs 6
      judge · outcome     0.80 →  0.90  lift  +0.10  inconclusive  (6 vs 6 trials)
      judge · trap        0.33 →  1.00  lift  +0.67  helps         (6 vs 6 trials)
      judge · restraint   1.00 →  1.00  lift  +0.00  inconclusive (saturated)  (6 vs 6 trials)
    verdict         gates X  ·  judge Y  ·  trajectory Z

This is what the anchor's own numbers could not say. Gates 0.33 against 0.33 and
judge 0.72 against 0.94 left the question *which dimension carried that judge
gap* unanswerable; only the breakdown answers it. Read it the same way as the
rest: each dimension against its own baseline, each with its own pair count, and
`saturated` on a dimension whose baseline is already at the ceiling.

Three flags belong to this half of the report:

- `trajectory-saturated` - the unaided arm already meets the trajectory checks.
- `trajectory-partial` - some trials of an arm carried a trajectory grade and
  others did not, so the mean is over a subset. A manifest that declares no
  trajectory section produces `null`, never `0`: silence must not drag an arm
  down, which is the "unmeasured reads as failed" mistake the split exists to
  undo.
- `judge-undimensioned` - a criterion came back whose dimension the manifest
  does not declare. It is left out of the breakdown rather than filed under
  `outcome`, and the flag says the breakdown is partial.

Cost belongs in the reading. Here the skill is worth 2.7x the money and 3.3x the
tokens; whether that trade is right is an engineering call, and the harness's
job is to put both sides of it on the table.

Trials are pooled across job directories, so a run left short by a lost trial
can be topped up instead of rerun:

    npx tsx tools/eval-report.ts jobs/lift-recurring-bug-root-cause jobs/lift-extra

`--summary` prints one line per skill - gate lift, judge lift, trajectory lift,
cost ratio, pairs, the read rate of the measured arm, flags - ordered weakest
signal first: regressions, then the skills that move nothing, then the clear
wins. The three dimensions weigh the same in that order, because a skill moving
none of them is as much of a problem as one moving the wrong way. It can be read while the sweep is still running; the per-skill
block above is for the ones the summary points at.

### Did the agent open the skill at all

"Skill not read" and "skill read but useless" produce the same score, so the
report reads each trial's ATIF trajectory (`agent/trajectory.json`) and says
which happened, per arm:

    with skill      gates 1.00  judge 1.00  ...  skill read 5/6 · reference read 3/6

`SKILL.md` never appears as a `Read`: the agent calls `Skill{skill: "<name>"}`
and the runtime pastes the body in, so that call is what "read" counts. A
skill's other files - `reference/`, `templates/` - do show up as ordinary reads
under the container's `.../skills/<name>/` mount, and `reference read` counts
those separately. That second number is the one a skill delegating its
apparatus to a sibling file lives on: it can score well only if the pointer was
followed.

Below 100 % on the measured arm the report adds the flag `skill-unread`. It is
a flag and never a gate: a trial where the skill was never opened still scores
whatever it scored, but its number says something about the model, not about
the text. Both numbers are `n/a` for an arm that installed no skill, and for a
trial whose trajectory is missing.

### Recording the verdict

A measurement outcome lives in the manifest it is about, as a comment block
next to the gate or criterion it justifies - never in this document alone. The
block states what was measured (arms, runs, date), what was changed because of
it, and what was deliberately NOT changed.

**As of 2026-09-03 exactly one manifest in the repository carries a figure of
its own**: `skills/recurring-bug-root-cause/eval.yaml`, `tier: anchor`, 6 pairs
on the `incident` world. Read it for the shape - and for the warning, since its
gate dimension was broken during that very run. Every other manifest declares
`tier: probed` and says in its own words that nothing about it has been
measured. Do not read a hardened gate as a measured one: 100 of the 101
manifests have passed the lint and the probe and nothing else.

**The same holds for the trajectory dimension, with exactly one exception, and
the exception is not a new run.** 137 of the 140 trajectory checks, and all 323
dimensioned criteria, have never been paired against anything. Each was proved
against a **synthetic** trajectory its own author wrote - green on a run that
honours the check, red on one that does not - which is a claim about the check
in the sense `eval-probe` makes a claim about a gate, and not a claim that the
check SEPARATES two arms.

The exception is the anchor, `skills/recurring-bug-root-cause/eval.yaml`. Its
three checks were **replayed** over the stored trajectories of the twelve trials
of the 2026-09-03 run - the same 6 pairs, arm by arm - and its comment block
records the per-check counts, the strongest being the prescribed script at 0/6
unaided against 5/6 aided. Read that as a replay, not as a measurement of its
own: no agent was run for it, the trials it reads were commissioned to measure
the gates and the judge, and **this repository holds none of those trial
directories**, so the figure cannot be re-derived here. Every trajectory check
in the base is waiting on a paired run commissioned for it.

What each of them DOES carry, because the rebuild required it, is the argument
for how a careful agent with no skill plausibly fails the scenario. Those
arguments belong in the fixture's `EXPECTED.md` and are not there: `EXPECTED.md`
is generated from `playground/fixtures-def/bases/<world>.ts`, which the scenario
authors did not own, so all 98 were written into the manifests' comment blocks
instead. They lift out verbatim for whoever moves them, and a scenario whose
argument could not be written says so as an admission rather than going
unwritten - see the saturation entries in the [findings log](#findings-log).

Three outcomes are legitimate, and the manifest must say which:

- **Measurable, hardened.** The sweep showed saturation, the exit condition
  named something unmeasured, a gate now covers it. Most of the 26.
- **Unevaluable here, or partly.** `ci-pipeline-orchestration` acts on a LIVE
  pipeline; a fixture degrades it to "write a plan". First recorded as
  unevaluable (2026-08-25), then retested: its own prompt was listing the four
  things the plan needed, and with that removed the judge separates the arms
  by +0.50. The diagnosis is measurable, the acting is not. Lesson kept in the
  manifest: check the prompt is not doing the skill's work before blaming the
  fixture.
- **No lift, stopped.** `refactoring-shared-component-api` came back 1.00 vs
  1.00 three times: after the prompt stopped naming the call sites, after the
  gates were hardened, after the fixture gained an aliased import that a grep
  of the component name cannot reach. The unaided arm found it too. On this
  scenario the model already does what the skill teaches, and the manifest
  says so. A fourth adjustment aimed at turning the number green would be
  moving the target; a harder fixture is a decision to take on its own merits,
  not a way to rescue a figure.

## Never move the target to make the test pass

Every check in this repo has a target that the author can edit: an eval manifest
gates on criteria you wrote, and the routing lint scores descriptions you own.
That makes Goodhart's law a live risk rather than a slogan - the cheapest way to
turn a check green is always to weaken what it measures.

The rule that holds, learned while building the routing lint (five of its ten
cases failed on the first run):

> **Change the artifact only if the change is right independently of the test.**
> Otherwise change the test - or admit the test cannot answer the question.

Applied to those five failures, it produced three different actions, and the
difference between them is the whole point:

- Three were **measurement defects**. Scoring on trigger substrings, then
  charging a description for naming the skill it redirects to, then failing to
  fold a plural - none of that said anything about the skills. Fixing the
  scorer was the honest move.
- Two were **real description defects**, fixed in the descriptions:
  `comprehensive-test-strategy` had an exclusion clause that never named the
  skill it pushed you toward, and `writing-robust-tests` did not mention its
  most common trigger. Both read better to a human now, which is the test of
  whether the edit was legitimate.
- One was **a question the check could not answer**: whether a skill ranks
  first among all 36 is not something lexical overlap can establish. The lint
  was narrowed to "does it beat the neighbours this case declares", which it
  can answer, instead of being tuned until the wrong question passed.

The tell that you are on the wrong side of this line: you are editing a
description while thinking about the score rather than about the reader.

## Findings log

What has actually been measured, newest first in each entry. Every figure here
predates the 2026-09-02 `EXPECTED.md` leak fix unless it says otherwise, and
none has been re-measured against the current fixtures. A verdict about one
skill belongs in that skill's manifest; this section keeps only what spans
several of them.

### 2026-09-03 - the trajectory dimension, and the defect that motivated it

**The judge could not see a single tool call.** Counted over the twelve trials
of the anchor run: 480 steps carrying **598 tool calls**, none of which reached
the judge. `transcriptFromTrajectory` mapped each step to its `message` and
dropped `tool_calls` entirely, so the judge read what the agent SAID and never
what it did. The anchor manifest ships a criterion that asks the agent to
*refute a hypothesis with evidence it produced, not with a claim*; that
criterion was unjudgeable by construction, because running a command and
claiming to have run it rendered identically. Rendering the actions with their
arguments took the twelve trajectories from **95 KB to 213 KB** - the added half
IS the actions.

**The 30 KB tail had to go with it.** `JUDGE_TRANSCRIPT_TAIL` kept the last
30 KB, defensible while the transcript was prose and indefensible at 213 KB: the
evidence for "context gathered before acting" sits at the START of a trajectory,
and a tail window deleted it silently. The budget is now 120 KB spent on both
ends, 40 % on the opening, with the cut announced by position and size.

**One of six skill surfaces was graded before this.** Across the 36 `SKILL.md`
files: `Exit condition` 36, `Principle` 25, `Tooling` 24, `Traps &
rationalizations` 22, `Context to gather (before acting)` 21, `Protocol`/`Steps`
16 - and only the first was measured. The other five live in the trajectory, and
the harness collected the trajectory and threw it away.

**What landed: 140 trajectory checks across 93 of the 101 manifests, and 323
judge criteria carrying a dimension.** By kind: `before` 80, `tool_used` 34,
`read_file` 15, `tool_absent` 10, `wrote_file` 1, `step_budget` 0. By dimension:
`outcome` 163, `restraint` 69, `trap` 57, `tooling` 22, `sequence` 12 - most
authors let the mechanical checks carry `sequence` and `tooling` rather than
asking the judge the same question twice.

**Eight manifests carry no trajectory section, and six of them argue why in
their own comment block.** `recording-decisions` (all three): the skill's
`## Tooling` opens "No script: essentially a human decision", it has no `Context
to gather` section, and its one ordering claim is about wall-clock within a
session rather than about two acts. `frontend-fullstack-implementation/hard`:
every file it writes is a file it must read first, so every `before` inverts and
would fail every trial. `daily-workflow-optimization/limit`: the restraint it
turns on is an absence in the TREE, which `repo_clean` already reads.
`validating-features-end-to-end/limit`: the skill's one mechanical act is
"actually start the app", and this scenario exists BECAUSE that act is
impossible here - the check would redden both arms and separate neither. The
remaining two are `audit-report` and `performance-profiling`, the smoke pair
still on the old `audit-target` fixture, which were not rebuilt and say nothing
about the trajectory either way.

**`step_budget` exists and nobody used it.** Not an oversight worth fixing by
adding one: a step budget calibrated on no measurement is a number invented to
look like a check, and the base has no paired run to calibrate it against.

**Almost none of this has been measured, and the exception is a replay.** 137 of
the 140 checks were proved against a synthetic trajectory written by their own
author - green on a run that honours the check, red on one that does not - which
says the check CAN discriminate, not that it DOES separate two arms. The
anchor's three were replayed over the stored trajectories of the same twelve
trials, giving 0/6 unaided against 5/6 aided on the prescribed script; the
trials were commissioned to measure the gates and the judge, no agent was run
for the replay, and the trial directories are not in this repository, so the
figure cannot be re-derived here. A paired run commissioned for a `trajectory:`
section is still owed - by all 93 manifests, the anchor included.

### 2026-09-03 - a decoy stronger than the answer

Reading what the twelve trials actually wrote turned up an authoring defect in
the `incident` world, and it is the mirror image of the format-gate disease.

**Zero of twelve reached the cause the answer key named as confirmed. Twelve of
twelve reached another one.** The key ranked that other cause fourth among the
wrong answers, calling it a half-answer that "bounds retention but leaves the
unit count decided by whatever is on disk".

That claim was false, and one experiment settled it: applying the second fix
alone, without touching the first, completes all 157 units.

The two causes are not equally supported, and the fixture is the reason:

- The one the author preferred is documented **nowhere** - deliberately, since
  that is what makes it hard to find.
- The one the agents found contradicts a comment **planted in the fixture**:
  `searchable()` says only the headings outlive the unit, and three lines later
  the code retains the whole page.

So twelve agents followed the evidence, which is the correct move. **A scenario
whose right answer is the less supported one is the same defect as a check
everybody passes**, seen from the other side: in one case the target is too easy
to hit, in the other it is not the target the fixture points at.

The fix was not to make the second cause artificially insufficient - that would
require recomputing the six prior fixes' arithmetic and the measured figures in
two operations documents, and it would be bending the world to protect a
verdict. The answer key now names both causes and says which is better
evidenced, and the judge criterion asks whether the response bounds *a* quantity
that grows with the catalogue rather than naming which one. What separates a
real answer from the four wrong ones was never which quantity gets bounded: the
wrong answers all move a limit, or move nothing.

**The general lesson, and it is the reason to read a run's artifacts and not
only its scores.** The gate and judge numbers for this scenario were stable and
unremarkable across two runs. Nothing in them said the answer key was wrong.
It took reading what the agents wrote.

### 2026-09-03 - the trajectory dimension, measured

The first end-to-end run of the three-dimension pipeline, on the twelve trials
the anchor had already produced. Nothing was re-run in a container; the
trajectory and judge passes are both post-passes, which is the point.

| dimension | unaided | aided | lift | verdict |
|---|---|---|---|---|
| deliverable gates | 0.33 | 0.33 | 0.00 | no lift |
| judge | 0.72 | 0.94 | +0.22 | helps |
| trajectory | 0.67 | 0.94 | +0.28 | helps |

**Two independent instruments agree, which is the finding.** Broken down by the
dimension each criterion declares, the judge attributes most of its gap to
tooling - 0.67 to 1.00, +0.33, against +0.17 on outcome. The trajectory checks
measure the same thing mechanically and for free: the script the skill names as
step one of its protocol was run by **0 of 6** unaided trials and **5 of 6**
aided ones. That script only reads, so it leaves nothing in the tree and no
check on the repository could ever have seen it.

Neither half of that corroboration was obtainable a day earlier. The trajectory
was collected and discarded - 480 steps carrying 598 tool calls, none of which
reached the judge - and the judge had no dimension to attribute a gap to.

**A design defect found while validating the chain.** Trajectory grading was
wired after the judge call, so the one dimension that is deterministic and free
could only be obtained by paying for the one that is neither. With rendered
actions the judge prompt runs to roughly 200 KB and a call takes minutes;
twelve trials did not finish in ten. Reordered, and the judge is now skippable
with `--no-judge`: the same twelve trajectories then graded in seconds. That is
also the mode to use while writing a manifest's trajectory section.

**A second defect, in the judge's own contract.** "A pass without a concrete
quote is invalid" is unsatisfiable for a `restraint` criterion: an absence
cannot be quoted, and the parser turns an empty quote into a fail, so every
restraint criterion would have failed for the wrong reason. The judge is now
told the quote is what the agent did *instead*, at the step where the forbidden
act belonged.

### 2026-09-03 - the rebuilt base, and what it is not

The base was rebuilt onto five worlds of 59-79 files each and rewritten as 98
`core`/`hard`/`limit` scenarios. **Nothing in it has been measured except the
one anchor.** This entry exists so no later reader mistakes a clean lint for a
result.

**The anchor was measured twice against the new `incident` world, and the
result is uncomfortable.** Read it with the old figures beside it:

| | old fixture, 15 lines | new world, 64 files |
|---|---|---|
| gates, unaided | 0.58 | 0.33 |
| gates, aided | 1.00 | 0.33 |
| judge, unaided | 0.39 | 0.72 |
| judge, aided | 1.00 | 0.94 |

The realistic world did what it was built to do: the unaided baseline came off
the ceiling. The aided arm came down with it, and the gate lift went to zero -
4 of 6 trials in each arm passing one gate of two, identical distributions. The
judge still separates, +0.22, down from +0.61.

Stated as the question these two runs cannot answer: on a fifteen-line
repository the skill's advantage was large and mechanical; on a realistic one it
is smaller and lives in the reasoning, where only the judge sees it. Whether
that is the skill's limit or the gates' is not settled.

**The first run was thrown away by a regex, and the lesson is cheap to
transfer.** The gate guarding the forbidden fix was written
`"key":\s*(?!288\b)` and matched the *untouched* line, because `\s*` can
consume nothing and the lookahead then succeeds against the whitespace. It
failed on all 12 trials whatever the agent did. Verify a pattern against the
real fixture on both the passing and the failing line, and prefer a shape that
forces the lookahead onto the value.

**One exit-condition promise turned out not to be gateable, and was moved to the
judge rather than tuned.** "A blocking, deterministic guardrail sweeping the
existing code" was gated three ways: a reference in the pipeline file (1 trial of
12), then any new file under a check directory (0 of 12). What the trials
actually did was extend a test that already existed - and `npm test` is blocking
in that world. A path-keyed gate cannot see an edit to an existing file, and no
word grep separates a check that sweeps from a test that pins one case. Widening
a third time would have been tuning until the number moved.

**Both arms, in both runs, produced the same plausible half-answer**: they
bounded the symptom rather than the workload, which the fixture's ground truth
ranks fourth among the wrong answers. A mechanical gate distinguishes a
half-answer from an answer badly; that is usually judge work.

**The format-gate disease is gone from the measured surface.** 4 format gates
across 101 manifests, against 43 of 58 before, and all four sit in the two
manifests that were not rebuilt. The scenario authors probed their candidates
before shipping them and reported 100+ rejected greps between them - the whole
prescribed vocabulary of several skills (*invariant*, *port*, *backfill*,
*breaking/additive*, *severity*, *confidence*, *non-auditable*, *provisional*,
MUST/SHOULD/COULD, the audit grid-coverage floors) turned out unusable, because
`eval-probe` harvests the skill's own exit-condition checklist into the
skeleton. Six of the rejected greps were live gates in the manifests the
rebuild deleted. One salvage rule generalises: an unanchored `[Ss]kipped|[Nn]ot
run` probes as `format`, and the same grep anchored on its subject
(`(build|dynamic|publish|suite)[^\n]*([Ss]kipped|[Nn]ot run)`) survives.

**Twenty-eight of the 98 scenarios carry an admitted saturation, or a stated
saturation risk, in their own comment block** - seventeen of them `limit`
scenarios. The pattern is one thing: on a fixture big enough to gate honestly,
the fact a `limit` scenario turns on is often stated in plain English in the
first file an agent opens. `bug-ticket-root-cause/limit`
(a `withdrawn:` header that says what it means),
`refactoring-shared-component-api` (all three - the skill has measured 1.00
against 1.00 three times and a fourth null result IS the answer),
`validating-features-end-to-end/limit` and
`frontend-spec-call-site-audit/limit` (a module docstring hands over the
conclusion), `design-system-component-lifecycle/core` and `/limit`,
`merge-request-review/limit`, `commit-readiness-review/limit`,
`recording-decisions/limit`. An honest saturated scenario is a finding; the
rule the rebuild ran on is that a scenario silently claimed to discriminate is
a lie that costs four dollars to discover.

**Three things the instrument cannot see, found while writing gates rather than
while running them.** `exit_ok` is dead on the paired path exactly as
`transcript_*` was (part 3). `repo_clean` cannot see commits, so an exit
condition promising "zero code changes, zero commits" is half-gated at best.
And `eval-probe` under-reports for the three skills that point at
`../audit-report/reference/apparatus.md` with a backticked path rather than a
markdown link: `linkedDocs` follows links only, so their skeletons are 369-468
bytes against 1.7-4.3 KB for the skills that inline their format, and a gate
that would probe `format` on a sibling comes back `content` on them. No shipped
gate depends on that blind spot, because the authors avoided grid-coverage
floors everywhere.

**One scenario in the base must not be run.**
`recurring-bug-root-cause/evals/limit.eval.yaml` is written against `incident`
while the fixture it needs - an overlay with `inheritCommits: false` - does not
exist. Five `fix(publish)` commits sit one directory from the scope whose
premise it asserts to be false, and the skill's own
`scripts/detect-recurring-fixes.ts` reports them, so the fixture can walk an
agent into the failure the manifest scores. The manifest opens by saying so in
capitals. It is left in place rather than deleted because the owed fixture is
the fix.

**Two exit-condition lines are uncitable by construction**, which is a lint
defect rather than an authoring one. `bug-ticket-root-cause`'s "No application
file modified" and "Argued priority" carry two significant words each once the
stop list is applied, and `citationFindings` errors below three; the three
`repo_clean` gates deriving from them are annotated with the line they come
from and left uncited, a warning rather than a false citation. Either the
lint needs a floor exemption for short exit lines or that checklist needs
rewording. Five manifests carry an uncited gate for this and related reasons:
those three, plus `audit-report` and `performance-profiling`.

### 2026-09-02 - the instrument, not the skills

The base was rebuilt after this date, so the manifests these figures were taken
from no longer exist. They are kept here because they are the evidence for the
rebuild, and because a figure whose manifest was deleted is exactly the kind
that disappears silently otherwise.

**Seven of ten skills came back `saturated` on gates** (2 pairs each,
claude-sonnet-5, on the ten manifests that carried no measurement of their own):
`production-incident-diagnostic`, `commit-readiness-review`,
`design-system-component-lifecycle`, `detection-sweep`, `visual-regression-check`,
`writing-robust-tests`, `ddd-backend-implementation`. Two pairs never yields a
verdict; the saturation flag does not need one.

**The judge dimension was empty on every paired job until this date.** The judge
runs outside the container as a separate pass, and nothing had ever invoked it
on a Harbor trial. Half of every manifest was therefore unmeasured while the
reports looked complete. Running it changed one reading materially:
`recurring-bug-root-cause` went from "gates helps, judge inconclusive" to both
dimensions helping, +0.42 and +0.61 over 6 pairs.

**A monolithic skill and a thin skill delegating to a shared reference file
measured exactly the same**, on both dimensions, over 6 pairs, on both
`audit-security` and `recurring-bug-root-cause`: 1.00 against 1.00, flagged
`saturated`. This is not a null result about skill architecture. It is a
positive result about the instrument: when a gate scores the presence of
vocabulary, how the vocabulary was delivered cannot matter.

**`audit-security` separated its arms on gates and not on the judge**: 0.33
unaided against 1.00 aided, 6 pairs, while the judge sat at 1.00 on both. The
two gates that moved were greps for the words *confidence* and *non-auditable*.
That pair of figures is the clearest statement of the format-gate problem in
this log.

### Before the rebuild - what the deleted manifests recorded

Preserved from the twelve manifests that carried a dated measurement block.

**`audit-security`, 2026-08-24, 6 trials.** Finding the planted secret was
saturated, 6/6 on both arms. The audit apparatus its exit condition prescribes
was not: a confidence per question and the non-auditable items stated rather
than skipped both went 0/3 unaided against 3/3 aided. Two further criteria from
the same exit condition measured **0 on both arms** and were deliberately left
ungated: the computed domain score ("X scored out of Y"), 0/3 on 2026-08-24, and
a verification command cited per scored question, 0/4 on 2026-08-25. The second
had been added before being checked and had to come back out. Both point at the
skill instruction rather than at the manifest: audits get written without ever
showing what was run. **Seven other `audit-*` manifests inherited this
calibration** and never carried a measurement of their own.

**`recurring-bug-root-cause`, 2026-08-24, 14 paired trials.** Every unaided run
wrote a postmortem and tickets and stopped there, 0/7. Every aided run installed
a git hook or a CI job, 7/7. The exit condition demands a *blocking* guardrail,
and fixing the bug alone does not deliver one.

**`daily-workflow-optimization`, 2026-08-25 - the worst result of the sweep, and
entirely the manifest's fault.** Gates 1.00 unaided against 0.00 aided. Its
`repo_clean` allowed only the report, while its prompt asked the agent to act on
tooling and process, so the skill was penalised for doing what it was asked
while the passive arm passed.

**`recording-decisions`, 2026-08-25.** Nothing but a comment in `go.mod` reached
disk on 4 runs out of 4. Two causes stacked: the prompt named no destination,
and the skill's own fallback destination is `.claude/decisions.md`, which
`SNAP_PRUNE` hides from every gate. A deliverable landing there is invisible.

**`refactoring-shared-component-api` - no lift, stopped on purpose.** 1.00
against 1.00 three times: after the prompt stopped naming the call sites, after
the gates were hardened from the exit condition, and after the fixture gained an
aliased import that a grep of the component name cannot reach. The unaided arm
did the exhaustive sweep by itself, aliased call site included. A fourth
adjustment aimed at turning the number green would have been moving the target.

**`ddd-backend-implementation`, 2026-09-02.** Its only gate was a `grep_zero`
scoped to `src/users/domain`, a path the fixture never had and the prompt never
asked for, so a run that created nothing scored exactly like a run that
implemented the feature. The lint's do-nothing check caught it. Its replacement
gate carried a confessed defect worth remembering: it also measured adoption of
the skill's layer vocabulary, so a correct design calling the directory
`entities/` or `model/` would have failed it.

**The last full `tools/eval.ts run` was 2026-08-08**, and all 36 skills passed
it - which, per the caveat in part 1, proves each skill still produces its
deliverable on the operator's machine, not that it adds anything. The manifests
have been rewritten since (2026-08-24/25) and that run has not been repeated
against them.

**Two families came back saturated on their mechanical gates (2026-08-24).**
The fix in each case was to gate what the skill's own exit condition demands and
the manifest had left untested.

`recurring-bug-root-cause` gated only "the planted off-by-one no longer greps",
which any agent manages. Its exit condition also demands a **blocking**
guardrail, and nothing checked for one: 0 of 7 unaided runs produced a hook or a
CI job, 7 of 7 aided runs did. A `file_matching` gate now covers it.

`audit-security` gated only `repo_clean`, and its judge asked whether the
planted secret was flagged - which every run does, aided or not. What separates
them is the audit APPARATUS its exit condition prescribes: a confidence per
question, and non-auditable items stated rather than silently skipped. Both were
0/3 unaided and 3/3 aided. Both are greppable, so they are gates, not judge
criteria - the judge is for what stays subjective.

**One open finding**: the audit exit condition demands a computed domain score
("X scored out of Y") and NO run produced one, aided or not - 0/3 on
2026-08-24. A second criterion from the same exit condition, a verification
command cited per scored question, was added without checking and measured
0/4 on both arms on 2026-08-25, then reverted. A criterion nobody meets
penalises both sides equally and dilutes the signal. Both point at the skill
instruction, not at the manifest: audits get written without ever showing what
was run. Neither is gated.

**The other nine `audit-*` manifests were hardened the same day**, each on what
ITS OWN exit condition promises - the family is not uniform: `audit-architecture`
asks for non-auditable items but not a confidence, `audit-quality` the
reverse. Seven of them carry a gate calibrated on `audit-security`'s 6 trials
and say so in their comment block: they inherit the reasoning, not a
measurement of their own. `audit-industrialisation` measured judge-saturated
on 2 pairs (its single criterion passed in all four runs) and gained two
criteria from its exit condition; it and `audit-report` now gate the
MUST/SHOULD/COULD priority and the maturity class their exit conditions demand.
