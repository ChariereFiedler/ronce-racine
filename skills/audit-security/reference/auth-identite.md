# Authentication & Identity section

Questions: SE-04 (JWT), SE-04a (Token revocation), SE-11 (Federated authentication).

## Table of contents

- [SE-04 — JWT challenge](#se-04--jwt-challenge--criticality-must)
- [SE-04a — Token revocation mechanism](#se-04a--token-revocation-mechanism--criticality-must)
- [SE-11 — Federated authentication and identity management](#se-11--federated-authentication-and-identity-management--criticality-must)

---

### SE-04 — JWT challenge — Criticality: **must**

**Analyze:** JWT config, signing algorithms, token lifetime, refresh tokens

**Check:**
- Robust signing algorithm (RS256, ES256 — not HS256 with a weak secret, not alg:none)
- Short access token lifetime (5-15 min ideally)
- Refresh tokens with rotation on each use
- Full validation (signature, expiration, audience, issuer)
- Secure client-side storage (httpOnly cookies with SameSite)

**Commands:**
```bash
grep -riE "jwt\|jsonwebtoken\|jose\|passport\|auth0\|keycloak" package.json composer.json requirements.txt 2>/dev/null
grep -riE "expiresIn\|ttl\|lifetime\|exp.*=\|token.*expir" . --include="*.ts" --include="*.php" --include="*.py" 2>/dev/null | head -10
grep -riE "alg.*none\|HS256\|RS256\|ES256" . --include="*.ts" --include="*.php" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No JWT or static tokens with no expiration. |
| 1 | must | JWT with a long expiration (>24h). No refresh token. |
| 2 | must | JWT with a reasonable expiration (1h). Refresh token. No revocation. |
| 3 | must | Short-lived tokens (<15min). Refresh rotation. Blacklist for revocation. |
| 4 | must | Token binding. JWE for sensitive data. Proof of possession. Regular security audit. |

---

### SE-04a — Token revocation mechanism — Criticality: **must**

**Dependency:** Evaluate only if SE-04 >= level 2.

**Analyze:** Blacklist mechanisms, token versioning, introspection, session management

**Check:**
- Ability to revoke a token before expiration (logout, compromise)
- Revocation mechanism (Redis blacklist, token versioning, introspection)
- Invalidation of all tokens on a password change
- Fast propagation of revocation (real-time or near real-time)

**Commands:**
```bash
grep -riE "blacklist\|blocklist\|revoke\|invalidat\|token.version\|introspect" . --include="*.ts" --include="*.php" --include="*.py" 2>/dev/null | head -10
grep -riE "redis.*token\|cache.*token\|token.*cache" . --include="*.ts" --include="*.php" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No revocation possible. Wait for expiration. |
| 1 | must | Change the global secret (invalidates all tokens). |
| 2 | must | Blacklist of revoked tokens. Check on every request. |
| 3 | must | Per-user token versioning. Granular revocation. |
| 4 | must | Distributed token revocation. Real-time propagation. Token introspection. |

---

### SE-11 — Federated authentication and identity management — Criticality: **must**

**Analyze:** Centralized IdP, SSO, OIDC/SAML protocols, MFA, session management, provisioning/deprovisioning

**Check:**
- Centralized IdP (Okta, Azure AD/Entra ID, Keycloak, Google Workspace)
- SSO for all applications (no separate credentials per app)
- Standard protocols (OIDC, SAML 2.0)
- MFA enabled (ideally phishing-resistant: FIDO2/WebAuthn)
- Session management (expiration, revocation, multi-device)
- Conditional access policies (context, device, location)
- Automated provisioning/deprovisioning (SCIM)

**Commands:**
```bash
grep -riE "oidc\|saml\|sso\|oauth\|keycloak\|okta\|azure.ad\|entra\|auth0" . --include="*.ts" --include="*.php" --include="*.yml" --include="*.json" 2>/dev/null | head -10
grep -riE "mfa\|multi.factor\|2fa\|totp\|fido\|webauthn\|passkey" . --include="*.ts" --include="*.php" 2>/dev/null | head -10
grep -riE "scim\|provisioning\|deprovisioning" . --include="*.yml" --include="*.md" 2>/dev/null | head -5
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | Passwords only. No SSO. Decentralized identity management. |
| 1 | must | Basic SSO for a few applications. No generalized MFA. |
| 2 | must | Centralized IdP (Okta, Azure AD). MFA enabled for critical access. |
| 3 | must | OIDC/SAML for all applications. Conditional access policies. Session management with expiration and revocation. |
| 4 | must | Zero Trust identity. Continuous and adaptive authentication. Passwordless (FIDO2/WebAuthn). Risk-based MFA. |
