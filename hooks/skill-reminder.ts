#!/usr/bin/env -S npx tsx
/**
 * UserPromptSubmit hook: suggests the relevant skills given the prompt.
 *
 * Self-maintained: reads the skills' descriptions (frontmatter) and matches the
 * quoted triggers + the words of the name against the prompt.
 * NEVER blocks (exit 0 no matter what); emits nothing if there is no match.
 *
 * A prompt about a ticket names first the project's ticket skill, when its
 * `.claude/ronce.json` declares one (`ticket.skill`), then bug-ticket-root-cause:
 * the project's form wins over the generic one.
 *
 * settings.json wiring (see hooks/README.md) - exec form, no shell involved:
 *   "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node",
 *     "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/skill-reminder.mjs"] }] }]
 *
 * @version 1.2.0
 * @last-reviewed 2026-11-03
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { rankSkills, type SkillVocab } from "./skill-scoring.ts";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_SUGGESTIONS = 3;
/** A prompt about writing a ticket, in French or English. */
const TICKET_PROMPT = /\b(tickets?|issues?|bug reports?|rapport de bug)\b/i;
const GENERIC_TICKET_SKILL = "bug-ticket-root-cause";
const POLICY_FILE = ".claude/ronce.json";

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

/** The project's ticket skill (`ticket.skill` of its policy file); undefined when it declares none. */
function ticketSkill(): string | undefined {
  const roots = [process.env.CLAUDE_PROJECT_DIR, process.cwd()].filter((p): p is string => Boolean(p));
  const policy = roots.map((root) => join(root, POLICY_FILE)).find((p) => existsSync(p));
  if (!policy) return undefined;
  try {
    const skill = JSON.parse(readFileSync(policy, "utf8"))?.ticket?.skill;
    return typeof skill === "string" && skill.trim() ? skill : undefined;
  } catch {
    return undefined;
  }
}

/** On a ticket prompt: the project's ticket skill first, bug-ticket-root-cause second, then the rest. */
function withTicketSkills(names: string[], prompt: string, available: string[]): string[] {
  const skill = TICKET_PROMPT.test(prompt) ? ticketSkill() : undefined;
  if (!skill) return names;
  const generic = available.includes(GENERIC_TICKET_SKILL) ? [GENERIC_TICKET_SKILL] : [];
  return [...new Set([skill, ...generic, ...names])].slice(0, MAX_SUGGESTIONS);
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

  const skills = loadSkills(dir);
  const scored = rankSkills(prompt, skills, MAX_SUGGESTIONS).map((s) => s.dir);
  const names = withTicketSkills(scored, prompt, skills.map((s) => s.dir));

  // Naming nothing is a legitimate answer: a hook that always names three skills
  // spends its credibility on the prompts that call for none.
  if (!names.length) return;
  const list = names.join(", ");
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
