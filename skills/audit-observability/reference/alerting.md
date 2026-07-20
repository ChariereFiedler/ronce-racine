# Alerting section - Catalog, notifications, correlation, runbooks, thresholds, post-mortems

6 questions. Alert catalog, multi-channel notifications, correlation/deduplication, runbooks, threshold tuning, post-mortems.

## Table of contents

- [al-01 - Alert catalog (critical, warning, info)](#al-01--alert-catalog-critical-warning-info--criticality-must)
- [al-02 - Multi-channel notifications](#al-02--multi-channel-notifications--criticality-should)
- [al-03 - Correlation/deduplication (alert fatigue)](#al-03--correlationdeduplication-alert-fatigue--criticality-should)
- [al-04 - Investigation runbook](#al-04--investigation-runbook--criticality-should)
- [al-05 - Alert threshold tuning](#al-05--alert-threshold-tuning--criticality-should)
- [al-06 - Post-mortem template + recurring incidents](#al-06--post-mortem-template--recurring-incidents--criticality-should)

---

### al-01 - Alert catalog (critical, warning, info) · Criticality: **MUST**

**Analyze:** Alert configs (Alertmanager, PagerDuty, OpsGenie, Grafana alerts), alert rules, severity classification, alerting-as-code

**Verification commands:**
```bash
# Check for the presence of alerting tools
grep -ri "sentry\|bugsnag\|logrocket\|pagerduty\|opsgenie\|alertmanager\|grafana.*alert" package.json composer.json docker-compose*.yml 2>/dev/null
# Look for alert configuration files
find . -name "*alert*" -o -name "*rules*" -o -name "*.rules.yml" 2>/dev/null | head -10
# Look for alert classification
grep -ri "critical\|warning\|info\|severity\|priority\|P1\|P2\|P3\|P4" --include="*.yaml" --include="*.yml" --include="*.rules" 2>/dev/null | head -10
```

**Check:**
- Structured catalog with classification: Critical (immediate action), Warning (action within 1h), Info (to consult)
- Owner defined per alert (person or team responsible)
- Trigger conditions documented (PromQL expression, threshold, frequency)
- Alerting-as-code (versioned configs, reviewed in code review)
- Quarterly review of the catalog (pruning obsolete alerts)
- Runbook linked to each alert

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No catalog. Alerts created on the fly without consistency. Duplicates and gaps. |
| 1 | Informal list of alerts. No severity classification. Confusion about who responds. |
| 2 | Basic catalog with 3 levels (crit/warn/info). Partial documentation of conditions. |
| 3 | Complete catalog with owner, runbook, response SLA per alert. Quarterly review. |
| 4 | Living catalog with effectiveness metrics. Auto-documentation from config. Quality scoring. |

**Client-side variant (SPA/PWA):**
| Level | Criteria |
|--------|----------|
| 0 | No alerting. Errors discovered by users. |
| 1 | Email on crash (via Sentry or equivalent, no fine configuration). |
| 2 | Sentry alerting configured (thresholds, Slack/Teams notifications). |
| 3 | PagerDuty/Slack on critical errors. Alerts per feature/page. Severity defined. |
| 4 | SLO-based client alerting. Burn rate on error rates. Alert fatigue under control. |

---

### al-02 - Multi-channel notifications · Criticality: **SHOULD**

**Analyze:** Configured notification channels, routing by severity, failover, automatic escalation

**Verification commands:**
```bash
# Check the configured notification channels
grep -ri "slack\|email\|sms\|pagerduty\|opsgenie\|teams\|webhook\|notification.*channel" --include="*.yaml" --include="*.yml" --include="*.env*" 2>/dev/null | head -10
# Look for routing/escalation configuration
grep -ri "escalat\|routing\|receiver\|notify\|on_call\|schedule" --include="*.yaml" --include="*.yml" 2>/dev/null | head -10
```

**Check:**
- Redundant channels (Slack + email + SMS + call for critical ones)
- Routing by severity: Critical → call + SMS, Warning → Slack + email, Info → Slack only
- Automatic failover if no acknowledgment (PagerDuty/OpsGenie escalation)
- Schedule handling (business hours vs on-call)
- Regular delivery tests on all channels
- Heartbeat checks on notification channels

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Single channel (email or Slack). If unavailable, alerts are lost. |
| 1 | 2 channels but no automatic fallback. Manual configuration. |
| 2 | Multi-channel (Slack, email, SMS) with routing by severity. No fallback test. |
| 3 | Automatic failover between channels. Regular delivery tests. Acknowledgment required for critical ones. |
| 4 | Smart orchestration (PagerDuty/OpsGenie). Automatic escalation. Response-time metrics. |

---

### al-03 - Correlation/deduplication (alert fatigue) · Criticality: **SHOULD**

**Analyze:** Alert deduplication, grouping, cross-service correlation, noise suppression, noise-ratio metrics

**Verification commands:**
```bash
# Look for Alertmanager grouping/inhibition configuration
grep -ri "group_by\|group_wait\|group_interval\|inhibit_rules\|deduplic\|fingerprint" --include="*.yaml" --include="*.yml" 2>/dev/null | head -10
# Look for references to alert fatigue or correlation
grep -ri "alert.*fatigue\|noise\|correlat\|dedup\|suppress\|inhibit" --include="*.yaml" --include="*.yml" --include="*.md" 2>/dev/null | head -5
```

**Check:**
- Deduplication by fingerprint (identical alerts merged)
- Alert grouping (per service, tenant, time window)
- Cross-service correlation (root-cause identification)
- Inhibition rules (if node down → suppress pod alerts)
- Noise-ratio metrics (< 20% non-actionable alerts)
- Alert volume per day per person (< 50-100)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No deduplication. Alert storm possible. Chronic alert fatigue. |
| 1 | Basic throttling (max N alerts/hour). No smart correlation. |
| 2 | Deduplication by fingerprint. Grouping of similar alerts. |
| 3 | Cross-service correlation. Root-cause identification. Suppression of symptomatic alerts. |
| 4 | ML for correlated anomaly detection. Auto-tuning of thresholds. Noise reduction >80%. |

---

### al-04 - Investigation runbook · Criticality: **SHOULD**

**Analyze:** Documented runbooks, direct link from alerts, automated diagnostic scripts, post-incident feedback loop

**Verification commands:**
```bash
# Look for runbooks in the repo
find . -name "*runbook*" -o -name "*playbook*" -o -name "*incident*" -o -name "*troubleshoot*" 2>/dev/null | head -10
# Look for runbook links in alert configs
grep -ri "runbook_url\|runbook\|playbook\|documentation_url" --include="*.yaml" --include="*.yml" --include="*.rules" 2>/dev/null | head -10
# Look for diagnostic scripts
find . -name "*diagnos*" -o -name "*debug*" -o -name "*healthcheck*" | grep -i script 2>/dev/null | head -5
```

**Check:**
- Runbooks documented for critical alerts (decision tree)
- Standard content: context, prerequisites, diagnostic steps, exact commands, decision criteria, remediation, escalation
- Direct link from the alert (runbook_url annotation)
- Automated diagnostic scripts (collection of contextual info)
- Feedback loop: post-incident update
- Resolution metrics (runbook coverage rate, accuracy score)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No runbook. Improvised investigation on each alert. |
| 1 | A few informal notes. Knowledge in the experts' heads. |
| 2 | Runbooks documented for critical alerts. Variable format. Not always up to date. |
| 3 | Structured runbook per alert with steps, commands, escalation. Direct link from the alert. |
| 4 | Interactive runbooks with partial auto-remediation. Resolution metrics. Feedback loop. |

---

### al-05 - Alert threshold tuning · Criticality: **SHOULD**

**Analyze:** Threshold review process, false-positive metrics, adaptive thresholds, SLO-based alerting

**Verification commands:**
```bash
# Look for thresholds in alert configs
grep -ri "threshold\|seuil\|baseline\|for:\|expr:" --include="*.yaml" --include="*.yml" --include="*.rules" 2>/dev/null | head -10
# Look for references to SLOs
grep -ri "slo\|error.*budget\|burn.*rate\|service.*level" --include="*.yaml" --include="*.yml" --include="*.md" --include="*.ts" 2>/dev/null | head -10
# Look for adaptive thresholds
grep -ri "anomaly\|predict_linear\|forecast\|dynamic.*threshold\|adaptive" --include="*.yaml" --include="*.yml" --include="*.rules" 2>/dev/null | head -5
```

**Check:**
- Regular threshold review (quarterly minimum)
- Objective metrics: false positive rate, alert-to-incident ratio, MTTR per alert type
- Adaptive vs static thresholds (dynamic baseline)
- SLO-based approach (alerts on burn rate rather than raw thresholds)
- A/B testing of new alert configurations
- Documentation of thresholds and their justification

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Default thresholds never adjusted. Many false positives or gaps. |
| 1 | Reactive adjustment after major incidents. No process. |
| 2 | Annual threshold review. Based on team feedback. No objective data. |
| 3 | Quarterly review with metrics (false positive rate, MTTR). Thresholds documented. |
| 4 | Adaptive thresholds based on dynamic baseline. A/B testing of configurations. Continuous optimization. |

---

### al-06 - Post-mortem template + recurring incidents · Criticality: **SHOULD**

**Analyze:** Post-mortem template, blameless culture, corrective-action tracking, recurrence metrics

**Verification commands:**
```bash
# Look for post-mortem templates or reports
find . -name "*postmortem*" -o -name "*post-mortem*" -o -name "*post_mortem*" -o -name "*incident-report*" -o -name "*retrospective*" 2>/dev/null | head -10
# Look for references to the post-mortem process in the docs
grep -ri "post.mortem\|blameless\|root.cause\|incident.*review\|lessons.*learned" --include="*.md" --include="*.yaml" --include="*.yml" 2>/dev/null | head -10
```

**Check:**
- Standardized template: summary, timeline, impact, root cause, contributing factors, corrective actions, lessons
- Blameless culture (focus on the system, not people)
- Systematic post-mortem for P1/P2 incidents
- Review board (collective validation of the analyses)
- Actions integrated into the backlog with owner and deadline
- Recurrence metrics (similar incidents after post-mortem)
- Cross-team sharing of learnings

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No post-mortem. The same incidents keep recurring. |
| 1 | Occasional post-mortem for major incidents. Free format. Actions rarely followed up. |
| 2 | Standardized post-mortem template. Done for P1/P2 incidents. Actions tracked. |
| 3 | Systematic blameless post-mortem. Review board. Actions integrated into the backlog with priority. |
| 4 | Strong post-mortem culture. Cross-team sharing. Recurrence metrics. Proven improvement. |
