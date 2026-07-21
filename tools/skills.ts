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
function parseFrontmatter(raw: string): { fm: Frontmatter; body: string } {
  if (!raw.startsWith("---\n")) return { fm: {}, body: raw };
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { fm: {}, body: raw };
  const head = raw.slice(4, end);
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1);
  const fm: Frontmatter = {};
  let inMeta = false;
  for (const line of head.split("\n")) {
    if (!line.trim()) continue;
    const nested = /^  (\S[^:]*?):\s*(.*)$/.exec(line);
    if (inMeta && nested) {
      (fm.metadata ??= {})[nested[1] as "category"] = nested[2].trim();
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

function validateSkill(dir: string): string[] {
  const errs: string[] = [];
  const skillPath = join(SKILLS, dir, "SKILL.md");
  if (!existsSync(skillPath)) return [`${dir}: SKILL.md missing`];
  const { fm, body } = parseFrontmatter(readFileSync(skillPath, "utf8"));

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
    const { fm } = parseFrontmatter(readFileSync(join(RULES, file), "utf8"));
    const errs: string[] = [];
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
    // A ": " inside an unquoted scalar makes the frontmatter invalid YAML.
    for (const line of raw.split("\n---")[0].split("\n")) {
      const m = /^([\w-]+):\s+(.*)$/.exec(line);
      if (m && !/^["'].*["']$/.test(m[2]) && m[2].includes(": "))
        errors.push(`${f}: frontmatter "${m[1]}" holds an unquoted ": " - invalid YAML`);
    }
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

const cmd = process.argv[2] ?? "validate";
if (cmd === "validate") validate();
else if (cmd === "templates") templatesCheck();
else if (cmd === "list") list();
else if (cmd === "triggers") triggersCheck();
else if (cmd === "rules") rulesCheck();
else if (cmd === "scripts") scriptsCheck();
else if (cmd === "hooks") hooksCheck();
else {
  console.error("usage: skills.ts <validate|list|triggers|rules|scripts|hooks>");
  process.exit(2);
}
