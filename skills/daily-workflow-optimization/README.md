# `daily-workflow-optimization`

> Find and cut recurring friction in the dev/agent workflow - toil loops, retry storms, cold reads, stale context - prioritized by friction × frequency, acting on tooling and process, never on production code.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `process` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None required (uses `git log`, CI history, session transcripts; the repo's metrics tool if it has one) |

## What it is

`daily-workflow-optimization` is a periodic **toil review**. It looks at how the team and its agents actually work - which commands get rerun, which files get re-read every session, which tickets keep reopening - and turns that into a short, prioritized list of concrete improvements to the tooling, scripts, memories and process.

Its scope is strictly the workflow. It is not a code-quality pass and never edits production code.

## Why it exists

Friction that nobody measures **rationalizes itself away**: every individual instance feels quick, so it never gets fixed, and the cumulative cost stays invisible. This skill counters that with a simple economic lens - **friction × frequency** - so the biggest recurring drag gets addressed first, not the easiest.

It also guards against two common anti-patterns:

- **Optimizing without a signal.** Without evidence, you harden a marginal friction and miss the real one. Every action must trace back to an observed signal, never "just in case".
- **Automating a broken process.** Wrapping a script around a flawed step freezes the defect. Fix the process first, then automate.

## When it triggers

- Reviewing recurring workflow friction - "what's slowing us down"
- Periodic toil review
- Cutting repeated manual steps
- Identical recurring feedback/fixes appearing across PRs or tickets
- Stale memories or context that need refreshing

Route elsewhere when: you are detecting **code** problems to ticket (→ [`detection-sweep`](../detection-sweep/)); or the same **bug** keeps returning, which is a code root cause, not workflow friction (→ [`recurring-bug-root-cause`](../recurring-bug-root-cause/)).

## How it works

The skill collects friction signals from git/CI history, session transcripts, recurring tickets and stale memories, then categorizes each (toil loop, retry storm, cold read, stale context), prioritizes by friction × frequency, and decides one concrete action per item - always on tooling, process or memories, never on production code. Every action must trace back to an observed signal (no optimizing "just in case"), and a broken process is fixed before it is automated. If the repo exposes a metrics tool, it wins over manual inference.

Full step-by-step protocol (per-category actions, documentation threshold) → [`SKILL.md`](SKILL.md).

## Worked example

> Over a week on `acme-app`, you notice the agent re-reads the same `schema.ts` at the start of every session and CI shows a "fix lint" commit almost daily.

1. **Collect**: transcripts show the repeated `schema.ts` read (cold_read); git log shows the "fix lint" streak (toil_loop).
2. **Categorize + prioritize**: the lint streak is high frequency and low effort to fix → highest product, handled first.
3. **Actions**: add a pre-commit format-on-save / lint alias so lint never reaches CI (removes the toil_loop); consolidate the stable parts of `schema.ts` into a reference memory so it stops being a cold read.
4. **Execute** on tooling and memory only - no production code touched.
5. **Document** both actions with their expected effect, and run a non-regression check on the modified tooling with the output pasted.

## Related artifacts

- [`detection-sweep`](../detection-sweep/) - for finding and ticketing code problems (this skill deliberately does not touch code).
- [`recurring-bug-root-cause`](../recurring-bug-root-cause/) - when the recurring thing is a bug, not friction.
