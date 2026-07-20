# Contract evolution — `<endpoint/schema>`: `<old>` → `<new>`

## Classification

- Change type: **breaking** / **additive** (specify per field)
- Strategy: expand-contract / direct additive / new API version

## Consumer inventory (greps pasted here)

| Family | Where searched (grep) | Co-deployed? | Status |
|---|---|---|---|
| Client mirror types | | yes / no | migrated / not affected |
| Adapters / composables | | | |
| Test fixtures & mocks | | | |
| Contract schema / snapshot | | — | diff reviewed |
| Distributed clients (CLI / SDK / installed app) | | **no** | dated compat / verified tolerance |
| Outbound integrations / webhooks (third party) | | **no** | |

## Compat & deprecation

- [ ] Non-co-deployed consumers covered (alias / dual field / new version)
- [ ] Dated removal ticket: #_____ — deadline _____

## Verifications

- [ ] Contract-artifact diff reviewed and pasted
- [ ] Build + lint + producer tests green
- [ ] Consumer tests + touched E2E green
- [ ] Contract comparison in compare mode (not `--update`) green
