---
name: audit-security
description: Application security audit. Use when auditing TLS, encryption, authentication, authorization, secrets management, incident response, SIEM, network security, or container security. Triggers on "audit sécurité", "audit security", "audit auth", "audit secrets".
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: audit
---

# Security Audit

## When ME and not audit-industrialisation

- **ME** when: audit focused on this domain only
- **audit-industrialisation** instead if: global multi-domain audit — it orchestrates all the audits (including ME) and produces a consolidated report

> For a full project audit, use `audit-industrialisation` rather than invoking each skill separately.

## Overview

Audit the security maturity of a project: encryption in transit and at rest, key management, secrets rotation, JWT authentication, token revocation, roles and permissions, audit log, incident response plan, crisis communication, SIEM detection, patching, post-mortem, federated authentication, network security, container security. Produces a maturity score (0-4) per question.

**16 questions** split across 7 sections. The detailed grids (statement, checks, commands, levels 0-4) are in `reference/` — see [Grids by section](#grids-by-section).

## Score calculation

- Domain score = average of the scored questions (exclude N/A)
- State "X questions scored out of Y total"
- A question is N/A if the project profile makes it non-applicable (see [Variants by project type](#variants-by-project-type))
- Sub-questions (SE-02a, SE-04a, SE-07a) count as full questions in the calculation

## Audit protocol

1. **Identify the project type**: backend, SPA frontend, fullstack, library, microservices. Mark questions N/A according to the variants below.
2. **Scan for secrets**: `grep -r` for secret patterns in the source code
3. **Check .gitignore**: `.env`, credentials, keys
4. **Read server configs**: Nginx, Caddy, Traefik, middleware headers
5. **Analyze auth**: JWT config, refresh tokens, revocation, IdP, SSO, MFA
6. **Check roles**: RBAC/ABAC, least privilege, separation of duties
7. **Review audit logs**: structure, immutability, retention
8. **Check incident response**: IRP, playbooks, crisis communication
9. **Check the pipeline**: SAST/SCA stages, Dependabot, container scanning
10. **Review network security**: WAF, segmentation, DDoS protection
11. **Review container security**: images, scanning, runtime protection
12. **Run `npm audit`** (if Node.js) or equivalent for a vulnerability snapshot
13. **Run the verification commands** listed for each question
14. **Assign a level** per question with justification and confidence level
15. **Produce the report** using the output format below

## Grids by section

Each file contains the statement, the items to analyze/check, the bash commands and the level 0-4 tables.

| Section | Reference | Questions | Count |
|-------|-----------|-----------|-----|
| Encryption & TLS | [reference/chiffrement-tls.md](reference/chiffrement-tls.md) | SE-01, SE-02, SE-02a | 3 |
| Secrets | [reference/secrets.md](reference/secrets.md) | SE-03 | 1 |
| Authentication & Identity | [reference/auth-identite.md](reference/auth-identite.md) | SE-04, SE-04a, SE-11 | 3 |
| Authorization & Audit log | [reference/autorisation.md](reference/autorisation.md) | SE-05, SE-06 | 2 |
| Incident response | [reference/incident-response.md](reference/incident-response.md) | SE-07, SE-07a, SE-10 | 3 |
| Detection & Patching | [reference/detection-patching.md](reference/detection-patching.md) | SE-08, SE-09 | 2 |
| Network & Containers | [reference/reseau-conteneurs.md](reference/reseau-conteneurs.md) | SE-12, SE-13 | 2 |

## Variants by project type

### Frontend SPA/PWA without a backend
- **SE-02, SE-02a** (DB encryption / Key management) → **N/A**: no server-side storage.
- **SE-04, SE-04a** (JWT / Token revocation) → **N/A**: auth is handled by the remote backend.
- **SE-05** (Roles and permissions) → **N/A**: authorization is handled server-side.
- **SE-06** (Audit log) → **N/A**: no server logs.
- **SE-13** (Containers) → **N/A** if deployed on CDN/Netlify/Vercel.
- **SE-01** (TLS) → adapts: TLS is terminated upstream (CDN, host). Only check that the site is served over HTTPS and that API calls are over HTTPS.
- **SE-12** (Network security) → reduced: check CSP, CORS, security headers.

### Library / SDK
- **SE-01, SE-04, SE-04a, SE-05, SE-06, SE-07, SE-07a, SE-08, SE-11, SE-12** → **N/A**: not applicable to a library.
- **SE-03** (Rotation) → Focus: make sure no secret is included in the published package (`npm pack --dry-run`, `.npmignore`).
- **SE-09** (Patching) → stays critical: clean dependencies with no known vulnerabilities.
- **SE-13** (Containers) → **N/A** unless the library publishes a Docker image.

### Application without containers
- **SE-13** (Containers) → **N/A**.

## Output format

```markdown
## Security — Overall score: X.X/4 (Y questions scored out of 16)

### Summary
[2-3 sentences summarizing the security maturity]

### Detail by question

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| SE-01 | TLS 1.2+ / TLS 1.3 | must | X | high/medium/low | ... |
| SE-02 | DB encryption (AES-256) of sensitive data | must | X | high/medium/low | ... |
| SE-02a | Encryption key management | must | X | high/medium/low | ... |
| SE-03 | Key/secret rotation | must | X | high/medium/low | ... |
| SE-04 | JWT challenge | must | X | high/medium/low | ... |
| SE-04a | Token revocation mechanism | must | X | high/medium/low | ... |
| SE-05 | Fine-grained roles and permissions for internal systems | must | X | high/medium/low | ... |
| SE-06 | Access audit log | must | X | high/medium/low | ... |
| SE-07 | Security incident response plan | must | X | high/medium/low | ... |
| SE-07a | Crisis communication | should | X | high/medium/low | ... |
| SE-08 | SIEM detection | should | X | high/medium/low | ... |
| SE-09 | Patching & communication | must | X | high/medium/low | ... |
| SE-10 | Security post-mortem | should | X | high/medium/low | ... |
| SE-11 | Federated authentication and identity management | must | X | high/medium/low | ... |
| SE-12 | Network security and perimeter protection | must | X | high/medium/low | ... |
| SE-13 | Security of containers and deployed images | must | X | high/medium/low | ... |

### Strengths
- ...

### Weaknesses
- ...

### Recommendations
1. [MUST] ...
2. [SHOULD] ...
3. [COULD] ...

### Non-auditable items
- [List here anything impossible to verify by static analysis: runtime config, external WAF, pentest results, etc.]
```

## Exit condition

- [ ] Project type identified, N/A questions marked
- [ ] All 16 questions evaluated (or justified N/A)
- [ ] Verification commands run for each scored question
- [ ] Level (0-4) + confidence + justification per question
- [ ] Domain score computed (average excluding N/A, "X scored out of Y")
- [ ] Report produced in the output format
- [ ] Non-auditable items listed

## Changelog

- 1.0.0 (2026-06-19) — initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition); audit grids in reference/ (progressive disclosure)
