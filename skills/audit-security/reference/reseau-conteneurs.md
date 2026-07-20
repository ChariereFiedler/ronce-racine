# Network & Containers section

Questions: SE-12 (Network security), SE-13 (Container security).

## Table of contents

- [SE-12 — Network security and perimeter protection](#se-12--network-security-and-perimeter-protection--criticality-must)
- [SE-13 — Security of containers and deployed images](#se-13--security-of-containers-and-deployed-images--criticality-must)

---

### SE-12 — Network security and perimeter protection — Criticality: **must**

**Analyze:** WAF, DDoS protection, network segmentation, microsegmentation, IDS/IPS, Zero Trust

**Check:**
- WAF configured (AWS WAF, Cloudflare WAF, ModSecurity) with OWASP rules
- DDoS protection (Cloudflare, AWS Shield)
- Network segmentation per environment (prod, staging, dev)
- Workload microsegmentation (Kubernetes NetworkPolicies, Security Groups)
- IDS/IPS deployed (Suricata, Palo Alto, AWS Network Firewall)
- Zero Trust approach (no implicit trust on the internal network)

**Commands:**
```bash
grep -riE "waf\|firewall\|ddos\|shield\|cloudflare" . --include="*.tf" --include="*.yml" --include="*.json" 2>/dev/null | head -10
grep -riE "networkpolicy\|securitygroup\|security.group\|ingress\|egress" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -10
grep -riE "ids\|ips\|suricata\|zerotrust\|zero.trust\|beyondcorp" . --include="*.yml" --include="*.tf" --include="*.md" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No network protection. No WAF, no segmentation. |
| 1 | must | Basic firewall. No WAF or DDoS protection. |
| 2 | must | WAF configured with basic rules. Network segmentation per environment. |
| 3 | must | Workload microsegmentation. Active DDoS protection. IDS/IPS deployed. |
| 4 | must | Zero Trust networking. Automated threat response. ML-based anomaly detection. Secure service mesh. |

---

### SE-13 — Security of containers and deployed images — Criticality: **must**

**Analyze:** Base images, vulnerability scanning, image signing, execution policies, runtime protection

**Check:**
- Private registry (no unverified public images)
- Automated image scanning (Trivy, Snyk, Grype) in CI/CD
- Minimal base images (distroless, Alpine, scratch)
- Image signing (Cosign/Sigstore, Notary)
- Pod Security Standards / Pod Security Policies enforced
- No containers running in privileged mode
- Runtime protection (Falco, Sysdig)
- SBOM (Software Bill of Materials) for all images
- Admission controllers (OPA/Gatekeeper, Kyverno)

**Commands:**
```bash
grep -riE "FROM\s+" . --include="Dockerfile*" 2>/dev/null | head -10
grep -riE "trivy\|snyk\|grype\|cosign\|notary\|sbom" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -10
grep -riE "privileged\|hostNetwork\|hostPID\|securityContext\|runAsNonRoot" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -10
grep -riE "falco\|gatekeeper\|kyverno\|admission.controller\|pod.security" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No container security. Public images used without verification. |
| 1 | must | Public images without scanning. No pod security policy. |
| 2 | must | Private registry. Basic vulnerability scanning on images. |
| 3 | must | Automated scanning in CI/CD. Signed images. Minimal base images. Pod security policies enforced. |
| 4 | must | Runtime protection (Falco). Admission controllers (OPA/Kyverno). SBOM for all images. Continuous compliance. |
