#!/usr/bin/env -S npx tsx
/**
 * Smart installer of the generic Claude config into a target repo.
 *
 *   npx tsx install.ts plan    <repo>                  analyzes the project and SUGGESTS what to install (read-only)
 *   npx tsx install.ts install <repo> [--all] [--yes]  interactive selector (TTY); --all pre-checks everything, --yes installs the default without prompting
 *
 * "Smart" = detects the stack (frontend/backend/tests/SQL/migrations/CI/infra/git)
 * and recommends only the relevant artifacts, each with a reason. Copies:
 *   rules   → <repo>/.claude/rules/shared/ (+ .adopted manifest)
 *   skills  → <repo>/.claude/skills/<name>/
 *   scripts → <repo>/.claude/scripts/
 *   hooks   → <repo>/.claude/hooks/
 *   agents  → <repo>/.claude/agents/
 * and prints the settings.json snippet to wire up the hooks.
 */
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, cpSync, type Dirent } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { emitKeypressEvents } from "node:readline";

const SELF = dirname(fileURLToPath(import.meta.url));
const LOCKFILE = ".claude/.ronce-racine.json";

interface Lock {
  source: string; // SHA of the canonical source at install time
  installed: string[]; // "kind:name" tokens
  detached: string[]; // tokens excluded from drift control (customized)
}

/** Current SHA of the ronce-racine canonical source (to detect staleness). */
function sourceSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: SELF, encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

/** Resolves canonical + target for a "kind:name" token. */
function tokenPaths(token: string, repo: string): { canon: string; inst: string; isDir: boolean } {
  const [kind, name] = token.split(":");
  if (kind === "rule") return { canon: join(SELF, "rules", name), inst: join(repo, ".claude/rules/shared", name), isDir: false };
  if (kind === "skill") return { canon: join(SELF, "skills", name), inst: join(repo, ".claude/skills", name), isDir: true };
  if (kind === "agent") return { canon: join(SELF, "agents", name), inst: join(repo, ".claude/agents", name), isDir: false };
  if (kind === "script") return { canon: join(SELF, "scripts", name), inst: join(repo, ".claude/scripts", name), isDir: false };
  // kind === "hook": one token per individual file
  return { canon: join(SELF, "hooks", name), inst: join(repo, ".claude/hooks", name), isDir: false };
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else out.push(r);
    }
  };
  if (existsSync(root)) walk(root, "");
  return out.sort();
}

/** null if compliant, otherwise a description of the drift. */
function compareToken(token: string, repo: string): string | null {
  const { canon, inst, isDir } = tokenPaths(token, repo);
  if (!existsSync(inst)) return "absent";
  if (!existsSync(canon)) return "canonical-removed";
  if (!isDir) return readFileSync(canon).equals(readFileSync(inst)) ? null : "modified";
  // Test procedures and eval manifests are never distributed (see copyToken) - exclude them from drift.
  const canonFiles = listFiles(canon).filter((f) => !f.endsWith(".test.ts") && f !== "eval.yaml");
  const probs = [
    ...canonFiles.filter((f) => !existsSync(join(inst, f))).map((f) => `-${f}`),
    ...canonFiles.filter((f) => existsSync(join(inst, f)) && !readFileSync(join(canon, f)).equals(readFileSync(join(inst, f)))).map((f) => `~${f}`),
    ...listFiles(inst).filter((f) => !canonFiles.includes(f)).map((f) => `+${f}`),
  ];
  return probs.length ? probs.join(" ") : null;
}

function readLock(repo: string): Lock | null {
  const p = join(repo, LOCKFILE);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Lock;
  } catch {
    return null;
  }
}

type Kind = "rule" | "skill" | "hook" | "agent" | "script";

interface HookWiring {
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

/** Catalog: the installer's "knowledge" (signal → artifact + reason). */
const CATALOG: Item[] = [
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
  // skills (process / cross-cutting)
  { kind: "skill", name: "recording-decisions", when: "always", reason: "record non-obvious choices" },
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
  // agents
  { kind: "agent", name: "code-reviewer.md", when: ["git", "code"], reason: "diff review agent" },
  { kind: "agent", name: "qa-tester.md", when: ["tests"], reason: "E2E testing agent" },
];

/** Bounded walk: extensions seen, presence of specs and a migrations folder. */
function scan(repo: string): { exts: Set<string>; spec: boolean; migrations: boolean; truncated: boolean } {
  // Prune `.claude` too: the tool's own installed artifacts (hook/script .ts
  // files) must not be detected as the project's code on a re-install.
  const PRUNE = new Set(["node_modules", ".git", ".claude", "target", "dist", "build", "vendor", ".nuxt", ".next", "coverage"]);
  const exts = new Set<string>();
  let spec = false;
  let migrations = false;
  let budget = 6000;
  const walk = (dir: string): void => {
    if (budget <= 0) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (budget-- <= 0) return;
      if (e.isDirectory()) {
        if (PRUNE.has(e.name)) continue;
        if (/^migrations?$/i.test(e.name) || /^migrate$/i.test(e.name)) migrations = true;
        walk(join(dir, e.name));
      } else {
        const m = /\.[a-z0-9]+$/i.exec(e.name);
        if (m) exts.add(m[0].toLowerCase());
        if (/\.(spec|test)\.[tj]sx?$/.test(e.name)) spec = true;
      }
    }
  };
  walk(repo);
  // No silent caps: on a huge repo the walk stops at the budget - say so, a
  // missed deep signal (migrations/, *.sql) would otherwise look like "not there".
  return { exts, spec, migrations, truncated: budget <= 0 };
}

function detect(repo: string): { signals: Set<string>; evidence: Record<string, string> } {
  const sig = new Set<string>();
  const ev: Record<string, string> = {};
  const add = (s: string, why: string): void => {
    if (!sig.has(s)) {
      sig.add(s);
      ev[s] = why;
    }
  };
  const has = (p: string): boolean => existsSync(join(repo, p));

  if (has(".git")) add("git", ".git/");
  if (has(".gitlab-ci.yml") || has(".github/workflows") || has("Jenkinsfile") || has(".circleci/config.yml"))
    add("ci", "CI config");
  if (["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "k8s", "kubernetes", "helm", "terraform"].some(has))
    add("infra", "Docker/infra");

  let deps: string[] = [];
  if (has("package.json")) {
    try {
      const p = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
      deps = Object.keys({ ...p.dependencies, ...p.devDependencies });
    } catch {
      /* ignore */
    }
  }
  const dep = (re: RegExp): boolean => deps.some((d) => re.test(d));
  if (dep(/^(react|vue|svelte|nuxt|next|@angular|solid-js|preact)/)) add("frontend", "frontend dependencies");
  if (dep(/^(express|koa|fastify|@nestjs|hapi|@hapi)/)) add("backend", "Node backend dependencies");
  if (dep(/playwright|cypress/)) add("tests", "E2E deps");
  if (dep(/vitest|jest|mocha|jasmine|karma/)) add("tests", "test runner");

  const { exts, spec, migrations, truncated } = scan(repo);
  if (truncated) add("scan-truncated", "large repo: detection stopped at the scan budget - deep signals may be missed; pass artifacts explicitly if needed");
  const anyCode = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".rs", ".go", ".java", ".py", ".php", ".rb"].some((e) =>
    exts.has(e),
  );
  if (anyCode) add("code", "sources detected");
  if ([".vue", ".svelte", ".tsx", ".jsx"].some((e) => exts.has(e))) add("frontend", "UI files");
  if ([".rs", ".go", ".java", ".py", ".php"].some((e) => exts.has(e)) || has("Cargo.toml") || has("go.mod") || has("pom.xml"))
    add("backend", "backend sources");
  if (exts.has(".sql")) add("sql", "SQL files");
  if (migrations) add("migrations", "migrations folder");
  if (spec) add("tests", "*.spec/*.test files");

  return { signals: sig, evidence: ev };
}

function isRecommended(item: Item, sig: Set<string>): boolean {
  return item.when === "always" || item.when.some((s) => sig.has(s));
}

function plan(repo: string): { picked: Item[]; optional: Item[]; signals: Set<string>; evidence: Record<string, string> } {
  const { signals, evidence } = detect(repo);
  const matched = CATALOG.filter((i) => isRecommended(i, signals));
  return {
    picked: matched.filter((i) => !i.optional),
    optional: matched.filter((i) => i.optional),
    signals,
    evidence,
  };
}

const KIND_LABEL: Record<Kind, string> = { rule: "Rules", skill: "Skills", script: "Scripts", hook: "Hooks", agent: "Agents" };

function printGroup(title: string, items: Item[]): void {
  if (!items.length) return;
  console.log(`\n${title}`);
  for (const k of ["rule", "skill", "script", "hook", "agent"] as Kind[]) {
    const g = items.filter((i) => i.kind === k);
    if (!g.length) continue;
    console.log(`  ${KIND_LABEL[k]} (${g.length}) :`);
    for (const i of g) console.log(`    • ${i.name.replace(/\.md$/, "")} - ${i.reason}`);
  }
}

function doPlan(repo: string): void {
  const { picked, optional, signals, evidence } = plan(repo);
  console.log(`Analysis of ${repo}`);
  console.log(`Signals: ${[...signals].map((s) => `${s} (${evidence[s]})`).join(", ") || "none"}`);
  printGroup("✓ Recommended (installed by default):", picked);
  printGroup("• Optional (add with --all):", optional);
  console.log(`\n→ To install: npx tsx ${join(SELF, "install.ts")} install ${repo}` + `   (add --all for the optional ones)`);
}

/**
 * Deep-merges the selected hook wirings into <repo>/.claude/settings.json.
 * Idempotent (a re-install adds no duplicate wiring), backs up an existing file
 * to settings.json.bak, and preserves any unrelated settings the user already has.
 */
interface CommandHook { type: string; command: string }
interface EventEntry { matcher?: string; hooks: CommandHook[] }

function mergeHookSettings(dotclaude: string, wirings: HookWiring[]): { added: number; backedUp: boolean; malformed: boolean } {
  const settingsPath = join(dotclaude, "settings.json");
  const existed = existsSync(settingsPath);
  let settings: { hooks?: Record<string, EventEntry[]> } & Record<string, unknown> = {};
  let malformed = false;
  if (existed) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      malformed = true; // keep {} but back up the original before overwriting
    }
  }
  // A hooks section with an unexpected shape (array, string…) cannot be merged
  // into: treat it like malformed JSON - back up the file and rebuild the section.
  if (settings.hooks !== undefined && (typeof settings.hooks !== "object" || settings.hooks === null || Array.isArray(settings.hooks))) {
    malformed = true;
    delete settings.hooks;
  }
  const hooks = (settings.hooks ??= {});
  let added = 0;
  for (const w of wirings) {
    const command = `npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/${w.commandFile}`;
    if (!Array.isArray(hooks[w.event])) {
      if (hooks[w.event] !== undefined) malformed = true;
      hooks[w.event] = [];
    }
    const entries = hooks[w.event];
    let entry = entries.find((e) => e && typeof e === "object" && Array.isArray(e.hooks) && (e.matcher ?? "") === (w.matcher ?? ""));
    if (!entry) {
      entry = { ...(w.matcher ? { matcher: w.matcher } : {}), hooks: [] };
      entries.push(entry);
    }
    if (!entry.hooks.some((h) => h.command === command)) {
      entry.hooks.push({ type: "command", command });
      added++;
    }
  }
  const backedUp = existed && (added > 0 || malformed);
  if (added > 0 || malformed) {
    if (backedUp) cpSync(settingsPath, settingsPath + ".bak");
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }
  return { added, backedUp, malformed };
}

const KIND_ORDER: Kind[] = ["rule", "skill", "script", "hook", "agent"];

// ─── Layout constants ─────────────────────────────────────────────────────────
const HEADER_LINES = 2;
const LEGEND_LINES = 2;
const DETAIL_LINES = 4;
const MIN_VIEWPORT_ROWS = 5;
const ITEM_LINE_WIDTH = 50;

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const DIM = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const INVERSE = (s: string): string => `\x1b[7m${s}\x1b[0m`;
const BOLD = (s: string): string => `\x1b[1m${s}\x1b[0m`;

// ─── Description precomputation ───────────────────────────────────────────────

/**
 * Reads the real description of each item from its source file.
 * Called once before the selector loop.
 */
function buildDetailMap(items: Item[]): Map<Item, string> {
  const map = new Map<Item, string>();
  for (const item of items) {
    map.set(item, readItemDescription(item));
  }
  return map;
}

function readItemDescription(item: Item): string {
  try {
    if (item.kind === "skill") {
      const skillFile = join(SELF, "skills", item.name, "SKILL.md");
      if (existsSync(skillFile)) {
        const content = readFileSync(skillFile, "utf8");
        const desc = extractFrontmatterField(content, "description");
        if (desc) return desc;
      }
    } else if (item.kind === "rule") {
      const ruleFile = join(SELF, "rules", item.name);
      if (existsSync(ruleFile)) {
        const content = readFileSync(ruleFile, "utf8");
        // Look for the first # line after the frontmatter (or at the start of the file)
        const afterFront = skipFrontmatter(content);
        const m = /^#\s+(.+)/m.exec(afterFront);
        if (m) return m[1].trim();
      }
    } else if (item.kind === "script") {
      const scriptFile = join(SELF, "scripts", item.name);
      if (existsSync(scriptFile)) {
        const content = readFileSync(scriptFile, "utf8");
        const desc = extractJsDocFirstSentence(content);
        if (desc) return desc;
      }
    } else if (item.kind === "hook") {
      const hookFile = join(SELF, "hooks", item.name);
      if (existsSync(hookFile)) {
        const content = readFileSync(hookFile, "utf8");
        const desc = extractJsDocFirstSentence(content);
        if (desc) return desc;
      }
    } else if (item.kind === "agent") {
      const agentFile = join(SELF, "agents", item.name);
      if (existsSync(agentFile)) {
        const content = readFileSync(agentFile, "utf8");
        const desc = extractFrontmatterField(content, "description");
        if (desc) return desc;
        // Fallback: first line of the file
        const firstLine = content.split("\n").find((l) => l.trim().length > 0);
        if (firstLine) return firstLine.replace(/^#\s*/, "").trim();
      }
    }
  } catch {
    // Cannot read - fall back to the default
  }
  return item.reason;
}

function skipFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  return content.slice(end + 4);
}

function extractFrontmatterField(content: string, field: string): string | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const front = content.slice(0, end);
  const re = new RegExp(`^${field}:\\s*(.+)`, "m");
  const m = re.exec(front);
  if (!m) return null;
  // Strip any surrounding quotes
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function extractJsDocFirstSentence(content: string): string | null {
  const start = content.indexOf("/**");
  if (start === -1) return null;
  const end = content.indexOf("*/", start);
  const block = end === -1 ? content.slice(start) : content.slice(start, end);
  // Remove /** and the leading * on each line
  const text = block
    .replace(/\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ");
  // Take up to the first period or the end of the first "sentence"
  const m = /^([^.\n]+\.?)/.exec(text);
  return m ? m[1].trim() : text.slice(0, 120) || null;
}

// ─── Rendering sub-functions (pure) ───────────────────────────────────────────

function buildHeader(checkedCount: number, total: number): string {
  const title = BOLD("⚙  Installing ronce-racine");
  const counter = `${checkedCount}/${total} selected`;
  return `  ${title}   ${counter}\n`;
}

function buildGroupHeader(kind: Kind, checkedInGroup: number, totalInGroup: number): string {
  const label = `${KIND_LABEL[kind]} (${checkedInGroup}/${totalInGroup})`;
  const dashes = "─".repeat(Math.max(0, ITEM_LINE_WIDTH - label.length - 4));
  return `  ─── ${label} ${dashes}`;
}

function buildItemLine(item: Item, isChecked: boolean, isCursor: boolean): string {
  const box = isChecked ? "[x]" : "[ ]";
  const baseName = item.name.replace(/\.md$/, "");
  const optTag = item.optional ? " · opt" : "";
  const nameField = (baseName + optTag).padEnd(28);
  const line = `  ${isCursor ? "›" : " "} ${box} ${nameField}  - ${item.reason}`;
  if (isCursor) return INVERSE(line);
  if (item.optional) return DIM(line);
  return line;
}

function buildDetailPanel(item: Item, detail: Map<Item, string>): string {
  const kindLabel = KIND_LABEL[item.kind];
  const baseName = item.name.replace(/\.md$/, "");
  const token = `${item.kind}:${baseName}`;
  const badge = item.optional ? " · optional" : " · recommended";
  const desc = detail.get(item) ?? item.reason;
  const header = ` Detail: ${kindLabel} › ${baseName}   [token: ${token}]${badge}`;
  const body = ` ${desc.slice(0, 120)}${desc.length > 120 ? "…" : ""}`;
  return `\n${header}\n${body}\n`;
}

function buildLegend(): string {
  return `\n ${DIM("↑↓ move · space toggle · a (un)check the group · enter confirm · q cancel")}`;
}

// ─── Main frame ────────────────────────────────────────────────────────────────

/**
 * Builds the complete selector frame (pure function, no I/O).
 * Returns the string to write after \x1b[2J\x1b[H.
 */
function buildSelectorFrame(opts: {
  flat: Item[];
  checked: Set<Item>;
  cursor: number;
  detail: Map<Item, string>;
  rows: number;
}): string {
  const { flat, checked, cursor, detail, rows } = opts;

  // Viewport computation
  const viewportRows = Math.max(MIN_VIEWPORT_ROWS, rows - HEADER_LINES - LEGEND_LINES - DETAIL_LINES);


  // Header
  const header = buildHeader(checked.size, flat.length);

  // Build the list lines (with group headers)
  const listLines: string[] = [];
  let lastKind: Kind | null = null;
  for (let i = 0; i < flat.length; i++) {
    const item = flat[i];
    if (item.kind !== lastKind) {
      // Group header
      const groupItems = flat.filter((x) => x.kind === item.kind);
      const checkedInGroup = groupItems.filter((x) => checked.has(x)).length;
      listLines.push(buildGroupHeader(item.kind, checkedInGroup, groupItems.length));
      lastKind = item.kind;
    }
    listLines.push(buildItemLine(item, checked.has(item), i === cursor));
  }

  // Viewport: find the index in listLines corresponding to the cursor item
  // We rebuild an item-index → line-index mapping
  const itemLineIndices: number[] = [];
  let lineIdx = 0;
  let prevKind: Kind | null = null;
  for (const item of flat) {
    if (item.kind !== prevKind) {
      lineIdx++; // group line
      prevKind = item.kind;
    }
    itemLineIndices.push(lineIdx);
    lineIdx++;
  }

  const cursorLineIdx = itemLineIndices[cursor] ?? 0;

  // Compute the viewport start: keeps the cursor visible with a margin on both sides
  const MARGIN = 2; // context lines kept around the cursor
  const lineViewportStart = Math.max(
    0,
    Math.min(cursorLineIdx - MARGIN, listLines.length - viewportRows),
  );

  const visibleLines = listLines.slice(lineViewportStart, lineViewportStart + viewportRows);

  // Overflow indicators
  const overflowTop = lineViewportStart > 0 ? lineViewportStart : 0;
  const overflowBottom = Math.max(0, listLines.length - (lineViewportStart + viewportRows));

  const topIndicator = overflowTop > 0 ? `  ▲ ${overflowTop} more\n` : "";
  const bottomIndicator = overflowBottom > 0 ? `  ▼ ${overflowBottom} more\n` : "";

  // Detail panel
  const currentItem = flat[cursor];
  const detailPanel = currentItem ? buildDetailPanel(currentItem, detail) : "\n\n\n\n";

  // Legend
  const legend = buildLegend();

  return (
    header +
    "\n" +
    topIndicator +
    visibleLines.join("\n") +
    "\n" +
    bottomIndicator +
    detailPanel +
    legend +
    "\n"
  );
}

// ─── Interactive selector ─────────────────────────────────────────────────────

/** TTY checkbox selector with a scrolling viewport and detail panel. Resolves the checked items, or null if cancelled. */
// ─── Selector keyboard logic (pure, exported for tests) ───────────────────────

export interface SelectorState { flat: Item[]; checked: Set<Item>; cursor: number }

/**
 * Applies one keypress to the selector state (mutated in place).
 * Returns "continue", "confirm" (enter) or "cancel" (q / ctrl-c).
 */
export function applySelectorKey(state: SelectorState, key: { name?: string; ctrl?: boolean }): "continue" | "confirm" | "cancel" {
  const k = key?.name;
  if ((key?.ctrl && k === "c") || k === "q") return "cancel";
  if (k === "up" || k === "k") state.cursor = (state.cursor - 1 + state.flat.length) % state.flat.length;
  else if (k === "down" || k === "j") state.cursor = (state.cursor + 1) % state.flat.length;
  else if (k === "space") {
    const it = state.flat[state.cursor];
    state.checked.has(it) ? state.checked.delete(it) : state.checked.add(it);
  } else if (k === "a") {
    const kind = state.flat[state.cursor].kind;
    const group = state.flat.filter((i) => i.kind === kind);
    const allOn = group.every((i) => state.checked.has(i));
    group.forEach((i) => (allOn ? state.checked.delete(i) : state.checked.add(i)));
  } else if (k === "return") return "confirm";
  return "continue";
}

function interactiveSelect(items: Item[], preChecked: Set<Item>): Promise<Item[] | null> {
  const flat = KIND_ORDER.flatMap((k) => items.filter((i) => i.kind === k));
  const checked = new Set(preChecked);
  let cursor = 0;

  // Precompute the descriptions (once)
  const detail = buildDetailMap(items);

  const render = (): void => {
    const frame = buildSelectorFrame({
      flat,
      checked,
      cursor,
      detail,
      rows: process.stdout.rows ?? 24,
    });
    process.stdout.write("\x1b[2J\x1b[H" + frame);
  };

  return new Promise((resolve) => {
    const stdin = process.stdin;
    emitKeypressEvents(stdin);

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      process.stdout.write("\x1b[?25h\n");
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("keypress", onKey);
    };

    const state: SelectorState = { flat, checked, cursor };
    const onKey = (_s: string, key: { name?: string; ctrl?: boolean }): void => {
      try {
        const outcome = applySelectorKey(state, key);
        cursor = state.cursor; // render() reads the outer binding
        if (outcome === "cancel") { cleanup(); resolve(null); return; }
        if (outcome === "confirm") { cleanup(); resolve(flat.filter((i) => checked.has(i))); return; }
        render();
      } catch {
        cleanup();
        resolve(null);
      }
    };

    try {
      stdin.setRawMode(true);
      stdin.resume();
      process.stdout.write("\x1b[?25l"); // hide the cursor
      render();
      stdin.on("keypress", onKey);
    } catch {
      cleanup();
      resolve(null);
    }
  });
}

async function doInstall(repo: string, opts: { all: boolean; yes: boolean; rulesOnly: boolean; pick: string[]; pickFlag: boolean }): Promise<void> {
  if (opts.pickFlag && opts.pick.length === 0) {
    console.error("--pick requires at least one token (kind:name), e.g. --pick skill:detection-sweep");
    process.exit(2);
  }
  let { picked, optional } = plan(repo);
  if (opts.rulesOnly) {
    picked = picked.filter((i) => i.kind === "rule");
    optional = optional.filter((i) => i.kind === "rule");
  }
  if (opts.pick.length) {
    const tokenOf = (i: Item): string => `${i.kind}:${i.name.replace(/\.md$/, "")}`;
    const unknown = opts.pick.filter((t) => !CATALOG.some((i) => tokenOf(i) === t || `${i.kind}:${i.name}` === t));
    if (unknown.length) {
      console.error(`Unknown pick token(s): ${unknown.join(", ")}`);
      process.exit(2);
    }
    // --rules-only restricts --pick to the rules-only set: a non-rule pick token errors rather than being silently installed anyway.
    if (opts.rulesOnly) {
      const nonRule = opts.pick.filter((t) => !t.startsWith("rule:"));
      if (nonRule.length) {
        console.error(`--rules-only restricts --pick to rule:* tokens; got: ${nonRule.join(", ")}`);
        process.exit(2);
      }
    }
    picked = CATALOG.filter((i) => opts.pick.some((t) => tokenOf(i) === t || `${i.kind}:${i.name}` === t));
    optional = [];
  }
  const candidates = [...picked, ...optional];
  const preChecked = new Set(opts.all ? candidates : picked);

  let items: Item[];
  if (opts.yes || !process.stdin.isTTY) {
    items = [...preChecked];
  } else {
    const sel = await interactiveSelect(candidates, preChecked);
    if (sel === null) { console.log("Cancelled - nothing installed."); return; }
    items = sel;
  }
  if (!items.length) { console.log("No item selected - nothing installed."); return; }
  const dotclaude = join(repo, ".claude");

  // Preserve deliberately customized (detached) items: never overwrite them on
  // re-install. They stay recorded as installed but their files are left as-is.
  const prevLock = readLock(repo);
  const detached = new Set(prevLock?.detached ?? []);
  // Pre-existing content we never installed (first install, or a token added since)
  // is user work: back it up before overwriting instead of silently clobbering it.
  const installedBefore = new Set(prevLock?.installed ?? []);
  let nPreserved = 0;
  let nBackedUp = 0;
  const copyToken = (token: string, src: string, dst: string, recursive = false): void => {
    if (detached.has(token)) { nPreserved++; return; }
    if (!installedBefore.has(token) && existsSync(dst)) {
      cpSync(dst, dst + ".pre-install.bak", { recursive: true });
      nBackedUp++;
    }
    // Test procedures (*.test.ts) and eval manifests (eval.yaml) stay in the canonical repo - never distributed.
    cpSync(src, dst, recursive ? { recursive: true, filter: (s) => !s.endsWith(".test.ts") && !s.endsWith("eval.yaml") } : undefined);
  };

  const adopted: string[] = [];
  const tokens: string[] = [];
  let nRules = 0;
  let nSkills = 0;
  let nScripts = 0;
  let nAgents = 0;
  let nHooks = 0;
  const collectedWirings: HookWiring[] = [];

  for (const i of items) {
    if (i.kind === "rule") {
      tokens.push(`rule:${i.name}`);
      const dst = join(dotclaude, "rules/shared");
      mkdirSync(dst, { recursive: true });
      copyToken(`rule:${i.name}`, join(SELF, "rules", i.name), join(dst, i.name));
      adopted.push(i.name);
      nRules++;
    } else if (i.kind === "skill") {
      tokens.push(`skill:${i.name}`);
      const dst = join(dotclaude, "skills", i.name);
      copyToken(`skill:${i.name}`, join(SELF, "skills", i.name), dst, true);
      nSkills++;
    } else if (i.kind === "agent") {
      tokens.push(`agent:${i.name}`);
      const dst = join(dotclaude, "agents");
      mkdirSync(dst, { recursive: true });
      copyToken(`agent:${i.name}`, join(SELF, "agents", i.name), join(dst, i.name));
      nAgents++;
    } else if (i.kind === "script") {
      tokens.push(`script:${i.name}`);
      const dst = join(dotclaude, "scripts");
      mkdirSync(dst, { recursive: true });
      copyToken(`script:${i.name}`, join(SELF, "scripts", i.name), join(dst, i.name));
      nScripts++;
    } else if (i.kind === "hook") {
      // One token per copied file (no generic token, to avoid duplicates)
      const hookDir = join(dotclaude, "hooks");
      mkdirSync(hookDir, { recursive: true });
      for (const fileName of i.files ?? [i.name]) {
        copyToken(`hook:${fileName}`, join(SELF, "hooks", fileName), join(hookDir, fileName));
        tokens.push(`hook:${fileName}`);
      }
      if (i.wiring) collectedWirings.push(...i.wiring);
      nHooks++;
    }
  }

  // Copy README.md once if at least one hook is installed
  if (nHooks > 0) {
    const hookDir = join(dotclaude, "hooks");
    mkdirSync(hookDir, { recursive: true });
    const readmeSrc = join(SELF, "hooks", "README.md");
    if (existsSync(readmeSrc)) cpSync(readmeSrc, join(hookDir, "README.md"));
  }

  if (adopted.length) {
    const manifest = join(dotclaude, "rules/shared/.adopted");
    const header = "# Generic rules adopted (ronce-racine). Resync: install.ts install --rules-only .\n";
    writeFileSync(manifest, header + adopted.sort().join("\n") + "\n");
  }

  // Lockfile: preserves the existing detached list (deliberately customized items).
  const lock: Lock = { source: sourceSha(), installed: tokens.sort(), detached: prevLock?.detached ?? [] };
  writeFileSync(join(repo, LOCKFILE), JSON.stringify(lock, null, 2) + "\n");

  console.log(`Installed into ${dotclaude}: ${nRules} rules, ${nSkills} skills, ${nScripts} scripts, ${nAgents} agents${nHooks > 0 ? `, ${nHooks} hook(s)` : ""}.`);
  if (nPreserved > 0) console.log(`Preserved ${nPreserved} detached (customized) item(s) - left untouched.`);
  if (nBackedUp > 0) console.log(`⚠ Backed up ${nBackedUp} pre-existing item(s) to *.pre-install.bak - review before deleting (or 'detach' them to keep your version).`);
  console.log(`Lockfile: ${LOCKFILE} (source ${lock.source.slice(0, 8)}) - drift via 'install.ts check .'`);
  if (adopted.length) console.log(`Rules manifest: .claude/rules/shared/.adopted (${adopted.length} rules)`);
  if (collectedWirings.length > 0) {
    const settingsPath = join(dotclaude, "settings.json");
    const { added, backedUp, malformed } = mergeHookSettings(dotclaude, collectedWirings);
    if (malformed) console.log(`\n⚠ ${settingsPath} was not valid JSON (or its hooks section had an unexpected shape) - backed up to settings.json.bak and rewritten.`);
    if (added > 0) console.log(`${malformed ? "" : "\n"}Wired ${added} hook(s) into ${settingsPath}${backedUp && !malformed ? " (backup: settings.json.bak)" : ""}.`);
    else if (!malformed) console.log(`\nHooks already wired in ${settingsPath} - no change.`);
    console.log(`(details: .claude/hooks/README.md)`);
  }
  console.log(`\nReview the diff then commit (.claude/ travels via git → team + CI).`);
}

/** Drift control (lenient: warns; --strict: exit 1) and staleness check. */
function doCheck(repo: string, strict: boolean): void {
  const lock = readLock(repo);
  if (!lock) {
    console.error(`No lockfile (${LOCKFILE}) - run 'install.ts install ${repo}' first.`);
    process.exit(2);
  }
  const checked = lock.installed.filter((t) => !lock.detached.includes(t));
  const drift = checked
    .map((t) => ({ t, d: compareToken(t, repo) }))
    .filter((x): x is { t: string; d: string } => x.d !== null);

  for (const { t, d } of drift) console.log(`⚠ drift ${t}: ${d}`);
  if (lock.detached.length) console.log(`(${lock.detached.length} detached item(s) ignored: ${lock.detached.join(", ")})`);

  const current = sourceSha();
  const stale = lock.source !== "local" && current !== "local" && lock.source !== current;
  if (stale) console.log(`↑ stale: installed from ${lock.source.slice(0, 8)}, canonical at ${current.slice(0, 8)} - re-run 'install.ts install ${repo}'.`);

  if (!drift.length) {
    console.log(`✓ ${checked.length} artifacts match the canonical source${stale ? " (but stale)" : ""}.`);
    return;
  }
  console.log(`\n${drift.length} drifted artifact(s). To make a customization official: 'install.ts detach ${repo} <token>'. To resync: 'install.ts install ${repo}'.`);
  if (strict) process.exit(1);
}

/** Detaches items (removes them from drift control - deliberate customization). */
function doDetach(repo: string, tokensToDetach: string[]): void {
  const lock = readLock(repo);
  if (!lock) {
    console.error(`No lockfile (${LOCKFILE}).`);
    process.exit(2);
  }
  const unknown = tokensToDetach.filter((t) => !lock.installed.includes(t));
  if (unknown.length) {
    console.error(`Unknown token(s) (format kind:name): ${unknown.join(", ")}\nInstalled: ${lock.installed.join(", ")}`);
    process.exit(2);
  }
  lock.detached = [...new Set([...lock.detached, ...tokensToDetach])].sort();
  writeFileSync(join(repo, LOCKFILE), JSON.stringify(lock, null, 2) + "\n");
  console.log(`Detached: ${tokensToDetach.join(", ")} - excluded from drift control.`);
}

/** Collects only the args following "--pick", stopping at the next flag (arg starting with "-"). */
function pickTokens(rest: string[]): string[] {
  const start = rest.indexOf("--pick");
  if (start === -1) return [];
  const tokens: string[] = [];
  for (let i = start + 1; i < rest.length && !rest[i].startsWith("-"); i++) tokens.push(rest[i]);
  return tokens;
}

// Only run the CLI when launched directly (the module stays importable in tests).
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const [cmd, repo, ...rest] = process.argv.slice(2);
  const COMMANDS = ["plan", "install", "check", "detach"];
  if (!repo || !COMMANDS.includes(cmd)) {
    console.error("usage: install.ts <plan|install|check|detach> <repo> [--all|--yes|--rules-only|--strict|<token...>]");
    process.exit(2);
  }
  if (!existsSync(repo)) {
    console.error(`repo not found: ${repo}`);
    process.exit(2);
  }
  if (cmd === "plan") doPlan(repo);
  else if (cmd === "install") await doInstall(repo, {
    all: rest.includes("--all"),
    yes: rest.includes("--yes") || rest.includes("-y"),
    rulesOnly: rest.includes("--rules-only"),
    pick: pickTokens(rest),
    pickFlag: rest.includes("--pick"),
  });
  else if (cmd === "check") doCheck(repo, rest.includes("--strict"));
  else doDetach(repo, rest.filter((a) => !a.startsWith("--")));
}
