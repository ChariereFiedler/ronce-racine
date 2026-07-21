# [Frontend] <title>

## Context
<Business need in 1-3 sentences.>

## Preliminary codebase audit
> Output of `audit-entry-points.ts` + answers. **No acceptance criteria until this section is filled in.**

- [ ] **Call sites of the main component**: <grep results>
- [ ] **Incoming links to the route**: <grep results>
- [ ] **Sidebar**: entry to add / change / not affected - <file>
- [ ] **Global creation menu ("+ New")**: entry to add / not affected - <file>
- [ ] **Data scope**: global / per organization / per project → determines the URL and the breadcrumb
- [ ] **Edge cases**: 0 entities → <empty+CTA> · 1 entity → <layout> · N → <pagination> · error → <retry> · loading → <skeleton>
- [ ] **i18n**: <keys> (or not applicable)

## Acceptance criteria

### Scenario 1: <complete user flow - not an isolated action>
**Given** <state>
**When** <action from any affected page>
**Then** <result, including navigation/menus>

### Scenario 2: edge case 0 / 1 / N
### Scenario 3: error case

## Technical specifications
- Files affected:
- Dependencies:

## Estimate
X SP
