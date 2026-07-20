# `frontend-spec-call-site-audit`

> Before writing a frontend ticket, map the graph the component lives in - call sites, incoming links, global navigation - so the spec never ships an isolated feature that breaks its neighbours.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `frontend` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`scripts/audit-entry-points.ts`](scripts/audit-entry-points.ts) · [`templates/ticket-frontend.md`](templates/ticket-frontend.md) |

## What it is

`frontend-spec-call-site-audit` is a **pre-spec discipline**. It sits before any frontend ticket is written and forces a codebase audit first: no page or component is designed in a vacuum, so the acceptance criteria are only drafted once the surrounding graph - sidebar, creation menus, breadcrumbs, parent pages, incoming links - is mapped and cited in the ticket.

Its hard rule: **refuse to draft acceptance criteria until the audit is done.**

## Why it exists

A ticket that describes a component in isolation produces a feature that works on its own screen and breaks everything around it: an orphaned component nobody mounts, a sidebar entry that no longer routes, a missing "+ New" creation path. These call-site breakages are invisible at review time and discovered in production.

The other chronic gap is edge cases. The empty state (0 entities) and the single-item case (1 entity) are the most frequently forgotten and the most frequently regressed. Enumerating 0/1/N + error + loading up front turns them from afterthoughts into acceptance criteria.

## When it triggers

Invoke it **before** writing any frontend feature ticket or spec:

- a new page, a new component, a new dashboard section - "add an X page"
- drafting acceptance criteria for a UI change in an existing app

Use a sibling instead when: the component's public API is changing with no new ticket ([`refactoring-shared-component-api`](../refactoring-shared-component-api/)), or the feature is already coded and needs coverage ([`writing-robust-tests`](../writing-robust-tests/)).

## How it works

The skill runs a blocking 6-point audit - call sites, incoming links, global navigation, data scope, UX edge cases (0/1/N + error + loading), i18n - whose grep results are pasted straight into the ticket. Only once that graph is mapped are acceptance criteria drafted, and at least one of them must be a full user flow rather than an isolated click.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### Criteria as flows, not isolated actions

At least one scenario must be a complete user flow - "How do you create an X from any page?", "What does the page look like at 0/1/N entities?", "The user goes back: what is preserved?" - because "click card → see detail" says nothing about the navigation graph.

### The tooling

- **[`scripts/audit-entry-points.ts`](scripts/audit-entry-points.ts)** `<ComponentName|-> <route|-> [rootDir]` - a zero-dependency scanner that pre-fills the audit: it greps call sites of the component, incoming links to the route, and heuristically lists the navigation files (sidebar/header/menu/breadcrumb/layout) to check by hand. Pass `-` to skip either criterion.

  ```bash
  npx tsx audit-entry-points.ts WebhookList /webhooks ./frontend
  ```

- **[`templates/ticket-frontend.md`](templates/ticket-frontend.md)** - a ticket skeleton whose audit section is blocking: no acceptance criteria until it is filled.

## Worked example

> "Add a Webhooks page" in an existing dashboard app.

1. Run `audit-entry-points.ts WebhookList /webhooks ./frontend`. It reports: `WebhookList` is not yet used anywhere (new component), no incoming links to `/webhooks`, and flags `AppSidebar.vue` + `GlobalCreateMenu.vue` to check.
2. Fill the ticket audit: sidebar gains a "Webhooks" entry, the "+ New" menu gains "New webhook", data scope is per-organization → URL is `/orgs/:id/webhooks`.
3. Enumerate edge cases: 0 → empty state with "Create your first webhook", 1 → single row (no giant table chrome), N → paginated, error → retry, loading → skeleton.
4. Write scenario 1 as a flow: "From any org page, the user opens '+ New → New webhook', fills the form, and lands back on the list with the new row visible."

## Related artifacts

- [`frontend-fullstack-implementation`](../frontend-fullstack-implementation/) - implement the feature once this audit and spec are done.
- [`refactoring-shared-component-api`](../refactoring-shared-component-api/) - when the change is to a shared component's API, not a new ticket.
- [`writing-robust-tests`](../writing-robust-tests/) - to cover the feature after it is coded.
