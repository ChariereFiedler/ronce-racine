---
name: frontend-spec-call-site-audit
description: Use BEFORE writing any frontend feature ticket or spec - new page, new component, new dashboard section, "add an X page", "ajoute une page X". Use when drafting acceptance criteria for a UI change in an existing app.
version: 1.0.3
metadata:
  last-reviewed: 2026-08-08
  category: frontend
---

# Codebase audit before a frontend spec

> If the current repo has a specific spec skill, it wins.

## This skill vs. others

- **This skill** when: drafting a frontend ticket/spec or acceptance criteria for a page/component in an existing app
- **refactoring-shared-component-api** instead if: changing the API of an already-shipped component (props/emits/slots) with no new ticket
- **writing-robust-tests** instead if: the feature is coded and needs coverage

## Principle

A frontend ticket **never** describes a component in a vacuum. Every page/component lives in a graph: side navigation, global menus ("+ New"), breadcrumbs, parent pages, incoming links. Specifying without mapping that graph = shipping an isolated feature and breaking the adjacent call sites (orphaned component, menu that no longer routes, missing creation entry).

**Refuse to draft the acceptance criteria until the audit is done.**

## Context to gather (before acting)

- Router + navigation files: read the route config, the sidebar/header/global menu to know where an entry gets added
- Read a neighbouring page already specced and copy its conventions (empty states, breadcrumbs, i18n) before inventing
- Data scope: global / per organization / per project - determines where the page lives and which menus are affected

## Audit checklist - to paste into the ticket

1. **Call sites of the main component**: grep the frontend code; list every page/component that uses it
2. **Routes / incoming links**: grep the target route; who points at it (sidebar, header, breadcrumb, links)?
3. **Global navigation**: do the sidebar / creation menu ("+ New") need to gain or change an entry?
4. **Data scope**: is the entity global, per organization, per project? (determines where the page lives and which menus are affected)
5. **UX edge cases enumerated**:
   - 0 entities → empty state with message + CTA
   - 1 entity → does the visualization hold up? (no giant canvas for a single node)
   - N entities → pagination/scroll, responsive layout
   - Backend error → display + retry · Loading → skeleton/spinner
6. **i18n**: required keys listed (or "not applicable" justified)

## Acceptance criteria: flows, not isolated actions

At least **1 scenario expressed as a complete user flow**:
- "How do you create an X from any page?"
- "When the app has 0 / 1 / N entities, what does the page look like?"
- "The user goes back: what is preserved (URL, scroll, filters)?"

A scenario like "I click the card → I see the detail" says nothing about the sidebar, the creation menu, or the other pages that display the same card.

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "The component is isolated, no need to audit call sites" | No component is isolated: sidebar, creation menu and breadcrumb point at it. Grep first. |
| "The ticket already describes clicking the card → detail" | An isolated action says nothing about global navigation or the other pages showing the same card. Full flow required. |
| "I'll write the criteria, we'll audit at implementation" | Broken call sites are found in prod. The audit is blocking before the criteria. |
| "0/1/N entities, the default UX will do" | The empty state and the single-node case are the most frequent regressions. Enumerated or not shipped. |

## Exit condition

- [ ] Audit of the 6 points complete, **grep results cited** in the ticket (call sites, incoming links, global navigation)
- [ ] At least 1 criterion expressed as a complete user flow
- [ ] Edge cases 0 / 1 / N + error + loading enumerated
- [ ] i18n keys listed or "not applicable" justified
- [ ] No acceptance criteria drafted before the audit

## Tooling

- Test procedure: `scripts/audit-entry-points.test.ts` - deterministic behavioral test of the script (positive + negative fixture). Run `npx tsx scripts/audit-entry-points.test.ts` from the canonical repo after any change to the script (also picked up by `npm test`). Not distributed to target repos.

- `scripts/audit-entry-points.ts <ComponentName|-> <route|-> [rootDir]` - pre-fills the audit: call sites, incoming links to the route, navigation files (sidebar/header/menu) to check
- `templates/ticket-frontend.md` - ticket skeleton with the blocking audit section

## Changelog

- 1.0.3 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.2 (2026-08-08) - audit-entry-points.ts escapes the component name before building its regex

- 1.0.1 (2026-07-20) - co-located test procedure for audit-entry-points.ts (scripts/audit-entry-points.test.ts)

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)
