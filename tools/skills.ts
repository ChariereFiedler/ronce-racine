#!/usr/bin/env -S npx tsx
/**
 * Validates the canonical skills against the standard contract (see docs/writing-a-skill.md).
 *
 *   npx tsx skills.ts validate   checks every skills/*\/SKILL.md (exit 1 on error)
 *   npx tsx skills.ts list       lists skills with version + category
 *
 * Static test wired into CI: guarantees every skill stays versioned, that its
 * description triggers correctly, and that its linked files exist.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROUTING_CASES, routingFailures } from "./routing-cases.ts";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = join(ROOT, "skills");
const RULES = join(ROOT, "rules");

const CATEGORIES = ["audit", "feature", "bug", "frontend", "test", "process"];
const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIRST_PERSON = /\b(I |I'|you can|you should|we )\b/i;
const BODY_SOFT_LIMIT = 500;

interface Frontmatter {
  name?: string;
  description?: string;
  version?: string;
  metadata?: { "last-reviewed"?: string; category?: string };
}

/** Minimal parser: top-level `key: value` + a single nested level under `metadata:`. */
function parseFrontmatter(rawInput: string): { fm: Frontmatter; body: string } {
  // Normalize first: with core.autocrlf=true a Windows checkout materializes
  // these files as CRLF, and every LF-anchored delimiter below silently
  // degrades to "no frontmatter" - the lint then passes by seeing nothing.
  const raw = rawInput.replace(/\r\n/g, "\n");
  if (!raw.startsWith("---\n")) return { fm: {}, body: raw }; // portability:allow - raw is CRLF-normalized on the line above
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { fm: {}, body: raw };
  const head = raw.slice(4, end);
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1);
  const fm: Frontmatter = {};
  let inMeta = false;
  for (const line of head.split("\n")) {
    if (!line.trim()) continue;
    const nested = /^ {2}(\S[^:]*?):\s*(.*)$/.exec(line);
    if (inMeta && nested) {
      fm.metadata ??= {};
      fm.metadata[nested[1] as "category"] = nested[2].trim();
      continue;
    }
    const top = /^(\S[^:]*?):\s*(.*)$/.exec(line);
    if (!top) continue;
    inMeta = top[1] === "metadata";
    if (inMeta) fm.metadata ??= {};
    else (fm as Record<string, string>)[top[1]] = top[2].trim();
  }
  return { fm, body };
}

/**
 * Refs to reference/, scripts/, templates/ in the body (excluding <…> placeholders).
 * A path preceded by `<dir>/` (e.g. `audit-report/reference/…`) targets ANOTHER
 * skill's material - it is not resolvable inside this skill's folder, skip it.
 */
function referencedPaths(body: string): string[] {
  const re = /(?<![\w-]\/)(?:reference|scripts|templates)\/[\w./-]+/g;
  return [...new Set(body.match(re) ?? [])].filter((p) => !p.includes("<"));
}

/**
 * A ": " inside an unquoted scalar makes the whole frontmatter invalid YAML.
 * Claude Code does not fail loudly on it: the artifact loads with EMPTY
 * metadata, so a skill silently stops routing and an agent loses its tool
 * list. `claude plugin validate` caught exactly that on agents/code-reviewer.md
 * ("Read-only: it reports findings"), which this repo's own parser - lenient,
 * line-based - had been reading happily for months.
 */
function unquotedColonProblems(rawInput: string, label: string): string[] {
  const raw = rawInput.replace(/\r\n/g, "\n"); // see parseFrontmatter: CRLF checkouts
  const head = raw.startsWith("---\n") ? raw.slice(4).split("\n---")[0] : ""; // portability:allow - raw is CRLF-normalized on the line above
  const errs: string[] = [];
  for (const line of head.split("\n")) {
    const m = /^([\w-]+):\s+(.*)$/.exec(line);
    if (m && !/^["'].*["']$/.test(m[2]) && m[2].includes(": "))
      errs.push(`${label}: frontmatter "${m[1]}" holds an unquoted ": " - invalid YAML`);
  }
  return errs;
}

function validateSkill(dir: string): string[] {
  const errs: string[] = [];
  const skillPath = join(SKILLS, dir, "SKILL.md");
  if (!existsSync(skillPath)) return [`${dir}: SKILL.md missing`];
  const rawSkill = readFileSync(skillPath, "utf8");
  const { fm, body } = parseFrontmatter(rawSkill);
  errs.push(...unquotedColonProblems(rawSkill, dir));

  if (fm.name !== dir) errs.push(`${dir}: name "${fm.name}" ≠ folder name`);
  if (!fm.description) errs.push(`${dir}: description missing`);
  else {
    if (!/use (when|before|after|while|once)\b/i.test(fm.description))
      errs.push(`${dir}: description without a "Use when/before/…" trigger`);
    if (FIRST_PERSON.test(fm.description)) errs.push(`${dir}: description not in the third person`);
  }
  if (!fm.version) errs.push(`${dir}: version missing`);
  else if (!SEMVER.test(fm.version)) errs.push(`${dir}: version "${fm.version}" not semver`);

  const reviewed = fm.metadata?.["last-reviewed"];
  if (!reviewed) errs.push(`${dir}: metadata.last-reviewed missing`);
  else if (!ISO_DATE.test(reviewed)) errs.push(`${dir}: last-reviewed "${reviewed}" ≠ YYYY-MM-DD`);

  const cat = fm.metadata?.category;
  if (!cat) errs.push(`${dir}: metadata.category missing`);
  else if (!CATEGORIES.includes(cat)) errs.push(`${dir}: category "${cat}" not in the allowed list`);

  if (!/^##\s+Changelog\s*$/m.test(body)) errs.push(`${dir}: ## Changelog section missing`);

  // The human page sits next to the skill (a skill is a folder, so it has room
  // for one) and is never distributed. It must point at what it documents,
  // otherwise it drifts into a standalone text nobody reconciles.
  const readme = join(SKILLS, dir, "README.md");
  if (!existsSync(readme)) errs.push(`${dir}: README.md missing (human page)`);
  else if (!readFileSync(readme, "utf8").includes("SKILL.md"))
    errs.push(`${dir}/README.md: does not link its SKILL.md`);

  for (const ref of referencedPaths(body)) {
    if (!existsSync(join(SKILLS, dir, ref))) errs.push(`${dir}: broken link → ${ref}`);
  }
  // Cross-skill refs (`other-skill/reference/x.md`) resolve from the skills/ root.
  for (const ref of body.match(/(?<![\w./-])[\w-]+\/(?:reference|scripts|templates)\/[\w./-]+/g) ?? []) {
    if (!existsSync(join(SKILLS, ref))) errs.push(`${dir}: broken cross-skill link → ${ref}`);
  }

  const lines = body.split("\n").length;
  if (lines > BODY_SOFT_LIMIT) console.warn(`  ⚠ ${dir}: body ${lines} lines (> ${BODY_SOFT_LIMIT})`);

  return errs;
}

function skillDirs(): string[] {
  return readdirSync(SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function validate(): void {
  const errors = skillDirs().flatMap(validateSkill);
  if (errors.length) {
    console.error(`✗ ${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ ${skillDirs().length} skills conform`);
}

function list(): void {
  for (const dir of skillDirs()) {
    const { fm } = parseFrontmatter(readFileSync(join(SKILLS, dir, "SKILL.md"), "utf8"));
    console.log(`${(fm.version ?? "?").padEnd(8)} ${(fm.metadata?.category ?? "?").padEnd(8)} ${dir}`);
  }
}

/** Triggers quoted in the description (distinctive phrases). */
function quotedTriggers(desc: string): string[] {
  return [...desc.matchAll(/"([^"]+)"|«\s*([^»]+?)\s*»/g)]
    .map((m) => (m[1] || m[2]).toLowerCase().trim())
    .filter((t) => t.length >= 4);
}

/** A skill's matching set: quoted phrases + words from its name (≥ 4 letters). */
function allTriggers(name: string, desc: string): string[] {
  const nameWords = name.split("-").filter((w) => w.length >= 4);
  return [...new Set([...quotedTriggers(desc), ...nameWords])];
}

/**
 * Routing discriminability lint: for each trigger quoted by a skill, checks that
 * this skill ranks in the top-K against all the others (otherwise its description
 * is not distinctive enough and the wrong skill would be suggested).
 */
function triggersCheck(): void {
  const K = 3;
  const skills = skillDirs().map((dir) => {
    const { fm } = parseFrontmatter(readFileSync(join(SKILLS, dir, "SKILL.md"), "utf8"));
    const desc = fm.description ?? "";
    return { dir, quoted: quotedTriggers(desc), triggers: allTriggers(dir, desc) };
  });

  const fails: string[] = [];
  let tested = 0;
  let skipped = 0;
  for (const s of skills) {
    if (!s.quoted.length) {
      skipped++;
      continue;
    }
    for (const t of s.quoted) {
      tested++;
      const ranked = skills
        .map((o) => ({ dir: o.dir, hits: o.triggers.filter((x) => t.includes(x)).length }))
        .filter((o) => o.hits > 0)
        .sort((a, b) => b.hits - a.hits);
      const pos = ranked.findIndex((r) => r.dir === s.dir);
      if (pos === -1 || pos >= K) {
        const top = ranked.slice(0, K).map((r) => r.dir).join(", ") || "(none)";
        fails.push(`${s.dir}: trigger "${t}" outside top-${K} (top: ${top})`);
      }
    }
  }

  if (fails.length) {
    console.error(`✗ ${fails.length} non-discriminating trigger(s):\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    `✓ ${tested} triggers tested - each ranks its skill in the top-${K} (${skipped} skills without a quoted trigger, skipped)`,
  );
}

/** Checks that every hooks/*.ts carries @version (semver) and @last-reviewed (ISO). */
function hooksCheck(): void {
  const dir = join(ROOT, "hooks");
  if (!existsSync(dir)) {
    console.error("✗ hooks/ folder missing");
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();
  if (!files.length) {
    console.error("✗ hooks/ contains no .ts");
    process.exit(1);
  }
  const errors: string[] = [];
  for (const f of files) {
    const content = readFileSync(join(dir, f), "utf8");
    const versionMatch = /@version\s+(\S+)/.exec(content);
    const reviewedMatch = /@last-reviewed\s+(\S+)/.exec(content);
    if (!versionMatch) {
      errors.push(`${f}: @version missing`);
    } else if (!SEMVER.test(versionMatch[1])) {
      errors.push(`${f}: @version "${versionMatch[1]}" not semver`);
    }
    if (!reviewedMatch) {
      errors.push(`${f}: @last-reviewed missing`);
    } else if (!ISO_DATE.test(reviewedMatch[1])) {
      errors.push(`${f}: @last-reviewed "${reviewedMatch[1]}" ≠ YYYY-MM-DD`);
    }
  }
  if (errors.length) {
    console.error(`✗ ${errors.length} hook problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ ${files.length} hooks versioned`);
}

/** Checks that the scripts/ folder exists and that every .ts is non-empty. */
function scriptsCheck(): void {
  const dir = join(ROOT, "scripts");
  if (!existsSync(dir)) {
    console.error("✗ scripts/ folder missing");
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  if (!files.length) {
    console.error("✗ scripts/ contains no .ts");
    process.exit(1);
  }
  for (const f of files) {
    if (!readFileSync(join(dir, f), "utf8").trim()) {
      console.error(`✗ scripts/${f} is empty`);
      process.exit(1);
    }
  }
  const s = files.length > 1 ? "s" : "";
  console.log(`✓ ${files.length} script${s} present`);
}

/**
 * Disambiguation lint: each case in routing-cases.ts must rank its expected
 * skill FIRST, ahead of the neighbours it was written to separate it from.
 * Where `triggers` asks "is this skill findable", this asks "is it the one
 * found" - the question a 36-skill surface actually fails.
 */
function disambiguationCheck(): void {
  const skills = skillDirs().map((dir) => ({
    dir,
    description: parseFrontmatter(readFileSync(join(SKILLS, dir, "SKILL.md"), "utf8")).fm.description ?? "",
  }));
  const fails = routingFailures(ROUTING_CASES, skills);
  if (fails.length) {
    console.error(`✗ ${fails.length} routing case(s) land on the wrong skill:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ ${ROUTING_CASES.length} disambiguation cases route to the right skill, ahead of their neighbours`);
}

/**
 * Agents were the one artifact family nothing validated, and it showed: a
 * description holding an unquoted "Read-only: " made agents/code-reviewer.md
 * load with no metadata at all - no name, no description, no tool list - which
 * only `claude plugin validate` noticed. Same contract as the rest now.
 */
function agentsCheck(): void {
  const dir = join(ROOT, "agents");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const errors = files.flatMap((file) => {
    const raw = readFileSync(join(dir, file), "utf8");
    const { fm } = parseFrontmatter(raw);
    const errs: string[] = unquotedColonProblems(raw, file);
    if (fm.name !== file.replace(/\.md$/, "")) errs.push(`${file}: name "${fm.name}" ≠ file name`);
    if (!fm.description) errs.push(`${file}: description missing`);
    else if (!/use when\b/i.test(fm.description)) errs.push(`${file}: description without a "Use when" trigger`);
    return errs;
  });
  if (errors.length) {
    console.error(`✗ ${errors.length} agent problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ ${files.length} agents conform`);
}

/** Validates rule versioning (parity with skills): semver version + last-reviewed. */
function rulesCheck(): void {
  const files = readdirSync(RULES)
    .filter((f) => f.endsWith(".md"))
    .sort();
  // Each rule also has a human-facing page under docs/rules/ that restates it
  // with the rationale the canonical file deliberately omits (every injected
  // token costs). That restatement can drift, and nothing else watches it.
  const DOCS_RULES = join(ROOT, "docs", "rules");
  const docFiles = existsSync(DOCS_RULES) ? readdirSync(DOCS_RULES).filter((f) => f.endsWith(".md")) : [];

  const errors = files.flatMap((file) => {
    const raw = readFileSync(join(RULES, file), "utf8");
    const { fm } = parseFrontmatter(raw);
    const errs: string[] = unquotedColonProblems(raw, file);
    if (!fm.version) errs.push(`${file}: version missing`);
    else if (!SEMVER.test(fm.version)) errs.push(`${file}: version "${fm.version}" not semver`);
    const reviewed = fm.metadata?.["last-reviewed"];
    if (!reviewed) errs.push(`${file}: metadata.last-reviewed missing`);
    else if (!ISO_DATE.test(reviewed)) errs.push(`${file}: last-reviewed "${reviewed}" ≠ YYYY-MM-DD`);

    const docPath = join(DOCS_RULES, file);
    if (!existsSync(docPath)) {
      errs.push(`${file}: no docs/rules/${file} page`);
    } else {
      const doc = readFileSync(docPath, "utf8");
      const shown = /\|\s*\*\*Version\*\*\s*\|\s*([\d.]+)\s*\|/.exec(doc)?.[1];
      if (!shown) errs.push(`docs/rules/${file}: no Version cell`);
      else if (shown !== fm.version) errs.push(`docs/rules/${file}: documents ${shown}, rule is ${fm.version}`);
      if (!doc.includes(`rules/${file}`)) errs.push(`docs/rules/${file}: does not link its canonical artifact`);
    }
    return errs;
  });
  for (const d of docFiles) {
    if (!files.includes(d)) errors.push(`docs/rules/${d}: documents a rule that no longer exists`);
  }

  if (errors.length) {
    console.error(`✗ ${errors.length} rule problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ ${files.length} rules versioned, each with a matching docs page`);
}

/**
 * Validates the contributor-facing templates. They escape every other check
 * (they are not skills), yet they are the first thing a contributor copies and
 * they render on the repository home. Two regressions already shipped this way:
 * an untranslated French template, and a frontmatter GitHub could not parse.
 */
function templatesCheck(): void {
  const dir = join(ROOT, "docs", "templates");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const errors: string[] = [];
  for (const f of files) {
    const raw = readFileSync(join(dir, f), "utf8");
    errors.push(...unquotedColonProblems(raw, f));
    // Accents alone missed "Quand MOI et pas X"; a few function words catch prose.
    if (/[éèêàçùôîïâûÉÈÀÇ]/.test(raw)) errors.push(`${f}: French characters (the repo is English-facing)`);
    const fr = raw.match(/\b(quand|pour|avec|dans|les|une|qui|sans|sortie|etape|principe)\b/gi);
    if (fr) errors.push(`${f}: French words ${[...new Set(fr.map((w) => w.toLowerCase()))].join(", ")}`);
  }
  if (errors.length) {
    console.error(`✗ ${errors.length} template problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ ${files.length} templates valid`);
}


/**
 * Documentation integrity: catches docs that describe a behavior the code no
 * longer has. Two such defects shipped to users before this existed:
 *  - hooks/README.md, which the installer copies into every adopting repo,
 *    still showed `npx tsx .../hook.ts` wiring after hooks moved to built
 *    `node .../hook.mjs`;
 *  - the README promised "Node only" while the detection scripts still ship
 *    as TypeScript and need tsx.
 * Prose cannot be type-checked, so this asserts the few claims that are
 * mechanically verifiable against the source of truth: the installer itself.
 */
function docsCheck(): void {
  const errors: string[] = [];
  const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

  // 1. Hook wiring shown in docs must match what the installer actually writes.
  const installer = ["install.ts", "src/paths.ts", "src/settings.ts"].map(read).join("\n");
  const shipsMjs = /shippedHookName\s*=.*\.mjs/.test(installer);
  const runsNode = /`\$\{?runtime\}?|`node \$CLAUDE_PROJECT_DIR/.test(installer) || /command = `node /.test(installer);
  const hooksReadme = read("hooks/README.md");
  for (const m of hooksReadme.matchAll(/"command":\s*"([^"]*\/\.claude\/hooks\/[^"]+)"/g)) {
    const cmd = m[1];
    if (shipsMjs && cmd.includes(".ts"))
      errors.push(`hooks/README.md: wiring example runs a .ts hook, but hooks ship built: ${cmd}`);
    if (runsNode && cmd.startsWith("npx tsx"))
      errors.push(`hooks/README.md: wiring example uses npx tsx, but the installer writes node: ${cmd}`);
  }

  // 2. Every hook must be documented, and no phantom hook may be.
  const hookFiles = readdirSync(join(ROOT, "hooks")).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, ""));
  for (const h of hookFiles) {
    if (!hooksReadme.includes(h)) errors.push(`hooks/README.md: ${h} exists but is undocumented`);
  }
  // Only headings name a hook; a backticked .ts anywhere else may legitimately
  // reference the installer or a skill script, which are not hooks.
  // A heading may name a hook, or a skill script that can be wired as one.
  const wirable = new Set(hookFiles);
  for (const sk of readdirSync(SKILLS)) {
    const dir = join(SKILLS, sk, "scripts");
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith(".ts") && !f.endsWith(".test.ts")) wirable.add(f.replace(/\.ts$/, ""));
  }
  for (const m of hooksReadme.matchAll(/^#+\s+`([a-z-]+)\.(?:ts|mjs)`/gm)) {
    if (!wirable.has(m[1])) errors.push(`hooks/README.md: documents ${m[1]}, which no longer exists`);
  }

  // 3. A doc that claims Node alone suffices must not contradict what ships:
  //    skill/standalone scripts are TypeScript and still need tsx.
  const scriptsAreTs = readdirSync(join(ROOT, "scripts")).some((f) => f.endsWith(".ts"));
  const readme = read("README.md");
  if (scriptsAreTs && /needs?\s+\*\*only Node\*\*|\*\*only Node\*\*/.test(readme))
    errors.push('README.md: claims "only Node" while scripts/ still ships TypeScript that needs tsx');

  // 4. A publishable package must not be documented as unpublished. This exact
  //    claim outlived the first publish and sat live on the repository home.
  const pkg = JSON.parse(read("package.json")) as { private?: boolean; name?: string };
  if (!pkg.private && /not (yet )?(on|published to) npm|not on npm yet/i.test(readme))
    errors.push('README.md: says the package is not on npm, but package.json is publishable');

  // 5. A published package should link its registry page.
  if (!pkg.private && !readme.includes(`npmjs.com/package/${pkg.name}`))
    errors.push(`README.md: no link to https://www.npmjs.com/package/${pkg.name}`);

  // 6. Documented commands must name a file that exists.
  for (const rel of ["README.md", "docs/adopting-a-repo.md", "docs/developing.md"]) {
    for (const m of read(rel).matchAll(/npx tsx ((?:tools\/|playground\/)[\w./-]+\.ts)/g)) {
      if (!existsSync(join(ROOT, m[1]))) errors.push(`${rel}: documents ${m[1]}, which does not exist`);
    }
  }

  if (errors.length) {
    console.error(`✗ ${errors.length} documentation problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log("✓ documentation matches what the installer actually does");
}

const cmd = process.argv[2] ?? "validate";
if (cmd === "validate") validate();
else if (cmd === "templates") templatesCheck();
else if (cmd === "docs") docsCheck();
else if (cmd === "list") list();
else if (cmd === "triggers") triggersCheck();
else if (cmd === "rules") rulesCheck();
else if (cmd === "scripts") scriptsCheck();
else if (cmd === "hooks") hooksCheck();
else if (cmd === "agents") agentsCheck();
else if (cmd === "routing") disambiguationCheck();
else {
  console.error("usage: skills.ts <validate|list|triggers|rules|scripts|hooks|agents|templates|docs>");
  process.exit(2);
}
