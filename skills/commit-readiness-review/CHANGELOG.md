# `commit-readiness-review` - changelog

Kept beside the skill and never distributed: it is history, and the
SKILL.md is the procedure an agent has to follow. No pointer is left in
the skill, because in a repository where it is installed this file is
not there and the pointer would dangle.

- 1.0.4 (2026-09-04) - a pre-existing red suite no longer forbids every commit.
  "A missing box = no commit" had no notion of a failure the diff did not
  cause, so read literally the checklist blocked every commit in a repository
  that had been red for a fortnight. Its own eval manifest already graded the
  right behaviour - "the red suite is reported even though this change did not
  cause it" - so the eval was ahead of the skill and supplied the wording.

- 1.0.3 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.2 (2026-08-08) - precommit-scan.ts iterates instead of returning a value from forEach

- 1.0.1 (2026-07-20) - co-located test procedure for precommit-scan.ts (scripts/precommit-scan.test.ts)

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)
