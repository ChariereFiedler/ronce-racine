/**
 * The installer's catalog: what can be installed, and on which signal.
 */

export type Kind = "rule" | "skill" | "hook" | "agent" | "script";

export interface HookWiring {
  event: string;
  matcher?: string;
  commandFile: string;
}

export interface Item {
  kind: Kind;
  name: string; // file name (rule/agent) or folder name (skill) or hook file
  when: "always" | string[]; // recommended if the signal is present
  reason: string;
  optional?: boolean; // offered but not installed without --all
  files?: string[]; // hooks: files to copy (default: [name])
  wiring?: HookWiring[]; // hooks: settings.json wiring fragments
}

/**
 * Catalog: the installer's "knowledge" (signal → artifact + reason).
 * An artifact absent from here exists on disk and ships in the package, yet
 * cannot be installed by any command. `tests/installer.test.ts` gates that.
 */
export const CATALOG: Item[] = [
  // rules
  { kind: "rule", name: "minimal-code.md", when: ["code"], reason: "YAGNI + readability, any code project" },
  { kind: "rule", name: "commits.md", when: ["git"], reason: "commit message format" },
  { kind: "rule", name: "secure-logging.md", when: ["code"], reason: "GDPR: never log sensitive data" },
  { kind: "rule", name: "pre-commit-secret-detection.md", when: ["git"], reason: "no committed secrets" },
  { kind: "rule", name: "test-discipline.md", when: ["tests"], reason: "tests detected" },
  { kind: "rule", name: "error-handling-discipline.md", when: ["backend", "code"], reason: "no swallowed error / panic" },
  { kind: "rule", name: "subscription-cleanup.md", when: ["frontend"], reason: "frontend: subscription teardown" },
  { kind: "rule", name: "ui-states-complete.md", when: ["frontend"], reason: "frontend: loading/error/empty/success states" },
  { kind: "rule", name: "clean-architecture-deps.md", when: ["backend"], reason: "backend: dependency direction" },
  { kind: "rule", name: "no-raw-sql-interpolation.md", when: ["sql"], reason: "SQL detected: anti-injection" },
  { kind: "rule", name: "sql-migrations-discipline.md", when: ["migrations"], reason: "migrations detected" },
  { kind: "rule", name: "detection-gap-protocol.md", when: ["code"], reason: "P0 found by user = detection failure", optional: true },
  { kind: "rule", name: "doc-code-parity.md", when: ["code"], reason: "docs must match the code they describe" },
  // skills (process / cross-cutting)
  { kind: "skill", name: "recording-decisions", when: "always", reason: "record non-obvious choices" },
  { kind: "skill", name: "domain-glossary", when: ["code"], reason: "one name per concept, written down" },
  { kind: "skill", name: "detection-sweep", when: ["code"], reason: "project detection sweep" },
  { kind: "skill", name: "commit-readiness-review", when: ["git"], reason: "self-review before commit (+ scripts/precommit-scan.ts)" },
  { kind: "skill", name: "merge-request-review", when: ["ci", "git"], reason: "review an MR/PR before merge" },
  { kind: "skill", name: "bug-ticket-root-cause", when: ["git"], reason: "document a bug as a ticket" },
  { kind: "skill", name: "bug-triage-structured", when: ["git"], reason: "full triage of a bug" },
  { kind: "skill", name: "recurring-bug-root-cause", when: ["git"], reason: "recurring bug → root cause" },
  { kind: "skill", name: "daily-workflow-optimization", when: ["code"], reason: "reduce workflow friction", optional: true },
  { kind: "skill", name: "qa-session-intake", when: ["frontend"], reason: "turn a QA session into tickets", optional: true },
  // test skills
  { kind: "skill", name: "writing-robust-tests", when: ["tests", "code"], reason: "write robust tests" },
  { kind: "skill", name: "comprehensive-test-strategy", when: ["tests", "code"], reason: "risk-based test strategy" },
  { kind: "skill", name: "adversarial-feature-challenge", when: ["code"], reason: "adversarial stress-test of a feature" },
  { kind: "skill", name: "validating-features-end-to-end", when: ["code"], reason: "validate a feature before closing" },
  // design / impl skills
  { kind: "skill", name: "domain-modeling-design", when: ["backend"], reason: "model a domain before coding" },
  { kind: "skill", name: "ddd-backend-implementation", when: ["backend"], reason: "implement in DDD layers" },
  { kind: "skill", name: "api-contract-versioning", when: ["backend"], reason: "evolve an API contract" },
  { kind: "skill", name: "database-schema-evolution", when: ["migrations", "sql"], reason: "risky schema migration" },
  // frontend skills
  { kind: "skill", name: "frontend-spec-call-site-audit", when: ["frontend"], reason: "frontend spec before ticket" },
  { kind: "skill", name: "frontend-fullstack-implementation", when: ["frontend"], reason: "implement a frontend feature" },
  { kind: "skill", name: "refactoring-shared-component-api", when: ["frontend"], reason: "change a shared component's API" },
  { kind: "skill", name: "design-system-component-lifecycle", when: ["frontend"], reason: "create/extend a DS component" },
  { kind: "skill", name: "visual-regression-check", when: ["frontend"], reason: "check the rendering before commit" },
  // ops skills
  { kind: "skill", name: "ci-pipeline-orchestration", when: ["ci"], reason: "CI detected: check/diagnose/retry" },
  { kind: "skill", name: "production-incident-diagnostic", when: ["infra"], reason: "infra/deployment: prod incident triage" },
  { kind: "skill", name: "performance-profiling", when: ["code"], reason: "find a bottleneck, prove the fix helped" },
  // audit skills (heavy, optional)
  { kind: "skill", name: "audit-industrialisation", when: ["code"], reason: "maturity audit orchestrator", optional: true },
  { kind: "skill", name: "audit-report", when: ["code"], reason: "audit report template/scoring", optional: true },
  { kind: "skill", name: "audit-security", when: ["backend", "infra"], reason: "application security audit", optional: true },
  { kind: "skill", name: "audit-testing", when: ["tests"], reason: "test strategy audit", optional: true },
  { kind: "skill", name: "audit-ci-cd", when: ["ci"], reason: "CI/CD & release audit", optional: true },
  { kind: "skill", name: "audit-quality", when: ["code"], reason: "code & data quality audit", optional: true },
  { kind: "skill", name: "audit-architecture", when: ["backend"], reason: "architecture & availability audit", optional: true },
  { kind: "skill", name: "audit-observability", when: ["infra", "backend"], reason: "observability & alerting audit", optional: true },
  { kind: "skill", name: "audit-performance-frontend", when: ["frontend"], reason: "low-level frontend perf audit", optional: true },
  { kind: "skill", name: "audit-compliance", when: ["code"], reason: "compliance/GDPR/FinOps audit", optional: true },
  // scripts (standalone, read-only)
  { kind: "script", name: "subscription-leak-scan.ts", when: ["frontend"], reason: "detects subscriptions/listeners/timers without teardown" },
  // hooks
  { kind: "hook", name: "skill-reminder.ts", when: "always", reason: "suggests the relevant skills for the prompt", wiring: [{ event: "UserPromptSubmit", commandFile: "skill-reminder.ts" }] },
  { kind: "hook", name: "bash-npm-silent.ts", when: ["code"], reason: "silences npm install/ci (less noise)", wiring: [{ event: "PreToolUse", matcher: "Bash", commandFile: "bash-npm-silent.ts" }] },
  { kind: "hook", name: "truncate-output.ts", when: ["code"], reason: "caps verbose output (cargo/git/docker…)", files: ["truncate-output.ts", "truncate-bash-output.ts"], wiring: [{ event: "PreToolUse", matcher: "Bash", commandFile: "truncate-output.ts" }] },
  { kind: "hook", name: "session-writer.ts", when: "always", reason: "per-branch session memo (writer/inject/precompact)", optional: true, files: ["session-writer.ts", "session-inject.ts", "session-precompact.ts"], wiring: [{ event: "Stop", commandFile: "session-writer.ts" }, { event: "SessionStart", matcher: "compact", commandFile: "session-inject.ts" }, { event: "PreCompact", commandFile: "session-precompact.ts" }] },
  { kind: "hook", name: "worktree-env-setup.ts", when: "always", reason: "symlink .env into git worktrees", optional: true, wiring: [{ event: "SessionStart", commandFile: "worktree-env-setup.ts" }] },
  // Opt-in: it spends an API call per push, so it is a cost the adopter accepts
  // rather than inherits.
  { kind: "hook", name: "readme-freshness.ts", when: ["git"], reason: "re-reads the README against what a push changes", optional: true, wiring: [{ event: "PreToolUse", matcher: "Bash", commandFile: "readme-freshness.ts" }] },
  // agents
  { kind: "agent", name: "code-reviewer.md", when: ["git", "code"], reason: "diff review agent" },
  { kind: "agent", name: "qa-tester.md", when: ["tests"], reason: "E2E testing agent" },
];
