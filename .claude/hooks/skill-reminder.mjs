#!/usr/bin/env -S npx tsx
/**
 * UserPromptSubmit hook: suggests the relevant skills given the prompt.
 *
 * Self-maintained: reads the skills' descriptions (frontmatter) and matches the
 * quoted triggers + the words of the name against the prompt.
 * NEVER blocks (exit 0 no matter what); emits nothing if there is no match.
 *
 * settings.json wiring (see hooks/README.md):
 *   "UserPromptSubmit": [{ "hooks": [{ "type": "command",
 *     "command": "npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/skill-reminder.ts" }] }]
 *
 * @version 1.0.0
 * @last-reviewed 2026-06-25
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const MIN_TRIGGER_LEN = 4; // ignore triggers that are too short (noise)
const MAX_SUGGESTIONS = 3;
function readStdin() {
    try {
        return readFileSync(0, "utf8");
    }
    catch {
        return "";
    }
}
function skillsDir() {
    const candidates = [
        process.env.CLAUDE_PROJECT_DIR && join(process.env.CLAUDE_PROJECT_DIR, ".claude/skills"),
        join(process.cwd(), ".claude/skills"),
        join(process.cwd(), "skills"),
        join(dirname(fileURLToPath(import.meta.url)), "../skills"),
    ].filter((p) => Boolean(p));
    return candidates.find((p) => existsSync(p));
}
/** A skill's triggers: quoted strings from the description + words of the name. */
function triggers(name, description) {
    const quoted = [...description.matchAll(/"([^"]+)"|«\s*([^»]+?)\s*»/g)].map((m) => m[1] || m[2]);
    const nameWords = name.split("-").filter((w) => w.length >= MIN_TRIGGER_LEN);
    return [...quoted, ...nameWords]
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length >= MIN_TRIGGER_LEN);
}
function loadSkills(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name, "SKILL.md");
        if (!existsSync(p))
            continue;
        const raw = readFileSync(p, "utf8");
        const fm = /^---\n([\s\S]*?)\n---/.exec(raw);
        const desc = fm && /description:\s*(.*)/.exec(fm[1]);
        if (desc)
            out.push({ name, triggers: triggers(name, desc[1]) });
    }
    return out;
}
function main() {
    const dir = skillsDir();
    if (!dir)
        return;
    let prompt = "";
    try {
        prompt = (JSON.parse(readStdin()).prompt || "").toLowerCase();
    }
    catch {
        return;
    }
    if (!prompt)
        return;
    const scored = loadSkills(dir)
        .map((s) => ({ name: s.name, hits: s.triggers.filter((t) => prompt.includes(t)).length }))
        .filter((s) => s.hits > 0)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, MAX_SUGGESTIONS);
    if (!scored.length)
        return;
    const list = scored.map((s) => s.name).join(", ");
    console.log(`Skills potentially relevant to this request: ${list}. Invoke them via the Skill tool if they apply.`);
}
try {
    main();
}
catch {
    /* a hook must never break the session */
}
process.exit(0);
