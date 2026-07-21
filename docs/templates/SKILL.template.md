---
name: name-in-kebab-case
description: Use when <concrete third-person triggers - symptoms, situations, user verbatims>. Triggers on "<english trigger>", "<another english trigger>", "<french trigger>", "<another french trigger>". <Describe WHEN, not HOW - never summarize the workflow here.>
version: 1.0.0
metadata:
  last-reviewed: YYYY-MM-DD
  category: audit | feature | bug | frontend | test | process
---

# Readable title - the principle in one line

> If the current repo has an equivalent skill (e.g. acme-app -> `<project-skill>`), it wins - it knows the paths, the tracker and the project commands.

## When ME and not X

- **ME** when: <precise use case>
- **<neighbour-skill>** instead if: <boundary>

## Principle

<1-2 sentences: the central insight, the expected output. What separates a good result from a bad one.>

## Context to gather (before acting)

- Framework + commands: read `package.json` / `Cargo.toml` / `Makefile` / CI config
- Read an existing neighbour and copy its conventions before inventing
- <project reference data / fixtures / locations>

## Protocol

1. <step>
2. <step>
3. <step>

<For a complex workflow, provide a copyable checklist:>
```
- [ ] Step 1
- [ ] Step 2
```

## Templates

- `templates/<x>.md` - <expected output to fill in>

## Pitfalls & rationalizations

| Excuse | Reality |
|--------|---------|
| "<common excuse>" | <why it is wrong> |

## Exit condition

Written as observable outcomes, because this section is what the evaluation
harness gates on (see `eval.yaml` below).

- [ ] <measurable proof the skill reached its goal>
- [ ] <verification run, output pasted - never "it should pass">

## Tooling

- `scripts/<x>.ts` - <runnable static detection: "Run scripts/x.ts">
- `reference/<x>.md` - <heavy grid / reference loaded on demand>

## Changelog

- 1.0.0 (YYYY-MM-DD) - initial versioned release
