# Ticket form: the `ticket-needs-skill` rule

A ticket written in a hurry loses what makes it useful to the person who picks it up weeks
later: the evidence, the acceptance criteria, what was not checked. A project that has a skill
for writing tickets wants that skill loaded every time, and a reminder in memory does not do
that. The `ronce` mod makes it a rule of the harness.

## What the project declares

In its `.claude/ronce.json`:

```json
{
  "version": 1,
  "ticket": {
    "skill": "write-issue",
    "headings": ["## Problem", "## Evidence", ["## Reproduction", "## Current behaviour"], "## Acceptance criteria", "## Not verified"],
    "labels": ["bug", "enhancement"],
    "requireSearch": true
  }
}
```

| Key | Meaning |
|---|---|
| `skill` | The skill that writes the project's tickets; the refusal names it (`Skill <name>`). |
| `headings` | Headings the body must hold, each as a whole line (case and surrounding spaces aside). A list is a choice: one of its headings is enough. |
| `labels` | Optional. The issue must carry at least one of them. |
| `requireSearch` | Optional, on unless `false`. The creation is refused until an issue search ran in the session. |

A malformed `ticket` (no `skill`, empty `headings`) is dropped and reported in `/ronce-hits`: a
wrong form would refuse good tickets.

## What the rule does

On a command that creates an issue, the mod reads the body and checks it against the form:

| Command | Where the body is read |
|---|---|
| `gh issue create` | `--body`/`-b`, `--body-file`/`-F` (a file, or `-` with a heredoc), `--body "$(cat file)"`, `--body "$(cat <<'EOF' … EOF)"` |
| `glab issue create` | `--description`/`-d` |
| `gh api …/issues`, `glab api …/issues` (POST) | `-f body=…`, `-F body=@file`, `--input file.json` |
| `curl` POST to `…/issues` (GitHub or GitLab) | `-d`, `--data*`, `--json`, `@file`: the JSON `body`/`description`, or the form field of that name |

With a `ticket` key, a body that misses a heading, a creation with no body, a body file that
cannot be read, a missing label or a missing search is **refused** before the command runs. The
message names the skill to load and lists what is missing:

```
ronce/ticket-needs-skill : Création d'issue : écrire le corps avec le skill de rédaction de tickets du projet
(charger Skill write-issue ; en-têtes manquants : ## Evidence, ## Not verified)
```

Without a `ticket` key, nothing is refused: the creation goes through and the model gets a
reminder to load the project's ticket skill if it has one, or `ronce-racine:bug-ticket-root-cause`
for a bug.

The duplicate search counts when one of these ran successfully earlier in the session:
`gh issue list --search`/`-S`, `gh search issues`, `glab issue list --search`, an API call on
`search/issues` or on `…/issues?search=`. A plain `gh issue list` is not a search.

`# ronce:allow ticket-needs-skill` at the end of the command lifts the refusal once; `"modes":
{ "ticket-needs-skill": "shadow" }` only records it; `"disable": ["ticket-needs-skill"]` turns it off.

## The prompt reminder

When a prompt speaks of a ticket, an issue or a bug report, the project's ticket skill is named
before `bug-ticket-root-cause`: by the mod (from `ticket.skill`), and by the `skill-reminder`
settings hook, which reads the same key.

## Limits

- The check is on the body's structure, not its content: a heading followed by nothing passes.
  Personal data and titles are not checked.
- A body piped from another command (`cat body.md | gh issue create --body-file -`) or written by
  a here-string is not read: write the body to a file and pass `--body-file`.
- GraphQL mutations (`gh api graphql`) and issue creation through a web page are not seen.
- The search is session-wide: any earlier search counts, whatever its keywords.
- The rule reads the first 20 000 characters of a command, like every rule; a longer inline body
  is cut, which a body file avoids.
