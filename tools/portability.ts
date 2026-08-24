#!/usr/bin/env tsx
/**
 * Portability gate: the guardrail for the defect class behind issue #2.
 *
 * Six shipped defects came from the same unwritten contract - a hook is launched
 * by an unknown runner, from a path that may hold spaces and backslashes, under
 * a .mjs name its source never had, over files whose line endings depend on the
 * adopter's core.autocrlf. Nine hooks re-implemented that contract from memory
 * and produced three different entry-guard idioms, one of which was dead on
 * win32. A comment saying "do it the right way" had already failed to prevent
 * the second occurrence, so this is a check instead.
 *
 * Two passes, both of which sweep what already exists rather than only new code:
 *
 *   static  - forbids the idioms that silently degrade off Linux
 *   smoke   - runs every BUILT hook from a directory whose name holds a space
 *             and asserts it actually did something
 *
 * The smoke pass is the half that needs a Windows runner to be worth its name;
 * run there it also covers the backslash separator the static pass can only
 * approximate. See docs/postmortems/2026-08-24-hook-portability.md.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Rule {
  /** What is forbidden. */
  pattern: RegExp;
  /** Why, and what to write instead - printed on a hit, so it must be actionable. */
  message: string;
}

const RULES: Rule[] = [
  {
    pattern: /\.split\((["'])\/\1\)/,
    message: 'splitting a path on "/" alone: win32 argv and env paths are all backslashes, so the split never fires. Use path.basename, or split(/[\\\\/]/).',
  },
  {
    pattern: /new URL\([^)]*\)\s*\.pathname/,
    message: 'URL.pathname on a file URL: yields "/C:/a%20b/..." on win32, percent-encoded and with a leading slash. Use fileURLToPath().',
  },
  {
    pattern: /import\.meta\.url\s*\)?\s*\.pathname/,
    message: "import.meta.url .pathname: same percent-encoding trap. Use fileURLToPath(import.meta.url).",
  },
  {
    pattern: /argv\[1\][^\n]*\.(?:endsWith|split)\(/,
    message: "an entry guard that parses argv[1]: it was bound to .ts (dead after the build), then to a '/' basename (dead on win32). Use `import.meta.url === pathToFileURL(process.argv[1] ?? '').href`.",
  },
  {
    pattern: /\/\^?-{3}\\n/,
    message: "an LF-only frontmatter delimiter: a core.autocrlf=true checkout is CRLF and matches none of it. Use \\r?\\n, or normalize the input first.",
  },
  {
    pattern: /startsWith\((["'])---\\n\1\)/,
    message: 'startsWith("---\\n"): same CRLF blind spot, and it degrades to "no frontmatter" rather than to an error.',
  },
];

/**
 * Files whose whole purpose is to contain the forbidden idioms: this checker's
 * own rule table, and the mutation catalog, which reintroduces each defect on
 * purpose to prove a test kills it. Anywhere else, use a `portability:allow`
 * annotation on the line, with a reason.
 */
const EXEMPT = new Set(["tools/portability.ts", "tools/mutations.ts"]);

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["hooks", "src", "tools", "scripts"]) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.endsWith(".ts")) out.push(`${dir}/${f}`);
    }
  }
  return out;
}

/** The one entry guard. Separator-agnostic, and blind to the .ts -> .mjs rename. */
const GUARD = "import.meta.url === pathToFileURL(process.argv[1] ?? '').href";

/**
 * The positive half: forbidding the broken shapes is not enough, because the
 * class was born from someone inventing a THIRD shape next to a working one.
 * A hook that guards its entry point must guard it the agreed way.
 *
 * This lives here rather than in the test suite on purpose: Stryker instruments
 * the hooks it mutates, so an assertion against their source text fails inside
 * its sandbox and aborts the mutation run.
 */
function guardPass(): string[] {
  const dir = join(ROOT, "hooks");
  const problems: string[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, f), "utf8");
    // A hook with no guard runs main() on import. Legitimate when nothing
    // imports it for its exports, so only guarded hooks are constrained.
    if (!/\bisMain\b|\binvoked\b|argv\[1\]/.test(src)) continue;
    if (!src.includes(GUARD)) {
      problems.push(`hooks/${f}  guards its entry point its own way. Use the one idiom:\n    ${GUARD}`);
    }
  }
  return problems;
}

function staticPass(): string[] {
  const problems: string[] = [];
  for (const rel of sourceFiles()) {
    if (EXEMPT.has(rel)) continue;
    const lines = readFileSync(join(ROOT, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return; // prose, not code
      // One-off escape hatch, same shape as the gitleaks:allow this repo's rules
      // already use: annotate the line with a REASON, never disable the check.
      if (/portability:allow\b/.test(line)) return;
      for (const rule of RULES) {
        if (rule.pattern.test(line)) problems.push(`${rel}:${i + 1}  ${rule.message}\n    ${line.trim()}`);
      }
    });
  }
  return problems;
}

/** A payload that makes each hook do something observable, or null if it needs a real session. */
const PAYLOADS: Record<string, unknown> = {
  "truncate-output.mjs": { tool_name: "Bash", tool_input: { command: "cargo build" } },
  "bash-npm-silent.mjs": { tool_name: "Bash", tool_input: { command: "npm ci" } },
  "skill-reminder.mjs": { prompt: "lance un sweep" },
};

function smokePass(): string[] {
  const built = join(ROOT, "dist", "hooks");
  if (!existsSync(built)) return ["dist/hooks is missing: run `npm run build` before the portability gate."];

  // A space in the directory name is the field report's environment, and the
  // cheapest reproduction of it available on any platform.
  const sandbox = join(tmpdir(), "ronce racine portability", "hooks");
  rmSync(dirname(sandbox), { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  for (const f of readdirSync(built).filter((f) => f.endsWith(".mjs"))) {
    writeFileSync(join(sandbox, f), readFileSync(join(built, f), "utf8"));
  }

  const problems: string[] = [];
  for (const [file, payload] of Object.entries(PAYLOADS)) {
    const r = spawnSync(process.execPath, [join(sandbox, file)], {
      encoding: "utf8",
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: "" },
    });
    if (r.error) problems.push(`${file}: could not be spawned from a path with a space (${r.error.message})`);
    else if (r.status !== 0) problems.push(`${file}: exit ${r.status} from a path with a space\n    ${(r.stderr ?? "").trim()}`);
    else if (!(r.stdout ?? "").trim()) {
      problems.push(`${file}: ran from a path with a space and produced NOTHING - the entry guard did not fire. This is how the class always presents: exit 0, empty stdout, indistinguishable from "no work to do".`);
    }
  }
  rmSync(dirname(sandbox), { recursive: true, force: true });
  return problems;
}

function main(): void {
  const problems = [...staticPass(), ...guardPass(), ...smokePass()];
  if (problems.length === 0) {
    console.log(`✓ portability: ${sourceFiles().length} sources, ${Object.keys(PAYLOADS).length} built hooks run from a spaced path (${process.platform})`);
    return;
  }
  console.error(`✗ portability: ${problems.length} problem(s) on ${process.platform}\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) main();
