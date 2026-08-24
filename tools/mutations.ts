#!/usr/bin/env tsx
/**
 * Mutation harness: proves the behavioral tests can fail.
 *
 * For each declared mutation: break the code under test, run the covering test
 * file, REQUIRE it to fail, restore the original. A mutation that survives
 * (tests stay green on broken code) means a Liar test - the run fails.
 *
 *   npm run test:mutation      (wired into CI; ~1 min, spawns real test files)
 *
 * Why this coexists with Stryker (`npm run test:mutation:inprocess`) rather than
 * being replaced by it: Stryker instruments the code in memory, so it only sees
 * modules a test imports directly. Most of this suite is behavioral and spawns
 * the real hooks and the real CLI as subprocesses, which read the ORIGINAL file
 * from disk and ignore the instrumentation entirely. Measured on 2026-07-21:
 * every subprocess-tested file scored 0% with all its mutants reported as
 * uncovered, while `tools/eval.ts`, which the tests import, scored 79%.
 *
 * This harness mutates on disk, so it works where Stryker structurally cannot.
 * The two are complementary: Stryker for the imported modules, this one for the
 * subprocess-tested ones.
 *
 * Companion of the writing-robust-tests skill (§5 "the test can fail") applied
 * to this repo's own harness.
 *
 * The table below quotes source lines verbatim, `${...}` placeholders included,
 * which is why biome.json turns off noTemplateCurlyInString for this file: here
 * a literal placeholder is the point, not a mistake.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

interface Mutation { name: string; file: string; find: string; replace: string; test: string }

const MUTATIONS: Mutation[] = [
  {
    name: "installer: first-install backup disabled",
    file: "install.ts",
    find: "      copyPath(dst, backup);",
    replace: "      /* mutated */;",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: .test.ts distribution filter removed",
    file: "install.ts",
    find: 'recursive ? (s: string) => !s.endsWith(".test.ts") && !s.endsWith("eval.yaml") && !s.endsWith("README.md") : undefined',
    replace: "undefined",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: bogus hooks-shape guard removed",
    file: "src/settings.ts",
    find: "    malformed = true;\n    delete settings.hooks;",
    replace: "    /* mutated */",
    test: "tests/installer.test.ts",
  },
  {
    name: "selector: group toggle inverted",
    file: "src/selector.ts",
    find: "      if (allOn) state.checked.delete(i);\n      else state.checked.add(i);",
    replace: "      if (allOn) state.checked.add(i);\n      else state.checked.delete(i);",
    test: "tests/selector.test.ts",
  },
  {
    name: "routing: a case no longer has to beat its declared neighbours",
    file: "tools/routing-cases.ts",
    find: "    const lost = c.against.filter((rival) => !(mine > score(rival)));",
    replace: "    const lost = c.against.filter((rival) => !(mine >= score(rival)));",
    test: "tests/routing.test.ts",
  },
  {
    name: "installer: a later run overwrites the backup holding the user's work",
    file: "install.ts",
    find: "    if (!installedBefore.has(token) && existsSync(dst) && !existsSync(backup)) {",
    replace: "    if (!installedBefore.has(token) && existsSync(dst)) {",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: symlinks followed, a dangling one aborts the install",
    file: "src/lock.ts",
    find: "  const stats = lstatSync(src);",
    replace: "  const stats = statSync(src);",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: hook wiring failure swallowed, lockfile written anyway",
    file: "install.ts",
    find: "    const { added, rewired, backedUp, malformed } = mergeHookSettings(dotclaude, collectedWirings, installedHookFiles);",
    replace: "    let added = 0, rewired = 0, backedUp = false, malformed = false;\n    try { ({ added, rewired, backedUp, malformed } = mergeHookSettings(dotclaude, collectedWirings, installedHookFiles)); } catch { /* mutated */ }",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: back to cpSync, which breaks on non-ASCII Windows paths",
    file: "src/lock.ts",
    find: "  copyFileSync(src, dst);",
    replace: "  cpSync(src, dst);",
    test: "tests/installer.test.ts",
  },
  {
    name: "uninstall: lockfile tokens trusted, so a traversal token deletes outside the repo",
    file: "src/lock.ts",
    find: "  if (!isValidToken(token)) throw new Error(`refusing to resolve a malformed token: ${JSON.stringify(token)}`);",
    replace: "",
    test: "tests/installer.test.ts",
  },
  {
    name: "uninstall: a locally modified artifact is deleted instead of backed up",
    file: "src/uninstall.ts",
    find: "      if (compareToken(token, repo) !== null) {",
    replace: "      if (false) {",
    test: "tests/installer.test.ts",
  },
  {
    name: "uninstall: unwires a detached hook, leaving it on disk but never firing",
    file: "install.ts",
    find: "  const hookFiles = removable.filter((t) => t.startsWith(\"hook:\")).map((t) => t.slice(\"hook:\".length));",
    replace: "  const hookFiles = lock.installed.filter((t) => t.startsWith(\"hook:\")).map((t) => t.slice(\"hook:\".length));",
    test: "tests/installer.test.ts",
  },
  {
    name: "uninstall: unwires every hook it finds, including the user's own",
    file: "src/uninstall.ts",
    find: "    return file !== null && ours.has(file);",
    replace: "    return file !== null;",
    test: "tests/installer.test.ts",
  },
  {
    name: "uninstall: deletes detached items the user customized on purpose",
    file: "src/uninstall.ts",
    find: "    if (skip.has(token)) { result.preserved.push(token); continue; }",
    replace: "",
    test: "tests/installer.test.ts",
  },
  {
    name: "uninstall: drops the pre-install backup instead of restoring it",
    file: "src/uninstall.ts",
    find: "      renameSync(backup, inst);",
    replace: "      rmSync(backup, { force: true });",
    test: "tests/installer.test.ts",
  },
  {
    name: "selector: cursor no longer wraps, it runs off the list",
    file: "src/selector.ts",
    find: "else if (k === \"down\" || k === \"j\") state.cursor = (state.cursor + 1) % state.flat.length;",
    replace: "else if (k === \"down\" || k === \"j\") state.cursor = state.cursor + 1;",
    test: "tests/properties.test.ts",
  },
  {
    name: "eval: repo_clean modification detection disabled",
    file: "tools/eval.ts",
    find: "else if (ctx.baseline.get(rel) !== content) dirty.push(`~${rel}`);",
    replace: "",
    test: "tests/eval.test.ts",
  },
  {
    name: "eval: judge anti-leniency downgrade removed",
    file: "tools/eval.ts",
    find: 'verdict: v.verdict === "pass" && v.evidence?.trim() ? "pass" : "fail",',
    replace: "verdict: v.verdict,",
    test: "tests/eval.test.ts",
  },
  {
    name: "eval: inline-object pair matching broken",
    file: "tools/eval.ts",
    find: '/([\\w-]+):\\s*("(?:[^"\\\\]|\\\\.)*"|[^,}]+)/g',
    replace: "/([\\w-]+):\\s*([^,]+)/g",
    test: "tests/eval.test.ts",
  },
  {
    name: "readme-freshness: blocks the push instead of failing open",
    file: "hooks/readme-freshness.ts",
    find: "  if (run.error || run.status !== 0) return",
    replace: "  if (run.error || run.status !== 0) { emit('deny', 'README check unavailable'); return }",
    test: "tests/hooks.test.ts",
  },
  {
    name: "readme-freshness: fires on a --dry-run, which pushes nothing",
    file: "hooks/readme-freshness.ts",
    find: "  if (/--dry-run\\b/.test(cmd)) return false",
    replace: "  /* mutated */",
    test: "tests/hooks.test.ts",
  },
  {
    name: "worktree-env-setup: broken-symlink repair disabled",
    file: "hooks/worktree-env-setup.ts",
    find: "try { unlinkSync(envWt) } catch { return }",
    replace: "return",
    test: "tests/hooks.test.ts",
  },
  {
    name: "truncate-bash-output: truncation disabled",
    file: "hooks/truncate-bash-output.ts",
    find: "if (output.length <= THRESHOLD) return output",
    replace: "if (true) return output",
    test: "tests/hooks.test.ts",
  },
  {
    name: "precommit-scan: blocking exit disabled",
    file: "skills/commit-readiness-review/scripts/precommit-scan.ts",
    find: "process.exit(1);",
    replace: "process.exit(0);",
    test: "skills/commit-readiness-review/scripts/precommit-scan.test.ts",
  },
  {
    name: "sweep: debt detection regex broken",
    file: "skills/detection-sweep/scripts/sweep.ts",
    find: 'row("TODO/FIXME/HACK", /TODO|FIXME|HACK|XXX/);',
    replace: 'row("TODO/FIXME/HACK", /NEVERMATCHXYZ/);',
    test: "skills/detection-sweep/scripts/sweep.test.ts",
  },
  {
    name: "audit-entry-points: usage exit disabled",
    file: "skills/frontend-spec-call-site-audit/scripts/audit-entry-points.ts",
    find: "process.exit(2)",
    replace: "process.exit(0)",
    test: "skills/frontend-spec-call-site-audit/scripts/audit-entry-points.test.ts",
  },
  {
    name: "detect-recurring-fixes: recurrence exit disabled",
    file: "skills/recurring-bug-root-cause/scripts/detect-recurring-fixes.ts",
    find: "process.exit(1)",
    replace: "process.exit(0)",
    test: "skills/recurring-bug-root-cause/scripts/detect-recurring-fixes.test.ts",
  },
  {
    name: "sweep-call-sites: usage exit disabled",
    file: "skills/refactoring-shared-component-api/scripts/sweep-call-sites.ts",
    find: "process.exit(2)",
    replace: "process.exit(0)",
    test: "skills/refactoring-shared-component-api/scripts/sweep-call-sites.test.ts",
  },
  {
    name: "installer: canonicalHash ignores file contents",
    file: "src/lock.ts",
    find: "      h.update(readFileSync(canon));",
    replace: "      /* mutated */;",
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: legacy lockfile treated as stale",
    file: "src/lock.ts",
    find: 'if (typeof s === "string") return false;',
    replace: 'if (typeof s === "string") return true;',
    test: "tests/installer.test.ts",
  },
  {
    name: "installer: staleness compares the wrong token set after detach",
    file: "install.ts",
    find: "isStale(lock.source, lock.installed)",
    replace: "isStale(lock.source, checked)",
    test: "tests/installer.test.ts",
  },
  {
    name: "truncate-output: entry guard bound to the .ts extension",
    file: "hooks/truncate-output.ts",
    find: "const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href",
    replace: "const isMain = (process.argv[1] ?? '').endsWith('truncate-output.ts')",
    test: "tests/hooks.test.ts",
  },
  {
    name: "truncate-output: helper pointed at a file that does not ship",
    file: "hooks/truncate-output.ts",
    find: "const helper = quoteForShell(join(hookDir, 'truncate-bash-output.mjs'))",
    replace: "const helper = `'${hookDir}/truncate-bash-output.ts'`",
    test: "tests/hooks.test.ts",
  },
  {
    name: "truncate-output: hookDir fallback percent-encodes the path",
    file: "hooks/truncate-output.ts",
    find: ": fileURLToPath(new URL('.', import.meta.url)).replace(/[\\\\/]$/, '')",
    replace: ": new URL('.', import.meta.url).pathname.replace(/\\/$/, '')",
    test: "tests/hooks.test.ts",
  },
  {
    name: "skill-reminder: frontmatter delimiter blind to CRLF",
    file: "hooks/skill-reminder.ts",
    find: "const fm = /^---\\r?\\n([\\s\\S]*?)\\r?\\n---/.exec(raw);",
    replace: "const fm = /^---\\n([\\s\\S]*?)\\n---/.exec(raw);",
    test: "tests/hooks.test.ts",
  },
  {
    name: "settings: hook identity reads command only, ignoring args",
    file: "src/settings.ts",
    find: "for (const token of [hook.command, ...(Array.isArray(hook.args) ? hook.args : [])]) {",
    replace: "for (const token of [hook.command]) {",
    test: "tests/installer.test.ts",
  },
  {
    name: "settings: a repaired wiring is appended instead of replaced in place",
    file: "src/settings.ts",
    find: "    entry.hooks[first] = wanted;",
    replace: "    entry.hooks = entry.hooks.filter((h) => wiredHookName(h) !== shipped); entry.hooks.push(wanted);",
    test: "tests/installer.test.ts",
  },
  {
    name: "settings: installed-but-unselected hooks keep their legacy wiring",
    file: "src/settings.ts",
    find: "  rewired += repairUnselected(hooks, installedFiles, new Set(wirings.map((w) => hookNameOf(w.commandFile))));",
    replace: "",
    test: "tests/installer.test.ts",
  },
  {
    name: "truncate-output: rewritten command no longer readable",
    file: "hooks/truncate-output.ts",
    find: "return `TRUNCATE_CMD_B64=${encoded} node ${helper} # ${readable}`",
    replace: "return `TRUNCATE_CMD_B64=${encoded} node ${helper}`",
    test: "tests/hooks.test.ts",
  },
  {
    name: "truncate-output: bounded git commands wrapped for nothing",
    file: "hooks/truncate-output.ts",
    find: "(?!.*(--oneline|--stat|--name-only|--name-status|\\s-\\d+|\\s-n\\s))",
    replace: "",
    test: "tests/hooks.test.ts",
  },
];

// This harness edits tracked files in place. Two concurrent runs corrupt each
// other: the first mutates a file, the second reports its target snippet as
// missing and calls the table stale. Refuse to start rather than mislead.
const LOCK = join(ROOT, ".mutations.lock");
if (existsSync(LOCK)) {
  // The lock records its owner's pid, so a lock left behind by a killed run
  // clears itself. Telling a human to "delete it if no run is active" invites
  // deleting it while one IS active, which is the race the lock exists to stop.
  const owner = Number(readFileSync(LOCK, "utf8").trim());
  let alive = false;
  try { process.kill(owner, 0); alive = true; } catch { alive = false; }
  if (alive) {
    console.error(`✗ mutation run ${owner} is already in progress. Wait for it to finish.`);
    process.exit(2);
  }
  console.error(`- clearing a stale lock from dead process ${owner}`);
  rmSync(LOCK, { force: true });
}
writeFileSync(LOCK, `${process.pid}\n`);
const releaseLock = (): void => { try { rmSync(LOCK, { force: true }); } catch { /* best effort */ } };
process.on("exit", releaseLock);
process.on("SIGINT", () => { releaseLock(); process.exit(130); });

let killed = 0;
const survivors: string[] = [];

for (const m of MUTATIONS) {
  const path = join(ROOT, m.file);
  const original = readFileSync(path, "utf8");
  if (!original.includes(m.find)) {
    survivors.push(`${m.name}: target snippet not found in ${m.file} - mutation table is stale`);
    continue;
  }
  writeFileSync(path, original.replace(m.find, m.replace));
  // Hooks and the CLI are BUILT before they ship, and the tests that matter
  // exercise the built artifact. Mutating the source without rebuilding leaves
  // the test reading the previous, correct output: the mutation survives and
  // the harness reports a Liar test that is really a stale-build artifact.
  const isBuildInput = m.file.startsWith("hooks/") || m.file.startsWith("src/") || m.file === "install.ts";
  try {
    if (isBuildInput) spawnSync(TSX, [join(ROOT, "tools", "build.ts")], { cwd: ROOT, encoding: "utf8" });
    const r = spawnSync(TSX, [join(ROOT, m.test)], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) survivors.push(`${m.name}: tests stayed GREEN on mutated code (Liar test)`);
    else killed++;
  } finally {
    writeFileSync(path, original);
    if (isBuildInput) spawnSync(TSX, [join(ROOT, "tools", "build.ts")], { cwd: ROOT, encoding: "utf8" });
  }
  console.log(`  ${survivors.at(-1)?.startsWith(m.name) ? "✗ survived" : "✓ killed  "} ${m.name}`);
}

if (survivors.length) {
  console.error(`✗ ${survivors.length}/${MUTATIONS.length} mutation(s) survived:\n  ${survivors.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ ${killed}/${MUTATIONS.length} mutations killed - the tests can fail`);
