#!/usr/bin/env -S npx tsx
/**
 * UserPromptSubmit hook: suggests the relevant skills given the prompt.
 *
 * Self-maintained: reads the skills' descriptions (frontmatter) and matches the
 * quoted triggers + the words of the name against the prompt.
 * NEVER blocks (exit 0 no matter what); emits nothing if there is no match.
 *
 * settings.json wiring (see hooks/README.md) - exec form, no shell involved:
 *   "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node",
 *     "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/skill-reminder.mjs"] }] }]
 *
 * @version 1.1.0
 * @last-reviewed 2026-08-24
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { rankSkills, type SkillVocab } from "./skill-scoring.ts";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_SUGGESTIONS = 3;

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function skillsDir(): string | undefined {
  const candidates = [
    process.env.CLAUDE_PROJECT_DIR && join(process.env.CLAUDE_PROJECT_DIR, ".claude/skills"),
    join(process.cwd(), ".claude/skills"),
    join(process.cwd(), "skills"),
    join(dirname(fileURLToPath(import.meta.url)), "../skills"),
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p));
}

function loadSkills(dir: string): SkillVocab[] {
  const out: SkillVocab[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name, "SKILL.md");
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    // \r?\n, not \n: with core.autocrlf=true (the Git default on Windows) a
    // checkout materializes SKILL.md as CRLF, and an LF-only delimiter matched
    // none of them - the hook then suggested only the skills that happened to
    // stay LF. Same reason the capture is bounded to the line rather than `.*`,
    // which would keep a trailing \r.
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    const desc = fm && /description:\s*([^\r\n]*)/.exec(fm[1]);
    if (desc) out.push({ dir: name, description: desc[1] });
  }
  return out;
}

function main(): void {
  const dir = skillsDir();
  if (!dir) return;

  let prompt = "";
  try {
    prompt = (JSON.parse(readStdin()).prompt || "").toLowerCase();
  } catch {
    return;
  }
  if (!prompt) return;

  const scored = rankSkills(prompt, loadSkills(dir), MAX_SUGGESTIONS);

  // Naming nothing is a legitimate answer: a hook that always names three skills
  // spends its credibility on the prompts that call for none.
  if (!scored.length) return;
  const list = scored.map((s) => s.dir).join(", ");
  console.log(
    `Skills potentially relevant to this request: ${list}. Invoke them via the Skill tool if they apply.`,
  );
}

try {
  main();
} catch {
  /* a hook must never break the session */
}
process.exit(0);
