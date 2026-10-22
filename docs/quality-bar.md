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

## Lift, not just pass

"The skill still produces its deliverable" is a weaker claim than "the agent is
better with it than without". `tools/eval.ts run` answers the first; it inherits
the operator's `~/.claude`, so it cannot answer the second. The second needs an
isolated container, and the harness runs the two arms as paired trials in one
([Harbor](https://github.com/laude-institute/harbor)): same task, same model,
one field apart.

- Gates and judge carry **separate verdicts**. A skill can move one and not the
  other, and averaging them buries whichever one carries the signal.
- No causal verdict below **six pairs**, however large the gap: a sign test on
  five pairs cannot go below p=0.0625.
- A dimension whose unaided arm already sits at the ceiling is flagged
  `saturated` - a fact about the eval, not about the skill - and the report
  states, per arm, whether the agent opened the skill at all.
- `npm run eval:lint` (part of `npm test`) rejects a gate whose literal the
  prompt hands over, so a manifest cannot score itself on what the prompt
  already said.

26 of the 36 manifests carry a measured verdict in a comment block, as of
2026-09-02; the other ten were hardened from their exit conditions without a
figure of their own. Three outcomes are legitimate and the manifest must say
which: measurable and hardened, unevaluable here, or no lift and stopped
(`refactoring-shared-component-api`). How to run one:
[`evaluating-skills.md`](evaluating-skills.md).

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
| The behavioral suite (`vitest run`) | mostly behavioral: it spawns the real CLI and the real hooks rather than mocking them |
| Property-based tests (`fast-check`) | invariants of the installer and the selector under generated input |
| Mutation harness (`npm run test:mutation`) | hand-written mutants, all of which must be killed. A test that stays green on broken code is worse than no test |
| CodeQL (CI) | static analysis of the shipped TypeScript |
| gitleaks (CI) | no secret in the repository or its history |
| `claude plugin validate --strict` (CI) | an external validator that reads the artifacts the way the runtime does. It caught an agent shipping without its documented tool restriction, which a seven-check in-house harness had missed |
| Structural validators (`tools/skills.ts`) | skills, rules, hooks, agents, scripts, templates and docs each have their own contract check |
| Eval-manifest lint (`tools/eval-lint.ts`) | a gate whose literal its own prompt hands over, and a judge criterion echoing the prompt's wording |
| Portability gate (`tools/portability.ts`) | the idioms that only break off Linux: separators, file URLs, CRLF, a space in the project path |

Reproduce them locally:

```bash
npm run verify            # typecheck + lint + the full test command
npm run test:mutation     # every declared mutant must turn its tests red
npm run coverage          # coverage of the imported modules
```
