# The quality bar

Anyone can write a skill. The two hard parts are knowing whether it still works,
and keeping many repositories on the same version of it. This page records what
is actually checked, and by what.

For how to run an evaluation, see [`evaluating-skills.md`](evaluating-skills.md).
For the development commands and gates, see [`developing.md`](developing.md).

## Every skill is evaluated against a real agent run

Each of the 36 skills carries an `eval.yaml`: a fixture, a realistic prompt,
mechanical gates derived from the skill's own exit conditions, and an LLM judge
for what stays subjective.

Prose cannot be unit-tested. Running the skill against a fixture that plants the
defect it claims to catch is the only honest way to know it still does what it
says, and it regularly answers no. The `bug-triage-structured` skill runs
`git log --grep="fix(<scope>)"` rather than trusting the agent's memory
precisely because evaluation runs showed agents skipping the recurrence check.

A rule accompanies this: never move the target to make the test pass. Every gate
here scores something its own author can edit, so a description changes only
when the change is right independently of the test.

## Routing is linted, not hoped for

A skill that cannot be told apart from its neighbours never fires, however good
its content is. `tsx tools/skills.ts routing` checks ten realistic user
sentences, each required to score strictly above the skills it is confusable
with.

Five of the ten failed on the first run of that lint. Half the sampled skills
did not distinguish themselves from their neighbours, which is the clearest
argument that 36 skills is a surface to reduce rather than to grow.

## The tooling is held to the same bar as what it ships

| Gate | What it covers |
|---|---|
| 132 tests across 13 files (`vitest run`) | mostly behavioral: they spawn the real CLI and the real hooks rather than mocking them |
| Property-based tests (`fast-check`) | invariants of the installer and the selector under generated input |
| Mutation harness (`npm run test:mutation`) | 35 hand-written mutants, all of which must be killed. A test that stays green on broken code is worse than no test |
| CodeQL (CI) | static analysis of the shipped TypeScript |
| gitleaks (CI) | no secret in the repository or its history |
| `claude plugin validate --strict` (CI) | an external validator that reads the artifacts the way the runtime does. It caught an agent shipping without its documented tool restriction, which a seven-check in-house harness had missed |
| Structural validators (`tools/skills.ts`) | skills, rules, hooks, agents, scripts, templates and docs each have their own contract check |

Reproduce them locally:

```bash
npm run verify            # typecheck + lint + the full test command
npm run test:mutation     # the 35 mutants
npm run coverage          # coverage of the imported modules
```
