# Secrets section

Questions: SE-03 (Key/secret rotation).

## Table of contents

- [SE-03 — Key/secret rotation](#se-03--keysecret-rotation--criticality-must)

---

### SE-03 — Key/secret rotation — Criticality: **must**

**Analyze:** Secret rotation policy, automation, ephemeral secrets, TTL

**Check:**
- Documented rotation policy for all types of secrets (DB passwords, API keys, tokens, certificates)
- Automated rotation (not manual only)
- Rotation frequency matched to sensitivity (monthly to quarterly)
- Zero-downtime rotation (dual-write, then switch)
- Ephemeral / dynamic secrets for advanced environments

**Commands:**
```bash
grep -ri "rotation\|ttl\|expir\|renew\|dynamic.secret" . --include="*.ts" --include="*.py" --include="*.yml" --include="*.php" 2>/dev/null | head -10
grep -ri "password\|secret\|api_key\|token\|private_key" . --include="*.env" --include="*.env.example" 2>/dev/null | head -10
grep ".env" .gitignore 2>/dev/null
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No rotation. Secrets never changed since creation. |
| 1 | must | Manual rotation on incident or employee departure. |
| 2 | must | Scheduled annual rotation. Documented but manual process. |
| 3 | must | Automated quarterly rotation. Alerts on expired secrets. |
| 4 | must | Continuous automatic rotation. Zero-downtime rotation. Ephemeral secrets. |
