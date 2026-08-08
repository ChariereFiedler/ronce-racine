---
name: domain-glossary
description: Use when the same thing goes by several names in a codebase, when a term means two different things depending on the file, or when onboarding onto an unfamiliar domain - before naming a new module, table or endpoint. Triggers on "build a glossary", "the naming is inconsistent", "define the domain vocabulary", "three names for the same thing", "construis un glossaire", "le nommage est incohérent", "définis le vocabulaire métier", "trois noms pour la même chose".
version: 1.0.0
metadata:
  last-reviewed: 2026-08-08
  category: process
---

# Domain glossary - one name per thing, written down

> If the current repo already has a glossary, a ubiquitous-language document or
> an ADR fixing its terms, it wins - extend it rather than starting a rival file.

## When ME and not X

- **ME** when: the vocabulary itself is the problem - one concept, several
  names, or one name covering several concepts
- **domain-modeling-design** instead if: the question is what the aggregates and
  invariants are, not what they are called
- **recording-decisions** instead if: what must survive is a *choice* (why this
  approach) rather than a *term* (what this word means here)
- **frontend-spec-call-site-audit** instead if: you need the call sites of an
  existing component, not the name it should have

## Principle

**A term that is not written down is renegotiated on every session.** Both by
people and by agents: an agent asked to add "a client note" will invent
`ClientNote`, `CustomerComment` or `AccountRemark` with equal confidence,
because nothing in the repository says which one this codebase already chose.
The cost is not aesthetic. It is a table nobody finds, a search that returns
nothing, and a second implementation of something that existed.

The output is a `GLOSSARY.md` at the repository root, versioned with the code
that uses it. Not a wiki page: it must travel in the diff that changes the
meaning, and it must be readable by whatever opens the repo next.

Three properties separate a glossary that works from a list of definitions:

1. **It records what was rejected, and why.** "We say *tenant*, never
   *organization*, because *organization* is a field on the invoice" prevents a
   relapse that a bare definition does not.
2. **Each entry points at the code.** A term with no anchor drifts within a
   release. An entry naming the type, table or module is checkable.
3. **It is short.** It is read on every naming decision, so anything that is
   not load-bearing costs more than it gives. Prefer removing an obvious term
   to explaining it.

## Context to gather (before writing)

- **The candidate terms, from the code, not from memory**: type and class names,
  table names, route segments, event names, queue names. Where the vocabulary
  actually lives is where the compiler enforces it.
- **The collisions**: the same word in two senses (an `Order` in sales and an
  `Order` in a sort function), and the same sense in two words (`user` /
  `member` / `account`).
- **The origin of each name**: which one the domain experts say out loud, which
  one exists only because a library used it, which one is a translation artifact.
- **What the team already fixed elsewhere**: ADRs, an existing README section,
  ticket titles. A term already decided must not be reopened here.

## Protocol

```
- [ ] 1. Harvest the terms from the code, mechanically
- [ ] 2. Cluster the synonyms and split the homonyms
- [ ] 3. Decide one name per concept, with the domain expert if there is one
- [ ] 4. Anchor each entry to code
- [ ] 5. Record the rejected terms and the reason
- [ ] 6. Write GLOSSARY.md, ordered for lookup
- [ ] 7. Wire it in: point the agent instructions at it
```

### 1. Harvest mechanically

Read the shapes the code commits to, in this order: schema/migrations, domain
types, public API routes, event and job names. Names that appear in only one
function are usually local, not domain.

### 2. Synonyms and homonyms

Two distinct failures, two distinct fixes:

- **Synonyms** (several names, one concept) → pick one, list the others as
  rejected so a search for them lands on the entry.
- **Homonyms** (one name, several concepts) → the name cannot stay as-is for
  both. Qualify at least one of them, and say in the entry which context each
  belongs to.

### 3. Decide, do not average

If a domain expert is reachable, the word they say wins over the word the code
happens to hold - that is the whole point of a *ubiquitous* language. If no one
can arbitrate, prefer the term with the most call sites (cheapest migration) and
mark the entry as provisional rather than pretending it is settled.

### 4. Anchor each entry

Every entry names at least one place the term is real: a type, a table, a route,
a module. An entry that anchors nowhere is either a term the code does not use -
delete it - or a gap worth its own ticket.

### 5. Record the rejections

The rejected terms are what makes a glossary hold. Without them, the next
reader re-runs the same debate and may land elsewhere.

### 6. Order for lookup

Alphabetical unless the domain has an obvious spine (a lifecycle, a pipeline).
The reader arrives with a word and wants its meaning; do not make them read the
document to find one line.

### 7. Wire it in

A glossary nobody opens changes nothing. Reference it where naming decisions are
made: the repository's agent instructions (`CLAUDE.md` / `AGENTS.md`), the
contributing guide, the pull-request template. One line pointing at it is enough
- but without that line, the file is decoration.

## Templates

```markdown
# Glossary

Vocabulary of this codebase. One name per concept; the rejected names are listed
so a search finds its way here. Change a meaning in the same diff as the code.

## <Term>

<One sentence, in the domain's words, not the framework's.>

| | |
|---|---|
| **In the code** | `<type / table / route / module>` |
| **Not to be confused with** | `<neighbouring term>` - <what separates them> |
| **We do not say** | `<rejected term>` - <why> |
| **Status** | settled / provisional (no arbiter yet) |
```

## Pitfalls & rationalizations

| Excuse | Reality |
|--------|---------|
| "Everyone here knows what a *batch* is" | Everyone currently here. The next reader, human or agent, is exactly who this file is for. |
| "The code is self-documenting" | The code is where the disagreement lives - three names for one concept are all in the code. |
| "I will write it once the naming settles" | The naming settles *because* it is written down. Waiting is how a third synonym appears. |
| "Let's keep both terms, they are close enough" | Then every search finds half the call sites, and both keep growing. Pick one; list the other as rejected. |
| "It belongs in the wiki" | A wiki does not travel in the diff that changed the meaning, and nothing fails when it goes stale. |
| "It would be a huge document" | A glossary over ~30 entries is describing a codebase, not a domain. Keep the load-bearing terms. |
| "The ORM already names the tables" | The ORM named them after a framework convention, not after the domain. That is the drift, not the fix. |

## Exit condition

- [ ] `GLOSSARY.md` exists at the repository root
- [ ] Every entry anchors to at least one type, table, route or module that exists
- [ ] Every synonym cluster resolved to one name, the others listed as rejected
- [ ] Every homonym either qualified or explicitly scoped per context
- [ ] Unsettled terms marked provisional rather than presented as decided
- [ ] The agent instructions (`CLAUDE.md` / `AGENTS.md`) point at the glossary
- [ ] No entry restates a general programming term the domain does not own

## Changelog

- 1.0.0 (2026-08-08) - initial versioned release
