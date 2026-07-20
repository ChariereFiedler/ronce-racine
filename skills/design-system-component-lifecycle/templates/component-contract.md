# Component contract - `<ComponentName>`

## Decision
- No existing DS component covers: <why>
- No external primitive covers: <why>
- Type: atom | molecule - location/naming: <…>

## API
| Element | Name | Type | Required | Default | Note |
|---------|------|------|----------|---------|------|
| value (two-way) | | | | | associated update event: |
| prop | label | string | no | | |
| prop | hint | string | no | | |
| prop | error | string | no | | |
| prop | disabled | boolean | no | false | |
| prop | required | boolean | no | false | |
| prop | size | enum | no | | |
| prop | variant | enum | yes | - | no arbitrary default |
| slot | | | | | |
| event | | | | | |

## Tokens (zero hardcoded value)
| Aspect | Token used |
|--------|------------|
| color | |
| spacing | |
| typography | |
| radius / border | |

## testid
- Pass-through from the call site: yes
- Internal sub-elements (derived suffix): <…>

## Call sites of the raw pattern to migrate
- [ ] <file:line>
- [ ] grep of the raw pattern = 0 occurrences outside an exemption

## Enforcement
- [ ] Doc / DS index updated
- [ ] Lint: raw pattern removed from exemptions, dedicated message, tested
- [ ] Unit test (testid, value, states)
- [ ] Visual snapshot (if the render is non-trivial)
- [ ] Runtime audit (if the DOM signal is reliable)
