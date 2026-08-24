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
export interface CommandHook { type: string; command: string; args?: string[] }
export interface EventEntry { matcher?: string; hooks: CommandHook[] }

/**
 * The wiring the installer writes: EXEC FORM, spawned with no shell at all.
 *
 * The shell form (`node $CLAUDE_PROJECT_DIR/.claude/hooks/x.mjs`) shipped until
 * 0.7.0 and broke on any project path containing a space - the shell split the
 * expanded path, and on a Windows box without Git Bash the unbraced variable was
 * never expanded to begin with. Exec form passes each argument verbatim, and
 * `${CLAUDE_PROJECT_DIR}` braced is substituted by Claude Code itself rather
 * than by whatever shell happens to be there.
 *
 * `node` + a script path, never the script as the executable: on Windows exec
 * form needs a real binary, and node.exe is one on every platform.
 */
export function hookCommand(commandFile: string): CommandHook {
  return {
    type: "command",
    command: "node",
    args: [`\${CLAUDE_PROJECT_DIR}/.claude/hooks/${shippedHookName(commandFile)}`],
  };
}

/**
 * Any reference to a shipped hook, whatever shape it takes.
 *
 * The leading separator is optional so a relative `node .claude/hooks/x.mjs`
 * counts, but the character before `.claude` is still constrained, so
 * `/opt/my.claude/hooks/x.mjs` does not. The extension is captured loosely
 * because the same hook has been wired as `.ts` (pre-0.5, run through tsx) and
 * as `.mjs` (since): both name the same hook, and an installer that only
 * recognizes today's spelling appends a duplicate beside yesterday's.
 */
const HOOK_REF = /(?:^|[\\/\s"'=])\.claude[\\/]hooks[\\/]([\w.-]+?)\.(?:mjs|js|ts)(?=$|[\s"'])/;

/**
 * Which shipped hook an entry launches - its LOGICAL identity - or null.
 * Returns the name WITHOUT extension, because the extension is spelling, not
 * identity: `skill-reminder.ts` and `skill-reminder.mjs` are the same wiring.
 *
 * Install and uninstall both need to answer "is this entry mine?", and they used
 * to answer it differently: exact string equality on one side, basename of
 * `command` on the other. Neither survived a wiring rewritten into another valid
 * form, so install appended a duplicate beside the working entry and uninstall
 * walked past it, leaving a wiring that errors on every event. One predicate,
 * used by both, is the fix - anything else drifts apart again.
 */
export function wiredHookName(hook: CommandHook | undefined): string | null {
  if (!hook || typeof hook !== "object") return null;
  for (const token of [hook.command, ...(Array.isArray(hook.args) ? hook.args : [])]) {
    if (typeof token !== "string") continue;
    const m = HOOK_REF.exec(token);
    if (m) return m[1];
  }
  return null;
}

/** The identity of a catalog hook file, in the same space wiredHookName returns. */
export const hookNameOf = (commandFile: string): string => commandFile.replace(/\.(ts|mjs|js)$/, "");

/** Whether an entry already IS what hookCommand would write, down to the args. */
function isCurrentForm(hook: CommandHook, wanted: CommandHook): boolean {
  return hook.command === wanted.command
    && Array.isArray(hook.args)
    && hook.args.length === wanted.args?.length
    && hook.args.every((a, i) => a === wanted.args?.[i]);
}

/**
 * Rewrites a legacy wiring for a hook that is installed but NOT part of this
 * run's selection, and returns how many it repaired.
 *
 * Without this, "re-run the installer to get the fix" is only true for the
 * hooks the current detection happens to select. A hook installed once with
 * --all, or one whose signal has since disappeared from the repo, keeps its
 * broken pre-0.8 wiring while its file sits right there in .claude/hooks.
 *
 * Bounded by `installedFiles`, which comes from the lockfile: hooks WE put
 * there. A hook the user wrote and wired themselves is never touched, even if
 * it lives in the same directory - their shell form may carry a pipe or a
 * `|| true` that exec form cannot express.
 */
function repairUnselected(
  hooks: Record<string, EventEntry[]>,
  installedFiles: string[],
  selected: Set<string>,
): number {
  const repairable = new Map(
    installedFiles
      .map((f) => hookNameOf(f))
      .filter((name) => !selected.has(name))
      .map((name) => [name, hookCommand(`${name}.ts`)]),
  );
  if (repairable.size === 0) return 0;

  let repaired = 0;
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || !Array.isArray(entry.hooks)) continue;
      entry.hooks = entry.hooks.map((h) => {
        const name = wiredHookName(h);
        const wanted = name === null ? undefined : repairable.get(name);
        if (!wanted || isCurrentForm(h, wanted)) return h;
        repaired++;
        return wanted;
      });
    }
  }
  return repaired;
}

export function mergeHookSettings(
  dotclaude: string,
  wirings: HookWiring[],
  /** Hook files the lockfile says are installed. Enables the sweep above. */
  installedFiles: string[] = [],
): { added: number; rewired: number; backedUp: boolean; malformed: boolean } {
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
  let rewired = 0;
  for (const w of wirings) {
    const wanted = hookCommand(w.commandFile);
    const shipped = hookNameOf(w.commandFile);
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
    const mine = entry.hooks.filter((h) => wiredHookName(h) === shipped);
    if (mine.length === 0) {
      entry.hooks.push(wanted);
      added++;
      continue;
    }
    // Already wired, possibly several times and possibly in the fragile pre-0.8
    // shell form. Re-installing is how a user gets the fix, so this repairs in
    // place: one entry, current form. Duplicates are collapsed, not tolerated.
    const stale = mine.filter((h) => !isCurrentForm(h, wanted));
    if (stale.length === 0 && mine.length === 1) continue;
    // In place, at the position it already held - never dropped and re-pushed.
    // Order inside an event is semantic: this repo's own hooks README says
    // PreToolUse `updatedInput` is last-wins, so appending our repaired entry
    // after a hook the user wired themselves would silently flip which rewrite
    // wins. A repair must not change anything but the entry it repairs.
    const first = entry.hooks.findIndex((h) => wiredHookName(h) === shipped);
    entry.hooks = entry.hooks.filter((h, i) => i === first || wiredHookName(h) !== shipped);
    entry.hooks[first] = wanted;
    rewired++;
  }
  rewired += repairUnselected(hooks, installedFiles, new Set(wirings.map((w) => hookNameOf(w.commandFile))));
  const changed = added > 0 || rewired > 0 || malformed;
  const backedUp = existed && changed;
  if (changed) {
    if (backedUp) copyPath(settingsPath, `${settingsPath}.bak`);
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return { added, rewired, backedUp, malformed };
}
