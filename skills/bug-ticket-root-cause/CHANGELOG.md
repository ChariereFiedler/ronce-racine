# `bug-ticket-root-cause` - changelog

Kept beside the skill and never distributed: it is history, and the
SKILL.md is the procedure an agent has to follow. No pointer is left in
the skill, because in a repository where it is installed this file is
not there and the pointer would dangle.

- 1.0.2 (2026-09-04) - the confirmation-tests line no longer states as observed
  something this skill forbids observing. It demanded "each test fails before
  the fix, passes after" while the Principle, the Traps table and the
  Guardrails all forbid modifying any application file, so neither half was
  reachable. The template already had it right - a predicted column - and the
  line now matches it: the ticket SPECIFIES the tests for whoever fixes the
  bug. Found by surveying what each exit-condition line demands against what
  the skill body teaches: the clearest of seven such contradictions.

- 1.0.1 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)
