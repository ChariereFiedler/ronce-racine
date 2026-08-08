# Evaluating the prose skills

`tools/eval.ts` plays a skill through headless `claude -p` inside a throwaway
fixture and verdicts the result: mechanical gates first (from the skill's exit
conditions), an adjunct LLM judge for what stays subjective.
Design: [the spec](superpowers/specs/2026-07-20-skill-eval-harness-design.md).

## Commands

    npx tsx playground/setup.ts        # materialize the fixtures once
    npm run eval:dry                         # what CI runs: setup + parse every skills/*/eval.yaml
    npx tsx tools/eval.ts run --dry-run      # the same parse, without regenerating the fixtures
    npx tsx tools/eval.ts run --only detection-sweep   # one skill, real agent run (API cost)
    npx tsx tools/eval.ts run                # full run - before a release only

The runner installs the skill under test into the fixture through the real CLI
(`install --yes --pick skill:<name>`), so an eval also exercises the
distribution path, and a skill absent from the catalog cannot be evaluated.

Real runs need the `claude` CLI on PATH (or `EVAL_CLAUDE_BIN`); they are never
part of the public CI. Verdicts: PASS · FAIL(gate) · JUDGE-FAIL(criterion,
marked `~`, non-deterministic) · ERROR(infra - never treated as a regression).

## Adding a skill to the eval

All 36 skills carry one, and all 36 passed the last full run. Nothing forces
that: the runner discovers the manifests that exist, so a skill shipped without
one is silently skipped rather than reported. Each manifest combines mechanical gates
with a short judge rubric, in two shapes: gates+judge for skills with greppable
exit conditions, and class C (judge plus a `repo_clean` that only permits the
written deliverable) for judgment-heavy skills. A pure gates-only manifest is
allowed by the format but none is needed so far. Gate vocabulary:
`file_exists`, `file_absent`, `grep_zero`, `grep_count`, `repo_clean`,
`grep_min`, `transcript_contains`, `transcript_absent`, `exit_ok`. Extend the runner if a
new gate kind is needed - never free-form logic in YAML.

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
