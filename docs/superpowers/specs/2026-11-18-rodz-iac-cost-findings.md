# rodz-iac cost findings (ronce telemetry, 2026-10-08 to 2026-11-18)

Read-only analysis; nothing was changed in that repository.

## Numbers

- 56 sessions, 5 294 $ in total (a third of all telemetry spend).
- Four sessions above 300 $ hold 4 295 $ (81 %); the top five hold 84 %.
- Those four reached 95 to 97 % of the context window and ran over 2 to 4 days.
- Biggest session: 2 313 $ for 416 turns and 16 522 tool calls, about 40 calls per turn at near-full context.
- 574 Agent and 401 SendMessage calls: a multi-agent orchestration, each turn re-reading a full window.
- The repository has no `.claude/ronce.json`: only the engine's default rules apply.

## What the commands show

Search and read through the shell dominate the Bash calls: `grep -n` 4 145, `git show` 1 427, `sed -n` 1 386,
`git grep` 1 283, `grep -rn` 1 228, `grep -nE` 407. About 9 000 of 39 000 Bash calls look for or read code.
Each default-rule refusal (85 to 231 per long session) is a read that was redirected to Read, so the default
rules already act here; the policy file is what is missing.

## Reading

The cost is the context re-read on every turn of sessions that never stop, as in the four other projects:
the lever is the session length, not the tool output. With mod 0.6 the context signal reaches these sessions
at 40, 60 and 75 %, which these four ran through within their first day.

## Proposals (not applied)

1. Add `.claude/ronce.json` (start with `{ "version": 1 }`), so the repository is visible to `/ronce-hits`.
2. Split long orchestrations: one session per work package, state in a file or a ticket, instead of days at 96 %.
3. Set `fixRepeat` to `enforce` there once its shadow hits are read.
4. Re-measure with `ronce-report` two weeks after the restart: share of turns above 60 % and share of the cost held by the ten most expensive sessions.
