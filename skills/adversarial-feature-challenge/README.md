# `adversarial-feature-challenge`

> Deliberately try to break a "done" feature before it ships - because a green golden path proves only that the happy case works.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `feature` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`templates/challenge-report.md`](templates/challenge-report.md), [`assets/fuzz-payloads.txt`](assets/fuzz-payloads.txt) |

## What it is

`adversarial-feature-challenge` is a **red-team pass** for a feature that has just been declared finished. Instead of confirming that the intended flow works, you adopt the mindset of an attacker, a distracted user, or a screen-reader user and actively try to make the feature fail. Every failure you find is captured with a reproducible proof, ranked by severity, and turned into a ticket before anyone closes the original.

## Why it exists

A passing golden path is the weakest possible evidence of quality: it is the one path the author already had in mind. Real defects hide at the edges - double-clicks, expired sessions, another tenant's token, a 10,000-character name, a 500 from an upstream call, a form that is unusable without a mouse.

Two failure modes make this skill necessary:

1. **False confidence.** "I couldn't break it" is usually a statement about the challenger, not the feature. The skill treats *0 bugs found* as a signal to change persona and angle, not as a green light.
2. **Blind spots.** Engineers instinctively probe backend security and numeric edge cases, but systematically forget UX, accessibility, and non-technical personas. The layer checklist forces those angles.

## When it triggers

Invoke it when a feature is "done" and about to be closed, and phrases like these appear:

- "is it really ready?" / "find the bugs" / "red team this"
- a ticket whose only validation is that the golden path passes
- right before shipping or closing a feature ticket

Do **not** use it to prove the intended behavior works in the first place - that is `validating-features-end-to-end` (validate first, challenge afterward). Do **not** use it to grow automated coverage - that is `writing-robust-tests`.

## How it works

The protocol is a persona-driven loop, not a single sweep. You adopt a persona, walk every layer of the checklist while injecting the fuzz payloads, and document each flaw with an archivable reproduction before switching persona and going again. Zero findings means the challenge was too shallow, not that the feature is perfect; the loop ends with a verdict and one ticket per confirmed flaw.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### The fuzz payloads

`assets/fuzz-payloads.txt` is a ready-to-inject list (one payload per line, `#` comments) covering SQL injection, XSS, path traversal, Unicode/RTL/Zalgo, numeric boundaries, extreme dates, tricky emails, and malformed IDs. It is designed to be piped into a curl loop against every input the feature exposes.

### Non-negotiable rules

- **Trying to break, not validate.** The goal is failure, and finding none is a failure of the challenge.
- **Every flaw needs an archivable reproduction** - steps plus output. An undocumented flaw is an opinion.
- **Don't triage away severity on the PO's behalf.** Record cosmetic bugs with their severity; let the owner decide.

## Worked example

> A "rename project" feature is declared done. Golden path: type a new name, click Save, the header updates.

Adopting the **malicious** persona, you send another tenant's project ID to the rename endpoint with your own token and get a `200` back - a cross-tenant write. You capture the two curl calls and the response body in `templates/challenge-report.md`, mark it **blocking**, and open a ticket.

Switching to the **distracted novice** persona on mobile, you double-click Save and the request fires twice, creating a duplicate audit-log entry. Captured, marked **improvement required**, ticketed.

Two personas, two flaws, one blocking - the ticket does not get closed.

## Related artifacts

- [`validating-features-end-to-end`](../validating-features-end-to-end/) - prove the intended behavior works *before* challenging it.
- [`writing-robust-tests`](../writing-robust-tests/) - harden coverage once the flaws are known.
- [`bug-ticket-root-cause`](../bug-ticket-root-cause/) - turn each confirmed flaw into a root-caused ticket.
