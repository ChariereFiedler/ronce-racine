# Evaluating the prose skills

`tools/eval.ts` plays a skill through headless `claude -p` inside a throwaway
fixture and verdicts the result: mechanical gates first (from the skill's exit
conditions), an adjunct LLM judge for what stays subjective.
Design: [the spec](superpowers/specs/2026-07-20-skill-eval-harness-design.md).

## Commands

    npx tsx playground/setup.ts        # materialize the fixtures once
    npx tsx tools/eval.ts run --dry-run      # validate every skills/*/eval.yaml (CI does this)
    npx tsx tools/eval.ts run --only detection-sweep   # one skill, real agent run (API cost)
    npx tsx tools/eval.ts run                # full run - before a release only

Real runs need the `claude` CLI on PATH (or `EVAL_CLAUDE_BIN`); they are never
part of the public CI. Verdicts: PASS · FAIL(gate) · JUDGE-FAIL(criterion,
marked `~`, non-deterministic) · ERROR(infra - never treated as a regression).

## Adding a skill to the eval

Every skill has one: `skills/<name>/eval.yaml`. All 34 combine mechanical gates
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
