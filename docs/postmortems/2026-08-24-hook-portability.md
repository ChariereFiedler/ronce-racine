# Postmortem - hooks silently dead off Linux (issue #2)

**Date**: 2026-08-24 · **Reported by**: an external adopter (issue #2, 2026-08-14)
**Affected versions**: up to and including 0.7.0 · **Severity**: high, silent
**Class**: portability of what ships - path semantics, launch contract, line endings

An adopter running Windows 11 with the project under `C:\Users\First LAST\...`
(a space in the username) and `core.autocrlf=true` reported that the hooks were
broken in every session. Six technical defects, all reproduced. None of them
could have been observed on our CI, which ran only on Linux.

This is the **third** occurrence of the same class: two prior `fix(hooks):`
commits already corrected an entry guard. That is what makes this a recurrence
postmortem rather than a bug report.

---

## 1. Timeline

| Date | Event |
|---|---|
| 2026-06-25 | `eacb52e` *fix(hooks): guard point d'entrée robuste* - the entry-guard problem is solved **correctly** for the session trio, using `pathToFileURL`. |
| 2026-07-10 | `6c6f34f` *perf(hooks): ship built JS* - hooks move from `.ts` to a built `.mjs`. Every guard bound to an extension becomes a latent bomb. |
| 2026-07-21 | `523edf8` *two shipped hooks were silently dead after the build* - occurrence #2. Fixed by **inventing a new idiom** (`argv[1].split("/")`) instead of reusing the June one. Adds `builtHook()`, a genuinely good harness - which runs on Linux. |
| 2026-08-14 | Issue #2 filed. Occurrence #3 of the guard, plus five sibling defects. |
| 2026-08-24 | This postmortem, the fixes, and the tooled guardrails. |

---

## 2. What was actually wrong

Seven findings, all confirmed against the code. The reporter's analysis was
accurate throughout; the numbering is theirs.

| # | Defect | Site |
|---|---|---|
| 1 | Wiring written as a shell string - dies on any path with a space | `src/settings.ts:40` |
| 2 | Install dedupes by exact string equality → duplicates after any rewrite | `src/settings.ts:51` |
| 3 | Uninstall reads `command` only → blind to exec form, leaves dangling wirings | `src/uninstall.ts:47` |
| 4 | Entry guard splits on `/` → never fires on win32, hook silently does nothing | `truncate-output`, `truncate-bash-output`, **and `readme-freshness`** |
| 5 | Frontmatter regex LF-only → blind to CRLF skills | `hooks/skill-reminder.ts:56` |
| 6 | `URL.pathname` → percent-encoded, unresolvable path | `hooks/truncate-output.ts:91` |
| 7 | `permissionDecision: "allow"` bypasses the permission prompt (design) | `bash-npm-silent`, `truncate-output` |

Found during the sweep, beyond the report:

- **A third occurrence of (4)** in `readme-freshness.ts:165`. The report listed two.
- **`hooks/README.md` had 9 fragile wirings, not 3.** Documentation that ships to
  an adopter's machine is code (`rules/doc-code-parity.md`).
- **`tools/skills.ts` had the CRLF blind spot of (5)** in its frontmatter lint. On
  a Windows checkout the lint would pass by seeing no frontmatter at all.
- **`truncate-bash-output` swallowed a spawn failure**: `result.stdout ?? ''` with
  exit 0 reported the user's command as a silent success and discarded its
  output entirely. Platform-independent, and the worst outcome available.

---

## 3. Root cause

> **The execution contract of a shipped hook exists nowhere as code.**

A hook must satisfy five clauses: *(a)* it is launched by an unknown runner
(POSIX shell? `cmd.exe`? direct spawn?), *(b)* from an arbitrary path that may
contain spaces and backslashes, *(c)* under a `.mjs` name its `.ts` source never
had, *(d)* over files whose line endings depend on the adopter's `core.autocrlf`,
*(e)* and it must never break the session.

No module, type, or test embodied that contract. Nine hooks re-implemented it
from memory, and produced **three competing idioms for the single question "am I
being run directly?"**:

```
main() nu                            → session-inject, session-precompact, bash-npm-silent
pathToFileURL(argv[1]).href === …    → session-writer, worktree-env-setup        ✅ correct
argv[1].split("/").pop()             → truncate-output, truncate-bash-output,
                                        readme-freshness                          ❌ dead on win32
```

The correct idiom **already existed in the repository, forty lines away**, when
the broken one was invented. Nothing designated it as *the* answer, so the next
person to face the problem solved it again, worse. The comment added in
`523edf8` - *"Entry guard by BASENAME, never by extension"* - is a **documentary**
guardrail: it protected against the previous regression and did not see the next
one coming.

### Two amplifiers

**A. The CI tested one world.** Every job ran `ubuntu-latest`. The matrix
existed, but its axis was the **Node version**, not the operating system. The
most recent commit before the report (`c4a9828`, *"the Node 18 leg tested the
toolchain, not the product"*) shows that matrix being actively refined - without
anyone questioning the axis that was missing. All six technical defects are
invisible on Linux.

**B. The default failure mode is silence.** The issue title says it: *silently*.
A `PreToolUse` hook exiting 0 with empty stdout is **indistinguishable** from one
that decided there was nothing to do. Combined with `catch { /* a hook must never
break the session */ }`, this yields a system where total failure and nominal
operation produce the same observable. That is why *"three follow-up defects were
hiding behind it"* - not a coincidence, but the designed behavior.

---

## 4. Detection gap

Required by `rules/detection-gap-protocol.md`: a defect a **user** found is a
detection failure before it is anything else, because the user must never be the
safety net. Six defects reached an adopter past a green pipeline, a 35-mutant
harness, and a suite that deliberately exercises the built artifacts.

| Level | Should it have caught this? | Why it did not |
|---|---|---|
| Typecheck | No | Every defect is type-correct. `split("/")` on a win32 path, `URL.pathname`, an LF-only regex: all well-typed, all wrong. |
| Lint (biome) | **Yes, for the idioms** | No rule expressed "this construct is POSIX-only". Now `tools/portability.ts`, which found three live hits the moment it existed. |
| Unit tests | **Yes, for (2) and (3)** | Install and uninstall were each tested against their *own* notion of identity. Nothing tested them **against each other**, so two predicates drifted apart unobserved. Now one shared predicate plus a round-trip test. |
| Behavioral tests on the built artifacts | **Yes, for (4), (5), (6)** | `builtHook()` runs the real shipped `.mjs`, which is right, and runs it on ubuntu-latest, which is why it saw nothing. The harness was sound; its single environment was the gap. |
| CI matrix | **Yes, the primary gap** | The matrix axis was the Node version. No OS axis, so the only environment where any of the six can appear was never entered. |
| Mutation testing | No | It mutates our source, not the platform. No mutant expresses "run this on win32". |
| Release / smoke | No such stage | The package ships hooks that run on someone else's machine; nothing exercised them off Linux before publishing. The Windows job now does, on every push. |

Two gaps stand out because neither is about missing tests:

- **The suite tested one world.** Coverage was good and evidence was narrow. More
  tests on Linux would have added nothing; one job on another OS added everything.
- **Two components were never tested against each other.** Install and uninstall
  each passed alone. The contract *between* them was the thing nobody asserted,
  and it is where (2) and (3) lived.

## 5. Hypotheses tested

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Isolated lapse of attention | **Refuted** | Three occurrences of the same construct across three months, two already carrying their own `fix(hooks):` commit. |
| Purely a Windows problem | **Refuted** | Defect (1) breaks on any path containing a space, including `/Users/Jean Dupont/`. Windows made it *systematic* (space in the username is near-default, `autocrlf=true` is the Git default), not *existent*. |
| The existing tooling should have caught it | **Refuted** | It structurally could not. `builtHook()` runs the real shipped `.mjs` - on Linux. Mutation testing does not mutate platform behavior. |
| The correct solution was unknown at the time | **Refuted** | `eacb52e` had shipped it a month earlier, in the same directory. |
| No shared runtime contract → each hook reinvents it | **Confirmed** | Three idioms for one question; two independent frontmatter parsers, one CRLF-tolerant by luck (`src/selector.ts`) and one not (`skill-reminder`). |

The luck in `src/selector.ts` is worth naming: `indexOf("\n---")` happens to
match inside `"\r\n---"`, and the stray `\r` happens to be eaten by a later
`.trim()`. Nobody decided that. It is the same parsing problem solved twice
independently, once fortunate and once not - which is the root cause restated.

---

## 6. Fixes

| # | Fix |
|---|---|
| 1 | `settings.ts` writes **exec form** (`command: "node"`, `args: ["${CLAUDE_PROJECT_DIR}/…"]`). No shell, and the braced placeholder is substituted by Claude Code itself. |
| 2, 3 | One shared predicate, `wiredHookFile()`, used by **both** install and uninstall. Install now also **repairs** a pre-0.8 shell-form wiring in place and collapses duplicates, so re-running the installer is how an affected user recovers. |
| 4 | The three divergent guards unified onto the June idiom. |
| 5 | `\r?\n` delimiter, description bounded to the line. Same fix in `tools/skills.ts`. |
| 6 | `fileURLToPath()`, and the helper path is shell-quoted with apostrophe escaping. |
| 7 | Documented in `hooks/README.md` - which commands stop prompting, and how to decline the trade. Not silently fixed: the behavior is required for `updatedInput` to apply. |
| + | `truncate-bash-output` now fails loudly on a spawn error instead of reporting empty success. |

---

## 7. Guardrails - tooled, not documentary

Each one sweeps **existing** code, per the anti-recurrence rule: a rule that only
applies to future code leaves the live bombs in place.

1. **`windows-latest` CI job** (`.github/workflows/ci.yml`). The missing matrix
   axis. Checks out with `core.autocrlf=true`, runs the portability gate, asserts
   `skill-reminder` parses the CRLF tree, asserts `truncate-output` fires and
   yields a resolvable helper, and installs/uninstalls into a path containing a
   space. Deliberately **not** the full vitest suite: it shells out to `ln -s`,
   `bash` stubs and `git worktree`, so a failure there would report on the test
   harness rather than the product. Widening it means porting those helpers first.

2. **`tools/portability.ts`**, wired into `npm test`. Two passes:
   - *static* - forbids `split("/")` on a path, `URL.pathname` on a file URL, an
     `argv[1]`-parsing entry guard, and LF-only frontmatter delimiters. It found
     three real hits on first run.
   - *smoke* - copies every built hook into a directory whose name contains a
     space, runs it, and fails if it produces nothing. On the Windows runner the
     same pass also covers the backslash separator.

   Escape hatch: `// portability:allow <reason>` on the line, mirroring the
   `gitleaks:allow` convention the repo's rules already use. Never disable the check.

3. **A test pinning the positive form** - every guarded hook must use the one
   idiom. The static gate forbids the known-bad shapes; this makes a *fourth*
   invention a failing test rather than a discovery from a user.

4. **Five new mutants** in `tools/mutations.ts`, one per fixed defect, each
   verified to be killed. 38/38 mutations killed.

### Deliberately not done: adding `.gitattributes`

Forcing LF in this repo would make our own checkout clean and the Windows CRLF
job **vacuous**, while doing nothing for adopters - `skill-reminder` reads the
`SKILL.md` files of *their* repository, whose line endings we do not control. The
hook has to be CRLF-tolerant on its own; keeping this repo CRLF-able on Windows
is what keeps the CI leg honest.

---

## 8. What this cost, and what to carry forward

Six defects reached users. All six were invisible to a green CI, a 38-mutant
harness, and a test suite that deliberately exercises the built artifacts. The
gap was never rigor - it was that **every check ran in the one environment where
none of the defects can appear.**

Two lessons worth generalizing beyond hooks:

- **When a fix invents a new way to do something the repo already does, that is
  the defect.** The reviewable moment was `523edf8`, where a second idiom
  appeared next to a working first one. Divergence is cheaper to catch than its
  consequences.
- **A guardrail that cannot fail is not a guardrail.** "Entry guard by BASENAME,
  never by extension" was true, prominent, and useless, because nothing executed
  it. Prefer the check that runs.
