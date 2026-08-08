/**
 * Stack detection: walks the target repo, turns what it finds into signals, and
 * maps those signals onto the catalog.
 */
import { readFileSync, existsSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { HERE, SELF, IS_BUILT } from "./paths.js";
import { CATALOG, type Item, type Kind } from "./catalog.js";

/** Bounded walk: extensions seen, presence of specs and a migrations folder. */
export function scan(repo: string): { exts: Set<string>; spec: boolean; migrations: boolean; truncated: boolean } {
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

export function detect(repo: string): { signals: Set<string>; evidence: Record<string, string> } {
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

export function isRecommended(item: Item, sig: Set<string>): boolean {
  return item.when === "always" || item.when.some((s) => sig.has(s));
}

export function plan(repo: string): { picked: Item[]; optional: Item[]; signals: Set<string>; evidence: Record<string, string> } {
  const { signals, evidence } = detect(repo);
  const matched = CATALOG.filter((i) => isRecommended(i, signals));
  return {
    picked: matched.filter((i) => !i.optional),
    optional: matched.filter((i) => i.optional),
    signals,
    evidence,
  };
}

export const KIND_LABEL: Record<Kind, string> = { rule: "Rules", skill: "Skills", script: "Scripts", hook: "Hooks", agent: "Agents" };

export function printGroup(title: string, items: Item[]): void {
  if (!items.length) return;
  console.log(`\n${title}`);
  for (const k of ["rule", "skill", "script", "hook", "agent"] as Kind[]) {
    const g = items.filter((i) => i.kind === k);
    if (!g.length) continue;
    console.log(`  ${KIND_LABEL[k]} (${g.length}) :`);
    for (const i of g) console.log(`    • ${i.name.replace(/\.md$/, "")} - ${i.reason}`);
  }
}

export function doPlan(repo: string): void {
  const { picked, optional, signals, evidence } = plan(repo);
  console.log(`Analysis of ${repo}`);
  console.log(`Signals: ${[...signals].map((s) => `${s} (${evidence[s]})`).join(", ") || "none"}`);
  printGroup("✓ Recommended (installed by default):", picked);
  printGroup("• Optional (add with --all):", optional);
  const invocation = IS_BUILT ? `node ${join(HERE, "install.js")}` : `npx tsx ${join(SELF, "install.ts")}`;
  console.log(`\n→ To install: ${invocation} install ${repo}   (add --all for the optional ones)`);
}
