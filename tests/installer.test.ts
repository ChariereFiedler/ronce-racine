#!/usr/bin/env tsx
/**
 * Behavioral tests of the installer (install.ts): plan/install/check/detach,
 * lockfile, drift, detached preservation, first-install guard, settings merge.
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  test, assert, contains, absent, cli, freshRepo, readLock, initWork, finish, WORK, ROOT,
} from "./helpers.js";
import { canonicalHash } from "../install.js";

initWork();

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
  const lock = readLock(repo) as { source: { contentHash: string } } & Record<string, unknown>;
  lock.source.contentHash = "sha256-" + "0".repeat(64);
  writeFileSync(join(repo, ".claude/.ronce-racine.json"), JSON.stringify(lock, null, 2));
  const r = cli(["install.ts", "check", repo]);
  contains(r.stdout, "stale", "a changed content hash must be reported as stale");
});

test("check still accepts a legacy lockfile whose source is a bare SHA", () => {
  const repo = freshRepo("lock-legacy");
  cli(["install.ts", "install", repo, "--yes"]);
  const lock = readLock(repo) as Record<string, unknown>;
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
  writeFileSync(rulePath, readFileSync(rulePath, "utf8") + "\n# LOCAL EDIT\n");

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
  assert(existsSync(sp + ".bak"), "an existing settings.json must be backed up before merge");
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
  assert(existsSync(rulePath + ".pre-install.bak"), "pre-existing file must be backed up");
  assert(readFileSync(rulePath + ".pre-install.bak", "utf8") === HOMEMADE, "backup must hold the user's version");
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
  assert(existsSync(sp + ".bak"), "original settings.json must be backed up");
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
  assert(existsSync(sp + ".bak"), "malformed original must be backed up");
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

  const cmd = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"))
    .hooks.UserPromptSubmit[0].hooks[0].command as string;
  assert(cmd.startsWith("node "), `hooks must run on plain node, got ${cmd}`);
  absent(cmd, "tsx", "a target repo must not need tsx to run hooks");
  contains(cmd, ".mjs", "the wiring must point at the built file");

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
  const lock = readLock(repo) as { source: { version: string } } & Record<string, unknown>;
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

finish("installer");
