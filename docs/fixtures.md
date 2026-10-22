# Where the fixtures come from

The eval fixtures have to be realistic, and realism is the one thing you cannot
invent. A fixture designed from a skill's exit condition contains exactly the
difficulty its author thought of, which is the difficulty the skill already
handles. Real projects fail in ways nobody designed.

So the difficulty comes from real episodes: a recurring defect that took six
fixes over four weeks, a detection gap that let four bugs reach a user, a
decision whose obvious answer was wrong. Those episodes exist, written up at
the time, in a private repository belonging to the same author. The skills in
this toolkit were extracted from that work.

This page is the rule for using it, and it exists because the temptation to
paste is real and the consequence is not recoverable.

## The rule

> **Transposition preserves the difficulty structure and nothing else.**
>
> What crosses: the hypothesis lattice, which fixes were tried, why each was
> partially right, what the durable fix bounded, where the detection gap was,
> the shape of the table that records it.
>
> What does not cross: any path, any commit hash, any ticket number, any
> service or crate or project name, any sentence. The domain changes. The
> language becomes English. The stack becomes Node and TypeScript.
>
> A reader who has never seen the source project must not be able to tell.

The test of a good transposition is that someone who knows the original reads
the fixture and recognises the *lesson*, not the incident.

## Why the rule is this strict

This repository ships public under MIT. The source is private and its artifacts
carry production code, live infrastructure details, real ticket numbers and
security findings that were never published. There is no version of "mostly
anonymised" that is safe, because the residue is exactly the part nobody
re-reads: a path in a code comment, a hash in a table, an issue number in a
list of actions.

Copyright reinforces what confidentiality already decides. A pattern of failure
that someone reasoned out is not an expression; the paragraph they wrote about
it is. Only the first crosses.

## Worked example

A real postmortem records six fixes in 29 days on a build that kept running out
of memory. Two hypotheses were tested and each was *partially* right, which is
why the fixes kept almost working: raising the memory budget helped and it
still failed, reducing concurrency helped and it still failed. The third
hypothesis was confirmed: a framework default made the amount of work unbounded,
so no budget was ever going to be enough. The durable fix bounded the workload
rather than the budget, and added a monitor so the next drift would be visible
before it was fatal.

Every word above is transposable and none of it identifies anything. What must
not appear in the fixture: the framework, the option name, the six commit
hashes, the ticket numbers, the repository layout, the prose of the original.

That paragraph is the specification for an `incident` world. The stack, the
domain and the defect are invented to fit it.

## The guard

`tests/fixtures.test.ts` greps every materialised fixture for the mechanical
tells: the source project's name and its siblings, the ticket-number shape, and
anything that reads as a commit hash. It runs in `npm test`.

A denylist cannot establish that a transposition is clean. It makes the
accidents impossible to land, which is a different and achievable job:

- a path pasted into a code comment,
- a hash left in a fix-chain table,
- an issue reference carried over in a list of actions.

The judgement - is this the *structure* of the episode, or its *expression*? -
stays with the author, and nothing will automate it. When you are unsure, the
question that decides is: could I have written this fixture from the four-line
summary of the lesson, without the original open in front of me? If not, you
are copying.

## When there is no episode

Several skill families have no real episode to draw on, and the honest move is
to say so in the manifest rather than to manufacture realism. A synthetic
fixture built carefully from an exit condition is a legitimate smoke fixture. It
is not a measurement fixture, because the difficulty in it is the difficulty its
author imagined.

See [evaluating-skills.md](evaluating-skills.md), part 2, for the contract a
fixture has to meet before its manifests may carry a verdict.
