# `adversarial-feature-challenge` - changelog

Kept beside the skill and never distributed: it is history, and the
SKILL.md is the procedure an agent has to follow. No pointer is left in
the skill, because in a repository where it is installed this file is
not there and the pointer would dangle.

- 1.1.2 (2026-09-04) - the challenge report now has a destination the agent can
  write to. The protocol and the exit condition both named
  `templates/challenge-report.md` as the place to document each flaw, which is a
  path inside the installed skill directory - read-only wherever the skill is
  installed, and never the deliverable anyone wants. The skill never said to copy
  it out, so all three eval manifests had to name a root file in the prompt,
  which is the prompt doing the skill's work. The template is now stated to be a
  model to copy into the audited repository, and the exit line grades the copy
  rather than the template. Found by surveying what each exit-condition line
  demands against what the skill body teaches.

- 1.1.1 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.1.0 (2026-07-21) - persona switch made explicit and countable; eval runs showed agents stopping after one

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)
