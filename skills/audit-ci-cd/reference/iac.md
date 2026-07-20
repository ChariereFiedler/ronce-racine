# Infrastructure as Code section

Questions: ci-07 (Infrastructure as Code).

## Table of contents

- [ci-07 — Infrastructure as Code (IaC)](#ci-07--infrastructure-as-code-iac--should)

---

### ci-07 — Infrastructure as Code (IaC) — `should`

**Analyze:** Terraform, Pulumi, CloudFormation, Ansible, CDK, Dockerfile, docker-compose files

**Commands:**
- `ls terraform/ pulumi/ cdk/ ansible/ cloudformation/ 2>/dev/null` → detect the IaC tools
- `ls *.tf *.tfvars 2>/dev/null` → Terraform files at the root
- `find . -maxdepth 3 -name "*.tf" -o -name "main.tf" 2>/dev/null | head -10` → Terraform in the project
- `ls Dockerfile docker-compose*.yml 2>/dev/null` → containerization
- `grep -ri "remote.*backend\|terraform.*backend\|state" *.tf terraform/*.tf 2>/dev/null` → remote state
- `grep -ri "module\|source.*=" *.tf terraform/*.tf 2>/dev/null | head -5` → reusable modules
- `grep -ri "checkov\|tfsec\|sentinel\|opa\|policy" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → Policy as Code

**Check:**
- Infrastructure defined as code (no manual cloud console config)
- IaC versioning (same repo or dedicated repo)
- State management (remote state, locking)
- Separate plan/apply with review
- Reusable modules
- Drift detection and alerting
- Policy as Code (OPA, Sentinel, Checkov)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Infrastructure managed manually via cloud consoles or SSH. No traceability of changes. |
| 1 | Basic provisioning scripts (shell, CLI). Partially documented. No systematic versioning. |
| 2 | IaC with Terraform/Pulumi/CDK for the core infrastructure. Code versioned in Git. Plan/Apply with review. Shared state (remote state). |
| 3 | IaC for all the infrastructure. GitOps with automatic reconciliation. Drift detection with alerting. Reusable modules. Policy as Code for validation. |
| 4 | Full IaC with automated tests (Terratest). Auto-remediated drift. Self-service infrastructure via a catalog. Compliance as Code. Rebuild time < 1h. |
