/**
 * settings.json hook wiring.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shippedHookName } from "./paths.js";
import type { HookWiring } from "./catalog.js";
import { copyPath } from "./lock.js";

/**
 * Deep-merges the selected hook wirings into <repo>/.claude/settings.json.
 * Idempotent (a re-install adds no duplicate wiring), backs up an existing file
 * to settings.json.bak, and preserves any unrelated settings the user already has.
 */
export interface CommandHook { type: string; command: string }
export interface EventEntry { matcher?: string; hooks: CommandHook[] }

export function mergeHookSettings(dotclaude: string, wirings: HookWiring[]): { added: number; backedUp: boolean; malformed: boolean } {
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
  settings.hooks ??= {};
  const hooks = settings.hooks;
  let added = 0;
  for (const w of wirings) {
    const command = `node $CLAUDE_PROJECT_DIR/.claude/hooks/${shippedHookName(w.commandFile)}`;
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
    if (backedUp) copyPath(settingsPath, `${settingsPath}.bak`);
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return { added, backedUp, malformed };
}
