# Encryption & TLS section

Questions: SE-01 (TLS), SE-02 (DB encryption), SE-02a (Key management).

## Table of contents

- [SE-01 — TLS 1.2+ / TLS 1.3](#se-01--tls-12--tls-13--criticality-must)
- [SE-02 — DB encryption (AES-256) of sensitive data](#se-02--db-encryption-aes-256-of-sensitive-data--criticality-must)
- [SE-02a — Encryption key management](#se-02a--encryption-key-management--criticality-must)

---

### SE-01 — TLS 1.2+ / TLS 1.3 — Criticality: **must**

**Analyze:** Nginx/Caddy/Traefik configs, certificates, HTTPS configs in the app

**Check:**
- TLS 1.2+ (ideally 1.3) on all endpoints
- HSTS enabled
- No mixed content (HTTP/HTTPS)
- Automated certificate management (Let's Encrypt/ACME)
- mTLS for inter-service communication (if microservices)
- Certificate Transparency monitoring

**Commands:**
```bash
grep -riE "ssl|tls|https|hsts|strict.transport" nginx.conf Caddyfile docker-compose*.yml 2>/dev/null
grep -riE "ssl_protocols|ssl_ciphers|tls_version" . --include="*.conf" --include="*.yml" 2>/dev/null | head -10
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No TLS or TLS 1.0/1.1. Data may travel in the clear. |
| 1 | must | TLS 1.2 on public endpoints. Default configuration. No audit. |
| 2 | must | TLS 1.2+ everywhere. Cipher suites reviewed. Basic certificate management. |
| 3 | must | TLS 1.3 preferred. HSTS enabled. Certificate automation (Let's Encrypt/ACME). Annual audit. |
| 4 | must | mTLS for internal communication. Certificate pinning. HSM for critical keys. PCI-DSS/SOC2 compliance. |

---

### SE-02 — DB encryption (AES-256) of sensitive data — Criticality: **must**

**Analyze:** DB config (encryption at rest), application-level encryption code, sensitive columns

**Check:**
- Encryption at rest enabled on the DB (TDE)
- Sensitive data encrypted at the application level (PII, secrets, tokens)
- Robust algorithm (AES-256, no MD5/SHA1 for crypto)
- Column-level encryption for regulated data
- Encrypted backups

**Commands:**
```bash
grep -ri "encrypt\|aes\|kms\|pgcrypto\|cipher" . --include="*.ts" --include="*.py" --include="*.php" 2>/dev/null | head -10
grep -ri "cast.*encrypted\|EncryptedString\|encryptable" . --include="*.php" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No encryption. Sensitive data in the clear in the DB. |
| 1 | must | Ad-hoc encryption of a few fields. Keys in the code or config. |
| 2 | must | TDE (Transparent Data Encryption) enabled. Sensitive fields encrypted at the application level. |
| 3 | must | AES-256 with KMS. Key separation per environment. Encrypted backups. |
| 4 | must | Envelope encryption. Automatic key rotation. Audit trail of key access. HSM. |

---

### SE-02a — Encryption key management — Criticality: **must**

**Dependency:** Evaluate only if SE-02 >= level 2.

**Analyze:** Key storage, key lifecycle, DEK/KEK separation, use of KMS/Vault/HSM

**Check:**
- Encryption keys not hardcoded or in config files
- Use of a secret manager (Vault, AWS Secrets Manager, Azure Key Vault)
- DEK (Data Encryption Key) / KEK (Key Encryption Key) separation
- Documented and scheduled key rotation
- HSM for root keys in critical environments

**Commands:**
```bash
grep -ri "APP_KEY\|ENCRYPTION_KEY\|MASTER_KEY\|KMS\|vault" .env.example 2>/dev/null
grep -ri "kms\|vault\|hsm\|key.rotation\|key.management" . --include="*.ts" --include="*.php" --include="*.yml" 2>/dev/null | head -10
git log --all --diff-filter=A -- "*.key" "*.pem" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | Keys hardcoded or in config files. |
| 1 | must | Environment variables. No rotation. |
| 2 | must | Secret manager (Vault, AWS Secrets Manager). Manual rotation. |
| 3 | must | KMS with automatic rotation. DEK/KEK separation. |
| 4 | must | HSM for root keys. BYOK supported. Full audit. |
