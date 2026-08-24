#!/usr/bin/env tsx
/**
 * Behavioral tests of the installer (install.ts): plan/install/check/detach,
 * lockfile, drift, detached preservation, first-install guard, settings merge.
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync, symlinkSync, readlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  test, assert, contains, absent, cli, freshRepo, readLock, initWork, finish, WORK, ROOT,
} from "./helpers.js";
import { canonicalHash, CATALOG, copyPath, wiredHookName, type CommandHook } from "../install.js";

initWork();

/**
 * An artifact on disk but absent from CATALOG passes every other gate - it is
 * well-formed, documented, and shipped in the package - while being
 * installable by no command at all. Caught first on the performance-profiling
 * skill, by a real eval run rather than by the suite; the skills-only version
 * of this test then missed `doc-code-parity.md`, a rule with the same defect.
 * Hence every family, in both directions.
 */
const FAMILIES: { kind: string; dir: string; entries: () => string[] }[] = [
  { kind: "skill", dir: "skills", entries: () => readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) },
  { kind: "rule", dir: "rules", entries: () => readdirSync(join(ROOT, "rules")).filter((f) => f.endsWith(".md")) },
  { kind: "agent", dir: "agents", entries: () => readdirSync(join(ROOT, "agents")).filter((f) => f.endsWith(".md")) },
  { kind: "script", dir: "scripts", entries: () => readdirSync(join(ROOT, "scripts")).filter((f) => f.endsWith(".ts")) },
];

test("every artifact on disk is offered by the installer", () => {
  for (const family of FAMILIES) {
    const listed = new Set(CATALOG.filter((i) => i.kind === family.kind).map((i) => i.name));
    const onDisk = family.entries();
    const missing = onDisk.filter((name) => !listed.has(name));
    assert(missing.length === 0, `${family.dir}/ absent from the installer catalog: ${missing.join(", ")}`);
    const orphans = [...listed].filter((name) => !onDisk.includes(name));
    assert(orphans.length === 0, `catalog ${family.kind} entries with nothing on disk: ${orphans.join(", ")}`);
  }
});

/** Hooks are the exception: one catalog entry can carry several files. */
test("every hook on disk is offered by the installer", () => {
  const listed = new Set(
    CATALOG.filter((i) => i.kind === "hook").flatMap((i) => i.files ?? [i.name]),
  );
  const onDisk = readdirSync(join(ROOT, "hooks")).filter((f) => f.endsWith(".ts"));
  const missing = onDisk.filter((name) => !listed.has(name));
  assert(missing.length === 0, `hooks absent from the installer catalog: ${missing.join(", ")}`);
  const orphans = [...listed].filter((name) => !onDisk.includes(name));
  assert(orphans.length === 0, `catalog hook entries with nothing on disk: ${orphans.join(", ")}`);
});

test("plan is read-only (writes nothing into the target)", () => {
  const repo = freshRepo("plan");
  const r = cli(["install.ts", "plan", repo]);
  assert(r.status === 0, `plan exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "Analysis of", "plan should print an analysis");
  assert(!existsSync(join(repo, ".claude")), "plan must NOT create .claude/");
});

test("install writes files + a valid lockfile", () => {
  const repo = freshRepo("install");
  const r = cli(["install.ts", "install", repo]);
  assert(r.status === 0, `install exit ${r.status}: ${r.stderr}`);
  const lock = readLock(repo);
  assert(lock.installed.length > 0, "lockfile should list installed tokens");
  assert(Array.isArray(lock.detached) && lock.detached.length === 0, "detached should start empty");
  assert(typeof lock.source === "object" && lock.source !== null, "lockfile needs a source");
  assert(existsSync(join(repo, ".claude/rules/shared/.adopted")), ".adopted manifest should exist");
});

test("install ships only what the agent consumes, no repo-internal material", () => {
  // Human docs, test procedures and eval manifests explain or verify the
  // toolkit; a target repo's .claude/ holds what the agent reads, nothing else.
  // hooks/README.md is the deliberate exception: hooks RUN on the target's
  // machine, so documenting what executes there is transparency, not clutter.
  const INTERNAL = (rel: string, name: string): boolean =>
    rel.endsWith("/hooks/README.md") ? false
      : name.endsWith(".test.ts") || name === "eval.yaml" || name === "README.md";
  const repo = freshRepo("no-internal-files");
  cli(["install.ts", "install", repo]);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (INTERNAL(p, e.name)) found.push(p);
    }
  };
  walk(join(repo, ".claude"));
  assert(found.length === 0, `repo-internal material must not be distributed: ${found.join(", ")}`);
});

test("check is clean right after install", () => {
  const repo = freshRepo("check-clean");
  cli(["install.ts", "install", repo]);
  const r = cli(["install.ts", "check", repo]);
  assert(r.status === 0, `check exit ${r.status}`);
  contains(r.stdout, "match the canonical", "check should report a clean state");
});

test("a fresh lockfile records package, version and content hash", () => {
  const repo = freshRepo("lock-shape");
  cli(["install.ts", "install", repo, "--yes"]);
  const src = readLock(repo).source as { package: string; version: string; contentHash: string };
  assert(typeof src === "object", `source must be an object, got ${JSON.stringify(src)}`);
  assert(src.package === "ronce-racine", "package name recorded");
  assert(/^\d+\.\d+\.\d+$/.test(src.version), `version must be semver, got ${src.version}`);
  assert(/^sha256-[0-9a-f]{64}$/.test(src.contentHash), "content hash recorded");
});

test("check reports staleness when the recorded hash no longer matches", () => {
  const repo = freshRepo("lock-stale");
  cli(["install.ts", "install", repo, "--yes"]);
  const lock = readLock(repo) as unknown as { source: { contentHash: string } } & Record<string, unknown>;
  lock.source.contentHash = `sha256-${"0".repeat(64)}`;
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), JSON.stringify(lock, null, 2));
  const r = cli(["install.ts", "check", repo]);
  contains(r.stdout, "stale", "a changed content hash must be reported as stale");
});

test("check still accepts a legacy lockfile whose source is a bare SHA", () => {
  const repo = freshRepo("lock-legacy");
  cli(["install.ts", "install", repo, "--yes"]);
  const lock = readLock(repo) as unknown as Record<string, unknown>;
  lock.source = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), JSON.stringify(lock, null, 2));
  const r = cli(["install.ts", "check", repo]);
  assert(r.status === 0, `a legacy lockfile must still check cleanly: ${r.stderr}`);
  absent(r.stdout, "stale", "a clone-era lockfile has no version to compare");
});

test("check detects a modified artifact (soft warns, --strict fails)", () => {
  const repo = freshRepo("check-drift");
  cli(["install.ts", "install", repo]);
  const lock = readLock(repo);
  const ruleTok = lock.installed.find((t) => t.startsWith("rule:"))!;
  const rulePath = join(repo, ".claude/rules/shared", ruleTok.slice("rule:".length));
  writeFileSync(rulePath, `${readFileSync(rulePath, "utf8")}\n# LOCAL EDIT\n`);

  const soft = cli(["install.ts", "check", repo]);
  assert(soft.status === 0, "soft check should not fail the process");
  contains(soft.stdout, "drift", "soft check should report drift");

  const strict = cli(["install.ts", "check", repo, "--strict"]);
  assert(strict.status === 1, `--strict must exit 1 on drift (got ${strict.status})`);
});

test("re-install PRESERVES a detached, customized artifact (data-loss guard)", () => {
  const repo = freshRepo("detach-preserve");
  cli(["install.ts", "install", repo]);
  const ruleTok = readLock(repo).installed.find((t) => t.startsWith("rule:"))!;
  const rulePath = join(repo, ".claude/rules/shared", ruleTok.slice("rule:".length));

  const CUSTOM = "\n# MY DELIBERATE CUSTOMIZATION\n";
  writeFileSync(rulePath, readFileSync(rulePath, "utf8") + CUSTOM);

  const det = cli(["install.ts", "detach", repo, ruleTok]);
  assert(det.status === 0, `detach exit ${det.status}: ${det.stderr}`);
  assert(readLock(repo).detached.includes(ruleTok), "token should be recorded as detached");

  // Re-install: the documented "idempotent" resync must NOT clobber the edit.
  const re = cli(["install.ts", "install", repo]);
  assert(re.status === 0, `re-install exit ${re.status}`);
  contains(readFileSync(rulePath, "utf8"), CUSTOM.trim(), "customization must survive re-install");
});

test("check does not crash when a canonical file was removed upstream", () => {
  const repo = freshRepo("ghost");
  cli(["install.ts", "install", repo]);
  const lock = readLock(repo);
  lock.installed.push("rule:__ghost__.md");
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), JSON.stringify(lock, null, 2));
  writeFileSync(join(repo, ".claude/rules/shared/__ghost__.md"), "orphan\n");

  const r = cli(["install.ts", "check", repo]);
  assert(r.status === 0, `check must not crash (exit ${r.status}): ${r.stderr}`);
  contains(r.stdout, "canonical-removed", "removed canonical should be reported, not thrown");
});

test("detaching an artifact must not make check falsely report staleness (regression)", () => {
  const repo = freshRepo("detach-no-false-stale");
  cli(["install.ts", "install", repo, "--yes"]);

  const clean = cli(["install.ts", "check", repo]);
  assert(clean.status === 0, `check exit ${clean.status}: ${clean.stderr}`);
  absent(clean.stdout, "stale", "a fresh install must not be reported stale");

  const ruleTok = readLock(repo).installed.find((t) => t.startsWith("rule:"))!;
  const det = cli(["install.ts", "detach", repo, ruleTok]);
  assert(det.status === 0, `detach exit ${det.status}: ${det.stderr}`);

  const afterDetach = cli(["install.ts", "check", repo]);
  assert(afterDetach.status === 0, `check exit ${afterDetach.status}: ${afterDetach.stderr}`);
  absent(afterDetach.stdout, "stale", "detaching a token must not shrink the token set used for the stored hash comparison");
});

test("install merges hooks into an existing settings.json (backup + preserve + idempotent)", () => {
  const repo = freshRepo("settings");
  const dc = join(repo, ".claude");
  mkdirSync(dc, { recursive: true });
  const sp = join(dc, "settings.json");
  // A user already has a settings.json with an unrelated hook + custom key.
  writeFileSync(sp, JSON.stringify({
    customKey: "keep me",
    hooks: { Stop: [{ hooks: [{ type: "command", command: "echo bye" }] }] },
  }, null, 2));

  cli(["install.ts", "install", repo]);
  const s1 = JSON.parse(readFileSync(sp, "utf8"));
  assert(s1.customKey === "keep me", "unrelated user setting must be preserved");
  contains(JSON.stringify(s1.hooks), "echo bye", "pre-existing hook must be preserved");
  contains(JSON.stringify(s1.hooks), "skill-reminder.mjs", "the new hook must be wired");
  assert(existsSync(`${sp}.bak`), "an existing settings.json must be backed up before merge");
  const count1 = (JSON.stringify(s1.hooks).match(/\.claude\/hooks\//g) ?? []).length;

  // Re-install: idempotent - no duplicate wiring.
  cli(["install.ts", "install", repo]);
  const s2 = JSON.parse(readFileSync(sp, "utf8"));
  const count2 = (JSON.stringify(s2.hooks).match(/\.claude\/hooks\//g) ?? []).length;
  assert(count2 === count1, `re-install must not duplicate wirings (was ${count1}, now ${count2})`);
});

test("FIRST install backs up a pre-existing artifact instead of clobbering it", () => {
  const repo = freshRepo("first-install-guard");
  // The user already has a homemade rule whose name collides with the catalog.
  // commits.md is always proposed on a git repo (unlike code-signal rules).
  const rulePath = join(repo, ".claude/rules/shared/commits.md");
  mkdirSync(dirname(rulePath), { recursive: true });
  const HOMEMADE = "# my homemade rule - do not lose\n";
  writeFileSync(rulePath, HOMEMADE);

  const r = cli(["install.ts", "install", repo]);
  assert(r.status === 0, `install exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "pre-install.bak", "install should report the backup");
  assert(existsSync(`${rulePath}.pre-install.bak`), "pre-existing file must be backed up");
  assert(readFileSync(`${rulePath}.pre-install.bak`, "utf8") === HOMEMADE, "backup must hold the user's version");
  absent(readFileSync(rulePath, "utf8"), "homemade", "canonical version must be installed in place");

  // Re-install: tokens are now tracked by the lockfile - no second backup pass.
  const r2 = cli(["install.ts", "install", repo]);
  absent(r2.stdout, "pre-install.bak", "re-install must not re-backup tracked items");
});

test("install survives a settings.json whose hooks section has a bogus shape", () => {
  const repo = freshRepo("settings-bogus-hooks");
  const dc = join(repo, ".claude");
  mkdirSync(dc, { recursive: true });
  const sp = join(dc, "settings.json");
  writeFileSync(sp, JSON.stringify({ customKey: "keep me", hooks: "oops" }, null, 2));

  const r = cli(["install.ts", "install", repo]);
  assert(r.status === 0, `install must not crash on bogus hooks (exit ${r.status}): ${r.stderr}`);
  contains(r.stdout, "unexpected shape", "install should report the rebuilt hooks section");
  assert(existsSync(`${sp}.bak`), "original settings.json must be backed up");
  const s = JSON.parse(readFileSync(sp, "utf8"));
  assert(s.customKey === "keep me", "unrelated user setting must survive");
  contains(JSON.stringify(s.hooks), "skill-reminder.mjs", "hooks must be wired after rebuild");
});

test("install survives a malformed (non-JSON) settings.json", () => {
  const repo = freshRepo("settings-malformed");
  const dc = join(repo, ".claude");
  mkdirSync(dc, { recursive: true });
  const sp = join(dc, "settings.json");
  writeFileSync(sp, "{ not json !");

  const r = cli(["install.ts", "install", repo]);
  assert(r.status === 0, `install must not crash on malformed JSON (exit ${r.status}): ${r.stderr}`);
  contains(r.stdout, "was not valid JSON", "install should report the malformed file");
  assert(existsSync(`${sp}.bak`), "malformed original must be backed up");
  contains(JSON.stringify(JSON.parse(readFileSync(sp, "utf8")).hooks), "skill-reminder.mjs", "hooks must be wired");
});

test("hooks ship built, run on plain node, and stay drift-clean", () => {
  // skill-reminder fires on every prompt: 527 ms via npx tsx, 34 ms as built
  // JS on plain node. Compiling at run time is not an option, and a target
  // repo must not need tsx at all.
  const repo = freshRepo("hook-build");
  const r = cli(["install.ts", "install", repo, "--yes"]);
  assert(r.status === 0, `install exit ${r.status}: ${r.stderr}`);

  const hookDir = join(repo, ".claude/hooks");
  const shipped = readdirSync(hookDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".mjs"));
  assert(shipped.length > 0, "at least one hook must be installed");
  assert(shipped.every((f) => f.endsWith(".js") || f.endsWith(".mjs")), `hooks must ship as JS, got ${shipped.join(", ")}`);
  assert(!shipped.some((f) => f.endsWith(".ts")), `hooks must never ship as TypeScript, got ${shipped.join(", ")}`);

  const wiring = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"))
    .hooks.UserPromptSubmit[0].hooks[0] as { command: string; args?: string[] };
  // Exec form: the executable alone in `command`, the script path as one arg.
  // A shell-form string here is the 0.7.0 wiring that died on any path with a
  // space in it, so the shape is asserted, not just the substrings.
  assert(wiring.command === "node", `hooks must run on plain node, got ${wiring.command}`);
  assert(Array.isArray(wiring.args) && wiring.args.length === 1, `wiring must be exec form, got ${JSON.stringify(wiring)}`);
  const scriptArg = wiring.args![0];
  absent(scriptArg, "tsx", "a target repo must not need tsx to run hooks");
  contains(scriptArg, ".mjs", "the wiring must point at the built file");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal ${...} IS the placeholder under test
  contains(scriptArg, "${CLAUDE_PROJECT_DIR}", "the braced placeholder is the one Claude Code substitutes itself");

  // A built artifact still has to be drift-controlled against its source.
  const check = cli(["install.ts", "check", repo]);
  contains(check.stdout, "match the canonical", `a fresh install must be clean: ${check.stdout}`);
});

test("install --rules-only installs rules only (no skills/hooks/settings)", () => {
  const repo = freshRepo("rules-only");
  const r = cli(["install.ts", "install", repo, "--rules-only"]);
  assert(r.status === 0, `--rules-only exit ${r.status}: ${r.stderr}`);
  const lock = readLock(repo);
  assert(lock.installed.length > 0, "should install some rules");
  assert(lock.installed.every((t) => t.startsWith("rule:")), `only rule tokens expected, got ${lock.installed.join(", ")}`);
  assert(!existsSync(join(repo, ".claude/settings.json")), "no hooks → no settings.json");
});

test("detach: exit 2 without a lockfile, exit 2 on an unknown token", () => {
  const bare = freshRepo("detach-no-lock");
  const r1 = cli(["install.ts", "detach", bare, "rule:commits.md"]);
  assert(r1.status === 2, `detach without lockfile must exit 2 (got ${r1.status})`);

  const repo = freshRepo("detach-unknown");
  cli(["install.ts", "install", repo]);
  const r2 = cli(["install.ts", "detach", repo, "rule:__nope__.md"]);
  assert(r2.status === 2, `unknown token must exit 2 (got ${r2.status})`);
});

test("check: exit 2 without a lockfile", () => {
  const bare = freshRepo("check-no-lock");
  const r = cli(["install.ts", "check", bare]);
  assert(r.status === 2, `check without lockfile must exit 2 (got ${r.status})`);
});

test("check reports staleness when the recorded version no longer matches", () => {
  const repo = freshRepo("stale");
  cli(["install.ts", "install", repo]);
  const lock = readLock(repo) as unknown as { source: { version: string } } & Record<string, unknown>;
  lock.source.version = "0.0.0-old";
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), JSON.stringify(lock, null, 2));
  const r = cli(["install.ts", "check", repo]);
  assert(r.status === 0, `stale check exit ${r.status}`);
  contains(r.stdout, "stale", "check should flag the outdated source");
});

test("check reports an installed artifact whose file disappeared (absent)", () => {
  const repo = freshRepo("absent");
  cli(["install.ts", "install", repo]);
  const ruleTok = readLock(repo).installed.find((t) => t.startsWith("rule:"))!;
  rmSync(join(repo, ".claude/rules/shared", ruleTok.slice("rule:".length)));
  const r = cli(["install.ts", "check", repo]);
  assert(r.status === 0, `check exit ${r.status}`);
  contains(r.stdout, "absent", "a deleted installed file must be reported as absent");
});

test("check details per-file drift inside a skill directory (-, ~, +)", () => {
  const repo = freshRepo("skill-drift");
  cli(["install.ts", "install", repo]);
  const skillTok = readLock(repo).installed.find((t) => t.startsWith("skill:"))!;
  const dir = join(repo, ".claude/skills", skillTok.slice("skill:".length));
  writeFileSync(join(dir, "SKILL.md"), "tampered\n");          // ~SKILL.md
  writeFileSync(join(dir, "EXTRA.md"), "added locally\n");     // +EXTRA.md
  const r = cli(["install.ts", "check", repo]);
  contains(r.stdout, "~SKILL.md", "modified file inside the skill must be listed");
  contains(r.stdout, "+EXTRA.md", "extra local file inside the skill must be listed");
});

test("re-install PRESERVES a detached skill DIRECTORY (not just rule files)", () => {
  const repo = freshRepo("detach-skill-dir");
  cli(["install.ts", "install", repo]);
  const skillTok = readLock(repo).installed.find((t) => t.startsWith("skill:"))!;
  const skillMd = join(repo, ".claude/skills", skillTok.slice("skill:".length), "SKILL.md");
  writeFileSync(skillMd, "# my fork of this skill\n");
  cli(["install.ts", "detach", repo, skillTok]);
  cli(["install.ts", "install", repo]);
  contains(readFileSync(skillMd, "utf8"), "my fork", "detached skill dir must survive re-install");
});

test("install --all installs strictly more than the default set", () => {
  const a = freshRepo("all-default");
  cli(["install.ts", "install", a]);
  const b = freshRepo("all-full");
  cli(["install.ts", "install", b, "--all"]);
  const defaults = new Set(readLock(a).installed);
  const full = readLock(b).installed;
  assert(full.length > defaults.size, `--all (${full.length}) must install more than default (${defaults.size})`);
  assert([...defaults].every((t) => full.includes(t)), "--all must be a superset of the default set");
});

test("install --pick installs exactly the named artifact", () => {
  const repo = freshRepo("pick-one");
  const r = cli(["install.ts", "install", repo, "--yes", "--pick", "skill:detection-sweep"]);
  assert(r.status === 0, `--pick exit ${r.status}: ${r.stderr}`);
  const lock = readLock(repo);
  assert(lock.installed.length === 1 && lock.installed[0] === "skill:detection-sweep",
    `expected exactly skill:detection-sweep, got ${lock.installed.join(", ")}`);
  assert(existsSync(join(repo, ".claude/skills/detection-sweep/SKILL.md")), "the skill must be on disk");

  const bad = cli(["install.ts", "install", repo, "--yes", "--pick", "skill:__nope__"]);
  assert(bad.status === 2, `unknown pick token must exit 2 (got ${bad.status})`);
});

test("install --pick with -y alias does not swallow -y as a pick token", () => {
  const repo = freshRepo("pick-dash-y");
  const r = cli(["install.ts", "install", repo, "-y", "--pick", "skill:detection-sweep"]);
  assert(r.status === 0, `-y --pick exit ${r.status}: ${r.stderr}`);
  const lock = readLock(repo);
  assert(lock.installed.length === 1 && lock.installed[0] === "skill:detection-sweep",
    `expected exactly skill:detection-sweep, got ${lock.installed.join(", ")}`);
});

test("install --rules-only --pick <non-rule> errors instead of installing it anyway", () => {
  const repo = freshRepo("pick-rules-only-mismatch");
  const r = cli(["install.ts", "install", repo, "--yes", "--rules-only", "--pick", "skill:detection-sweep"]);
  assert(r.status === 2, `--rules-only --pick <non-rule> must exit 2 (got ${r.status})`);
  assert(!existsSync(join(repo, ".claude/skills/detection-sweep")), "the non-rule pick must NOT be installed");
});

test("install --rules-only --pick <rule> installs exactly that rule", () => {
  const repo = freshRepo("pick-rules-only-match");
  const r = cli(["install.ts", "install", repo, "--yes", "--rules-only", "--pick", "rule:commits.md"]);
  assert(r.status === 0, `--rules-only --pick <rule> exit ${r.status}: ${r.stderr}`);
  const lock = readLock(repo);
  assert(lock.installed.length === 1 && lock.installed[0] === "rule:commits.md",
    `expected exactly rule:commits.md, got ${lock.installed.join(", ")}`);
});

test("install --pick with zero following tokens exits 2 instead of falling back to default install", () => {
  const repo = freshRepo("pick-empty");
  const r = cli(["install.ts", "install", repo, "--yes", "--pick"]);
  assert(r.status === 2, `--pick with no tokens must exit 2 (got ${r.status})`);
  assert(!existsSync(join(repo, ".claude")), "no --pick tokens must NOT trigger a default install");
});

test("plan announces a truncated scan on a huge repo (no silent cap)", () => {
  const repo = freshRepo("huge");
  // Blow past the 6000-entry scan budget with many small files.
  for (let d = 0; d < 7; d++) {
    const dir = join(repo, `pkg${d}`);
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 1000; i++) writeFileSync(join(dir, `f${i}.txt`), "x");
  }
  const r = cli(["install.ts", "plan", repo]);
  assert(r.status === 0, `plan exit ${r.status}`);
  contains(r.stdout, "scan-truncated", "a capped scan must be announced, not silent");

  const small = freshRepo("small");
  writeFileSync(join(small, "index.ts"), "export {}\n");
  const ok = cli(["install.ts", "plan", small]);
  absent(ok.stdout, "scan-truncated", "a small repo must not report truncation");
});

test("CLI errors: unknown command and missing repo both exit 2", () => {
  const r1 = cli(["install.ts", "frobnicate", "."]);
  assert(r1.status === 2, `unknown command must exit 2 (got ${r1.status})`);
  const r2 = cli(["install.ts", "plan", join(WORK, "does-not-exist")]);
  assert(r2.status === 2, `missing repo must exit 2 (got ${r2.status})`);
});

test("canonicalHash is stable, order-independent, and content-sensitive", () => {
  const a = canonicalHash(["rule:commits.md", "rule:minimal-code.md"]);
  const b = canonicalHash(["rule:minimal-code.md", "rule:commits.md"]);
  assert(a === b, "the hash must not depend on token order");
  assert(/^sha256-[0-9a-f]{64}$/.test(a), `unexpected shape: ${a}`);
  const c = canonicalHash(["rule:commits.md"]);
  assert(c !== a, "a different token set must hash differently");
});

test("canonicalHash reacts to file content, not just token names", () => {
  const ruleTokens = ["rule:commits.md"];
  const ruleFile = join(ROOT, "rules/commits.md");
  const originalRule = readFileSync(ruleFile, "utf8");
  try {
    const before = canonicalHash(ruleTokens);
    writeFileSync(ruleFile, `${originalRule}\n// mutated for test\n`);
    const afterEdit = canonicalHash(ruleTokens);
    writeFileSync(ruleFile, originalRule);
    assert(afterEdit !== before, "editing the canonical file content must change the hash");
  } finally {
    writeFileSync(ruleFile, originalRule);
  }

  const skillTokens = ["skill:detection-sweep"];
  const readmeFile = join(ROOT, "skills/detection-sweep/README.md");
  const originalReadme = readFileSync(readmeFile, "utf8");
  try {
    const before = canonicalHash(skillTokens);
    writeFileSync(readmeFile, `${originalReadme}\n// mutated for test\n`);
    const afterEdit = canonicalHash(skillTokens);
    writeFileSync(readmeFile, originalReadme);
    assert(afterEdit === before, "editing an excluded file (README.md) must not change the hash");
  } finally {
    writeFileSync(readmeFile, originalReadme);
  }
});

/**
 * Regression, issue #1. On Windows, `fs.cpSync` onto an EXISTING destination
 * fails when the absolute path holds a non-ASCII character (errno 0, syscall
 * "unlink"); copying onto a fresh path works, so a first install looked fine
 * and the wiring died. That platform cannot be reproduced from here, so what
 * this file guards is the decision: no cpSync in the installer, and copyPath
 * really overwriting - the two properties whose loss would bring the bug back.
 */
test("the installer copies without cpSync (issue #1)", () => {
  // Every installer source, not just the entrypoint: copyPath lives in src/lock.ts,
  // and a guard reading install.ts alone would pass while the bug came back.
  const files = ["install.ts", ...readdirSync(join(ROOT, "src")).filter((f) => f.endsWith(".ts")).map((f) => join("src", f))];
  for (const rel of files) {
    const source = readFileSync(join(ROOT, rel), "utf8");
    // The name still appears in copyPath's comment, explaining why it is avoided.
    const imported = /import \{([^}]*)\} from "node:fs"/.exec(source)?.[1] ?? "";
    assert(!/\bcpSync\b/.test(imported), `${rel} must not import cpSync: it breaks on non-ASCII Windows paths`);
    assert(!/\bcpSync\(/.test(source), `${rel} must not call cpSync: it breaks on non-ASCII Windows paths`);
  }
});

test("copyPath overwrites an existing file and an existing directory", () => {
  const base = join(WORK, "copypath");
  mkdirSync(join(base, "src", "nested"), { recursive: true });
  writeFileSync(join(base, "src", "a.txt"), "new");
  writeFileSync(join(base, "src", "nested", "b.test.ts"), "excluded");
  writeFileSync(join(base, "src", "nested", "c.md"), "kept");

  // File onto an existing file.
  writeFileSync(join(base, "target.txt"), "old");
  copyPath(join(base, "src", "a.txt"), join(base, "target.txt"));
  assert(readFileSync(join(base, "target.txt"), "utf8") === "new", "copyPath must overwrite an existing file");

  // Directory onto an existing directory, with the distribution filter.
  mkdirSync(join(base, "dst"), { recursive: true });
  writeFileSync(join(base, "dst", "a.txt"), "old");
  copyPath(join(base, "src"), join(base, "dst"), (s) => !s.endsWith(".test.ts"));
  assert(readFileSync(join(base, "dst", "a.txt"), "utf8") === "new", "copyPath must overwrite inside an existing directory");
  assert(readFileSync(join(base, "dst", "nested", "c.md"), "utf8") === "kept", "copyPath must recurse into subdirectories");
  assert(!existsSync(join(base, "dst", "nested", "b.test.ts")), "the filter must exclude what it rejects");
});

/**
 * Second half of issue #1: the lockfile was written BEFORE the hooks were
 * wired, so a crash during wiring left a repo recording a complete install.
 * `check` then reported no drift while the hooks were absent - a half-install
 * that stays silent for the life of the project.
 */
test("a failed hook wiring leaves no lockfile behind (issue #1)", () => {
  if (process.getuid?.() === 0) return; // root ignores the read-only bit
  const repo = freshRepo("wiring-failure");
  const dotclaude = join(repo, ".claude");
  mkdirSync(dotclaude, { recursive: true });
  const settings = join(dotclaude, "settings.json");
  writeFileSync(settings, "{}\n");
  chmodSync(settings, 0o444); // wiring must fail on write

  try {
    const r = cli(["install.ts", "install", repo, "--yes"]);
    assert(r.status !== 0, "an install whose hook wiring fails must not exit 0");
    assert(!existsSync(join(repo, ".claude/.ronce-racine.json")), "a failed install must not record itself as complete");
  } finally {
    chmodSync(settings, 0o644);
  }
});

/**
 * The two findings of an external review of the issue #1 fix. Both come from
 * the same root: ANY run that does not reach the lockfile - wiring throwing,
 * Ctrl-C, a lockfile deleted by hand - leaves the repo looking untouched to the
 * next run, while the destination already holds OUR content.
 */
test("a second install after a failed one does not destroy the first backup", () => {
  if (process.getuid?.() === 0) return; // root ignores the read-only bit
  const repo = freshRepo("backup-preserved");
  const rulePath = join(repo, ".claude/rules/shared/commits.md");
  mkdirSync(dirname(rulePath), { recursive: true });
  const USER_WORK = "MY OWN VERSION\n";
  writeFileSync(rulePath, USER_WORK);

  // Run 1: wiring fails, so no lockfile is written - the invariant working.
  const settings = join(repo, ".claude/settings.json");
  writeFileSync(settings, "{}\n");
  chmodSync(settings, 0o444);
  cli(["install.ts", "install", repo, "--yes"]);
  const backup = `${rulePath}.pre-install.bak`;
  assert(readFileSync(backup, "utf8") === USER_WORK, "run 1 must back up the user's version");

  // Run 2: the user retries. Without a lockfile the installer believes nothing
  // was ever installed, and would back up its OWN content over the real backup.
  chmodSync(settings, 0o644);
  cli(["install.ts", "install", repo, "--yes"]);
  assert(readFileSync(backup, "utf8") === USER_WORK, "run 2 must not overwrite the backup with canonical content");
});

test("a dangling symlink in the target does not abort the install", () => {
  const repo = freshRepo("dangling-symlink");
  // Code signals, so detection-sweep is actually part of the proposed set.
  writeFileSync(join(repo, "package.json"), '{"name":"x"}\n');
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/a.ts"), "export const a = 1\n");
  const skillDir = join(repo, ".claude/skills/detection-sweep");
  mkdirSync(skillDir, { recursive: true });
  symlinkSync("/nowhere/missing.md", join(skillDir, "dangling.md"));

  const r = cli(["install.ts", "install", repo, "--yes"]);
  assert(r.status === 0, `a dangling symlink must not abort the install: ${r.stderr}`);
  assert(existsSync(join(repo, ".claude/.ronce-racine.json")), "the install must complete");
  // Recreated as a link, like cpSync without dereference - not followed.
  const copied = join(repo, ".claude/skills/detection-sweep.pre-install.bak/dangling.md");
  assert(readlinkSync(copied) === "/nowhere/missing.md", "the backup must preserve the link itself");
});

/**
 * Uninstall. The risk is not "does it delete", it is "does it delete only what
 * it put there": a target's .claude/ also holds the user's own hooks, settings
 * and customized artifacts, and an uninstall that takes those with it is worse
 * than no uninstall at all.
 */
test("uninstall removes the installed artifacts and the lockfile", () => {
  const repo = freshRepo("uninstall");
  cli(["install.ts", "install", repo, "--yes"]);
  const lock = readLock(repo);
  assert(lock.installed.length > 0, "precondition: something was installed");

  const r = cli(["install.ts", "uninstall", repo]);
  assert(r.status === 0, `uninstall exit ${r.status}: ${r.stderr}`);
  assert(!existsSync(join(repo, ".claude/.ronce-racine.json")), "the lockfile must be gone");
  for (const token of lock.installed) {
    const [kind, name] = token.split(":");
    const dir = { rule: "rules/shared", skill: "skills", agent: "agents", script: "scripts", hook: "hooks" }[kind]!;
    const suffix = kind === "hook" ? name.replace(/\.ts$/, ".mjs") : name;
    assert(!existsSync(join(repo, ".claude", dir, suffix)), `${token} must be removed`);
  }
});

test("uninstall --dry-run writes nothing", () => {
  const repo = freshRepo("uninstall-dry");
  cli(["install.ts", "install", repo, "--yes"]);
  const before = readFileSync(join(repo, ".claude/.ronce-racine.json"), "utf8");
  const r = cli(["install.ts", "uninstall", repo, "--dry-run"]);
  assert(r.status === 0, `dry-run exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "Would remove", "dry-run should describe what it would do");
  assert(readFileSync(join(repo, ".claude/.ronce-racine.json"), "utf8") === before, "dry-run must not touch the lockfile");
  const lock = readLock(repo);
  const rule = lock.installed.find((t) => t.startsWith("rule:"))!.slice("rule:".length);
  assert(existsSync(join(repo, ".claude/rules/shared", rule)), "dry-run must not delete anything");
});

test("uninstall keeps a detached artifact and the user's own hook wiring", () => {
  const repo = freshRepo("uninstall-preserve");
  cli(["install.ts", "install", repo, "--yes"]);
  const lock = readLock(repo);
  const ruleTok = lock.installed.find((t) => t.startsWith("rule:"))!;
  cli(["install.ts", "detach", repo, ruleTok]);

  // A hook the user wired themselves, in the same settings.json and the same event.
  const settingsPath = join(repo, ".claude/settings.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  settings.hooks.UserPromptSubmit ??= [];
  settings.hooks.UserPromptSubmit.push({ hooks: [{ type: "command", command: "node $CLAUDE_PROJECT_DIR/.claude/hooks/mine.mjs" }] });
  settings.permissions = { allow: ["Bash(ls:*)"] };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  const r = cli(["install.ts", "uninstall", repo]);
  assert(r.status === 0, `uninstall exit ${r.status}: ${r.stderr}`);
  assert(existsSync(join(repo, ".claude/rules/shared", ruleTok.slice("rule:".length))), "a detached artifact must survive");

  const after = JSON.parse(readFileSync(settingsPath, "utf8"));
  const events = Object.values(after.hooks ?? {}) as { hooks?: { command: string }[] }[][];
  const commands = events.flat().flatMap((e) => e.hooks ?? []).map((h) => h.command);
  assert(commands.some((c: string) => c.endsWith("mine.mjs")), "the user's own hook wiring must survive");
  assert(!commands.some((c: string) => c.endsWith("skill-reminder.mjs")), "the installed hooks must be unwired");
  assert(after.permissions?.allow?.[0] === "Bash(ls:*)", "unrelated settings must survive");
});

test("uninstall restores the file the install backed up", () => {
  const repo = freshRepo("uninstall-restore");
  const USER_WORK = "# my own version\n";
  const rulePath = join(repo, ".claude/rules/shared/commits.md");
  mkdirSync(dirname(rulePath), { recursive: true });
  writeFileSync(rulePath, USER_WORK);

  cli(["install.ts", "install", repo, "--yes", "--pick", "rule:commits"]);
  assert(readFileSync(rulePath, "utf8") !== USER_WORK, "precondition: the install overwrote the user's file");

  cli(["install.ts", "uninstall", repo]);
  assert(readFileSync(rulePath, "utf8") === USER_WORK, "uninstall must give the user's file back");
  assert(!existsSync(`${rulePath}.pre-install.bak`), "the consumed backup must not be left behind");
});

/**
 * The lockfile is a COMMITTED file in the target repo, so its tokens come from
 * whatever branch is checked out. uninstall is the first command that deletes
 * on their strength, which makes an unvalidated token a path traversal.
 */
test("uninstall refuses a lockfile holding a traversal token", () => {
  const repo = freshRepo("uninstall-traversal");
  cli(["install.ts", "install", repo, "--yes"]);
  const victim = join(WORK, "victim.txt");
  writeFileSync(victim, "do not delete me\n");
  const lock = readLock(repo) as unknown as { installed: string[] } & Record<string, unknown>;
  lock.installed.push("hook:../../../victim.txt");
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), JSON.stringify(lock, null, 2));

  // Validation lives in the parsing boundary, so EVERY command refuses it:
  // check is the CI gate, and detach used to write the bad token back out.
  for (const cmd of ["uninstall", "check", "detach"]) {
    const r = cli(["install.ts", cmd, repo, ...(cmd === "detach" ? ["rule:commits.md"] : [])]);
    assert(r.status === 2, `${cmd}: expected a refusal (exit 2), got ${r.status}`);
    contains(r.stderr, "malformed token", `${cmd} should name the problem`);
  }
  assert(existsSync(victim), "a path outside .claude must never be deleted");
  assert(existsSync(join(repo, ".claude/.ronce-racine.json")), "a refused run must change nothing");
});

test("an unreadable lockfile is not reported as an absent one", () => {
  const repo = freshRepo("lock-unparseable");
  cli(["install.ts", "install", repo, "--yes"]);
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), "{ broken json");
  const r = cli(["install.ts", "uninstall", repo]);
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  contains(r.stderr, "not valid JSON", "an installation on disk must not be called 'nothing to uninstall'");
  absent(r.stderr, "No lockfile", "that message would be a lie here");
});

test("uninstall keeps a pre-uninstall backup out of the .adopted manifest", () => {
  const repo = freshRepo("uninstall-adopted-bak");
  cli(["install.ts", "install", repo, "--yes", "--pick", "rule:commits", "rule:minimal-code"]);
  const edited = join(repo, ".claude/rules/shared/commits.md");
  writeFileSync(edited, `${readFileSync(edited, "utf8")}\n# local edit\n`);
  cli(["install.ts", "detach", repo, "rule:minimal-code.md"]);

  cli(["install.ts", "uninstall", repo]);
  const manifest = readFileSync(join(repo, ".claude/rules/shared/.adopted"), "utf8");
  absent(manifest, ".bak", "a backup is not an adopted generic rule");
  const listed = manifest.split("\n").filter((l) => l && !l.startsWith("#"));
  assert(listed.length === 1 && listed[0] === "minimal-code.md", `only the surviving rule belongs there, got: ${listed.join(", ")}`);
});

test("uninstall refuses a lockfile whose installed list is not a list", () => {
  const repo = freshRepo("uninstall-shape");
  cli(["install.ts", "install", repo, "--yes"]);
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), JSON.stringify({ source: "x", detached: [] }, null, 2));
  const r = cli(["install.ts", "uninstall", repo]);
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  contains(r.stderr, "lists of strings", "it should say what is wrong");
});

test("uninstall leaves no empty directories behind", () => {
  const repo = freshRepo("uninstall-empty");
  cli(["install.ts", "install", repo, "--yes"]);
  cli(["install.ts", "uninstall", repo]);
  assert(!existsSync(join(repo, ".claude")), ".claude/ must be gone when nothing of the user's was in it");
});

test("uninstall keeps the wiring of a detached hook", () => {
  const repo = freshRepo("uninstall-detached-hook");
  cli(["install.ts", "install", repo, "--yes"]);
  const hookTok = readLock(repo).installed.find((t) => t.startsWith("hook:"))!;
  cli(["install.ts", "detach", repo, hookTok]);

  cli(["install.ts", "uninstall", repo]);
  const mjs = hookTok.slice("hook:".length).replace(/\.ts$/, ".mjs");
  assert(existsSync(join(repo, ".claude/hooks", mjs)), "a detached hook must survive on disk");
  const settings = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"));
  const events = Object.values(settings.hooks ?? {}) as { hooks?: { command: string; args?: string[] }[] }[][];
  // The whole invocation, not just `command`: in exec form the script path lives
  // in args, and reading `command` alone is exactly the blind spot that made
  // uninstall walk past its own wirings.
  const invocations = events.flat().flatMap((e) => e.hooks ?? []).map((h) => [h.command, ...(h.args ?? [])].join(" "));
  assert(invocations.some((c) => c.endsWith(mjs)), "a hook kept on disk must keep its wiring, or it never fires again");
});

test("uninstall keeps a locally modified artifact as a backup", () => {
  const repo = freshRepo("uninstall-drift");
  cli(["install.ts", "install", repo, "--yes"]);
  const ruleTok = readLock(repo).installed.find((t) => t.startsWith("rule:"))!;
  const rulePath = join(repo, ".claude/rules/shared", ruleTok.slice("rule:".length));
  const EDIT = `${readFileSync(rulePath, "utf8")}\n# my local edit\n`;
  writeFileSync(rulePath, EDIT);

  const r = cli(["install.ts", "uninstall", repo]);
  assert(r.status === 0, `uninstall exit ${r.status}: ${r.stderr}`);
  assert(!existsSync(rulePath), "the artifact itself is still removed");
  assert(readFileSync(`${rulePath}.pre-uninstall.bak`, "utf8") === EDIT, "a local edit must not vanish silently");
  contains(r.stdout, "pre-uninstall.bak", "the user must be told the backup exists");
});

test("uninstall rewrites the .adopted manifest to the rules that survive", () => {
  const repo = freshRepo("uninstall-adopted");
  cli(["install.ts", "install", repo, "--yes"]);
  const ruleTok = readLock(repo).installed.find((t) => t.startsWith("rule:"))!;
  cli(["install.ts", "detach", repo, ruleTok]);

  cli(["install.ts", "uninstall", repo]);
  const manifest = readFileSync(join(repo, ".claude/rules/shared/.adopted"), "utf8");
  const listed = manifest.split("\n").filter((l) => l && !l.startsWith("#"));
  assert(listed.length === 1 && listed[0] === ruleTok.slice("rule:".length), `the manifest must list only what is left, got: ${listed.join(", ")}`);
});

test("uninstall without a lockfile exits 2 rather than guessing", () => {
  const repo = freshRepo("uninstall-nolock");
  const r = cli(["install.ts", "uninstall", repo]);
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  contains(r.stderr, "No lockfile", "it should say why it refused");
});

// ---- hook wiring identity: install and uninstall must agree ----------------

/** Every hook invocation in a settings.json, flattened, form-agnostic. */
function wirings(repo: string): string[] {
  const settings = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"));
  const events = Object.values(settings.hooks ?? {}) as { hooks?: { command: string; args?: string[] }[] }[][];
  return events.flat().flatMap((e) => e.hooks ?? []).map((h) => [h.command, ...(h.args ?? [])].join(" "));
}

/** The placeholder Claude Code substitutes. A literal here, never interpolated. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: this literal IS the placeholder under test
const DIR = "${CLAUDE_PROJECT_DIR}";

test("hook identity survives every wiring shape a Windows adopter can have", () => {
  // The half of the win32 behavior that is pure logic, so it is pinned HERE
  // rather than only on the Windows runner: string shapes go in, an identity
  // comes out. A backslash separator, a settings.json hand-edited on Windows, a
  // legacy .ts path, a quoted shell form - all name the same hook, and both
  // install and uninstall must see that. Reading `command` alone saw none of
  // the exec-form ones, which is how uninstall left dangling wirings behind.
  const same: CommandHook[] = [
    { type: "command", command: "node", args: [`${DIR}/.claude/hooks/skill-reminder.mjs`] },
    { type: "command", command: "node", args: ["C:\\Users\\First LAST\\proj\\.claude\\hooks\\skill-reminder.mjs"] },
    { type: "command", command: "node $CLAUDE_PROJECT_DIR/.claude/hooks/skill-reminder.mjs" },
    { type: "command", command: `node "${DIR}"/.claude/hooks/skill-reminder.mjs` },
    { type: "command", command: `npx tsx ${DIR}/.claude/hooks/skill-reminder.ts` },
  ];
  for (const hookEntry of same) {
    // Identity is the NAME, not the spelling: a pre-0.5 `.ts` wiring and a
    // current `.mjs` one are the same hook, and treating them as different is
    // how a re-install ends up appending a duplicate beside the old entry.
    const got = wiredHookName(hookEntry);
    assert(got === "skill-reminder", `${JSON.stringify(hookEntry)} must resolve to skill-reminder, got ${got}`);
  }

  // And it must NOT claim a hook that simply is not ours: a user's own script,
  // or one living outside .claude/hooks. Over-claiming here would make
  // uninstall delete wirings it never wrote.
  const foreign: CommandHook[] = [
    { type: "command", command: "node", args: [`${DIR}/scripts/my-own.mjs`] },
    { type: "command", command: "prettier --write ." },
    { type: "command", command: "node", args: [`${DIR}/.claude/other/skill-reminder.mjs`] },
  ];
  for (const hookEntry of foreign) {
    assert(wiredHookName(hookEntry) === null, `${JSON.stringify(hookEntry)} is not ours and must not be claimed`);
  }
});

// The positive counterpart - "every guarded hook uses THE one idiom" - is a
// static check, and it lives in tools/portability.ts rather than here. Stryker
// instruments the hooks it mutates, so any assertion made against their source
// TEXT fails in the sandbox and aborts the whole mutation run.

test("install repairs a legacy shell-form wiring instead of duplicating it", () => {
  // What a 0.7.0 user has on disk. Recognizing our own entry by exact string
  // equality meant any rewritten form went unrecognized: the next install
  // appended the fragile entry BESIDE the working one, so the hook fired twice
  // per event and the shell copy failed on every path containing a space.
  const repo = freshRepo("wiring-legacy");
  const dotclaude = join(repo, ".claude");
  mkdirSync(dotclaude, { recursive: true });
  writeFileSync(join(dotclaude, "settings.json"), `${JSON.stringify({
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: "command", command: "node $CLAUDE_PROJECT_DIR/.claude/hooks/skill-reminder.mjs" }] }],
    },
  }, null, 2)}\n`);

  const r = cli(["install.ts", "install", repo, "--yes"]);
  assert(r.status === 0, `install exit ${r.status}: ${r.stderr}`);

  const reminder = wirings(repo).filter((w) => w.includes("skill-reminder.mjs"));
  assert(reminder.length === 1, `exactly one skill-reminder wiring must remain, got ${reminder.length}: ${reminder.join(" | ")}`);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal ${...} IS the placeholder under test
  contains(reminder[0], "${CLAUDE_PROJECT_DIR}", "the surviving wiring must be the repaired one");
  absent(reminder[0], "node $CLAUDE_PROJECT_DIR", "the fragile shell form must be gone, not kept alongside");
  contains(r.stdout, "Repaired", "a repair must be reported, never folded into 'no change'");
});

test("a legacy wiring is repaired even when this run does not select that hook", () => {
  // "Re-run the installer to get the fix" was only true for hooks the current
  // detection happens to pick. One installed with --all, or whose signal has
  // since left the repo, kept its broken pre-0.8 wiring while its .mjs sat
  // right there in .claude/hooks - a hook that errors on every event, and a
  // recovery path that quietly did not cover it.
  const repo = freshRepo("wiring-unselected");
  cli(["install.ts", "install", repo, "--all", "--yes"]);

  // An OPTIONAL hook specifically: those are the ones a plain re-install does
  // not pick, which is the whole point. Picking whichever hook came first made
  // this test pass against the unfixed code, because it landed on one that is
  // always selected anyway.
  const optionalHook = CATALOG.find((i) => i.kind === "hook" && i.optional)!;
  const degraded = optionalHook.name.replace(/\.ts$/, "");
  assert(readLock(repo).installed.includes(`hook:${optionalHook.name}`), `--all must install ${degraded}`);

  const settingsPath = join(repo, ".claude/settings.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  let found = false;
  for (const entries of Object.values(settings.hooks) as { hooks: CommandHook[] }[][]) {
    for (const entry of entries) {
      for (let i = 0; i < entry.hooks.length; i++) {
        if (wiredHookName(entry.hooks[i]) !== degraded) continue;
        // Back to the exact 0.7.0 shell form, by hand.
        entry.hooks[i] = { type: "command", command: `node $CLAUDE_PROJECT_DIR/.claude/hooks/${degraded}.mjs` };
        found = true;
      }
    }
  }
  assert(found, `${degraded} must be wired after --all for this test to mean anything`);
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

  // A plain re-install: no --all, so the optional hooks are NOT selected again.
  const r = cli(["install.ts", "install", repo, "--yes"]);
  assert(r.status === 0, `re-install exit ${r.status}: ${r.stderr}`);

  const after = JSON.parse(readFileSync(settingsPath, "utf8"));
  const all = (Object.values(after.hooks) as { hooks: CommandHook[] }[][])
    .flat().flatMap((e) => e.hooks);
  const target = all.filter((h) => wiredHookName(h) === degraded);
  assert(target.length === 1, `expected exactly one ${degraded} wiring, got ${target.length}`);
  assert(target[0].command === "node" && Array.isArray(target[0].args),
    `${degraded} was installed but left in the broken shell form: ${JSON.stringify(target[0])}`);
});

test("repairing a wiring keeps its position among the user's own hooks", () => {
  // Order inside an event is semantic - hooks/README.md states that PreToolUse
  // `updatedInput` is last-wins. A repair implemented as filter-then-push moved
  // our entry to the end, silently flipping which rewrite wins against a hook
  // the user wired themselves. Repairing must change the entry, and nothing else.
  const repo = freshRepo("wiring-order");
  const dotclaude = join(repo, ".claude");
  mkdirSync(dotclaude, { recursive: true });
  writeFileSync(join(dotclaude, "settings.json"), `${JSON.stringify({
    hooks: {
      UserPromptSubmit: [{ hooks: [
        { type: "command", command: "node $CLAUDE_PROJECT_DIR/.claude/hooks/skill-reminder.mjs" },
        { type: "command", command: "node ./user-own-hook.mjs" },
      ] }],
    },
  }, null, 2)}\n`);

  const r = cli(["install.ts", "install", repo, "--yes"]);
  assert(r.status === 0, `install exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "Repaired", "the legacy wiring must actually have been repaired for this test to mean anything");

  const settings = JSON.parse(readFileSync(join(dotclaude, "settings.json"), "utf8"));
  const entry = settings.hooks.UserPromptSubmit.find((e: { hooks: unknown[] }) => e.hooks.length === 2);
  assert(entry !== undefined, `expected the two-hook entry to survive, got ${JSON.stringify(settings.hooks.UserPromptSubmit)}`);
  const order = entry.hooks.map((h: { command: string; args?: string[] }) => [h.command, ...(h.args ?? [])].join(" "));
  contains(order[0], "skill-reminder.mjs", `ours must stay FIRST, where it was; got ${JSON.stringify(order)}`);
  contains(order[0], DIR, "and it must be the repaired form, not the legacy one");
  contains(order[1], "user-own-hook.mjs", "the user's hook must stay where they put it");
});

test("uninstall removes the wirings install wrote, in exec form", () => {
  // unwire read `command` only. In exec form that is just "node", so every
  // wiring the installer had written was invisible to it: the .mjs files went,
  // the wirings stayed, and each one errored on every event afterwards.
  const repo = freshRepo("wiring-unwire");
  cli(["install.ts", "install", repo, "--yes"]);
  assert(wirings(repo).length > 0, "the install must have wired something to make this test meaningful");

  const r = cli(["install.ts", "uninstall", repo]);
  assert(r.status === 0, `uninstall exit ${r.status}: ${r.stderr}`);
  const left = existsSync(join(repo, ".claude/settings.json")) ? wirings(repo) : [];
  assert(left.length === 0, `uninstall left dangling wirings behind: ${left.join(" | ")}`);
});

test("install then uninstall survive a project path containing a space", () => {
  // The field report's actual environment: C:\Users\First LAST\... A space in
  // the path broke the wiring on every platform, not just Windows - the shell
  // split the expanded placeholder at the space and node got a truncated path.
  const repo = freshRepo("project dir with space");
  const install = cli(["install.ts", "install", repo, "--yes"]);
  assert(install.status === 0, `install exit ${install.status}: ${install.stderr}`);

  // Exec form means the path travels as ONE argument: no quoting to get right,
  // nothing for a shell to tokenize. Asserted on the arg, where the path lives.
  const settings = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"));
  const entries = (Object.values(settings.hooks) as { hooks: { command: string; args?: string[] }[] }[][]).flat();
  for (const hookEntry of entries.flatMap((e) => e.hooks)) {
    assert(hookEntry.command === "node", `every wiring must be exec form, got ${JSON.stringify(hookEntry)}`);
    assert(hookEntry.args?.length === 1, `the script path must be exactly one argument, got ${JSON.stringify(hookEntry.args)}`);
  }

  const check = cli(["install.ts", "check", repo]);
  contains(check.stdout, "match the canonical", `check must be clean under a spaced path: ${check.stdout}`);
  const un = cli(["install.ts", "uninstall", repo]);
  assert(un.status === 0, `uninstall exit ${un.status}: ${un.stderr}`);
});

finish("installer");
