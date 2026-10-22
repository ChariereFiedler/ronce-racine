# `visual-regression-check` - changelog

Kept beside the skill and never distributed: it is history, and the
SKILL.md is the procedure an agent has to follow. No pointer is left in
the skill, because in a repository where it is installed this file is
not there and the pointer would dangle.

- 1.0.2 (2026-09-04) - the comparison to "the state before the change" now says
  what produces the before half. No protocol step made one - no stash, no base
  checkout, no capture-then-change ordering - so the step was satisfiable only
  from memory, which is exactly the "it should render" the last exit line
  forbids. Step 6 now states what counts as a before-capture and how to get one
  in a clause, a trap row names the memory shortcut, and the exit condition
  accepts the comparison being explicitly declared not made rather than quietly
  imagined. Found by surveying what each exit-condition line demands against what
  the skill body teaches; this skill has no eval manifest and cannot get one (no
  browser in the container), so nothing measured it from the other end.

- 1.0.1 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.0 (2026-06-19) - initial generic release extracted from a project-specific visual-self-review workflow (stack coupling removed, viewports parameterizable)
