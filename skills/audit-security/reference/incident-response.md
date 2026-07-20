# Incident response section

Questions: SE-07 (Incident response plan), SE-07a (Crisis communication), SE-10 (Security post-mortem).

## Table of contents

- [SE-07 — Security incident response plan](#se-07--security-incident-response-plan--criticality-must)
- [SE-07a — Crisis communication](#se-07a--crisis-communication--criticality-should)
- [SE-10 — Security post-mortem](#se-10--security-post-mortem--criticality-should)

---

### SE-07 — Security incident response plan — Criticality: **must**

**Analyze:** IRP documentation, playbooks, roles (incident commander, technical lead, communications lead), simulation exercises

**Check:**
- Documented incident response plan (IRP)
- Defined roles and responsibilities (incident commander, technical lead, communications lead)
- Incident classification by severity (P1-P4) with response SLAs
- Playbooks per incident type (ransomware, data breach, account compromise, DDoS)
- Regular simulation exercises (tabletop exercises)
- GDPR articles 33-34 compliance (72h notification)

**Commands:**
```bash
find . -iname "*incident*" -o -iname "*playbook*" -o -iname "*irp*" -o -iname "*security*plan*" 2>/dev/null | head -10
grep -riE "incident.response\|playbook\|tabletop\|red.team\|bug.bounty" . --include="*.md" --include="*.yml" --include="*.adoc" 2>/dev/null | head -10
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No plan. Ad-hoc reaction on incident. |
| 1 | must | Informal plan. Emergency contacts known to a few people. |
| 2 | must | Documented plan with roles. Not regularly tested. |
| 3 | must | Plan tested annually (tabletop exercises). Systematic post-mortems. |
| 4 | must | Red team exercises. Bug bounty. Incident response automation. Internal CERT or partnership. |

---

### SE-07a — Crisis communication — Criticality: **should**

**Dependency:** Evaluate only if SE-07 >= level 2.

**Analyze:** Communication templates, war room process, status page, audience-differentiated communication

**Check:**
- Pre-written communication templates per severity level (P1-P4)
- Pre-configured distribution lists (internal, customers, authorities)
- War room process (physical or virtual)
- Public status page (Statuspage.io, Instatus, etc.)
- Audience-differentiated communication (technical, management, customers, authorities)
- GDPR articles 33-34 compliance (CNIL notification within 72h)

**Commands:**
```bash
grep -riE "status.page\|statuspage\|communication.*crise\|war.room\|template.*incident" . --include="*.md" --include="*.yml" --include="*.adoc" 2>/dev/null | head -10
find . -iname "*crisis*" -o -iname "*communication*plan*" -o -iname "*status*page*" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | should | No process. Improvised communication. |
| 1 | should | Emergency contacts. Communication by email/Slack. |
| 2 | should | Prepared communication templates. Defined distribution list. |
| 3 | should | War room process. Differentiated internal/external communication. CNIL notification if required. |
| 4 | should | Automated communication. Public status page. Notification SLA. Coordination with authorities. |

---

### SE-10 — Security post-mortem — Criticality: **should**

**Analyze:** Post-mortem process, templates, tracking of corrective actions, recurrence metrics

**Check:**
- Systematic post-mortem after each security incident
- Blameless approach (focus on systems, not individuals)
- Root cause analysis (5 Whys, timeline reconstruction)
- Corrective actions tracked in a tool (Jira, Linear) with deadlines
- Sharing of lessons learned across the organization
- Recurrence metrics and continuous improvement

**Commands:**
```bash
find . -iname "*post-mortem*" -o -iname "*postmortem*" -o -iname "*incident-report*" 2>/dev/null | head -10
grep -riE "post.mortem\|blameless\|root.cause\|lessons.learned\|5.whys" . --include="*.md" --include="*.adoc" 2>/dev/null | head -10
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | should | No post-mortem. Incidents forgotten. |
| 1 | should | Informal discussion after a major incident. |
| 2 | should | Documented post-mortem for critical incidents. Actions identified. |
| 3 | should | Systematic post-mortem. Action tracking. Sharing of learnings. |
| 4 | should | Blameless post-mortems. Recurrence metrics. Measured continuous improvement. |
