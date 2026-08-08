/**
 * Removing an installation: the inverse of doInstall.
 *
 * Two properties matter more than completeness here. Nothing the installer did
 * not write is ever deleted: removal is driven by the lockfile, tokens are
 * validated before they become paths, every target is checked to sit inside
 * the repository's own `.claude/`, and the hook unwiring only touches the exact
 * commands the installer added. And nothing of the user's is lost: a detached
 * token is left alone, a `.pre-install.bak` is restored over the file the
 * install overwrote, and an artifact carrying local edits is backed up rather
 * than dropped.
 */
import { existsSync, readFileSync, writeFileSync, rmSync, rmdirSync, readdirSync, renameSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tokenPaths, compareToken } from "./lock.js";
import { shippedHookName, ADOPTED_HEADER } from "./paths.js";
import type { EventEntry } from "./settings.js";

/** Directories the installer creates, deepest first so a parent empties before it is tested. */
const OWNED_DIRS = ["rules/shared", "rules", "skills", "hooks", "agents", "scripts"];

/** Errors that mean "this directory is simply not removable", as opposed to a bug. */
const TOLERATED_RMDIR = new Set(["ENOTEMPTY", "EACCES", "EPERM", "EBUSY", "ENOENT", "ENOTDIR"]);

/**
 * Drops the wirings the installer added from settings.json, and nothing else.
 * Matching is by the hook file names recorded in the lockfile, not by "anything
 * under .claude/hooks", so a hook the user wrote and wired themselves survives.
 */
export function unwireHookSettings(dotclaude: string, hookFiles: string[]): { removed: number; unreadable: boolean } {
  const settingsPath = join(dotclaude, "settings.json");
  if (!existsSync(settingsPath)) return { removed: 0, unreadable: false };
  let settings: { hooks?: Record<string, EventEntry[]> } & Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    // Hand-edited into invalid JSON since the install: rewriting it would
    // destroy whatever the user was in the middle of. Say so instead, because
    // the hook files are about to go and the commands launching them would
    // stay, failing on every event with nothing explaining why.
    return { removed: 0, unreadable: true };
  }
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return { removed: 0, unreadable: false };

  const ours = new Set(hookFiles.map((f) => shippedHookName(f)));
  const isOurs = (command: string): boolean => {
    const file = command.split(/[/\\]/).pop() ?? "";
    return command.includes(".claude") && ours.has(file);
  };

  let removed = 0;
  for (const event of Object.keys(hooks)) {
    const entries = hooks[event];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || !Array.isArray(entry.hooks)) continue;
      const before = entry.hooks.length;
      entry.hooks = entry.hooks.filter((h) => !(h && typeof h.command === "string" && isOurs(h.command)));
      removed += before - entry.hooks.length;
    }
    // An entry we emptied was ours; one that was already empty is not our business.
    hooks[event] = entries.filter((e) => !e || !Array.isArray(e.hooks) || e.hooks.length > 0);
    if (hooks[event].length === 0) delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  if (removed === 0) return { removed, unreadable: false };

  // A file reduced to {} only ever held our wiring, so it is ours to clean up -
  // unless a .bak sits next to it, which means the user had one before us.
  if (Object.keys(settings).length === 0 && !existsSync(`${settingsPath}.bak`)) rmSync(settingsPath, { force: true });
  else writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { removed, unreadable: false };
}

/** Removes a directory only once nothing is left in it. */
function removeIfEmpty(dir: string): void {
  if (!existsSync(dir) || readdirSync(dir).length > 0) return;
  try {
    rmdirSync(dir);
  } catch (err) {
    // A directory that will not go is a target-repo condition, not a reason to
    // fail an uninstall that has already done its work. Anything else is a bug.
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (!TOLERATED_RMDIR.has(code)) throw err;
  }
}

export interface UninstallResult {
  removed: string[];
  preserved: string[];
  restored: string[];
  /** Artifacts that had local edits: backed up next to themselves before removal. */
  backedUp: string[];
}

/** Guards against a lockfile token resolving anywhere but the repository's own .claude/. */
function insideDotClaude(repo: string, target: string): boolean {
  const root = resolve(join(repo, ".claude"));
  const p = resolve(target);
  return p === root || p.startsWith(root + sep);
}

/**
 * Deletes the artifacts recorded in `installed`, skipping `detached` ones.
 * Returns what happened per token so the caller can report it.
 */
export function removeArtifacts(repo: string, installed: string[], detached: string[]): UninstallResult {
  const skip = new Set(detached);
  const result: UninstallResult = { removed: [], preserved: [], restored: [], backedUp: [] };
  for (const token of installed) {
    if (skip.has(token)) { result.preserved.push(token); continue; }
    const { inst } = tokenPaths(token, repo);
    if (!insideDotClaude(repo, inst)) continue;
    const backup = `${inst}.pre-install.bak`;
    if (existsSync(inst)) {
      // Local edits are exactly what `check` reports as drift. Uninstall is not
      // the place to discover they are gone, so they leave a copy behind.
      if (compareToken(token, repo) !== null) {
        // An earlier uninstall may already have left one. It holds different
        // user work, so it is numbered rather than overwritten.
        let bak = `${inst}.pre-uninstall.bak`;
        for (let n = 2; existsSync(bak); n++) bak = `${inst}.pre-uninstall.${n}.bak`;
        renameSync(inst, bak);
        result.backedUp.push(token);
      } else {
        rmSync(inst, { recursive: true, force: true });
      }
      result.removed.push(token);
    }
    // The backup holds what was there before the install overwrote it: giving
    // it back is the whole point of having taken it.
    if (existsSync(backup)) {
      renameSync(backup, inst);
      result.restored.push(token);
    }
  }
  return result;
}

/**
 * Rewrites the generated manifest to the rules that survived, removes the hooks
 * README once no hook is left, and drops any directory now empty.
 *
 * Both generated files describe the artifacts around them, so they track what
 * remains rather than being deleted outright: a detached rule still deserves
 * its `.adopted` line, and a hook kept behind still deserves the README saying
 * what it runs.
 */
export function cleanupLayout(repo: string, survivingRules: string[]): void {
  const dotclaude = join(repo, ".claude");
  const manifest = join(dotclaude, "rules/shared/.adopted");
  if (existsSync(manifest)) {
    // From the tokens, never from readdir: the directory also holds the backups
    // we just wrote and the user's own files we just handed back, and listing
    // either as an adopted generic rule invites `install --rules-only` to
    // overwrite them.
    if (survivingRules.length === 0) rmSync(manifest, { force: true });
    else writeFileSync(manifest, `${ADOPTED_HEADER}${[...survivingRules].sort().join("\n")}\n`);
  }
  const hooks = join(dotclaude, "hooks");
  if (existsSync(hooks) && readdirSync(hooks).every((e) => e === "README.md")) {
    rmSync(join(hooks, "README.md"), { force: true });
  }
  for (const dir of OWNED_DIRS) removeIfEmpty(join(dotclaude, dir));
  removeIfEmpty(dotclaude);
}
