#!/usr/bin/env tsx
/** The build must produce a CLI that runs on plain node, with no tsx. */
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, assert, contains, absent, freshRepo, initWork, finish, ROOT, TSX, WORK } from "./helpers.js";

initWork();

let cli: string;

/**
 * Two manifests now carry a version: package.json for npm, plugin.json for the
 * Claude Code marketplace. A plugin pinned to a version string only updates for
 * users when that string changes, so a release that bumps one and forgets the
 * other ships an update nobody receives.
 */
test("the plugin manifest and package.json agree on the version", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  const plugin = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8")) as { version: string };
  assert(plugin.version === pkg.version, `plugin.json is ${plugin.version}, package.json is ${pkg.version}`);
});

test("build produces an executable CLI that runs on plain node", () => {
  rmSync(join(ROOT, "dist"), { recursive: true, force: true });
  const b = spawnSync(TSX, [join(ROOT, "tools/build.ts")], { cwd: ROOT, encoding: "utf8" });
  assert(b.status === 0, `build failed: ${b.stderr}`);

  cli = join(ROOT, "dist/install.js");
  assert(existsSync(cli), "dist/install.js must exist");
  const src = readFileSync(cli, "utf8");
  contains(src, "#!/usr/bin/env node", "the built CLI needs a node shebang");
  absent(src, ": string", "types must be stripped from the built output");

  const repo = freshRepo("built-cli");
  const r = spawnSync("node", [cli, "plan", repo], { encoding: "utf8" });
  assert(r.status === 0, `built CLI failed: ${r.stderr}`);
  contains(r.stdout, "Analysis of", "the built CLI must behave like the source");
});

test("built CLI installs real artifacts into a target repo (not just plan)", () => {
  const repo = freshRepo("built-cli-install");
  const r = spawnSync("node", [cli, "install", repo, "--yes"], { encoding: "utf8" });
  assert(r.status === 0, `built CLI install failed: ${r.stderr}`);

  const rulesDir = join(repo, ".claude/rules/shared");
  assert(existsSync(rulesDir) && readdirSync(rulesDir).length > 0, "rules must be copied into .claude/rules/shared");

  const hooksDir = join(repo, ".claude/hooks");
  const hookFiles = existsSync(hooksDir) ? readdirSync(hooksDir).filter((f) => f.endsWith(".mjs")) : [];
  assert(hookFiles.length > 0, "at least one built hook .mjs must be copied into .claude/hooks");

  const c = spawnSync("node", [cli, "check", repo], { encoding: "utf8" });
  assert(c.status === 0, `built CLI check failed: ${c.stderr}`);
  contains(c.stdout, "artifacts match the canonical source", "check must report a clean match after a fresh install");
});

test("the packed tarball ships the artifacts and nothing internal", () => {
  const r = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert(r.status === 0, `npm pack failed: ${r.stderr}`);
  const files = (JSON.parse(r.stdout) as { files: { path: string }[] }[])[0].files.map((f) => f.path);

  for (const needed of ["dist/install.js", "rules/commits.md", "skills/detection-sweep/SKILL.md", "templates/anti-drift.gitlab-ci.yml"]) {
    assert(files.includes(needed), `${needed} must ship`);
  }
  const leaked = files.filter((f) =>
    f.startsWith("tests/") || f.startsWith("playground/") || f.startsWith("tools/") ||
    f.endsWith(".test.ts") || f.endsWith("eval.yaml"));
  assert(leaked.length === 0, `internal material must not ship: ${leaked.join(", ")}`);
});

test("built CLI runs when invoked through a symlink (npm bin shape)", () => {
  const link = join(WORK, "ronce-racine-symlink");
  rmSync(link, { force: true });
  symlinkSync(cli, link);

  const repo = freshRepo("built-cli-symlink");
  const r = spawnSync("node", [link, "plan", repo], { encoding: "utf8" });
  assert(r.status === 0, `symlinked CLI failed: ${r.stderr}`);
  contains(r.stdout, "Analysis of", "the symlinked CLI must behave like the direct one");
});

finish("build");
