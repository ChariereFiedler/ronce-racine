# Measuring whether a document helps an agent

A method, and the measurements that produced it. Everything here was learned by
building the thing badly first, and every figure is one this repository actually
measured.

It is written to be reusable without our code. The code is 3300 lines you will
rewrite anyway; the mistakes below are the part worth having.

## The question

Not "is this agent good" - the question every eval framework answers - but:

> A document is added to an agent's context. How much does it move the work?

That is an A/B on a *piece of prose*, with the agent, the model and the task
held fixed. It needs two arms, an isolated environment so the document is
genuinely absent from one of them, and a repository the agent works in.

Everything that follows is about the one thing that decides whether the answer
means anything: **what you measure the two arms against**.

## The failure that eats this kind of eval

We measured 36 documents against ten purpose-built repositories of 6 to 33 lines
of code each. One of them, 15 lines, was the target of eleven of them.

> On a fifteen-line project there is nothing for a check to key on except the
> wording of the deliverable. Every check becomes a **format check**, and a
> format check is passed by any text carrying the format, whatever produced it.

Three measurements say it from three directions:

- A document separated its arms 0.33 against 1.00 on the mechanical checks while
  the LLM judge sat at 1.00 on both. The two checks that moved were greps for
  the words *confidence* and *non-auditable*. Nothing about the work got better.
- The same document, monolithic, and split into a thin file pointing at a shared
  reference, measured **exactly the same** over 6 pairs on two different
  subjects. Which is what the format hypothesis predicts: if the check scores
  vocabulary, how the vocabulary arrived cannot matter.
- Seven of ten subjects in a smoke sweep came back saturated.

### The cheapest detector we found

Grade a synthetic deliverable that carries the document's own headings and **no
content whatsoever**, against your own checks. Every check it passes scores
vocabulary rather than work: the deliverable knows nothing about the repository.

It costs one call. On our base: **43 of 58 checks were format checks. 13
survived.** That single number is why we rebuilt the repositories rather than
reword the checks a third time.

Run it against your own suite before you trust a figure. It is the most useful
hour in this document.

## What a fixture has to contain

Six properties. Fewer than five and it is a smoke fixture - a legitimate thing
to be, as long as it says so and never publishes a causal verdict.

1. **The house format is already present** - a template plus two filled
   examples of the deliverable's kind. The counter-intuitive one, and the most
   load-bearing: giving the format away for free makes the word greps saturate,
   which forces them out, which leaves content as the only thing left to check.
2. **Two decoy causes** that survive a shallow investigation, each supported by
   evidence a careful reader will find and believe.
3. **One non-textual outcome** the document promises: a hook that blocks, a call
   site removed, a migration split in three. Something a grep can reach and
   prose cannot fake.
4. **Something the document forbids**, reachable and tempting. Ours was a
   one-line change, pre-authorised in a colleague's note, that makes the build
   green.
5. **History that changes the correct answer.** If the log is decoration, a
   whole class of work has nothing to demonstrate.
6. **An answer key that names the wrong answers**, ranked by likelihood, and
   carries a written argument for how a careful agent with no document plausibly
   fails. If you cannot write that argument, the scenario is saturated and you
   have measured nothing yet.

In practice this lands around twenty files and thirty commits. The contract is
the bar; the line count is a symptom of it.

### Where the realism comes from

Not from imagination. A fixture designed from a document's own checklist
contains exactly the difficulty its author thought of, which is the difficulty
the document already handles.

We transposed real episodes from a private project: a recurring failure fixed
six times in 29 days, a detection gap that let four bugs reach a user. What
crosses is the **difficulty structure** - the hypothesis lattice, which fixes
were tried, why each was partly right, what the durable fix bounded. What does
not cross is anything else: no path, no hash, no ticket number, no sentence.

The test of a good transposition: could you have written the fixture from a
four-line summary of the lesson, without the original open? If not, you are
copying.

## Measure the trajectory, not only the deliverable

The mistake that took us longest to see.

A document worth measuring prescribes more than an output. Counting the sections
across our 36:

| Section | Documents | Graded, before |
|---|---|---|
| the deliverable and its properties | 36 | yes |
| the tools to run | 24 | no |
| named traps and their refutations | 22 | no |
| the context to gather **before acting** | 21 | no |
| the protocol | 16 | no |

One surface of six. The other five are claims about what the agent **did**, and
a repository snapshot cannot hold any of them: the final tree is identical
whether the history was read first or last.

We were collecting the trajectory and throwing it away. Measured over twelve
trials: **480 steps carrying 598 tool calls, and the judge saw none of them** -
the renderer kept each step's prose and dropped its actions. So a criterion we
actually shipped, *"refutes a hypothesis with evidence it produced, not with a
claim"*, was unanswerable by construction. Running a command and saying you ran
it rendered identically.

### What it bought, on the same twelve trials

| dimension | without the document | with it | lift |
|---|---|---|---|
| deliverable checks | 0.33 | 0.33 | 0.00 |
| LLM judge | 0.72 | 0.94 | +0.22 |
| **trajectory checks** | **0.67** | **0.94** | **+0.28** |

The single strongest signal: the script the document names as step one of its
protocol was run by **0 of 6** unaided runs and **5 of 6** aided ones. That
script only reads. It leaves nothing in the tree. No deliverable check could
ever have seen it.

And the trajectory dimension is deterministic and free, where the judge is
neither.

### The checks that carry it

- **the tool ran** - a prescribed script, optionally scoped to what it was
  pointed at. "Ran grep" and "ran grep for the thing that matters" are different
  claims.
- **the file was read** - and count a shell read (`cat`, `grep`, `sed -n`,
  `head`) as well as a dedicated tool, or you measure your harness rather than
  the work. A report can cite a document it never opened.
- **the forbidden act is absent** - a commit, a destructive command. Invisible
  in a snapshot diff.
- **the order** - the one with no equivalent anywhere in a state-based
  vocabulary. "Context to gather *before acting*" is an ordering claim, and
  ordering is precisely what a snapshot erases.

One rule keeps them honest, and it is the format rule again in a new costume:
**a trajectory check names an action, never a word the agent might say.** A
substring match against the agent's prose is a format check in disguise, and the
synthetic-deliverable probe cannot catch that one for you.

### A trajectory that could not be read must fail every check

Including the absence ones. A lost trial scoring like a perfect one is the
quietest way to corrupt a measurement.

## Reading the result

**Never as one number.** Judge each dimension against its own baseline. Ours
reported "inconclusive" overall while the judge was separating the arms
perfectly, and averaging would have reported +0.35 and buried every fact.

**Saturation is a fact about your fixture, not about the document.** A baseline
already at the ceiling means the fixture is too easy for that check.

**A check nobody passes is as bad as one everybody passes.** It penalises both
arms equally and dilutes the rest. We shipped one by accident - a regex whose
`\s*` could consume nothing, so a negative lookahead succeeded against the
whitespace and it matched the *untouched* line. It failed on all 12 trials
whatever the agent did, and cost the entire mechanical dimension of a
ten-dollar run. **Verify every pattern against the real fixture, on the line
that must pass and the line that must fail.**

**Below six pairs a sign test cannot go under p=0.0625.** No causal verdict
below that, however large the gap. And at six pairs a document that helps four
times out of six reads as no lift - report the p-value and the count of
discordant pairs, or you will close a document that works.

**Cost belongs in the reading.** Ours cost 2.7x the money and 3.3x the tokens.
Whether that trade is right is an engineering call; the harness's job is to put
both sides of it on the table.

## Three outcomes, all legitimate

State which one, in the manifest, next to the check it justifies.

- **Measurable, hardened.** The sweep showed saturation, the document named
  something unmeasured, a check now covers it.
- **Unevaluable here, or partly.** A document that acts on a live pipeline
  degrades to "write a plan" in a fixture. Say so rather than pretend.
- **No lift, stopped.** Ours came back 1.00 against 1.00 three times running.
  The unaided arm did the work by itself. A fourth adjustment aimed at turning
  the number green would be moving the target.

## Never move the target

Every check has a target its author can edit. That makes Goodhart's law a live
risk rather than a slogan: the cheapest way to turn a check green is always to
weaken what it measures.

> **Change the artifact only if the change is right independently of the test.**
> Otherwise change the test - or admit the test cannot answer the question.

We used all three answers in one night. A check that keyed on a guardrail living
in one particular directory was widened, because the document promised a
*blocking* guardrail and never named a location - right independently of the
score. Then the widened form failed too, because agents added the guardrail by
**editing a file that already existed**, which a path-keyed check cannot see.
Widening a third time would have been tuning until the number moved. It went to
the judge instead, with the reasoning written down.

The tell that you are on the wrong side of the line: you are editing the
artifact while thinking about the score rather than about the reader.

## What we would not build again

The container, the agent runner, the trajectory format, the paired-arm
isolation. All of that came from [Harbor](https://github.com/laude-institute/harbor)
and building it would have been the expensive mistake.

What is genuinely specific is thin: the manifest sitting beside the artifact it
grades, the synthetic-deliverable probe, the fixture contract, the trajectory
checks derived from the document's own sections. Perhaps 3300 lines, with a
one-to-one test ratio and no dependencies.

That ratio is not zeal. Three harness defects in one night each produced a
**plausible measurement that was wrong** - the regex above, a judge budget that
truncated from the wrong end, a renderer that dropped 598 tool calls. That is
the signature of a bespoke evaluator: its bugs do not look like bugs, they look
like findings.

## Further reading

The literature converges on the same shape from the research side:
[AgentProcessBench](https://arxiv.org/pdf/2603.14465) on step-level process
quality and why end-of-trajectory supervision alone is a sparse signal;
[RubricEval](https://arxiv.org/pdf/2603.25133) and
[Step-wise Rubric Rewards](https://arxiv.org/html/2605.17291v1) on one judgment
call per rubric item, attributed to a step;
[Can LLM-as-a-Judge Reliably Verify Rubrics in Agentic Scenarios?](https://arxiv.org/html/2606.29920)
on judge fragility to order and wording, which a quorum bounds and does not
remove.

Our own harness, its manifests and its findings log are in this repository:
[evaluating-skills.md](evaluating-skills.md), [fixtures.md](fixtures.md).
