# domain-glossary

Fixes the vocabulary of a codebase in a `GLOSSARY.md` the code travels with, so
one concept keeps one name, for the people reading it and for the agent naming
the next module.

## What it is for

You have three names for the same thing (`user`, `member`, `account`), or one
name for two things (an `Order` in sales, an `Order` in a sort), and every new
piece of code picks whichever the author saw last. Or you are onboarding onto a
domain and the words themselves are the obstacle.

`SKILL.md` is the source of truth for the protocol: harvest the terms from the
code rather than from memory, separate synonyms from homonyms, decide one name
per concept, anchor each entry to a type/table/route, and record what was
rejected and why.

## What it is not for

- Designing the aggregates and invariants → `domain-modeling-design`
- Preserving a *decision* rather than a *term* → `recording-decisions`
- Finding the call sites of an existing component → `frontend-spec-call-site-audit`

## Why the rejected terms matter

The property that separates a glossary that holds from a list of definitions is
the "we do not say" line. A definition tells you what `tenant` means; the
rejection tells you that `organization` was considered, dropped, and why, which
is what stops the next reader from reopening the debate and landing elsewhere.
It is also what makes a search for the wrong word arrive at the right entry.

## Output

A `GLOSSARY.md` at the repository root, ordered for lookup, where each entry
names at least one place the term is real in the code, and unsettled terms are
marked provisional rather than dressed up as decided.

## How it is verified

`eval.yaml` plays it against the `flawed-app` fixture and gates on the file
being produced, then has a judge check the properties that are not greppable:
entries anchored to real code, rejected terms recorded, no invented vocabulary
the codebase does not use.
