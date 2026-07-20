# `recurring-bug-root-cause`

> When the same area gets patched again and again, stop treating symptoms: name the bug class and kill it with a blocking, tooled guardrail - not a reminder.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `bug` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`scripts/detect-recurring-fixes.ts`](scripts/detect-recurring-fixes.ts), [`templates/postmortem-recidive.md`](templates/postmortem-recidive.md) |

## What it is

`recurring-bug-root-cause` is the escalation you apply when a scope has already taken several similar one-line fixes and is about to take another. It shifts the work from "patch the Nth symptom" to "identify the shared cause and install a mechanism that makes the whole class impossible."

## Why it exists

3+ fixes on the same scope in about two weeks is a signal: you are debugging by trial and error, patching surface symptoms of one underlying cause. Two things then go wrong under pressure:

1. **The reminder illusion** - adding a note to `CLAUDE.md` or a lint comment feels like a fix, but a documentation rule does not sweep the existing code and does not survive the next moment of inattention. The class stays alive.
2. **The deferred trace** - you ship the urgent one-liner and promise to open the root-cause ticket "later". Later never comes.

The skill answers both: the guardrail must be **tooled and blocking**, and the **session does not end until the spike leaves a real trace** (ticket or postmortem), even if the urgent fix shipped first.

## When it triggers

- 2+ similar recent fixes on the same scope
- a 2nd bug of the same class appears elsewhere
- "this bug again" / repeated fix commits on the same area
- **before** writing the Nth one-line fix

Use `bug-ticket-root-cause` instead for a first, isolated bug (not yet a class), and `superpowers:systematic-debugging` for a single bug with no repetition pattern.

## How it works

### Detect the recurrence

```bash
npx tsx scripts/detect-recurring-fixes.ts [--window 14] [--threshold 3] [repoDir]
```

It scans the git log for `fix(scope):` conventional commits, flags any scope at the threshold, and **exits 1** on recurrence - so it doubles as a CI check. 5+ fixes on a scope escalates to "root-cause required before any new fix".

### The approach

Once recurrence is detected, the skill maps the shared class rather than the Nth symptom, spikes 2–4 candidate causes until at least one is refuted with evidence, then installs a *tooled, blocking, deterministic* guardrail that sweeps the existing code (so each error it raises is a latent bug or an annotated exception). It closes with class regression tests and a postmortem that leaves a real ticket for every action not shipped inside the fix.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> On acme-app, `fix(export)` has landed four times in ten days: empty CSV, wrong delimiter, missing header, broken encoding.

1. `detect-recurring-fixes.ts` flags `export` at 4 → 🔴.
2. Mapping the class: every fix is an ad-hoc string built without going through the shared serializer.
3. Spike refutes "isolated slip" (four independent authors) and confirms "no guardrail forbids hand-rolled CSV".
4. Guardrail: a lint rule banning manual CSV assembly outside the serializer, run across the repo - it raises 3 more latent call sites, each ticketed.
5. One regression test per past bug + one asserting all export paths use the serializer. Postmortem filed with the 3 follow-up tickets.

## Related artifacts

- [`bug-ticket-root-cause`](../bug-ticket-root-cause/) - first, isolated bug (not yet a class).
- [`writing-robust-tests`](../writing-robust-tests/) - to build the class regression tests.
- [`qa-session-intake`](../qa-session-intake/) - when a QA session surfaces the recurrence.
