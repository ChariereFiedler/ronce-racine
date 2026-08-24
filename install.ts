#!/usr/bin/env -S npx tsx
/**
 * Smart installer of the generic Claude config into a target repo.
 *
 *   npx tsx install.ts plan    <repo>                  analyzes the project and SUGGESTS what to install (read-only)
 *   npx tsx install.ts install <repo> [--all] [--yes]  interactive selector (TTY); --all pre-checks everything, --yes installs the default without prompting
 *
 * "Smart" = detects the stack (frontend/backend/tests/SQL/migrations/CI/infra/git)
 * and recommends only the relevant artifacts, each with a reason. Copies:
 *   rules   → <repo>/.claude/rules/shared/ (+ .adopted manifest)
 *   skills  → <repo>/.claude/skills/<name>/
 *   scripts → <repo>/.claude/scripts/
 *   hooks   → <repo>/.claude/hooks/
 *   agents  → <repo>/.claude/agents/
 * and prints the settings.json snippet to wire up the hooks.
 *
 * The implementation is split under src/: paths, lock, catalog, detect,
 * settings and selector. This file keeps the commands and the CLI parsing.
 */
import { existsSync, mkdirSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SELF, INVOCATION, LOCKFILE, BUILT_HOOKS, ADOPTED_HEADER, shippedHookName } from "./src/paths.js";
import { CATALOG, type HookWiring, type Item } from "./src/catalog.js";
import { canonicalHash, compareToken, copyPath, describeSource, isStale, loadLock, selfVersion, staleMessage, type Lock } from "./src/lock.js";
import { doPlan, plan } from "./src/detect.js";
import { mergeHookSettings } from "./src/settings.js";
import { unwireHookSettings, removeArtifacts, cleanupLayout } from "./src/uninstall.js";
import { interactiveSelect } from "./src/selector.js";

// Re-exported so importers (and the test suite) keep a single entry point.
export { canonicalHash, copyPath, describeSource, isStale } from "./src/lock.js";
export { CATALOG, type Item } from "./src/catalog.js";
export { hookCommand, wiredHookName, type CommandHook } from "./src/settings.js";
export { applySelectorKey, type SelectorState } from "./src/selector.js";

/**
 * Reads the lockfile, or exits 2 saying why.
 *
 * An unreadable lockfile is never treated as an absent one: the difference is
 * "nothing to do" versus "an installation is on disk that no command can act on
 * safely", and guessing the first is how a command destroys or duplicates work.
 */
function lockOrExit(repo: string, required: boolean): Lock | null {
  const read = loadLock(repo);
  if (read.status === "unreadable") {
    console.error(`Lockfile ${LOCKFILE} is unusable: ${read.reason}.`);
    console.error(`Fix or delete it by hand. Acting on it would risk touching files outside ${join(repo, ".claude")}.`);
    process.exit(2);
  }
  if (read.status === "absent") {
    if (!required) return null;
    console.error(`No lockfile (${LOCKFILE}) - run '${INVOCATION} install ${repo}' first.`);
    process.exit(2);
  }
  return read.lock;
}

async function doInstall(repo: string, opts: { all: boolean; yes: boolean; rulesOnly: boolean; pick: string[]; pickFlag: boolean }): Promise<void> {
  if (opts.pickFlag && opts.pick.length === 0) {
    console.error("--pick requires at least one token (kind:name), e.g. --pick skill:detection-sweep");
    process.exit(2);
  }
  let { picked, optional } = plan(repo);
  if (opts.rulesOnly) {
    picked = picked.filter((i) => i.kind === "rule");
    optional = optional.filter((i) => i.kind === "rule");
  }
  if (opts.pick.length) {
    const tokenOf = (i: Item): string => `${i.kind}:${i.name.replace(/\.md$/, "")}`;
    const unknown = opts.pick.filter((t) => !CATALOG.some((i) => tokenOf(i) === t || `${i.kind}:${i.name}` === t));
    if (unknown.length) {
      console.error(`Unknown pick token(s): ${unknown.join(", ")}`);
      process.exit(2);
    }
    // --rules-only restricts --pick to the rules-only set: a non-rule pick token errors rather than being silently installed anyway.
    if (opts.rulesOnly) {
      const nonRule = opts.pick.filter((t) => !t.startsWith("rule:"));
      if (nonRule.length) {
        console.error(`--rules-only restricts --pick to rule:* tokens; got: ${nonRule.join(", ")}`);
        process.exit(2);
      }
    }
    picked = CATALOG.filter((i) => opts.pick.some((t) => tokenOf(i) === t || `${i.kind}:${i.name}` === t));
    optional = [];
  }
  const candidates = [...picked, ...optional];
  const preChecked = new Set(opts.all ? candidates : picked);

  let items: Item[];
  if (opts.yes || !process.stdin.isTTY) {
    items = [...preChecked];
  } else {
    const sel = await interactiveSelect(candidates, preChecked);
    if (sel === null) { console.log("Cancelled - nothing installed."); return; }
    items = sel;
  }
  if (!items.length) { console.log("No item selected - nothing installed."); return; }
  const dotclaude = join(repo, ".claude");
  if (items.some((i) => i.kind === "hook") && !existsSync(BUILT_HOOKS)) {
    console.error("Hooks are not built. Run 'npm install' (or 'npm run build') in the ronce-racine checkout first.");
    process.exit(2);
  }

  // Preserve deliberately customized (detached) items: never overwrite them on
  // re-install. They stay recorded as installed but their files are left as-is.
  const prevLock = lockOrExit(repo, false);
  const detached = new Set(prevLock?.detached ?? []);
  // Pre-existing content we never installed (first install, or a token added since)
  // is user work: back it up before overwriting instead of silently clobbering it.
  const installedBefore = new Set(prevLock?.installed ?? []);
  let nPreserved = 0;
  let nBackedUp = 0;
  const copyToken = (token: string, src: string, dst: string, recursive = false): void => {
    if (detached.has(token)) { nPreserved++; return; }
    // The FIRST backup is the only one that can hold user work; every later one
    // can only degrade it. Any run that does not reach the lockfile - hook
    // wiring throwing, a Ctrl-C, a lockfile deleted by hand - leaves this repo
    // looking untouched on the next run, while `dst` already holds OUR content.
    // Backing up again would then overwrite the real backup with the canonical
    // file, and on a skill directory it silently produces a HYBRID (the user's
    // extra files kept, the same-named ones canonical) - all under a message
    // telling the user to review the backup before deleting it.
    const backup = `${dst}.pre-install.bak`;
    if (!installedBefore.has(token) && existsSync(dst) && !existsSync(backup)) {
      copyPath(dst, backup);
      nBackedUp++;
    }
    // Test procedures (*.test.ts) and eval manifests (eval.yaml) stay in the canonical repo - never distributed.
    copyPath(src, dst, recursive ? (s: string) => !s.endsWith(".test.ts") && !s.endsWith("eval.yaml") && !s.endsWith("README.md") : undefined);
  };

  const adopted: string[] = [];
  const tokens: string[] = [];
  let nRules = 0;
  let nSkills = 0;
  let nScripts = 0;
  let nAgents = 0;
  let nHooks = 0;
  const collectedWirings: HookWiring[] = [];

  for (const i of items) {
    if (i.kind === "rule") {
      tokens.push(`rule:${i.name}`);
      const dst = join(dotclaude, "rules/shared");
      mkdirSync(dst, { recursive: true });
      copyToken(`rule:${i.name}`, join(SELF, "rules", i.name), join(dst, i.name));
      adopted.push(i.name);
      nRules++;
    } else if (i.kind === "skill") {
      tokens.push(`skill:${i.name}`);
      const dst = join(dotclaude, "skills", i.name);
      copyToken(`skill:${i.name}`, join(SELF, "skills", i.name), dst, true);
      nSkills++;
    } else if (i.kind === "agent") {
      tokens.push(`agent:${i.name}`);
      const dst = join(dotclaude, "agents");
      mkdirSync(dst, { recursive: true });
      copyToken(`agent:${i.name}`, join(SELF, "agents", i.name), join(dst, i.name));
      nAgents++;
    } else if (i.kind === "script") {
      tokens.push(`script:${i.name}`);
      const dst = join(dotclaude, "scripts");
      mkdirSync(dst, { recursive: true });
      copyToken(`script:${i.name}`, join(SELF, "scripts", i.name), join(dst, i.name));
      nScripts++;
    } else if (i.kind === "hook") {
      // One token per copied file (no generic token, to avoid duplicates)
      const hookDir = join(dotclaude, "hooks");
      mkdirSync(hookDir, { recursive: true });
      for (const fileName of i.files ?? [i.name]) {
        copyToken(`hook:${fileName}`, join(BUILT_HOOKS, shippedHookName(fileName)), join(hookDir, shippedHookName(fileName)));
        tokens.push(`hook:${fileName}`);
      }
      if (i.wiring) collectedWirings.push(...i.wiring);
      nHooks++;
    }
  }

  // Copy README.md once if at least one hook is installed
  if (nHooks > 0) {
    const hookDir = join(dotclaude, "hooks");
    mkdirSync(hookDir, { recursive: true });
    const readmeSrc = join(BUILT_HOOKS, "README.md");
    if (existsSync(readmeSrc)) copyPath(readmeSrc, join(hookDir, "README.md"));
  }

  if (adopted.length) {
    const manifest = join(dotclaude, "rules/shared/.adopted");
    writeFileSync(manifest, `${ADOPTED_HEADER + adopted.sort().join("\n")}\n`);
  }

  console.log(`Installed into ${dotclaude}: ${nRules} rules, ${nSkills} skills, ${nScripts} scripts, ${nAgents} agents${nHooks > 0 ? `, ${nHooks} hook(s)` : ""}.`);
  if (nPreserved > 0) console.log(`Preserved ${nPreserved} detached (customized) item(s) - left untouched.`);
  if (nBackedUp > 0) console.log(`⚠ Backed up ${nBackedUp} pre-existing item(s) to *.pre-install.bak - review before deleting (or 'detach' them to keep your version).`);
  if (adopted.length) console.log(`Rules manifest: .claude/rules/shared/.adopted (${adopted.length} rules)`);

  // Hooks BEFORE the lockfile, on purpose. Written first, the lockfile records a
  // complete install even when the wiring below throws, so `check` reports no
  // drift while the hooks the user asked for are absent - a half-install that
  // announces itself as healthy, and stays that way (issue #1).
  if (collectedWirings.length > 0) {
    const settingsPath = join(dotclaude, "settings.json");
    // The lockfile's hooks, so a legacy wiring is repaired even when this run's
    // detection no longer selects that hook (installed once with --all, signal
    // since gone). Without it, "re-run the installer" only fixes what is picked.
    const installedHookFiles = (prevLock?.installed ?? [])
      .filter((t) => t.startsWith("hook:"))
      .map((t) => t.slice("hook:".length));
    const { added, rewired, backedUp, malformed } = mergeHookSettings(dotclaude, collectedWirings, installedHookFiles);
    const backupNote = backedUp && !malformed ? " (backup: settings.json.bak)" : "";
    if (malformed) console.log(`\n⚠ ${settingsPath} was not valid JSON (or its hooks section had an unexpected shape) - backed up to settings.json.bak and rewritten.`);
    if (added > 0) console.log(`${malformed ? "" : "\n"}Wired ${added} hook(s) into ${settingsPath}${backupNote}.`);
    // Worth its own line: it means the wirings that were there did not work, or
    // were duplicated. Folding it into "no change" would hide a repair.
    if (rewired > 0) console.log(`${added > 0 || malformed ? "" : "\n"}Repaired ${rewired} pre-existing wiring(s) to the exec form${added > 0 ? "" : backupNote}.`);
    if (added === 0 && rewired === 0 && !malformed) console.log(`\nHooks already wired in ${settingsPath} - no change.`);
    console.log(`(details: .claude/hooks/README.md)`);
  }

  // Lockfile: preserves the existing detached list (deliberately customized items).
  const lock: Lock = {
    source: { package: "ronce-racine", version: selfVersion(), contentHash: canonicalHash(tokens) },
    installed: tokens.sort(),
    detached: prevLock?.detached ?? [],
  };
  writeFileSync(join(repo, LOCKFILE), `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Lockfile: ${LOCKFILE} (${describeSource(lock.source)}) - drift via 'ronce-racine check .'`);
  console.log(`\nReview the diff then commit (.claude/ travels via git → team + CI).`);
}

/** Drift control (lenient: warns; --strict: exit 1) and staleness check. */
function doCheck(repo: string, strict: boolean): void {
  const lock = lockOrExit(repo, true)!;
  const checked = lock.installed.filter((t) => !lock.detached.includes(t));
  const drift = checked
    .map((t) => ({ t, d: compareToken(t, repo) }))
    .filter((x): x is { t: string; d: string } => x.d !== null);

  for (const { t, d } of drift) console.log(`⚠ drift ${t}: ${d}`);
  if (lock.detached.length) console.log(`(${lock.detached.length} detached item(s) ignored: ${lock.detached.join(", ")})`);

  // The stored hash covers the FULL installed set (see doInstall), so detaching
  // items must not change the comparison basis - compare against lock.installed,
  // not the detach-filtered `checked` list, or staleness would never clear.
  const stale = isStale(lock.source, lock.installed);
  if (stale) console.log(staleMessage(lock.source, repo));

  if (!drift.length) {
    console.log(`✓ ${checked.length} artifacts match the canonical source${stale ? " (but stale)" : ""}.`);
    return;
  }
  console.log(`\n${drift.length} drifted artifact(s). To make a customization official: '${INVOCATION} detach ${repo} <token>'. To resync: '${INVOCATION} install ${repo}'.`);
  if (strict) process.exit(1);
}

/** Detaches items (removes them from drift control - deliberate customization). */
function doDetach(repo: string, tokensToDetach: string[]): void {
  const lock = lockOrExit(repo, true)!;
  const unknown = tokensToDetach.filter((t) => !lock.installed.includes(t));
  if (unknown.length) {
    console.error(`Unknown token(s) (format kind:name): ${unknown.join(", ")}\nInstalled: ${lock.installed.join(", ")}`);
    process.exit(2);
  }
  lock.detached = [...new Set([...lock.detached, ...tokensToDetach])].sort();
  writeFileSync(join(repo, LOCKFILE), `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Detached: ${tokensToDetach.join(", ")} - excluded from drift control.`);
}

/**
 * Removes what the lockfile says was installed, and only that.
 *
 * Deliberately not destructive by default in the ways that would hurt: detached
 * items stay, a `.pre-install.bak` is restored over the file it backed up, and
 * the lockfile goes last, so an interruption leaves a state a re-run can finish
 * rather than an orphaned installation no command can find again.
 */
function doUninstall(repo: string, opts: { dryRun: boolean }): void {
  // Shape and token validation happen in loadLock, for every command at once.
  const lock = lockOrExit(repo, true)!;
  const detached = new Set(lock.detached);
  const removable = lock.installed.filter((t) => !detached.has(t));
  // A detached hook is the one the user customized and wants to keep running,
  // so its wiring stays too: unwiring it would leave a hook that never fires.
  const hookFiles = removable.filter((t) => t.startsWith("hook:")).map((t) => t.slice("hook:".length));
  if (opts.dryRun) {
    console.log(`Would remove ${removable.length} artifact(s) from ${join(repo, ".claude")}:`);
    for (const t of removable) console.log(`  - ${t}${compareToken(t, repo) !== null ? " (locally modified: kept as *.pre-uninstall.bak)" : ""}`);
    if (lock.detached.length) console.log(`Would keep ${lock.detached.length} detached item(s), wiring included: ${lock.detached.join(", ")}`);
    console.log(`Would unwire ${hookFiles.length} hook(s) from .claude/settings.json and delete ${LOCKFILE}.`);
    return;
  }

  // Unwire BEFORE deleting, mirroring doInstall: a failure here leaves the
  // lockfile in place, so the command can simply be run again.
  const { removed: unwired, unreadable } = unwireHookSettings(join(repo, ".claude"), hookFiles);
  const result = removeArtifacts(repo, lock.installed, lock.detached);
  // The lockfile goes before the layout sweep, not after: it lives in .claude/
  // itself, so leaving it for last would keep the directory it is meant to let
  // us remove. Everything destructive is already done by this point.
  rmSync(join(repo, LOCKFILE), { force: true });
  cleanupLayout(repo, lock.detached.filter((t) => t.startsWith("rule:")).map((t) => t.slice("rule:".length)));

  console.log(`Removed ${result.removed.length} artifact(s) from ${join(repo, ".claude")}.`);
  if (unwired > 0) console.log(`Unwired ${unwired} hook(s) from .claude/settings.json.`);
  if (unreadable) console.log(`⚠ .claude/settings.json is not valid JSON - left untouched. Remove the .claude/hooks/*.mjs commands from it by hand, or they will fail on every event.`);
  if (result.backedUp.length) console.log(`⚠ ${result.backedUp.length} artifact(s) had local edits - kept as *.pre-uninstall.bak: ${result.backedUp.join(", ")}`);
  if (result.restored.length) console.log(`Restored ${result.restored.length} pre-install backup(s) over the file they backed up.`);
  if (result.preserved.length) console.log(`Kept ${result.preserved.length} detached (customized) item(s): ${result.preserved.join(", ")}`);
  console.log(`Lockfile deleted. Review the diff then commit.`);
}

/** Collects only the args following "--pick", stopping at the next flag (arg starting with "-"). */
function pickTokens(rest: string[]): string[] {
  const start = rest.indexOf("--pick");
  if (start === -1) return [];
  const tokens: string[] = [];
  for (let i = start + 1; i < rest.length && !rest[i].startsWith("-"); i++) tokens.push(rest[i]);
  return tokens;
}

// Only run the CLI when launched directly (the module stays importable in tests).
// Compares REAL paths: npm/npx install `bin` as a symlink, so process.argv[1]
// stays the symlink path while import.meta.url is already resolved - a direct
// string comparison never matches through that symlink and the CLI silently
// no-ops (exit 0, nothing printed).
const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  const [cmd, repo, ...rest] = process.argv.slice(2);
  const COMMANDS = ["plan", "install", "check", "detach", "uninstall"];
  if (!repo || !COMMANDS.includes(cmd)) {
    console.error(`usage: ${INVOCATION} <plan|install|check|detach|uninstall> <repo> [--all|--yes|--rules-only|--strict|--dry-run|<token...>]`);
    process.exit(2);
  }
  if (!existsSync(repo)) {
    console.error(`repo not found: ${repo}`);
    process.exit(2);
  }
  if (cmd === "plan") doPlan(repo);
  else if (cmd === "install") await doInstall(repo, {
    all: rest.includes("--all"),
    yes: rest.includes("--yes") || rest.includes("-y"),
    rulesOnly: rest.includes("--rules-only"),
    pick: pickTokens(rest),
    pickFlag: rest.includes("--pick"),
  });
  else if (cmd === "check") doCheck(repo, rest.includes("--strict"));
  else if (cmd === "uninstall") doUninstall(repo, { dryRun: rest.includes("--dry-run") });
  else doDetach(repo, rest.filter((a) => !a.startsWith("--")));
}
