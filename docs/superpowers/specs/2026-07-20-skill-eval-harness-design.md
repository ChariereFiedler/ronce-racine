# Skill evaluation harness (testability tier 4) - design

Date: 2026-07-20 · Status: approved (brainstorm 2026-07-20)

## Problem

The toolkit's test suite covers the tooling (installer, hooks, executable skill
scripts) but not the product itself: 29 of the 34 skills are prose whose value
is the behavior they produce when an agent follows them. Nothing detects a
skill edit that silently breaks that behavior.

## Goal

A **replayable anti-regression harness**: each skill is played by a headless
agent against a known fixture, and the deliverable is checked against the
skill's own exit conditions. Run on demand and before each release - never per
push (real API cost).

## Decisions (settled during brainstorm)

| Decision | Choice |
|---|---|
| Purpose | Continuous anti-regression (replayable), not a one-shot audit |
| Execution | `claude -p` headless inside the fixture, skill installed via `install.ts` (the real distribution path) |
| Verdict | Mechanical gates from exit conditions first; LLM judge only for what stays subjective; judge-only (+ `repo_clean`) for the 3 judgment-class skills |
| Scope | All 29 prose skills (26 class B + 3 class C), built in a staged order |
| Architecture | Declarative runner + co-located manifests (`skills/<x>/eval.yaml`), single central `eval.ts` |

Rejected: one `eval.test.ts` per skill (29 copies of the same claude-CLI
mechanics); in-session multi-agent orchestration (not replayable, operator-
dependent).

## Architecture

```
eval.ts run [--only <skill>] [--dry-run] [--parallel N] [--confirm-judge] [--judge-model <id>]
  1. discover skills/*/eval.yaml manifests (warn on missing ones)
  2. per skill:
     a. materialize the fixture into a throwaway tmpdir (playground generator)
     b. install the skill into the fixture with install.ts
     c. run `claude -p "<manifest prompt>" --permission-mode acceptEdits` in the
        fixture; capture the JSON transcript + the final repo state
     d. apply the mechanical gates against (final repo, transcript, artifacts)
     e. if the manifest has a judge rubric: one LLM call -> per-criterion verdict
     f. skill verdict: PASS / FAIL(gate) / JUDGE-FAIL(criterion) / ERROR(infra)
  3. aggregate report (markdown + JSON) + diff against the committed baseline
```

`--dry-run` validates every manifest (schema, fixture exists, gates well-formed)
without any agent call - that mode runs in the public CI.

## Manifest format (`skills/<x>/eval.yaml`)

```yaml
fixture: flawed-app            # a playground fixture name (or inline: files)
prompt: >                      # what a user would naturally ask
  Run a detection sweep on this project and create the tickets.
gates:                         # closed vocabulary, executed by the runner
  - file_exists: "SWEEP-REPORT.md"
  - grep_zero:   { pattern: "console\\.log", in: "src/" }
  - repo_clean:  { except: ["SWEEP-REPORT.md"] }
  - transcript_contains: "EXPECTED.md"
judge:                         # optional - absent means gates only
  criteria:
    - "The report groups findings by cause, not by occurrence"
  threshold: pass_all          # or pass_ratio: 0.8
```

Gate vocabulary (v1, closed): `file_exists`, `file_absent`, `grep_zero`,
`grep_count`, `repo_clean`, `transcript_contains`, `transcript_absent`,
`exit_ok`. A new need extends the runner, never free-form YAML - that is what
keeps verdicts reproducible. YAML parsing: a homemade subset like `skills.ts`
already does for frontmatter (zero-dependency policy holds).

Class C skills (domain-modeling-design, recording-decisions,
daily-workflow-optimization): no gates beyond a mandatory `repo_clean`, plus a
mandatory judge rubric.

## LLM judge (adjunct)

- One call per judged skill, also via `claude -p` (same binary, same auth - no
  SDK or key management). Structured prompt: manifest criteria + the skill's
  exit conditions + compacted transcript + produced artifacts. Output forced to
  JSON `{criterion, verdict, evidence}`; a verdict without a citation from the
  transcript/deliverable is a FAIL (anti-leniency rule).
- Non-determinism is acknowledged: judge verdicts are marked `~` in the report,
  and the baseline comparator only declares a judge regression if it is stable
  across 2 runs (`--confirm-judge` replays automatically before concluding).

## Fixtures

- Reuse the playground generator; manifests reference fixtures by name.
  `flawed-app` (ground truth locked by tests) already serves the detection
  family. Roughly 6-8 new fixtures are needed - one per skill FAMILY, not per
  skill: reproducible-bug repo (bug-* family), feature-to-validate repo
  (validating/adversarial), shared-component repo (frontend family),
  audit-defects repo (the 8 audit grids).
- Every new fixture follows the `flawed-app` contract: planted defects +
  `EXPECTED.md` ground truth.

## Cost and execution model

- One skill run = one full `claude -p` session; 29 skills ~ 30-60 min
  wall-clock and real API cost. Hence `--only` for iteration, the full run
  before a release only. The JSON report is committed under `eval/reports/` and
  serves as the comparator baseline.
- Infra failures (claude binary missing, timeout, quota) are `ERROR`, distinct
  from `FAIL`; a run containing ERRORs never overwrites the baseline.

## Testing the harness itself

- Manifest parser and every gate: deterministic unit tests in
  `tests/eval.test.ts` (synthetic fixtures, zero LLM calls).
- `--dry-run` over the 29 manifests is a CI gate like any other.
- One dedicated mutation: a rigged criterion must not obtain a PASS without
  evidence.

## Build order (full scope, prudent delivery)

1. Runner + gates + dry-run + harness tests
2. 4 pilot manifests on existing fixtures -> first real run, cost/reliability
   calibration
3. Remaining family fixtures + the other 25 manifests
4. Committed baseline + `docs/evaluating-skills.md`

## Out of scope

- Running real agent evals in the public GitHub CI (cost, auth).
- Scoring skill QUALITY (style, pedagogy) - the harness checks that following
  the skill still produces its promised outcome, nothing more.

## Calibration notes (2026-07-20, 4 pilots, real runs)

Final state: 4/4 PASS. Wall-clock per skill: 1-7 min (writing-robust-tests the
longest at ~7 min; commit-readiness-review the shortest at ~1 min). Full-29
projection: 45-90 min sequential.

What the real runs taught (each finding fixed and committed):
1. `--permission-mode acceptEdits` was NOT the blocker predicted at review
   time: read-only tools plus file edits carried all four pilots. Keep
   acceptEdits as the default; revisit only if a step-3 manifest truly needs
   arbitrary Bash.
2. Parser bug: inline-object values containing a comma inside quotes broke
   when the comma-bearing value was the LAST key (`except: "docs/, .claude/"`
   parsed as a broken quote fragment). Red-first fix + mutation 14.
3. A manifest can contradict its skill: the recording-decisions pilot failed
   `repo_clean` on `~go.mod` twice - the agent was FOLLOWING the skill's
   "comment at the implementation site" exit condition. The manifest, not the
   agent, was wrong. Lesson: derive gates from the skill's exit conditions,
   not from intuition about what "clean" means.
4. Judge criteria must be short one-liners: the anti-leniency parser requires
   verbatim echo, and a two-line folded criterion got paraphrased by the real
   judge (ERROR, fail-closed as designed). Documented in
   docs/evaluating-skills.md.

Go for step 3 (remaining 25 manifests + family fixtures) when scheduled - a
separate plan.

## Step 3 completed (2026-07-20)

Full coverage: 34/34 skills carry an `eval.yaml`. Four family fixtures were
added to the playground (`buggy-app` with a planted off-by-one plus 3 prior
`fix(cart)` commits, `shipped-feature` with unit-tested happy path only,
`design-system` with 3 BaseButton call sites, `audit-target` with defects
spread across the audit domains), each with an `EXPECTED.md` ground truth.

Manifests were authored per family from each skill's own exit conditions.
Spot-calibration on 3 representative manifests (bug-ticket-root-cause,
audit-security as proxy for the 10 audit manifests, and
refactoring-shared-component-api): 3/3 PASS. Cumulative real runs: 7/7 PASS.

One authoring defect was caught before any run, by computing the gate against
the fixture rather than trusting it: a `grep_count` of the renamed prop was set
to the number of call sites (3), but a correct rename also touches the prop
declaration and its usage inside the component, yielding 4 matching lines. The
gate would have failed a correct refactor. Rule added to the docs: numeric
gates are computed against the fixture, never guessed.

Remaining: the full 34-skill run has not been executed end to end (cost); it is
the pre-release gate. `eval/reports/` baselines and `--confirm-judge` remain
deferred.

## Criterion corrected, then passing (2026-07-21)

`ddd-backend-implementation` failed its judge criterion "Email uniqueness
invariant enforced in the domain, not the handler". Its mechanical gate (the
dependency direction) passed; the criterion was the problem. Uniqueness across
aggregates needs a repository lookup, so it cannot live inside the aggregate:
the skill itself places it behind a declared port, orchestrated by the handler.
Reworded to "Uniqueness is checked through a declared port, not inline in the
API layer" - what the skill actually teaches - it passes.

Lesson: when a judge criterion keeps failing, check whether it asks for
something the skill never prescribed before blaming the agent.

## Gate-design rule learned over six failing runs (2026-07-21)

`repo_clean` with an allowlist only fits READ-ONLY skills. For a skill that
builds something, an agent legitimately produces files nobody can enumerate
upfront (tests, configs, adapters, CI jobs, probe scripts): the except list
never converges, and each run punishes the agent for obeying its own skill.
Gate the INVARIANT instead - what must not happen:

| Skill | Invariant gated |
|---|---|
| adversarial-feature-challenge | challenge without fixing: no validation added to the attacked function |
| ddd-backend-implementation | dependencies point inward: the domain never imports infrastructure |
| recurring-bug-root-cause | the bug is actually gone: the planted defect no longer greps |

Two vocabulary gaps surfaced the same way and were closed: `name-*` prefix
globs in `except`, and `grep_min` (a floor) for agent-authored output where an
exact count is unknowable.
