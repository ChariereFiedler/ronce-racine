---
name: daily-workflow-optimization
description: Use when reviewing recurring development workflow friction - "what's slowing things down", "qu'est-ce qui nous ralentit", periodic toil review, cutting repeated manual steps, identical recurring feedback/fixes, stale memories or context to refresh.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: process
---

# Daily Workflow Optimization — cut workflow friction, not fix code

> If the current repo has a tooled improvement command (e.g. acme-app → `daily-improve`), it wins — it knows its metrics, scripts and paths.

## This skill vs. others

- **This skill** when: optimizing the dev/agent WORKFLOW — recurring toil, retry storms, cold reads, repeated manual steps, stale memories/context. Target = tooling, scripts, memories, process. Never production code.
- **detection-sweep** instead if: detecting CODE problems in the project and ticketing them.
- **recurring-bug-root-cause** instead if: the same bug keeps coming back — that is a root cause in the code, not workflow friction.

## Principle

Unmeasured friction rationalizes itself away ("it's quick"). The expected output = a list of concrete actions prioritized by **friction × frequency**, acting on tooling/process, with an explicit expected effect. No changes to production code, no optimization without a signal that justifies it.

## Context to gather (sources of friction signals)

No dedicated metric is required; infer friction from generic signals already available:

- **Git/CI history**: repeated fix commits on the same area, "fix lint" streaks, CI re-runs, slow or flaky jobs.
- **Session logs / transcripts**: same commands rerun, same files re-read without changes (cold reads), identical manual corrections.
- **Recurring tickets**: same-class tickets reopened, identical review feedback from one PR to the next.
- **Memories / context docs**: expired notes or notes with no TTL, reference files re-read every session for lack of consolidation.

If the repo exposes a measurement tool (metrics script, report), use it — it wins over manual inference.

## Protocol

1. **Collect** the signals from the sources above.
2. **Categorize** each signal: toil_loop (repeated command/manual step) · retry_storm (file/test/component that forces retries) · cold_read (re-read with no change) · stale_context (expired memory/doc).
3. **Prioritize** by friction × frequency: effort per occurrence × number of occurrences. Handle the highest product first.
4. **Decide one action per prioritized item**:
   - toil_loop → helper script, alias, or rule that removes the step
   - retry_storm → trace back to the cause (fragile test, poorly documented type) → memory or skill
   - cold_read → consolidate into a reference doc/memory
   - stale_context → renew the TTL or archive
5. **Execute** on tooling/process/memories only. Open a ticket only if the action spans multiple sessions.
6. **Document** if ≥ 2 actions taken: signal detected, action, expected effect.

```
- [ ] Signals collected (git/CI, sessions, tickets, memories)
- [ ] Items categorized + prioritized by friction × frequency
- [ ] Action decided for each priority item
- [ ] Execution on tooling/process only (zero production code)
- [ ] ≥ 2 actions ⇒ improvement note written
- [ ] Non-regression checks run on the modified tooling
```

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "It's obvious, I optimize right away" | Optimizing without measuring the signal → you harden a marginal friction and miss the real one. Collect first. |
| "Let's automate this step" | Automating a broken process freezes the defect. Fix the process, then automate. |
| "One friction, one more ticket" | Workflow frictions are handled in the session, not in the backlog. Ticket only if multi-session. |
| "I'll touch the production code while I'm at it" | Out of scope. This skill acts on tooling/process; a code bug → detection-sweep or recurring-bug-root-cause. |
| "The expired memory, I'll ignore it" | A stale note pollutes the context. Renew it or archive it, never ignore it. |

## Exit condition

- [ ] Each action taken is tied to an observed friction signal (never "just in case")
- [ ] Actions prioritized by friction × frequency, not by ease
- [ ] Zero change to production code
- [ ] Expected effect noted for structuring actions; non-regression check run on the tooling (output pasted)

## Tooling

- The repo's metrics tool if it exists (wins); otherwise `git log`, `git log --oneline`, CI history, session transcripts.

## Changelog

- 1.0.0 (2026-06-19) — initial version, generalized from acme-app's daily-improve workflow (metrics/scripts coupling removed)
