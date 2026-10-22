# `production-incident-diagnostic` - changelog

Kept beside the skill and never distributed: it is history, and the
SKILL.md is the procedure an agent has to follow. No pointer is left in
the skill, because in a repository where it is installed this file is
not there and the pointer would dangle.

- 1.0.2 (2026-09-04) - a diagnosis with no live access is now a path through the
  skill rather than a dead end. The body had no such branch anywhere, while three
  exit lines assumed one: the symptom had to be reproduced, prod had to be
  re-checked with the health endpoint output pasted, and every scenario this
  skill is evaluated on states there is no dashboard and no shell. The sibling
  `bug-ticket-root-cause` already handles the analogous lack of code access - in
  the Context bullet, in the protocol step and in the exit line, with the
  `to investigate` escape - and that shape is what is copied here. The
  mitigation line needed nothing: "applied or planned" already carried its own
  branch. Found by surveying what each exit-condition line demands against what
  the skill body teaches.

- 1.0.1 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.0 (2026-06-19) - initial version, derived from a project workflow decanted of all infra coupling
