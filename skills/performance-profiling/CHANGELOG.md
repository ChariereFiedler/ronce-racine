# `performance-profiling` - changelog

Kept beside the skill and never distributed: it is history, and the
SKILL.md is the procedure an agent has to follow. No pointer is left in
the skill, because in a repository where it is installed this file is
not there and the pointer would dangle.

- 1.0.1 (2026-09-04) - the p-value is no longer demanded where nothing in the
  skill can produce one. "Every A/B claim reports sample count and p-value" was
  written for the only statistical apparatus this skill ships - `benchstat`,
  which is Go, and whose interleaving recipe is a `go test` loop. The Node path
  the skill itself recommends (`tinybench`, `mitata`) reports ops/s with a margin
  of error or a coefficient of variation and runs no significance test, so for
  every fixture in this repository the requirement had no path. Step 8, the
  hypothesis template and the exit line now ask for a p-value where the harness
  computes one and for the delta against the measured noise floor where it does
  not - the same decision, taken from step 1's measurement, which the skill
  already requires. Not weakened to "report what you can": a claim with neither a
  p-value nor a noise floor is still refused by name. Found by surveying what
  each exit-condition line demands against what the skill body teaches.
  `reference/statistics.md` still states the p-value as unconditional in its
  Reporting rules; it was out of scope for this pass and is the next edit.

- 1.0.0 (2026-07-29) - initial versioned release
