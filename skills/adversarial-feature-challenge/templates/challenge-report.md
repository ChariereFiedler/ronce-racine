# Adversarial challenge - <feature> - <YYYY-MM-DD>

## Layers

### UX & interactions
- [ ] Double-click submit (idempotence) · [ ] Back/reload mid-flow · [ ] Close while saving
- [ ] Buttons disabled during loading · [ ] Empty state (0) · [ ] Saturated state (10k+) · [ ] Zoom 200%/50% · [ ] Mobile

### Inputs (payloads: assets/fuzz-payloads.txt)
- [ ] Empty/null · [ ] Edge whitespace · [ ] Unicode/RTL/emoji · [ ] 10,000+ chars
- [ ] SQLi · [ ] XSS · [ ] Path traversal · [ ] Numbers (0, negative, MAX, NaN) · [ ] Extreme dates
- [ ] IDs: other tenant, nonexistent, malformed

### Auth & multi-tenant
- [ ] Session expired mid-action · [ ] Other tenant's token → strict 403/404 · [ ] Cross-tenant URL → 404 not 200
- [ ] Role downgrade mid-session · [ ] CSRF on destructive actions

### Concurrency
- [ ] 2 users same object · [ ] Deletion during edit · [ ] Invariants under simultaneous requests

### Network & state
- [ ] Drop during submit (retry/idempotence) · [ ] High latency · [ ] API 500 → degraded UX · [ ] 200 empty/malformed payload

### Data
- [ ] Deletion of referenced entity · [ ] Modification during async process · [ ] Threshold/quota bounds

### Accessibility
- [ ] 100% keyboard · [ ] Visible focus · [ ] Labels on icon buttons · [ ] Contrast · [ ] Screen reader

### Observability
- [ ] Logs on key actions (no PII) · [ ] Metrics · [ ] Error visible in dashboard

## Personas walked through
- [ ] Distracted novice (mobile) · [ ] Power user · [ ] Malicious · [ ] Blind user · [ ] Curious dev (DevTools)

## Flaws found
| # | Flaw | Severity | Repro (steps + proof) | Ticket |
|---|---|---|---|---|
| | | | | |

## Verdict
<blocking / improvement required / green-light> - if 0 flaws: the challenge was insufficient, start over with another persona.
