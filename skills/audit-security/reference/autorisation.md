# Authorization & Audit log section

Questions: SE-05 (Roles and permissions), SE-06 (Access audit log).

## Table of contents

- [SE-05 — Fine-grained roles and permissions for internal systems](#se-05--fine-grained-roles-and-permissions-for-internal-systems--criticality-must)
- [SE-06 — Access audit log](#se-06--access-audit-log--criticality-must)

---

### SE-05 — Fine-grained roles and permissions for internal systems — Criticality: **must**

**Analyze:** Authorization middleware, guards, policies, defined roles, cloud IAM, Kubernetes RBAC

**Check:**
- Explicit authorization model (RBAC, ABAC)
- Least-privilege principle applied (infra, DB, app, CI/CD)
- No shared accounts
- Separation of duties
- Periodic permission review
- Server-side verification (not client-side only)

**Commands:**
```bash
grep -riE "guard\|policy\|role\|permission\|rbac\|abac\|gate\|authorize" . --include="*.ts" --include="*.php" --include="*.py" 2>/dev/null | head -10
grep -riE "iam\|serviceAccount\|clusterRole" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -10
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | Shared accounts. Generalized admin access. |
| 1 | must | Individual accounts but roles too broad (admin/user). |
| 2 | must | RBAC defined. Least-privilege principle applied. Documentation. |
| 3 | must | Granular RBAC. Quarterly access review. Separation of duties. |
| 4 | must | ABAC (Attribute-Based). Just-in-time access. Privileged Access Management (PAM). |

---

### SE-06 — Access audit log — Criticality: **must**

**Analyze:** Audit logs, access traceability, immutability, retention, SIEM integration

**Check:**
- Structured audit logs (who, what, when, on which data, result)
- Separation of audit logs / application logs
- Log immutability (append-only, tamper-proof)
- Defined and compliant retention (GDPR, SOC 2)
- Alerts on abnormal behavior

**Commands:**
```bash
grep -riE "audit.log\|auditLog\|activity.log\|access.log" . --include="*.ts" --include="*.php" --include="*.py" 2>/dev/null | head -10
grep -riE "log.*action\|log.*event\|log.*access\|log.*change" . --include="*.ts" --include="*.php" 2>/dev/null | head -10
grep -riE "cloudtrail\|s3.*log\|immutable\|append.only\|worm" . --include="*.tf" --include="*.yml" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No audit log. Access untracked. |
| 1 | must | Basic application logs. No structured who/what/when. |
| 2 | must | Structured audit log for sensitive actions. Defined retention. |
| 3 | must | Full audit (CRUD on sensitive data). Tamper-proof. Alerts on anomalies. |
| 4 | must | Centralized audit log. Automatic compliance. Forensics-ready. SIEM integrated. |
