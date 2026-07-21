# Contributing to Ronce Racine

Thanks for wanting to contribute. This repo is the canonical source of *project-agnostic* [Claude Code](https://claude.com/claude-code) configuration: a layer of *always-on* rules and *on-demand* workflows installable in any project. The admission bar is one word: **genericity**.

## The non-negotiable bar: genericity

An artifact (rule, skill, hook, agent, script) lives here **only if it is truly project-agnostic**:

- no crate, package, script, path, or identifier name tied to a specific project;
- no imposed tracker (Jira, GitLab, GitHub…), no imposed stack;
- examples use **fictional** project names (`acme-app`, `beta-app`).

If an idea is useful but coupled to a project, **split it**: the generic principle goes here, the project-specific tooling stays in the project's own repo (via a routing override - "e.g. `acme-app` → `my-skill`, it wins").

Detailed criteria:
- Rules → [`docs/writing-a-rule.md`](docs/writing-a-rule.md)
- Skills → [`docs/writing-a-skill.md`](docs/writing-a-skill.md)
- Working on the toolkit itself → [`docs/developing.md`](docs/developing.md)
- Context for an LLM agent → [`AGENTS.md`](AGENTS.md)

## Language

The repository is **English-facing**: rules, skills, docs, and user-facing tooling output are written in English. Keep new artifacts and documentation in English. Skills may keep bilingual (English + French) quoted trigger phrases in their `description` so they can be invoked in either language.

## Contribution workflow

1. Fork + branch from `main`.
2. Add or modify your artifact, following its type's contract (frontmatter, semver `version`, `metadata`).
3. Run the local checks:
   ```bash
   npm install
   npm test          # skill structure + routing, rule/script/hook versioning
   npm run typecheck # tsc --noEmit
   ```
4. Open a Pull Request explaining **why** the artifact is generic (what project coupling was removed, if any).

## Versioning

Every rule and skill carries a semver `version` and a `metadata.last-reviewed` date in its frontmatter, validated by `npm test`. Any behavior change must bump the version and add a line to the artifact's `## Changelog`.

## Commit messages

Format `type(scope): description` with `type` ∈ `feat | fix | refactor | test | docs | chore`. First line ≤ 72 characters.

## Structural decisions

A non-obvious choice (a new artifact family, a contract change, an architectural trade-off) is recorded in [`docs/decisions.md`](docs/decisions.md) at the moment the decision is made - never modify an existing entry, add one that supersedes it.

## Security

Hooks and scripts in this repo run code on your machine. Before contributing or adopting one, read [`SECURITY.md`](SECURITY.md).

## Code of conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
