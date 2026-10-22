# `audit-report` - changelog

Kept beside the skill and never distributed: it is history, and the
SKILL.md is the procedure an agent has to follow. No pointer is left in
the skill, because in a repository where it is installed this file is
not there and the pointer would dangle.

- 1.0.2 (2026-09-04) - the exit condition no longer asks for a notation the skill
  never defines. It demanded an "impact projection `(XX-01: current→projected)`"
  whose notation appears nowhere else in the skill directory: no column in the
  report template, no example, no rule for deriving a projected level, no
  statement of whether the projection is per question, per domain or global. The
  findings log records the measurement from the other end - 0 of 3 runs produced
  one, aided or unaided, which is what an undefined promise looks like when it is
  graded.
  Reduced rather than defined, deliberately: defining it fully would take three
  additions - a projected-level column in the action plan, a rule for deriving
  that level, and a scope decision - three sections grown to justify one
  checkbox, on a skill whose whole content is a template. What the skill does
  teach is the per-question code and the MUST/SHOULD/COULD ranking, and the
  "Priority critical items" rule already ties a recommendation back to the
  question that produced it; the line now grades exactly that traceability.
  Found by surveying what each exit-condition line demands against what the skill
  body teaches.

- 1.0.1 (2026-07-20) - weight table and thresholds no longer restated outside reference/scoring-model.md

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)
