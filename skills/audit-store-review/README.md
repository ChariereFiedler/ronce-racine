# `audit-store-review`

> Check a mobile app against the store's review rules before (or just after) submission: the built manifest, the code, the listing and the console declarations, with the mismatches between them.

| | |
|---|---|
| **Type** | Skill (on-demand audit) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | `unzip`/`strings`/`grep`/`wc -m`; the rule table in [`reference/google-play-rules.md`](reference/google-play-rules.md) |

## What it is

A review is refused or an app is pulled when a declaration does not match the code: a data safety form, a foreground-service form, a privacy policy, a listing claim. This skill reads the **built bundle** and the **code** first, then the declarations, and reports each gap with the evidence on both sides. Google Play is covered; Apple's App Store is not.

## Why it exists

The generic audits do not read store rules. `audit-compliance` asks about GDPR and retention; it does not ask whether a foreground service passes the type the console form declared, or whether a model that writes text needs an in-app report button. Those questions come from the store's pages, which move every year, so the rule table keeps the source page and the date it was last read, and the skill requires re-reading a page before calling a rule violated.

## Status

Not yet evaluated against an agent run: it ships without an `eval.yaml`. The table rows marked `from memory` or `not re-read` are starting points to confirm, not verified rules.
