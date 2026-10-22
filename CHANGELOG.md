# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Individual artifacts (rules, skills, hooks) also carry their own `version` in
their frontmatter; this file tracks the toolkit as a whole.

## [Unreleased]

## [0.9.0] - 2026-10-22

Minor, not patch: the `ronce` mod (an in-process plugin of function hooks, enforced rules, quality
checks and a session report) ships with the plugin for the first time, the measurement base is
rebuilt as 98 core, hard and limit scenarios, and a new opt-in hook sends shell file reads back to
Read and Write. Nothing a 0.8.x install relies on is removed.

### Added
- **`shell-read-guard` - shell file reads sent back to Read/Write** (opt-in,
  `PreToolUse`/`Bash`). Denies `sed -n` and `cat` on a project file, and
  `cat > file <<EOF` to create one. Measured on a real agent run (2026-09-19, 32
  minutes, $14.15): 43 of its 101 Bash calls were file reads - 18 `sed -n`, 11
  `cat`, 14 `grep` - pouring 125k characters into the context. A run pays for its
  whole context on every call, so a 10k `cat` at call 20 is billed again by the
  260 that follow. Bounded reads (`| head`, `grep -l/-c/-q`) and scratch paths
  are left alone; `# no-read-guard` overrides. It answers `deny` rather than
  rewriting, hence opt-in.
- **The measurement base, rebuilt as 98 scenario manifests over five worlds.**
  Every measured skill now declares three scenarios under
  `skills/<skill>/evals/` instead of one `eval.yaml`: **core** (the central
  promise against the world's main defect), **hard** (a careful agent following
  only the prompt plausibly fails a gate the exit condition promises) and
  **limit** (the right answer is restraint - not applicable, insufficient
  evidence, do not act). The base had no `limit` scenario for its first months,
  which is why no skill could fail by producing its deliverable when none was
  warranted. 101 manifests over 36 skills: 98 scenarios for 33 skills, plus the
  `recurring-bug-root-cause` anchor and the two declared-smoke defaults;
  `visual-regression-check` still carries none, and its README says why.
  Every gate cites the exit-condition line it derives from, and every scenario
  carries a written argument for how a careful unaided agent fails it - or an
  explicit admission that it is saturated, which 28 of the 98 make.
  **Nothing in the rebuilt base has been through a paired run**; every manifest
  but the anchor declares `tier: probed` and says so in its own words.
- **What a run cost, and what that bought.** Wall-clock per trial was collected
  from the start and displayed nowhere; it now prints beside the tokens and the
  cost. It is the least reproducible number here - the same scenario ran between
  three and forty-seven minutes on one machine depending on how many agents
  shared it - so it is read as a ratio between two arms of one job, exactly as
  cost already was, and never enters a verdict. On the anchor: 1.25x the time,
  1.36x the money, 1.39x the tokens, three numbers pointing the same way.
  A new `costly-no-lift` flag fires when the aided arm costs at least twice as
  much and NO dimension helps. It skips a scenario whose verdicts are merely
  withheld: "no dimension helps" and "no dimension is entitled to say it helps"
  are different, and flagging a probed scenario would turn a withheld verdict
  into an accusation.
- **Trajectory evaluation**: a manifest gains a `trajectory:` section graded from
  the agent's own trajectory in the post-pass, and judge criteria carry the
  dimension they grade - outcome, tooling, sequence, trap or restraint. A skill
  prescribes six surfaces and only one of them, the exit condition, survives
  into the repository; the other five are claims about what the agent DID.
  Measured over the twelve trials of the 2026-09-03 anchor run: 480 steps
  carrying **598 tool calls, none of which reached the judge** - the renderer
  kept each step's prose and dropped its actions, so a criterion like "refutes a
  hypothesis with evidence it produced, not with a claim" was unanswerable by
  construction. Rendering actions took the transcript from 95 KB to 213 KB.
  Replayed on the same twelve trials, the trajectory dimension gives the largest
  lift of the three - 0.67 unaided against 0.94 aided, where the deliverable
  checks moved 0.00 - and its strongest single check, the script the skill names
  as step one, went 0/6 unaided against 5/6 aided. That script only reads, so no
  check on the tree could ever have seen it. Six check kinds: `tool_used` with an
  optional argument scope, `tool_absent`, `read_file` (counting a shell read as
  well as a dedicated tool, or you measure the harness rather than the work),
  `wrote_file`, `before` - the ordering claim a snapshot erases - and
  `step_budget`. An unreadable trajectory fails every check including the
  absence ones: a lost trial must not score like a perfect one.
- **`docs/measuring-prose.md`**: the method, written to be reusable without this
  code - the failure that eats this kind of eval, the six-point fixture
  contract, the synthetic-deliverable probe, the trajectory dimension with its
  figures, the three legitimate outcomes, and the never-move-the-target rule.
  The code is 3300 lines a reader will rewrite anyway; the mistakes are the part
  worth having.
- **A format-gate probe** (`npm run eval:probe`): grades a deliverable carrying
  the skill's own headings and no content whatsoever against a manifest's gates.
  Any gate it passes scores vocabulary rather than work, since the deliverable
  knows nothing about the fixture. It reuses `applyGate`, so it cannot count
  differently from the gate it probes. On the base as it stood before the
  rebuild: **43 of 58 gates were format gates, 13 survived**. On the base as it
  stands after it: **4 format gates across 101 manifests, 197 survive**, and all
  four are in the two manifests declared smoke. A path-keyed gate is reported
  `shallow`
  rather than `format` - an empty artifact in the right place passes it, but
  putting it there is an act, not a word, and the acts these gates ask for
  measured 0/7 unaided against 7/7 aided. Severity follows the tier: reported
  everywhere, blocking only for a manifest claiming the right to publish a
  causal verdict.
- **A `tier:` on every manifest** - `anchor`, `measured` or `probed` - so a
  five-minute smoke scenario cannot sit in a report beside one measured at full
  power as though the two numbers meant the same thing. An untiered manifest
  grades as `probed`, the direction that costs at worst a withheld verdict.
  `eval-lint` now requires the tier alongside an `answer-only` annotation, so a
  manifest admitting it has no mechanical signal cannot sit unnoticed inside the
  measured base, and requires every gate to cite the exit-condition line it
  derives from - a warning today, an error the day the manifest claims a tier
  that may publish a verdict.
- **An agent time budget that knows how big the fixture is**: a 1200s floor plus
  20s per file and 6s per KiB, capped at an hour, measured on the staged tree
  through the same prune list the gates use. The old constant was sized for
  6-line fixtures; on a 40-file one, orientation alone costs minutes before any
  work starts, and both arms timing out yields a null result that reads as "the
  skill does not help". The floor is the old value, so no recorded measurement
  changes conditions retroactively.
- **`incident-first-failure`, the first overlay fixture**: `incident` with the
  publish-side recurrence removed - every commit kept except the five
  `fix(publish)` ones, their cumulative effect folded into one commit that is
  not a fix, worktree byte-identical to the base's. The `limit` scenario of
  `recurring-bug-root-cause` asserts a recurrence where the history holds a
  single correction, and against the base that scenario was confounded rather
  than hard: five fix commits sat one directory from the scope whose premise is
  false, and the skill's own detector reported them, so an agent misled by the
  fixture would have been scored as eager. Verified after the swap: the detector
  says "apply the skill" on the base and "no scope at the threshold" here.
- **History primitives for fixtures**: a commit step can now patch a file in
  place or delete one, instead of restating every touched file in full. A
  thirty-commit history was previously thousands of lines of escaped literals in
  which one content edit had to be propagated by hand through every later commit.
- **A fixture contract, and the rule for where fixture realism comes from**:
  `docs/evaluating-skills.md` part 2 states the six things a fixture must carry
  before its manifests may claim a verdict, and why the first of them - shipping
  the deliverable's own format inside the fixture - is what stops a gate
  degenerating into a word grep. `docs/fixtures.md` states the transposition
  rule: the difficulty structure of a real episode crosses into a fixture and
  nothing else does, no path, no hash, no ticket number, no sentence. A denylist
  in `tests/fixtures.test.ts` makes the mechanical tells impossible to land by
  accident; it cannot establish that a transposition is clean, and says so.
  `docs/superpowers/plans/2026-09-03-eval-base-rebuild.md` records which skill is
  measured, which is smoke, and which carries no manifest at all.
- **Fixture invariants**: a fixture declares the counts it guarantees, checked
  through `applyGate` - the same code path a manifest's `grep_count` takes, so an
  invariant cannot count differently from the gate it protects. An overlay
  inherits its base's invariants except those keyed on a file it rewrote, in the
  tree or through a commit. Without this, a content edit silently moves what a
  gate measures several scenarios away.
- **Paired with-skill/without-skill measurement**: `tools/eval-tasks.ts` generates
  one Harbor task per skill manifest (verified across all 36: one task each,
  never the manifest itself or `EXPECTED.md` inside the image); `tools/eval-grade.ts`
  applies a manifest's checks to a finished run and writes partial-credit
  scores, never short-circuiting on the first failure; `tools/eval-judge.ts` runs
  an adjunct LLM-judge pass after the trial, outside the sandbox (the judge
  needs an API the container has not got), built from the manifest alone so it
  cannot grade the arm's label instead of its work; `tools/eval-report.ts`
  compares the two arms and attributes the gap per dimension, refusing a causal
  verdict below six paired trials and flagging a dimension `saturated` when its
  baseline already sits at the ceiling. `eval-report --summary` prints one line
  per skill, weakest-first, so a sweep can be read while it is still running.
- **Named arms**: `eval-tasks --arms "name:dir[,dir];…"` declares more than the
  default with/without pair, for "this version of the skill against that one";
  an empty dir list is the no-skill arm, each name lands in the trial's
  `result.json`, and `eval-report --contrast a:b` pairs the trials by those
  names - judging each dimension against the named baseline, and refusing to
  pool a job with named arms when no contrast is given.
- **`npm run eval:lint`**, run with no agent call as part of `npm test`: errors
  when a gate's literal is handed over verbatim in its own prompt (the check
  would then be satisfiable by reading the prompt alone) and warns when a judge
  criterion echoes the prompt's own wording. A `# leak-ok: <reason>` annotation
  covers the irreducible leaks - a rename that cannot be asked for without
  naming the new prop, an imposed contract that has to be stated.
  It also replays every manifest's preconditions and gates against the
  UNTOUCHED fixture (minus `EXPECTED.md`, which never enters the image): a
  manifest whose checks all hold there scores a do-nothing agent exactly like
  one that did the work, and an absence gate scoped to a path the fixture has
  not got - `grep_zero` on `src/users/domain` - passes for free whatever
  happened. Found after a real paired run in which an agent that produced no
  file at all passed `ddd-backend-implementation`.
- **A `preconditions:` list**, split out of a manifest's `gates:`: a check
  belongs in `gates` only if an agent could plausibly fail it while still doing
  what the prompt literally asked. A deliverable's mere existence - unearnable
  credit, since an unskilled run produces it too (28 of 72 gates across the 36
  manifests, measured 2026-08-24) - moved to `preconditions` and is reported
  alone on failure, since a missing deliverable makes every gate below it
  uninterpretable rather than failed.
- **A `file_matching` gate kind**, keyed on a path pattern rather than one exact
  filename, for exit conditions that demand a *kind* of file - a guardrail is a
  git hook or a CI job, and the agent picks where it lives.
- **`repo_clean`'s optional `in`**, scoping the invariant to the tree that must
  not move instead of requiring every legitimate file a skill might touch to be
  enumerated.
- **A read rate per arm in `eval-report.ts`**, taken from each trial's ATIF
  trajectory: how many trials opened the skill at all, and how many followed a
  pointer into a `reference/` file under a skill directory. Below 100 % on the
  measured arm the report flags `skill-unread` - a flag, never a gate, since a
  trial that never opened the skill measures the model rather than the text.
- **`tools/skills.ts validate` accepts a cross-skill reference written the way
  an installed skill walks it** (`../audit-report/reference/apparatus.md`),
  resolving it against `skills/<skill>/reference/<file>` like the bare form.
  The lint had been rejecting the only path that works at runtime, which forced
  a pointer to spell out two paths for one file.

### Fixed
- **The skill suggestion now runs the algorithm its tests measure.** Two scorers
  coexisted: the one in `tools/routing-cases.ts`, held to account by 208 cases
  (198 triggers ranked top-3, 10 disambiguation cases), and the one the hook
  actually ran — `triggers.filter(t => prompt.includes(t)).length`, no stopwords,
  no stemming, no weighting. The algorithm under test was never the algorithm
  under load, the same defect the 2026-08-24 portability postmortem records for
  the two frontmatter parsers. Scoring now lives once, in `hooks/skill-scoring.ts`,
  imported by both.
- **A suggestion below the noise line is no longer emitted.** The hook named three
  skills whatever the score, so a prompt calling for none still got three.
  Measured on the live catalogue (2026-09-19): prompts that genuinely call a skill
  score 17, 7, 3; prompts with no business here score 1 or 0. Below `MIN_SCORE`
  (2) the hook stays silent — naming nothing is an answer.
- **A backup no longer lands in a directory the harness scans.** Claude Code
  loads every directory under `.claude/skills/`, so a skill backed up in place as
  `<name>.pre-install.bak/` was loaded as a SECOND skill - the same instructions
  offered twice to the model, under a name ending in `.bak`. One install of a
  20-skill toolkit put 35 of those in front of it. Backups (both `pre-install`
  and `pre-uninstall`) now live under `.claude/.ronce-racine-backups/<kind>/`;
  `uninstall` still restores one left in place by an older install.
- **`truncate-output` now caps unbounded shell reads** (`cat`, `sed -n`,
  unbounded `grep`). It only knew the commands that are verbose by *accident* -
  a build, a fetch - and ignored those verbose *by construction*, proportionally
  to the file they read. A `grep` that already carries its bound (`-l`, `-c`,
  `-q`, `-m N`) is left alone; `--include="*.ts"` no longer reads as a grouped
  `-l`, which had it pass for bounded.
- **Three scenarios could not run at all.** All three `merge-request-review`
  manifests opened with "Commit 8f22028 is the change under review" and no such
  object existed: the fixture generator pins the commit author but not the date,
  so every regeneration produces different ids. The agent would have searched for
  something that is not there and returned a null result, which reads exactly
  like "the skill does not help" - the expensive failure, because it costs a full
  paired run to find and arrives looking like a finding. They now name the commit
  by its subject, which survives a regeneration and a later edit of the history,
  and `eval-lint` refuses a prompt naming a git object its fixture cannot
  resolve. It reads the prompt only: a comment block legitimately quotes the id
  it discusses.
- **Seven exit conditions demanded something their own skill never taught.**
  Found by surveying all 209 exit-condition lines against the skill bodies. The
  sharpest: `bug-ticket-root-cause` stated as observed - "each test fails before
  the fix, passes after" - something its Principle, Traps table and Guardrails
  all forbid observing, since it may not modify an application file; its template
  already had it right as a prediction. `commit-readiness-review`'s "a missing box
  = no commit" had no notion of a suite red before the change, so read literally
  it forbade every commit in a repository red for a fortnight - and its own eval
  manifest already graded the right behaviour, so the eval was ahead of the skill
  and supplied the wording. Also fixed: a deliverable addressed to a read-only
  path inside the installed skill, a before/after comparison with no step
  producing the before, a notation defined nowhere, and a p-value demanded of a
  toolchain that reports none.

- **The judge could not see a single tool call.** `transcriptFromTrajectory`
  mapped each step of the ATIF trajectory to its `message` and dropped
  `tool_calls` entirely, so the judge read what the agent SAID and never what it
  did. Counted over the twelve trials of the 2026-09-03 anchor run: **598 tool
  calls across 480 steps, none of them visible**. A criterion the anchor
  manifest actually ships - *"refutes a hypothesis with evidence it produced,
  not with a claim"* - was therefore unanswerable by construction, because
  running a command and claiming to have run it rendered identically. Tool calls
  now render with their arguments (which file was opened, which pattern was
  searched, which flag was passed), each argument truncated on its own so one
  long file body cannot push a step's other actions out of the budget. The
  twelve transcripts went from 95 KB to 213 KB, and the added half is the
  actions. The judge is now held to it: a rendered call is a quote, and for a
  `tooling` or `sequence` criterion it is the ONLY admissible evidence - an
  agent saying it ran a command is not proof that it ran.
- **Every fresh install reported as drifted, and uninstall then refused to
  delete what it had installed.** The installer's copy filter excluded any path
  ending in `eval.yaml` while drift control excluded only the exact name
  `eval.yaml`, so the two disagreed about every `evals/<scenario>.eval.yaml` the
  moment skills gained one: `check` listed manifests that are deliberately never
  distributed as missing files, and `uninstall` - reading that drift as local
  edits worth preserving - renamed the skill directories to `.pre-uninstall.bak`
  instead of removing them, leaving `.claude/` behind. Both now read one
  predicate, `isDistributed` in `src/lock.ts`. `copyPath` also drops a directory
  whose every file the filter rejected, so an empty `evals/` shell is no longer
  installed into a target repository.
- **The judge graded content it had never seen, and said nothing.** The artifact
  budget was 10 KB over a bundle of whole file bodies in directory-walk order,
  so on a fixture of any size the judge returned confident verdicts about files
  cut from its prompt, and a deliverable whose path sorted late was dropped
  entirely. Never reached on 6-line fixtures, which is why the cliff was
  invisible. The budget is now 80 KB, the files a manifest's own checks name are
  presented first, and every cut is announced by name and byte count with an
  instruction not to assume what was not shown. The transcript was cut the same
  way while its heading claimed truncation unconditionally; it now says which.
- **A thin skill's with-arm measured a dangling pointer.** `pairedArms` staged
  exactly one skill directory, and Harbor uploads a staged directory verbatim.
  `audit-security` and `audit-testing` both send the reader to
  `../audit-report/reference/apparatus.md` for the score rule, the confidence
  levels and the handling of non-auditable items, so their aided arm ran a skill
  whose apparatus was not in the image. The generator now reads that pointer out
  of the skill's own text and stages what it finds; a pointer to something absent
  is dropped rather than staged, because a path Harbor cannot upload would turn a
  skill defect into an infrastructure error, which the report treats as
  never-a-regression and would therefore hide.
- **A scenario manifest would have shipped in the npm tarball.** The package's
  file list excluded `skills/**/eval.yaml`, which does not match
  `<scenario>.eval.yaml`. Reproduced by adding one and watching `npm pack` carry
  it. The installer's own filter matches on the suffix and was already correct;
  a test now proves that rather than assuming it, so a future rename cannot leak
  the oracle into the container that the agent under evaluation runs in.
- **The toolkit this repo installs into itself was a stale snapshot.** Installed
  from 0.5.1 while the repo ran 0.8.0: 24 drifted artifacts, 20 of 21 `SKILL.md`
  two minor versions behind, and only 21 of the skills present at all. A
  contributor working here read July's text while `skills/` held August's. The
  `check` command already reported all of it and had never been run on this
  repo; a test now runs it, so the copy cannot silently fall behind again.
- **The fixture's answer key was reachable from inside a Harbor image.**
  `EXPECTED.md` was removed from the shipped worktree but had been `git add`ed
  with the rest of the fixture, so `git show :EXPECTED.md` printed it to the
  agent under evaluation, and on `buggy-app` it sat in `HEAD`. The fixture
  generator now keeps the file out of git entirely; a test locks the index and
  the history of every generated task. Figures measured before 2026-09-02 were
  taken with the key reachable, whether or not any agent read it.
- Prompts for **api-contract-versioning**, **database-schema-evolution**,
  **ddd-backend-implementation**, **production-incident-diagnostic**,
  **frontend-fullstack-implementation**, **comprehensive-test-strategy**,
  **ci-pipeline-orchestration** and **refactoring-shared-component-api** stopped
  spelling out the method their skill exists to teach.
- **domain-modeling-design**'s prompt never said where the domain model should
  land, so it lived in the conversation and nothing reached disk; it now names
  `MODEL.md`. **recording-decisions**'s exit condition offers
  `.claude/decisions.md` as its own fallback, which the harness's own prune of
  `.claude` hides from every gate; the prompt now names a place the harness can
  see.
- **`playground/buggy-app`'s three prior `fix(cart)` commits were
  `--allow-empty`** (the first also carried the whole initial import from a
  preceding `git add -A`), so an agent could root-cause the fixture's own
  construction instead of the recurring symptomatic-patch pattern it exists to
  present. Each commit now rewrites the file it claims to touch, with a test
  locking a non-empty diff on every one and the planted off-by-one still alive
  at HEAD.
- **audit-security** dropped a judge criterion asking each scored question to
  cite the verification command behind it: 0 of 4 runs met it on either arm, so
  it penalised both sides equally instead of separating them.
- **api-contract-versioning**'s gates are now calibrated from its four retest
  runs instead of derived a priori - `expand-contract` and a dated removal
  ticket appear in every skilled run and no unaided one.
- **refactoring-shared-component-api**'s fixture gained a fifth file that
  reaches the component through an aliased import (invisible to a grep of the
  component name) plus noise files, with its call-site count recomputed
  against the fixture (3).
- **validating-features-end-to-end**, judge-only by nature since it produces no
  file, gained a criterion asking for a verdict per unvalidated edge case
  rather than a bare mention, plus the never-"it-should-work" rule as a
  criterion of its own.

### Removed
- **`visual-regression-check` no longer carries an eval manifest.** It drives a
  real browser across two viewports and the eval container has none, so a
  manifest could only ever grade a *plan* for looking - which is precisely what
  the skill exists to stop people substituting for looking. Its README records
  the gap and what would close it. Deleting beats keeping a check that cannot
  fail: coverage reads as evidence, and a green check that means nothing is
  worse than an acknowledged hole.

### Changed
- **`audit-report` and `performance-profiling` are declared smoke**, and say what
  they do not measure. The first is a template and a set of computation rules
  consumed by the other audit skills, so there is no work of its own for a
  fixture to make hard; its gates are format gates by construction, which is the
  honest shape when the deliverable IS a format. The second needs a live
  profiler. Its manifest now carries the open question rather than a shrug:
  whether a synthetic trace checked into the fixture makes an unaided run invent
  numbers while an aided one reports a noise floor. Two pairs, about $1.40,
  unspent.
- **Hardened the manifest for every one of the 36 skills** so gates and judge
  criteria measure against each skill's own exit condition instead of
  saturating at 1.00 on both arms: prompts that handed over the method under
  test (an architecture, a layer list, a matrix structure, an exhaustive
  call-site list) now state only the need and leave the method to the skill;
  added checks cover what exit conditions promise beyond a bare deliverable -
  a decision's weighed options and revisit condition, a review's stated
  verdict, an audit's confidence and actionability ranking, a glossary's
  rejected synonyms, a guardrail that actually blocks.
- **Each dimension - gates, judge, trajectory - now carries its own verdict**,
  instead of one verdict driven by the gates alone. A report that read
  "inconclusive" while the judge had separated the arms cleanly was burying the
  only dimension carrying signal. The judge half is additionally broken out per
  dimension - outcome, tooling, sequence, trap, restraint - each against its own
  baseline and its own pair count, because the anchor's numbers (gates 0.33 vs
  0.33, judge 0.72 vs 0.94) left "which dimension carried that judge gap"
  unanswerable. A manifest declaring no trajectory section scores `null` there,
  never `0`: unmeasured must not read as failed, and `trajectory-partial` says
  when an arm's mean is over a subset of its trials.
- **The judge's transcript budget is no longer a tail.** `JUDGE_TRANSCRIPT_TAIL`
  kept the last 30 KB, which was defensible while the transcript was prose and
  stopped being defensible the moment tool calls were rendered: the twelve
  anchor trajectories went from 95 KB to 213 KB, and 30 KB taken from the end of
  213 KB drops the opening steps entirely - which is exactly where the evidence
  for "context gathered *before* acting" lives. `JUDGE_TRANSCRIPT_BUDGET` is
  120 KB, spent 40 % on the opening and the rest on the close, cut back to line
  boundaries so no half-rendered call can be quoted as an act, and every cut
  announces its position and its byte count.
- **The Harbor task generator emits one job per skill**, not one job spanning
  every requested skill - a single job would install the whole catalog into
  the with-skill arm, unable to attribute any gap to the skill under test.
- **Judge bundles now split on a marker the payload cannot forge**, replacing a
  `### <path>` heading indistinguishable from the `### Summary` / `### Weaknesses`
  headings already inside a markdown report.

### Documented
- **refactoring-shared-component-api records no measurable lift**, after three
  separate attempts to separate the arms - a prompt no longer naming the call
  sites, gates hardened from the exit condition, then the fixture widening
  above - all converged on 1.00 vs 1.00: on this scenario the model already
  performs the exhaustive sweep the skill teaches. A harder fixture might
  separate the arms, but that is a fixture decision to take on its own merits,
  not a way to rescue a number.

## [0.8.0] - 2026-08-24

### Fixed
- **Hooks were silently broken on Windows, and on any project path containing a
  space** ([#2](https://github.com/ChariereFiedler/ronce-racine/issues/2), field
  report). Six defects, all sharing one cause: nothing in the code expressed the
  contract a shipped hook runs under. Full analysis in
  [`docs/postmortems/2026-08-24-hook-portability.md`](docs/postmortems/2026-08-24-hook-portability.md).
  - The installer wrote each wiring as a **shell string**, which the shell split
    at the first space in the path - and which a Windows box without Git Bash
    never expanded at all. Wirings are now written in **exec form**
    (`"command": "node"`, `"args": ["${CLAUDE_PROJECT_DIR}/…"]`): no shell, and
    the braced placeholder is substituted by Claude Code itself.
  - **Re-running `install` repairs a pre-0.8 wiring in place** instead of
    appending a duplicate beside it, and leaves it at the position it held in
    its event - order there is semantic, since `PreToolUse` `updatedInput` is
    last-wins. The repair covers every hook the lockfile records as installed,
    not only the ones the current run selects, so a hook installed once with
    `--all` is not left behind. Identity ignores the extension, so a pre-0.5
    `.ts` wiring is recognized as the same hook rather than duplicated.
  - `uninstall` recognized wirings by their `command` string only, so every
    exec-form entry was **invisible** to it: the hook files went and the wirings
    stayed, erroring on every event. Install and uninstall now share one identity
    predicate.
  - Three hooks (`truncate-output`, `truncate-bash-output`, `readme-freshness`)
    extracted their own basename by **splitting on `/`**, which never matches on
    win32: the hook loaded, `main()` never ran, and it exited 0 producing nothing.
    All nine hooks now use one entry-guard idiom, pinned by a test.
  - `skill-reminder` could not parse a **CRLF** `SKILL.md`. With
    `core.autocrlf=true` (the Git default on Windows) that is most of the
    catalog, so it suggested whichever skills happened to stay LF. Same blind
    spot fixed in the `tools/skills.ts` frontmatter lint.
  - `truncate-output` resolved its helper through `URL.pathname`, yielding a
    **percent-encoded** path nothing can open.
- **`truncate-bash-output` no longer swallows a spawn failure.** It returned
  `stdout ?? ''` with exit 0, reporting the user's command as a silent success
  while discarding its entire output.

### Added
- **A `windows-latest` CI job.** The matrix had a Node-version axis and no OS
  axis, which is why all six defects above shipped past a green build. It checks
  out with `core.autocrlf=true`, then exercises what ships from a path containing
  a space.
- **`tools/portability.ts`**, wired into `npm test`: forbids the POSIX-only
  idioms that caused this class (it found three live hits on its first run), and
  runs every built hook from a directory whose name contains a space, failing if
  one produces nothing. One-off exceptions via `// portability:allow <reason>`.

### Documented
- **The rewriting hooks answer `permissionDecision: "allow"`**, which is required
  for `updatedInput` to apply and has the side effect of **skipping the
  permission prompt** for every command they match - `npm install`/`npm ci` (and
  their `postinstall` scripts), `cargo`, `curl`, `docker build`, unbounded
  `git log`/`git diff`. `hooks/README.md` now states this plainly and says how to
  decline the trade.

## [0.7.0] - 2026-08-08

### Added
- **`uninstall`**, the command that was missing. Driven by the lockfile, so it
  removes what it installed and nothing else: detached artifacts stay, a
  `*.pre-install.bak` is restored over the file the install overwrote, and only
  the hook commands it wired are dropped from `settings.json`. An artifact
  carrying local edits is kept as `*.pre-uninstall.bak` rather than dropped,
  a detached hook keeps its wiring, and the `.adopted` manifest is rewritten to
  the rules that survive. `--dry-run` lists the removal without performing it.
- **The lockfile is validated at the parsing boundary**, so every command
  refuses a malformed one instead of one command only. It is a committed file
  in the target repository, so `hook:../../../something` was a path traversal
  waiting for the first command that deletes on its strength, `check --strict`
  died in CI with a bare stack trace, and `install` copied a bad token forward
  into a fresh lockfile. An unreadable lockfile is also no longer reported as
  an absent one, which told users there was nothing to uninstall while their
  `.claude/` was full.

### Changed
- The CLI is split under `src/` (paths, lock, catalog, detect, settings,
  selector, uninstall); `install.ts` keeps the commands and the argument
  parsing, and re-exports what importers used to get from it.
- The README is organized around what each artifact is for rather than around
  the architecture, with the full skill catalog moved to
  [`docs/catalog.md`](docs/catalog.md) and the mechanics to
  [`docs/distribution-model.md`](docs/distribution-model.md) and
  [`docs/quality-bar.md`](docs/quality-bar.md).

### Fixed
- **The issue #1 regression guard had stopped guarding anything.** It asserted
  that `install.ts` contains no `cpSync`, which became vacuously true once
  `copyPath` moved to `src/lock.ts`. It now scans every installer source.
- **`docs/chardon/` shipped in the npm tarball.** The `files` entry `docs/`
  overrides `.gitignore`, so local workflow reports, absolute paths included,
  were published with the package.
- `tests/*.ts` are now typechecked (they were outside the `tsconfig.json`
  include), which surfaced three unsound casts.
- A batch of documentation claims that no longer matched the code, mostly in
  `docs/adopting-a-repo.md`, `docs/architecture.md` and `docs/developing.md`.

## [0.6.0] - 2026-08-08

Bringing the engineering floor up to the level of the monitoring plugin
sitting next to it - and then letting the new gates find what they found.

### Fixed
- **Install no longer half-completes on Windows** (#1). `fs.cpSync` onto an
  existing destination fails when the absolute path holds a non-ASCII
  character - the native override path calls unlink and reports `errno 0,
  syscall 'unlink'`. All four copy sites now go through `copyFileSync`, whose
  binding is unaffected. Thanks to @loicchossiere for a report that arrived
  with the root cause, a minimal repro and a table of what works.
- **A retried install no longer destroys the backup of your work.** Any run
  that did not reach the lockfile left the next one believing nothing was
  installed, so it backed up again - overwriting the backup holding the user's
  version with the canonical file, and producing a silently hybrid backup on a
  skill directory. A backup is now written only when none exists.
- **A dangling symlink in the target no longer aborts the install.** The copy
  followed links where `cpSync` recreated them; the backup walk crosses
  arbitrary user content, where one broken link threw ENOENT mid-install - and
  fed the defect above on the next run.
- **A crashed install no longer records itself as complete** (#1). The lockfile
  was written before the hooks were wired, so a failure during wiring left
  `check` reporting no drift while the requested hooks were absent - silently,
  for the life of the project. Wiring happens first now.
- **`agents/code-reviewer.md` loaded with no metadata at all.** An unquoted
  "Read-only: " made its frontmatter invalid YAML, which Claude Code does not
  fail loudly on: the read-only agent shipped without its tool restriction.
  Agents are now validated like every other artifact family.
- **Two artifacts were uninstallable**: `performance-profiling` and the
  `doc-code-parity` rule were present, documented and shipped in the package,
  yet in no catalog, so no command could install them. A test now requires the
  catalog and the disk to name the same set for every family - skills, rules,
  agents, scripts and hooks - in both directions. The skills-only version of
  that test is what let the second one through.
- **The sweep scripts built regexes from raw argv** - a component name holding a
  metacharacter changed what was matched, and a pathological one backtracked
  over every scanned line (CodeQL `js/regex-injection`, 4 sites).
- **A quoted eval criterion was unescaped twice**, so the criterion sent to the
  judge was not the one written (CodeQL `js/double-escaping`).

### Added
- **Installable as a Claude Code plugin**: `/plugin marketplace add
  ChariereFiedler/ronce-racine`. The skills and the agents, subscribed rather
  than copied. Deliberately not the rules, the hooks or the drift control -
  always-on context and code that runs on your machine belong in a reviewed
  diff.
- **`domain-glossary` skill** (36 skills now): fixes the vocabulary of a
  codebase in a `GLOSSARY.md`, resolving synonyms to one name and recording the
  rejected ones, so a search for the wrong word lands on the right entry.
  Ships with the `mixed-vocabulary` fixture that plants the defect.
- **Disambiguation lint** (`skills.ts routing`): ten realistic user sentences,
  each required to score strictly above the neighbours it is confusable with.
  **Five of the ten failed on the first run** - half the sampled skills did not
  distinguish themselves from their neighbours, which is the clearest argument
  yet that 36 skills is a surface to reduce rather than to grow.
- **The external plugin validator in CI** (`claude plugin validate --strict`),
  which reads the artifacts the way the runtime does. It found a defect a
  seven-check in-house harness had missed.
- **A rule against moving the target** in `docs/evaluating-skills.md`: every
  gate here scores something its author can edit, so a description changes only
  when the change is right independently of the test.
- **Agent contract validation** (`skills.ts agents`), the artifact family
  nothing checked until now.
- **`readme-freshness` hook** (opt-in): before a `git push` carrying structural
  changes, Claude re-reads README.md against the diff and reports the claims it
  contradicts - a wrong count, a renamed command, a mechanism that changed. An
  LLM rather than a grep, because that drift stays true-looking to any pattern
  you can write. Warns without blocking, fails open on every failure mode.
  Its first real catch was its own arrival: four stale claims in this README.

- **`performance-profiling` skill**: measure, then change,
  then measure again - noise floor before any timing claim, macro profile
  before micro work, off-CPU as well as on-CPU, and "inconclusive" as a
  first-class verdict. Per-ecosystem sheets for Go, Node/web, native and Tracy.
- **Biome** over the TypeScript, in CI. It caught an `Array.forEach` callback
  used as an expression, an implicitly-`any` `let`, and five assignments hidden
  inside `if` conditions. Formatting stays off: reformatting the tree would
  bury review in noise for no defect caught.
- **`npm run coverage`** (v8), with a threshold on the pure layer only. The
  global figure is deliberately not gated - most of this code runs as a
  subprocess and is invisible to in-process instrumentation.
- **`npm run verify`** = typecheck + lint + test, the single pre-PR command.
- **Property-based tests** (fast-check) over the eval manifest parser, the
  canonical hash and the selector's key handling, plus the mutation proving
  the selector property can fail.
- **A release workflow**: a `v*` tag runs the full gate set, checks that the
  tag and `package.json` agree, and opens the GitHub Release from the matching
  CHANGELOG section. npm publish stays manual.

### Changed
- **The README leads with the problem, not the architecture.** A visitor used to
  reach what the thing does on line 100 and the install command on line 190;
  both are now above the fold, the reference material follows, and the console
  capture is regenerated from a real run rather than edited in place.
- **Lint covers the scripts shipped to users**, not just the repo's own tooling:
  the four scripts skills install into other people's repositories were the
  only executable code nobody linted.
- **Example projects removed from 22 SKILL.md files.** `acme-app` / `beta-app`
  were private projects of mine, renamed for the release and meaningless to
  every reader since - carried in text a model reads on every invocation. The
  precedence note they sat in stays: each one names what the project skill
  knows that the generic one cannot.
- **CI split into parallel jobs** (validate on Node 18 and 22, coverage,
  mutation, CodeQL, gitleaks) with every action pinned to a SHA instead of a
  mutable tag, and `npm audit --omit=dev` on the runtime supply chain.
- Contributor docs now describe the suite that actually runs, with a table of
  what each gate protects and what it structurally cannot see.
- The workflow reports the monitoring plugin writes under `docs/chardon/` are
  ignored: they are observations of one machine, not documentation.

## [0.5.3] - 2026-07-21

A hook is never alone on its event.

### Changed
- **`truncate-output` keeps the rewritten command readable.** It replaced the
  command with an opaque base64 blob, which broke every downstream consumer:
  other plugins observing the same `PreToolUse` event, the transcript, the
  logs. The original now travels as a trailing shell comment, which runs to end
  of line and swallows quotes and apostrophes without interpreting them (a
  leading `: 'cmd';` prefix does not: it breaks on `echo it's fine`).
- **Bounded `git log` / `git diff` are no longer wrapped.** With `--oneline`,
  `--stat`, `--name-only` or a count, their output never reaches the truncation
  threshold, so rewriting them cost readability and broke composition for
  nothing.

### Added
- A composition rule in `hooks/README.md` and `AGENTS.md`: a hook that rewrites
  a command must preserve the original in readable form, must not rewrite when
  the rewrite buys nothing, and must never mask an exit code through a pipe.
- Regression tests asserting that a wrapped command keeps its original readable
  AND yields the same exit code as the bare one, so readability cannot be
  bought at the cost of correctness.

## [0.5.2] - 2026-07-21

### Fixed
- The published README still carried "The package is not on npm yet", so the
  npm page told visitors the package they were looking at did not exist. It
  now links the registry page and carries a version badge.
- `package.json` gained `homepage` and `bugs`, so the npm page links back to
  the project and its issue tracker.

### Added
- `tools/skills.ts docs` now also fails when a publishable package is
  documented as unpublished, or when the README does not link its registry
  page. Both were real defects that survived the first version of this check,
  which had been built around the two failures known at the time.

## [0.5.1] - 2026-07-21

### Fixed
- **Two shipped hooks were silently dead.** `truncate-output` and
  `truncate-bash-output` guarded their entry point on a `.ts` extension the
  built `.mjs` no longer has, so `main()` never ran: the hook exited 0
  producing nothing, and nothing signalled the failure. The truncate wrapper
  also pointed at a `.ts` helper the package does not ship.
- `hooks/README.md`, which ships into every adopting repo, still described the
  pre-0.5.0 wiring: it claimed the target needed `tsx` and showed
  `npx tsx .../hook.ts` in every example, while the installer now writes
  `node .../hook.mjs`.
- The Requirements section overstated "Node only": hooks do run on plain Node,
  but the optional detection scripts still ship as TypeScript and need `tsx`.

### Added
- `tools/skills.ts docs`, wired into `npm test`: compares the documentation
  against what the installer actually generates, so a doc describing a past
  behavior fails the build instead of reaching users.
- The `doc-code-parity` rule, and `builtHook()` in the test harness: assertions
  about shipped behavior now run the built artifact, not the source. The
  mutation harness rebuilds when it mutates a build input, so a stale build can
  no longer disguise a real defect as a false positive.

## [0.5.0] - 2026-07-21

Adoption stops requiring a clone.

### Changed
- **Adoption no longer needs a clone**: `npx ronce-racine install .`. The
  lockfile records the package version and a content hash instead of a git
  SHA, so `check` detects a canonical source that changed under the same
  version number. Lockfiles written by the clone-era installer keep working.
- The anti-drift CI template drops the pinned clone for a single
  `npx ronce-racine@<version> check . --strict`.

## [0.4.0] - 2026-07-21

### Changed
- **A target repo no longer receives the toolkit's own documentation.** Skill
  `README.md` pages describe THIS repository, so shipping them put roughly
  1300 lines of irrelevant prose into every adopting repo's `.claude/`. They
  now stay canonical, alongside `*.test.ts` and `eval.yaml`. The one deliberate
  exception is `hooks/README.md`: hooks execute on the target's machine, so
  documenting what runs there is transparency rather than clutter.

### Added
- Drift guards for the human documentation layer, which nothing watched before:
  every rule must have a `docs/rules/` page whose stated version matches the
  rule and which links the canonical artifact, and every skill must have a
  `README.md` that links its `SKILL.md`. Orphan pages documenting a deleted
  artifact now fail the build.

## [0.3.0] - 2026-07-21

### Added
- `docs/developing.md`: working on the toolkit itself - repo map, what each
  harness actually protects, the playground, and how to add every artifact
  type (hooks and agents had no guide at all).
- A header illustration on the README.

### Changed
- The internal harnesses (`skills.ts`, `tests.ts`, `mutations.ts`, `eval.ts`)
  moved to `tools/`. `install.ts`, the only user-facing entry point, stays at
  the repo root.
- `templates/` split by audience: it now holds only what a CONSUMER copies
  into their repo, while the artifact skeletons a CONTRIBUTOR starts from
  moved to `docs/templates/`.
- `docs/writing-a-skill.md` rewritten against the current contract. It
  described the pre-0.2.0 world, so a contributor following it produced a
  skill that CI rejects: no mention of the required `eval.yaml`, the per-skill
  `README.md`, the bilingual quoted triggers, or the test procedure that any
  script must ship.
- `bug-triage-structured` 1.1.0 and `adversarial-feature-challenge` 1.1.0:
  two protocol steps that evaluation runs showed agents skipping (the
  recurrence check, the persona switch) are now mechanical - a command to run
  and a count to state, rather than an instruction to remember.

### Fixed
- `templates/SKILL.template.md` was still entirely in French and carried a
  frontmatter GitHub could not parse (an unquoted colon), so the repository
  home rendered a YAML error banner. Both are now guarded by
  `tools/skills.ts templates`, wired into `npm test`.
- Evaluation manifests no longer punish an agent for obeying its own skill:
  build output and dependency lock files are pruned from the snapshot, and
  `repo_clean`'s `except` accepts a `name-*` prefix glob for skills whose
  deliverables cannot be named upfront (one ticket per finding).
- The `writing-robust-tests` fixture can actually run a test suite offline
  (`node --test`, nothing to install), so the "see it red, then green"
  discipline the skill demands is demonstrable rather than impossible.

### Removed
- `rules.ts`, deprecated since 0.1.x and superseded by
  `install.ts install <repo> --rules-only`.

## [0.2.0] - 2026-07-20

The toolkit can now test itself, at every level: its code, its detection
scripts, and the behavior its prose skills are supposed to produce. Plus the
post-release audit fixes from a full-repo sweep.

### Added
- **Skill evaluation harness** (`eval.ts`): plays a skill through headless
  `claude -p` inside a throwaway fixture, then verdicts it with mechanical
  gates derived from the skill's own exit conditions, plus an adjunct LLM
  judge for what stays subjective (a judge verdict without a verbatim
  quote as evidence is downgraded to a failure). Verdicts: PASS, FAIL(gate),
  JUDGE-FAIL(criterion), ERROR(infra, never a regression).
- **An `eval.yaml` manifest for every skill** (34/34), co-located with the
  skill. Closed gate vocabulary: `file_exists`, `file_absent`, `grep_zero`,
  `grep_count`, `repo_clean`, `transcript_contains`, `transcript_absent`,
  `exit_ok`. Manifests stay canonical and are never distributed to targets.
- `npm run eval:dry` validates every manifest with no agent call, no network
  and no auth - wired into CI. Real runs (`eval.ts run [--only <skill>]`) are
  on demand and before a release, never per push.
- **Mutation harness** (`npm run test:mutation`): 14 declared mutations must
  each turn their covering tests red; a surviving mutation fails CI.
- `install.ts --pick <token...>` installs exactly the named artifacts.
- Playground fixtures with planted defects and an `EXPECTED.md` ground truth:
  `flawed-app`, `buggy-app`, `shipped-feature`, `design-system`,
  `audit-target`.
- CI matrix on Node 18 (the documented minimum) and 22.
- `docs/evaluating-skills.md`.

### Changed
- Test harness split by domain (`tests/`) plus one co-located test procedure
  per executable skill script (`skills/<skill>/scripts/*.test.ts`); 80 tests.
  `*.test.ts` files are never distributed to target repos.
- `bin` now points at `install.ts`. Anyone who linked the package got the
  deprecated `rules.ts` CLI before this release.
- The interactive selector's keyboard logic is a pure, unit-tested reducer;
  the TTY shell only does I/O.
- Em dashes replaced with plain punctuation across the toolkit.

### Fixed
- CI now triggers on `main`, the public default branch. It previously only
  listened to `master` and therefore never ran on the public repository.
- Installer: pre-existing artifacts are backed up to `*.pre-install.bak` on
  first install instead of being silently overwritten (data loss); a
  `settings.json` whose `hooks` section has an unexpected shape no longer
  crashes mid-install; a truncated scan is announced instead of silently
  missing deep signals.
- Audit suite: every domain scores with the flat mean defined in
  `scoring-model.md` (dead weight formulas removed); orchestrator
  contradictions resolved; `performance-frontend` restored in `$ARGUMENTS`.
- `worktree-env-setup` hook: broken `.env` symlinks are repaired.
- `subscription-leak-scan.ts` and `templates/.adopted.example` translated to
  English; docs no longer recommend the deprecated `rules.ts sync`;
  `package.json` description translated and `engines` declared.

## [0.1.0] - 2026-07-20

First public release (pre-1.0: the API and artifact set may still change).

### Added
- MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- GitHub Actions CI running `typecheck` + the validation harness.
- A human documentation layer: a `README.md` per skill and a `docs/rules/<name>.md` per rule.
- Bilingual (English + French) invocation triggers on every skill.
- Deterministic behavioral tests (`tests.ts`) exercising the installer (plan/install/check/detach, drift, detached preservation, settings.json merge, `--rules-only`) and the hooks - wired into `npm test`.
- `install.ts --rules-only` (rules-only distribution under the unified lockfile drift).
- The installer now **auto-merges hook wirings into `.claude/settings.json`** (deep-merge by event/matcher, idempotent, `settings.json.bak` backup, preserves unrelated settings) instead of printing a snippet to hand-merge.

### Deprecated
- `rules.ts` (`sync`/`check`) - superseded by `install.ts --rules-only`; still works, prints a notice, to be removed later.

### Changed
- Public rebrand to **Ronce Racine**; the whole public repo is now English-facing (US spelling).
- Example project names in routing hints are fictional (`acme-app`, `beta-app`).
- Trimmed duplication in the per-skill READMEs (SKILL.md stays the source of truth for the steps).

### Fixed
- Installer no longer overwrites `detach`-ed (customized) artifacts on re-install; `check` no longer crashes when a canonical file was removed upstream.
- `session-inject` now uses the correct `SessionStart` output schema (nested `additionalContext`); `session-precompact` persists the memo instead of an ineffective `systemMessage`.
- `bash-npm-silent` preserves the real exit code (no output pipe) and only touches a bare `npm install`/`ci`; `truncate-output` runs via `npx tsx` (any Node) and no longer conflicts with it.
- Anti-drift CI template pins the canonical clone to the lockfile SHA, avoiding false-positive drift.
- Broken README cross-links, false changelog clauses, and untranslated leftovers.

### Removed
- Internal design/spec documents that were specific to other projects.

_Baseline (pre-OSS, 2026-06-19): 34 skills, 12 rules, 8 hooks, 2 agents and the `install.ts` CLI, validated by the `npm test` harness._
