---
name: audit-store-review
description: Use when a mobile app is about to be submitted to, or has just been sent to, an app store review (Google Play first) and nobody has yet checked it against the store's policies. Triggers on "audit the store review", "will Google Play accept this", "check the Play policies", "pre-submission check", "audite les règles du store", "est-ce que Google va accepter l'appli", "vérifie les règles d'examen Play", "avant l'envoi en examen".
version: 1.0.0
metadata:
  last-reviewed: 2026-11-11
  category: audit
---

# Store review audit - confront the app, the listing and the console form with the store's rules

> If the current repo has a project-specific store checklist (a console answers sheet, a release script), read it first: it holds the real answers. This skill checks those answers against the **behaviour of the code**, which is where rejections come from.

## When ME and not X

- **ME** when: an Android app is going to review, or is in review, and the question is "will the store accept it, and are our declarations true".
- **audit-compliance** instead if: the question is GDPR, retention, right to erasure (law, not store policy). The two overlap on the privacy policy; run both for an app that handles personal data.
- **audit-security** instead if: the question is exploitable flaws in the app.

## Principle

A store rejects or later removes an app for a **mismatch**: a declaration (data safety form, foreground-service form, privacy policy, listing text) that the code does not bear out, or a policy the team never read. So the audit reads the **built artifact** and the **code**, then the declarations, and reports each gap with the evidence on both sides. Rules change: every rule in `reference/google-play-rules.md` carries its source page and the date it was last read, and the audit re-reads a page before calling a rule violated.

## Context to gather (before acting)

- The built bundle, not the config: `unzip -p <app>.aab base/manifest/AndroidManifest.xml | strings` (or `aapt2 dump xmlstrings`) for permissions, services, `foregroundServiceType`, `targetSdkVersion`, `allowBackup`.
- Every `startForeground`, `requestPermissions`, `checkSelfPermission` and network call in the sources: `grep -rn "startForeground\|requestPermissions\|checkSelfPermission" <src>` (quote globs, the shell may refuse unquoted ones).
- The listing texts (title, short, full, release notes) and their length: `wc -m`.
- The privacy policy as published (fetch the live URL, not the file in the repo) and the console answers sheet.
- The distribution constraints of the account (personal or organisation, creation date): they decide whether a closed test is mandatory.

## Protocol

1. Classify the app (what data it touches, does it generate content with a model, does it run in the background, accounts or not) and mark the rules that do not apply.
2. Read the built manifest, then the code that uses each permission and each foreground service. Record permission → code that needs it.
3. Walk the rule table in `reference/google-play-rules.md` in order, one verdict per rule: OK, GAP, TO VERIFY, N/A, with the file, command or page that proves it.
4. For every rule whose source page may have moved, re-read that page now (web fetch) and write the date; never rely on memory for a threshold, a deadline or an exemption.
5. Compare the declarations with the code in both directions: a declared item the code does not use, and a code behaviour the declaration omits. Both are mismatches.
6. Produce the report (below). Separate what blocks the review from what is a warning or a product improvement.

## Templates

```markdown
## Store review audit - <app> <version> - <store>

### Verdict
[blocking gaps: n · to verify: n · warnings: n]

| Rule | Verdict | Evidence (code / page, date read) | Fix |
|------|---------|-----------------------------------|-----|

### Blocking
### To verify (needs the console, a lawyer, or the store's reply)
### Warnings and improvements
### Not auditable from the repo
```

## Pitfalls & rationalizations

| Excuse | Reality |
|--------|---------|
| "The data never leaves the device, so the form can stay empty" | Only data processed **locally and not sent off device** is exempt. A sync to a user-chosen server, a credential sent for login, a model download that exposes an IP: each is a different line. Check each against the definition on the store's page. |
| "It only summarizes the user's own text, so the AI policy does not apply" | The official AI-generated-content page read on 2026-11-11 states no exemption for summarization or productivity. A secondary article claims one. Treat it as **TO VERIFY**, not as OK. |
| "The manifest in the repo is the manifest in the build" | Build tools merge and rewrite. Read the manifest inside the bundle that is uploaded. |
| "A warning in the console means a rejection" | Missing mapping files and native debug symbols are warnings. Do not block the release on them; attach the symbols afterwards. |
| "I remember the threshold" | Deadlines for target API level, background limits and test requirements move every year. Re-read the page. |
| "The old audit already covered the listing" | A listing text changes on each release. Re-run `wc -m` and the forbidden-term search on the current files. |

## Exit condition

- [ ] The report names the bundle it read (path, versionCode) and the date.
- [ ] Every rule of the table has one verdict with a command output or a page quote, no rule left blank.
- [ ] Each permission in the built manifest is matched to the code that uses it, or reported as unused.
- [ ] Each foreground service: declared type in the manifest, type passed at runtime, timeout handler present for the types that have a time limit.
- [ ] Each data-safety line is matched to a code path (network call, stored data) or reported as missing.
- [ ] Rules re-read during this run are listed with the date; the others are marked "not re-read".
- [ ] Nothing was submitted, edited in the console or committed by the audit itself.

## Tooling

- `reference/google-play-rules.md` - the rule table: id, rule, how to check, source page, last read.
- Commands above (`unzip`, `strings`, `grep`, `wc -m`) - no script: each project's layout differs and a wrong regex over code fails silently.
