# Rebuilding the eval base on realistic fixtures

Companion to the fixture contract in [evaluating-skills.md](../../evaluating-skills.md),
part 2, and the transposition rule in [fixtures.md](../../fixtures.md). This
file holds the one thing those two cannot: which skill goes where, and why.

## Why the base is being rebuilt rather than repaired

The old fixtures held 6 to 33 lines of code each and one of them, 15 lines,
was the target of eleven manifests. On a repository that size a gate has
nothing to key on but the wording of the deliverable, so every gate became a
format gate. The evidence and the three measurements that establish it are in
the findings log; the diagnosis is in part 2 of the main document.

All 36 manifests are deleted and rebuilt rather than patched. Patching them
against the same fixtures is what the previous rounds did, and it produced
hardened manifests on an unhardened substrate: `audit-security` went from 0.33
to 1.00 on gates while its judge never moved off 1.00 on either arm.

## Six worlds

Each world is a coherent repository, not a snippet, and serves several skills
through overlays with different histories rather than through one shared
snapshot.

| world | what it is | the trap it plants |
|---|---|---|
| `service` | backend domain, migrations, a tenant-scoped repository | one accessor bypasses the tenant scope |
| `surface` | design system, a component consumed in nine places | two call sites reached through a renaming barrel |
| `platform` | pipeline, decision records, runbooks | a stage barrier that reads as an oversight |
| `maturity` | an audit target that is genuinely uneven | an apparent gap that is handled outside the repo |
| `incident` | one defect class recurring in three areas | six prior fixes, each partially right |
| `shopfront` | the taste skills' world | outside the measurement base, see below |

`incident` is built first. It hosts `recurring-bug-root-cause`, the only skill
with a real six-pair figure on the old fixture, which makes it the one place
where the rebuild can be checked against a number rather than an impression.

## The classification

Two questions decide it, both answerable for free from the skill's own exit
condition:

- **A.** Does the exit condition name an outcome that survives a fixture -
  something that is not a word in the deliverable?
- **B.** Is there a world that can host it?

### Measured - three scenarios each

Their exit conditions name something a repository can carry: a call site
removed, a migration split in three, an index left empty, a dependency that
must not point outward, a glossary entry that must anchor to a type that
exists.

`adversarial-feature-challenge`, `api-contract-versioning`, `audit-architecture`,
`audit-ci-cd`, `audit-compliance`, `audit-industrialisation`, `audit-observability`,
`audit-performance-frontend`, `audit-quality`, `audit-security`, `audit-testing`,
`bug-ticket-root-cause`, `bug-triage-structured`, `commit-readiness-review`,
`comprehensive-test-strategy`, `daily-workflow-optimization`,
`database-schema-evolution`, `ddd-backend-implementation`,
`design-system-component-lifecycle`, `detection-sweep`, `domain-glossary`,
`domain-modeling-design`, `frontend-fullstack-implementation`,
`frontend-spec-call-site-audit`, `merge-request-review`, `qa-session-intake`,
`recording-decisions`, `recurring-bug-root-cause`,
`refactoring-shared-component-api`, `validating-features-end-to-end`,
`writing-robust-tests`.

Three of these carry a caveat that must be written into their manifests rather
than discovered again later:

- **The nine audit skills** are measured on `maturity` only because that world
  is deliberately uneven. Their exit conditions are otherwise almost entirely
  about the report, and on a uniform target they collapse back into format
  gates. What discriminates is *which* questions get marked non-auditable and
  *which* level each one gets, both checkable against a world whose answer is
  known. Gate the decision, never the vocabulary.
- **`ddd-backend-implementation`** must be gated on dependency direction, read
  from imports, and never on directory names. Its previous gate measured
  adoption of the skill's layer vocabulary and said so in its own comment: a
  correct design calling the directory `entities/` failed it.
- **`refactoring-shared-component-api`** found no lift three times running, and
  the unaided arm did the exhaustive sweep by itself including an aliased
  import. It is rebuilt on `surface` because a barrel re-export is a harder
  scenario than an alias, not because the previous figure needed rescuing. If
  it comes back 1.00 against 1.00 a fourth time, that is the answer.

### Half-measured - the diagnosis, not the act

`ci-pipeline-orchestration` and `production-incident-diagnostic` act on
something a fixture cannot provide: a live pipeline, a running production. A
fixture degrades both to "write a plan". The diagnosis half is measurable and
was already shown to separate the arms by +0.50 once the prompt stopped listing
what the plan needed; the acting half is not. Their manifests say so.

### Smoke - kept, never counted

`audit-report` is a template and a set of computation rules, consumed by the
other audit skills rather than run on a repository. `performance-profiling`
needs a live profiler; whether a checked-in synthetic trace makes it
discriminate is worth one cheap probe before deciding.

### Unevaluated - and the manifest is deleted, not faked

`visual-regression-check` requires a browser, and the eval container has none.
It carries no manifest. Its README says why.

Deleting beats keeping a manifest that cannot fail. Coverage reads as evidence,
so a green check that means nothing is worse than an acknowledged gap.

## What survives from the previous round

Seventy-two scenarios were designed against the old fixtures and reviewed by an
adversary whose job was to pass each one without the skill. Three layers, three
fates:

- **The traps survive**, and they are the expensive part: the aliased barrel a
  grep cannot reach, the blame dead-end where the introducing commit touched
  another file, the duplicate ticket already open, the decision record that
  already settled the term.
- **The adversarial reviews survive and matter more.** Each carries a written
  argument for how a careful unaided agent fails. That argument becomes the
  mandatory paragraph in every `EXPECTED.md`, and it is the free filter that
  catches a saturated scenario before a single trial is paid for.
- **The gates and the overlay code do not survive.** They were computed against
  fifteen-line bases, and several are flagged by their own reviewers as
  measuring citation format rather than content.

## Admission, and what it costs

No scenario counts until, cheapest first: the lint is clean, every gate cites
the exit-condition line it derives from, `EXPECTED.md` carries the unaided
walkthrough, the template-only probe passes no gate, a two-pair probe leaves
the unaided arm off the ceiling, and a six-pair run produces a verdict recorded
in the manifest.

The template-only probe is the new one and the one worth most. Grade a
synthetic deliverable carrying the skill's headings and no content: any gate it
passes is a format gate. It costs a single call and it would have caught most
of what was wrong with the old base.

| tier | protocol | count | budget |
|---|---|---|---|
| anchor | six pairs, topped to twelve, re-measured every release | 8 | $32 per re-measure |
| measured | six pairs once, at admission | ~30 | ~$120 one-off |
| probed | admission checks only, never a causal verdict | ~70 | ~$50 |

A scenario stuck at the two-pair probe twice is retired rather than rescued.
The retirement is the finding.

## The stopping condition

Named before spending, because the whole rebuild rests on one unproven bet:
that realism moves the unaided baseline down.

> Build `incident`, rebuild `recurring-bug-root-cause` on it, run the anchor
> protocol. On the old fixture the unaided arm scored 0.58 on gates and 0.39 on
> the judge, against 1.00 and 1.00 aided.
>
> If the unaided gate score does not fall well below 0.58, and the judge gap
> does not hold or widen, **stop at two worlds**. The problem is then the skill
> texts, and no amount of fixture work will fix it.

Cost of the answer: about eight dollars.

## A harness defect that would have corrupted the audit measurements (fixed)

`pairedArms` in `tools/eval-tasks.ts` stages exactly one skill directory into
the with-skill arm. Two skills today, `audit-security` and `audit-testing`,
delegate their apparatus to a sibling: their `SKILL.md` says to read
`../audit-report/reference/apparatus.md` before writing the report, and the
score rule, the confidence levels and the handling of non-auditable items live
there and nowhere else.

So the default paired run of either measures a skill whose central pointer
dangles. The scenarios in the `maturity` world key on exactly what that file
defines - which questions are marked non-auditable, which level each one
carries - so the defect lands on the gates that matter most. The other seven
audit skills carry their own apparatus today; if the thin architecture spreads
to them, it spreads this defect with it.

The escape hatch existed: `--arms` accepts an arm that installs two directories,
and the three-arm run of 2026-09-02 used it. Requiring the operator to remember
it per skill was not a fix, because the pointer is a literal `../<skill>/` path
in the skill's own text and the generator can read it.

`pairedArms` now stages what it finds there. A pointer to something absent is
dropped rather than staged: a path Harbor cannot upload would turn a skill
defect into an infrastructure error, and the report is required to treat those
as never-a-regression, which would hide it.

## Two things the report must learn to say

Both are honesty items the current one lacks, and both bite hardest on a base
this size.

At six pairs a sign test cannot resolve a skill that helps four times out of
six; it reads as no lift and would be wrongly closed under the "no lift,
stopped" outcome. The report must print the p-value and the count of discordant
pairs rather than a verdict alone.

And a judge criterion below two-thirds agreement across the quorum is a badly
written criterion, not a result. That failure mode is already on record from
the `recording-decisions` pilot, where long criteria came back paraphrased.
