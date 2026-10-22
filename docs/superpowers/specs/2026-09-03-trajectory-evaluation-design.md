# Evaluating the trajectory, not only the deliverable

Design note. The eval harness grades what an agent produced. The skills it
grades prescribe how to get there, and almost none of that is measured.

## The problem, in numbers

A skill in this repository is not a description of an output. Counting the
sections across the 36 `SKILL.md` files:

| Section | Skills | What it prescribes | Graded today |
|---|---|---|---|
| `Exit condition` | 36 | the deliverable and its properties | yes |
| `Principle` | 25 | the stance the work takes | no |
| `Tooling` | 24 | the scripts to run | no |
| `Traps & rationalizations` | 22 | named excuses and their refutations | no |
| `Context to gather (before acting)` | 21 | what to read *before* acting | no |
| `Protocol` / `Steps` | 16 | the order of the work | no |

One of six surfaces is measured. The other five live in the trajectory, and the
harness collects the trajectory and throws it away.

Measured over the twelve trials of the 2026-09-03 anchor run:

- 480 steps, **598 tool calls**, and the judge saw **none of them**.
  `transcriptFromTrajectory` mapped each step to its `message` and dropped
  `tool_calls` entirely.
- So a criterion the anchor manifest actually ships - *"refutes a hypothesis
  with evidence it produced, not with a claim"* - was unjudgeable by
  construction. Running a command and saying you ran it rendered identically.

That is the mechanical form of the critique. It also explains a result the
findings log records as uncomfortable: on the realistic `incident` world the
gate lift went to zero and the judge lift narrowed. The dimensions where a
skill's advantage actually lives - did it gather context before acting, did it
follow the protocol, did it fall for a named trap - were not being read.

## What the literature says

Convergent, and it says the same thing three ways.

**Supervision only at the end is a sparse signal.** *AgentProcessBench*
(arXiv 2603.14465) frames step-level process quality as the gap: trajectory-level
supervision alone gives a coarse signal for multi-step decisions and worsens
credit assignment. Which is exactly the shape here - one score for a run that
took fifty steps.

**A rubric is the unit, and one judgment call per rubric item.** *RubricEval*
(arXiv 2603.25133) and *Step-wise Rubric Rewards* (arXiv 2605.17291) both give
the judge one rubric item at a time with the trajectory, and ask for a rationale
plus a binary verdict, attributed to the step that earns it. Holistic scoring of
a whole trajectory is the thing they move away from.

**Adherence to a fixed procedure is its own judge.** A phase-adherence judge
applies a procedural rubric across the successive phases of a trajectory,
exactly as given, adding nothing. The `Protocol` sections in this repo are
already written as such rubrics.

**The standard trajectory metrics are four**: tool correctness, step efficiency,
plan adherence, action safety. The first and third map onto `Tooling` and
`Protocol`; the fourth maps onto `Guardrails`.

**Judges are unreliable in known ways** - sensitive to order, wording and
position (*Can LLM-as-a-Judge Reliably Verify Rubrics in Agentic Scenarios?*,
arXiv 2606.29920). The countermeasure this repo can afford is a quorum with
per-criterion agreement, and treating a criterion below agreement as a badly
written criterion rather than a result.

## The design

### Five dimensions, three grading moments

The harness has two grading moments today and needs the second one to grow.
Nothing here changes what a gate means.

| Dimension | Source in the skill | Where it is graded |
|---|---|---|
| **outcome** | `Exit condition` | in-container verifier, repo state. Unchanged. |
| **tooling** | `Tooling` | post-pass, trajectory. Mechanical. |
| **sequence** | `Context to gather (before acting)`, `Protocol` | post-pass, trajectory. Mechanical for order, judged for substance. |
| **trap** | `Traps & rationalizations` | post-pass, judged. The trap table names the failure and its refutation. |
| **restraint** | `Guardrails`, the `limit` scenarios | both. An absence in the repo, an absence in the trajectory. |

The in-container verifier cannot see the trajectory: Harbor writes
`agent/trajectory.json` after the agent phase ends, and `eval-grade.ts` runs
before that with `transcript: ""`. This is why `transcript_contains` and
`transcript_absent` are dead on the paired path today. They are not dead
because transcripts are unavailable - they are dead because they were put in
the wrong grading moment.

### New check kinds, keyed on the trajectory

Graded in the post-pass, beside the judge, from `agent/trajectory.json`:

    tool_used:      { name: "detect-recurring-fixes", min: "1" }
    tool_absent:    { name: "git commit" }
    before:         { first: "git log", then: "write:build.config.json" }
    step_budget:    { max: "60" }

`before` is the one that carries the most and does not exist anywhere in the
current vocabulary. *"Context to gather **before acting**"* is an ordering
claim, and ordering is exactly what a repo snapshot cannot hold: the final tree
is identical whether the agent read the history first or last.

Two rules keep these honest, both learned from the gates:

- A trajectory check names an **action**, never a word the agent might say. A
  grep over the agent's prose is a format gate wearing a trajectory costume.
- Every check cites the skill line it derives from, under the same rule as the
  gates, and the citation names which of the five dimensions it belongs to.

### What the judge receives

One rubric item at a time, with the rendered trajectory, and a rationale plus a
binary verdict attributed to a step. Two consequences for the prompt builder:

- **Actions are rendered, with their arguments.** Which file was opened, which
  pattern was searched, which flag was passed. Arguments truncate per argument,
  so one long file body cannot push a step's other actions out of the budget.
  Already landed: the transcript went from 95 KB to 213 KB across twelve
  trajectories, and the added half is the actions.
- **The budget can no longer be a tail.** `JUDGE_TRANSCRIPT_TAIL` keeps the last
  30 KB, which was defensible when the transcript was prose. It is not now: the
  evidence for "context gathered before acting" sits at the **start** of the
  trajectory, and 30 KB of 213 KB taken from the end drops it entirely. The
  budget has to be spent per dimension - the opening steps for sequence, the
  closing steps for outcome - or raised and announced, as the artifact budget
  now is.

### What changes in a manifest

The scenario keeps its shape. It gains a section whose checks are graded from
the trajectory rather than the tree, and judge criteria carry the dimension they
belong to so the report can say *where* a skill helped rather than only whether
it did.

    tier: anchor
    fixture: incident
    prompt: >
      …
    preconditions: […]
    gates: […]            # outcome, in-container, unchanged
    trajectory:           # new, post-pass
      # from-skill(tooling): scripts/detect-recurring-fixes.ts then git log/git blame
      - tool_used: { name: "detect-recurring-fixes", min: "1" }
      # from-skill(sequence): Context to gather (before acting)
      - before: { first: "git log", then: "edit:build.config.json" }
    judge:
      criteria:
        - { dimension: trap, text: "Does not settle for a documentation-only guardrail" }

### Reading a report

The report gains the dimension breakdown. A skill that moves *sequence* and not
*outcome* is a different finding from one that moves neither, and the current
single gate/judge pair cannot express it. On the anchor's own numbers - gates
0.33 against 0.33, judge 0.72 against 0.94 - the open question is precisely
which dimension carried that judge gap, and the report cannot say.

## Migration

Additive. `trajectory:` is optional, an absent section grades as it does today,
and a manifest that declares none keeps its current verdict shape. The two dead
`transcript_*` gate kinds are subsumed: they become trajectory checks in the
grading moment that can actually see a transcript.

The 98 scenarios written on 2026-09-03 gate outcome only. Adding a trajectory
section to each is per-skill work, and the order to do it in is the tier order:
anchors first, where a dimension breakdown changes what the next measurement is
for.

## What this does not fix

The judge remains a model, and the reliability results above are not
hypothetical. A quorum with per-criterion agreement bounds the damage and does
not remove it. And a trajectory check can confirm a script was run without
confirming it was read - `tool_used` is `shallow` in the probe's sense, an act
rather than an understanding, and the skill-read rate the report already prints
is the same kind of evidence.

Sources: [AgentProcessBench](https://arxiv.org/pdf/2603.14465) ·
[RubricEval](https://arxiv.org/pdf/2603.25133) ·
[Step-wise Rubric Rewards](https://arxiv.org/html/2605.17291v1) ·
[Can LLM-as-a-Judge Reliably Verify Rubrics in Agentic Scenarios?](https://arxiv.org/html/2606.29920) ·
[Agent-RewardBench](https://arxiv.org/pdf/2506.21252) ·
[LangSmith trajectory evals](https://docs.langchain.com/langsmith/trajectory-evals)
