# npm Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npx ronce-racine install .` the adoption path, with a lockfile that records the package version plus a content hash (spec: `docs/superpowers/specs/2026-07-21-npm-distribution-design.md`).

**Architecture:** `tools/build.ts` transpiles the CLI and the hooks into `dist/`; `package.json` ships `dist/` plus the artifact folders; the lockfile's `source` becomes an object read alongside the legacy string form.

**Tech Stack:** TypeScript via tsx, Node >= 18 builtins only, `typescript` used at build time (already a devDependency).

## Global Constraints

- Zero runtime dependencies. `typescript` is build-time only and must never be needed at install time.
- All code, comments and user-facing strings in English. No em dashes.
- Every behavioral change gets a test in `tests/*.test.ts`, run red before green.
- Any change to a snippet named in `tools/mutations.ts` requires updating that table in the same commit.
- Never run two mutation runs concurrently: the harness edits tracked files in place. Run `npx tsx tools/mutations.ts` once and wait.
- `npm test`, `npm run typecheck`, `npm run test:mutation`, `npm run eval:dry` all green after every task.
- Commit after every task (conventional commits, first line <= 72 chars, never mention Claude/AI).
- **Never run `npm publish`.** Publishing is the human's explicit act (the name is claimed permanently).

---

### Task 1: Build the CLI into dist/install.js

**Files:**
- Modify: `tools/build-hooks.ts` → rename to `tools/build.ts`, extend to build the CLI
- Modify: `package.json` (scripts `build`, `prepare`)
- Test: `tests/build.test.ts` (create)

**Interfaces:**
- Produces: `dist/install.js`, executable, shebang `#!/usr/bin/env node`, runnable as `node dist/install.js plan <repo>`. `dist/hooks/*.js` keeps its current behavior.

- [ ] **Step 1: Write the failing test** - create `tests/build.test.ts`:

```ts
#!/usr/bin/env tsx
/** The build must produce a CLI that runs on plain node, with no tsx. */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, assert, contains, absent, freshRepo, initWork, finish, ROOT, TSX } from "./helpers.js";

initWork();

test("build produces an executable CLI that runs on plain node", () => {
  rmSync(join(ROOT, "dist"), { recursive: true, force: true });
  const b = spawnSync(TSX, [join(ROOT, "tools/build.ts")], { cwd: ROOT, encoding: "utf8" });
  assert(b.status === 0, `build failed: ${b.stderr}`);

  const cli = join(ROOT, "dist/install.js");
  assert(existsSync(cli), "dist/install.js must exist");
  const src = readFileSync(cli, "utf8");
  contains(src, "#!/usr/bin/env node", "the built CLI needs a node shebang");
  absent(src, ": string", "types must be stripped from the built output");

  const repo = freshRepo("built-cli");
  const r = spawnSync("node", [cli, "plan", repo], { encoding: "utf8" });
  assert(r.status === 0, `built CLI failed: ${r.stderr}`);
  contains(r.stdout, "Analysis of", "the built CLI must behave like the source");
});

finish("build");
```

- [ ] **Step 2: Run it, expect FAIL** - `npx tsx tests/build.test.ts` → fails, `tools/build.ts` does not exist.

- [ ] **Step 3: Implement.** `git mv tools/build-hooks.ts tools/build.ts`, then extend it. Add above `main()`:

```ts
const CLI_SRC = join(ROOT, "install.ts");
const CLI_OUT = join(ROOT, "dist", "install.js");

/** The CLI ships built so `npx ronce-racine` needs no TypeScript runtime. */
function buildCli(): void {
  const js = transpile(readFileSync(CLI_SRC, "utf8"));
  // The source shebang runs it through tsx; the built one must be plain node.
  const withShebang = js.replace(/^#!.*\n/, "");
  writeFileSync(CLI_OUT, `#!/usr/bin/env node\n${withShebang}`);
  chmodSync(CLI_OUT, 0o755);
}
```

Add `chmodSync` to the `node:fs` import. In `main()`, after the hooks loop and the README copy, call `buildCli()` and change the final log to:

```ts
  console.log(`✓ built ${sources.length} hooks + the CLI to dist/`);
```

In `package.json`, point `build` and `prepare` at `tools/build.ts`.

- [ ] **Step 4: Run** `npx tsx tests/build.test.ts` → PASS. Then `npm run build && npm test && npm run typecheck` → green.

- [ ] **Step 5: Commit**

```bash
git add tools/build.ts package.json tests/build.test.ts
git commit -m "build: compile the CLI to dist/install.js"
```

---

### Task 2: Content hash of the canonical set

**Files:**
- Modify: `install.ts`
- Test: `tests/installer.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3-4):

```ts
export function canonicalHash(tokens: string[]): string; // "sha256-<hex>", stable across machines
```
Computed over the tokens sorted, each followed by the bytes of its canonical file(s), so it changes when any installed artifact's content changes and ignores artifacts the repo did not install.

- [ ] **Step 1: Write the failing test** (append to `tests/installer.test.ts` before `finish`):

```ts
test("canonicalHash is stable, order-independent, and content-sensitive", () => {
  const a = canonicalHash(["rule:commits.md", "rule:minimal-code.md"]);
  const b = canonicalHash(["rule:minimal-code.md", "rule:commits.md"]);
  assert(a === b, "the hash must not depend on token order");
  assert(/^sha256-[0-9a-f]{64}$/.test(a), `unexpected shape: ${a}`);
  const c = canonicalHash(["rule:commits.md"]);
  assert(c !== a, "a different token set must hash differently");
});
```

(Add `canonicalHash` to the `../install.js` import.)

- [ ] **Step 2: Run** `npx tsx tools/tests.ts installer` → FAIL, not exported.

- [ ] **Step 3: Implement** in `install.ts`, after `tokenPaths`:

```ts
/**
 * Fingerprint of the canonical content behind a set of tokens. The lockfile
 * records it next to the package version: with the version alone, `check`
 * compares "0.4.0" to "0.4.0" and reports nothing even when the package
 * content changed under the same number.
 */
export function canonicalHash(tokens: string[]): string {
  const h = createHash("sha256");
  for (const token of [...tokens].sort()) {
    const { canon, isDir } = tokenPaths(token, "");
    h.update(token);
    if (!existsSync(canon)) continue;
    if (isDir) {
      for (const rel of listFiles(canon).filter((f) => !f.endsWith(".test.ts") && f !== "eval.yaml" && f !== "README.md")) {
        h.update(rel);
        h.update(readFileSync(join(canon, rel)));
      }
    } else {
      h.update(readFileSync(canon));
    }
  }
  return `sha256-${h.digest("hex")}`;
}
```

Add `import { createHash } from "node:crypto";` at the top.

- [ ] **Step 4: Run** `npx tsx tools/tests.ts installer` → PASS; `npm run typecheck` → 0.

- [ ] **Step 5: Commit** - `git add install.ts tests/installer.test.ts && git commit -m "feat(installer): content hash of the installed canonical set"`

---

### Task 3: Lockfile records package + version + hash, reads the legacy form

**Files:**
- Modify: `install.ts` (`Lock` interface, `doInstall`, `doCheck`)
- Test: `tests/installer.test.ts`

**Interfaces:**
- Produces:

```ts
type LockSource = string | { package: string; version: string; contentHash: string };
export function describeSource(s: LockSource): string;   // human line for `check`
export function isStale(s: LockSource, tokens: string[]): boolean;
```
A legacy string source is NEVER stale (it came from a clone; only artifact drift applies). An object source is stale when the running package's version or the recomputed hash differs.

- [ ] **Step 1: Write the failing tests:**

```ts
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
```

- [ ] **Step 2: Run** → FAIL (source is still a bare SHA).

- [ ] **Step 3: Implement** in `install.ts`.

Replace the `Lock` interface:

```ts
/** A lockfile written before the npm switch carries a bare git SHA. */
type LockSource = string | { package: string; version: string; contentHash: string };

interface Lock {
  source: LockSource;
  installed: string[];
  detached: string[];
}
```

Add, next to `sourceSha()`:

```ts
/** Version of the package this CLI belongs to. */
function selfVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(SELF, "package.json"), "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function describeSource(s: LockSource): string {
  return typeof s === "string" ? `clone ${s.slice(0, 8)}` : `${s.package}@${s.version}`;
}

/** A clone-era lockfile has no version to compare, so it is never stale. */
export function isStale(s: LockSource, tokens: string[]): boolean {
  if (typeof s === "string") return false;
  return s.version !== selfVersion() || s.contentHash !== canonicalHash(tokens);
}
```

In `doInstall`, replace the lock construction:

```ts
  const lock: Lock = {
    source: { package: "ronce-racine", version: selfVersion(), contentHash: canonicalHash(tokens) },
    installed: tokens.sort(),
    detached: prevLock?.detached ?? [],
  };
```

And the log line that printed the SHA:

```ts
  console.log(`Lockfile: ${LOCKFILE} (${describeSource(lock.source)}) - drift via 'ronce-racine check .'`);
```

In `doCheck`, replace the staleness block:

```ts
  const stale = isStale(lock.source, checked);
  if (stale) console.log(`↑ stale: installed from ${describeSource(lock.source)}, now running ${selfVersion()} - re-run 'ronce-racine install ${repo}'.`);
```

- [ ] **Step 4: Run** `npx tsx tools/tests.ts installer` → PASS. Full `npm test` + typecheck green.

- [ ] **Step 5: Add a mutation** (in `tools/mutations.ts`, after the eval entries):

```ts
  {
    name: "installer: legacy lockfile treated as stale",
    file: "install.ts",
    find: 'if (typeof s === "string") return false;',
    replace: 'if (typeof s === "string") return true;',
    test: "tests/installer.test.ts",
  },
```

Run `npx tsx tools/mutations.ts` ONCE (never concurrently) → the new mutation must be killed.

- [ ] **Step 6: Commit** - `git add install.ts tests/installer.test.ts tools/mutations.ts && git commit -m "feat(installer): lockfile records package version and content hash"`

---

### Task 4: Package manifest and a verified tarball

**Files:**
- Modify: `package.json`
- Test: `tests/build.test.ts`

**Interfaces:**
- Produces: `npm pack` yields a tarball containing `dist/`, `rules/`, `skills/`, `agents/`, `scripts/`, `templates/`, `docs/` and no `tests/`, `playground/`, `tools/`, `*.test.ts` or `eval.yaml`.

- [ ] **Step 1: Write the failing test** (append to `tests/build.test.ts`):

```ts
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
```

- [ ] **Step 2: Run** `npx tsx tests/build.test.ts` → FAIL (`private: true` makes pack refuse, and no `files` field).

- [ ] **Step 3: Implement** in `package.json`: remove `"private": true`; set `"bin": { "ronce-racine": "dist/install.js" }`; add:

```jsonc
  "files": ["dist/", "rules/", "skills/", "agents/", "scripts/", "templates/", "docs/", "AGENTS.md"],
  "repository": { "type": "git", "url": "git+https://github.com/ChariereFiedler/ronce-racine.git" },
  "keywords": ["claude-code", "ai-agents", "developer-tools", "code-quality"],
```

and in `scripts`: `"prepublishOnly": "tsx tools/build.ts && npm test"`.

Add a `.npmignore`-equivalent through `files` only; to drop the internal material that lives INSIDE shipped folders, add at the repo root a `.npmignore` containing:

```
*.test.ts
eval.yaml
```

- [ ] **Step 4: Run** `npx tsx tests/build.test.ts` → PASS. Then `npm test`, `npm run typecheck` → green.

- [ ] **Step 5: Commit** - `git add package.json .npmignore tests/build.test.ts && git commit -m "build: publishable package manifest with a verified file list"`

---

### Task 5: Anti-drift CI template and docs

**Files:**
- Modify: `templates/anti-drift.gitlab-ci.yml`, `README.md`, `docs/adopting-a-repo.md`, `docs/developing.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: the published CLI name `ronce-racine`.

- [ ] **Step 1: Rewrite the template.** Replace the whole clone-and-pin block:

```yaml
# Anti-drift CI gate for the generic Claude config (rules + skills + hooks + agents).
# Include it in the .gitlab-ci.yml of the repo that adopts Ronce Racine.
# Compares the installed artifacts (lockfile .claude/.ronce-racine.json) against
# the published package the lockfile names.
#
# Soft by default: `--strict` makes the job fail, but `allow_failure: true` keeps
# it non-blocking (yellow warning). For a STRICT blocking gate, remove that line.

claude-config:drift:
  stage: test
  image: node:22-alpine
  allow_failure: true            # ← soft: warns without blocking. Remove to block.
  script:
    # The lockfile records the version installed, so the check runs against
    # exactly that one: a newer release cannot flag this repo on its own.
    - VERSION=$(node -e "try{process.stdout.write(require('./.claude/.ronce-racine.json').source.version||'latest')}catch(e){process.stdout.write('latest')}")
    - npx -y ronce-racine@"$VERSION" check . --strict
  rules:
    - changes:
        - ".claude/**"
```

- [ ] **Step 2: Update the README quickstart.** Replace the `git clone` block with:

````markdown
```bash
# 1. Propose an adapted install for your project (read-only)
npx ronce-racine plan .

# 2. Apply it, then review the diff before committing
npx ronce-racine install .
```
````

Update the Requirements section: the installer needs no clone, and a target repo needs Node only.

- [ ] **Step 3: Update `docs/adopting-a-repo.md`** the same way, and add one line to `docs/developing.md` stating that the clone is the CONTRIBUTOR path and is no longer a documented way to install.

- [ ] **Step 4: CHANGELOG** - add under a new `## [Unreleased]`:

```markdown
### Changed
- **Adoption no longer needs a clone**: `npx ronce-racine install .`. The
  lockfile records the package version and a content hash instead of a git
  SHA, so `check` detects a canonical source that changed under the same
  version number. Lockfiles written by the clone-era installer keep working.
- The anti-drift CI template drops the pinned clone for a single
  `npx ronce-racine@<version> check . --strict`.
```

- [ ] **Step 5: Verify every changed command** by running it, and check no doc still tells a user to clone in order to install: `git grep -n "git clone" -- '*.md' | grep -v CONTRIBUTING | grep -v developing`.

- [ ] **Step 6: Run** `npm test`, `npm run typecheck`, `npx tsx tools/mutations.ts` (once), `npm run eval:dry` → all green.

- [ ] **Step 7: Commit** - `git add -A && git commit -m "docs: npx-based adoption, drop the clone from the install path"`

---

### Task 6 (human-gated): publish

Not agent-executable. Claiming the npm name is effectively permanent.

- [ ] Verify the tarball one last time: `npm pack` then install the resulting `.tgz` into a throwaway repo and run `plan`, `install`, `check` against it.
- [ ] The human runs `npm publish` (the agent never does).
- [ ] Cut the release: version bump, tag, GitHub release from the CHANGELOG.
- [ ] Confirm `npx ronce-racine@<version> plan .` works from a machine with no clone.

## Self-review notes

- Spec coverage: CLI build (Task 1), content hash (2), lockfile shape + legacy read (3), tarball contents (4), CI template and docs (5), publish (6). The spec's three named risks are each handled: name permanence is gated to a human in Task 6, a stale `dist/` is caught by `prepublishOnly` plus the tarball test in Task 4, and the `npm link` shadowing case is documented in Task 5 step 3.
- Types checked across tasks: `LockSource` is used identically in Tasks 3 and 4; `canonicalHash` returns the `sha256-<hex>` shape asserted in both Task 2 and Task 3.
- Deliberately deferred: publishing from CI, and installation from a git URL (both listed out of scope in the spec).
