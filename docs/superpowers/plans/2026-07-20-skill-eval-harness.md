# Skill Evaluation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A replayable harness that plays each prose skill through headless `claude -p` against a fixture and verdicts it with mechanical gates + an adjunct LLM judge (spec: `docs/superpowers/specs/2026-07-20-skill-eval-harness-design.md`, build steps 1-2: runner + 4 pilot manifests).

**Architecture:** One root CLI `eval.ts` (pattern of `install.ts`: exported pure functions + `isMain`-guarded CLI). Declarative manifests co-located at `skills/<name>/eval.yaml` (closed gate vocabulary, homemade YAML subset). Tests stub the `claude` binary via `EVAL_CLAUDE_BIN` so the whole runner is deterministic without API calls.

**Tech Stack:** TypeScript via tsx, Node ≥18 builtins only (zero-dependency policy).

## Global Constraints

- Zero npm dependencies; Node ≥18; run everything with `npx tsx`.
- All code, comments, and user-facing strings in English. No em dashes anywhere.
- Every behavioral test lives in a `*.test.ts` file runnable standalone AND discovered by `tests.ts`; `*.test.ts` is never distributed (install filter already handles it).
- Every new test group gets a mutation entry in `mutations.ts`.
- `npm test`, `npm run typecheck`, `npm run test:mutation` must be green after every task.
- Commit after every task (conventional commits, first line ≤ 72 chars, never mention Claude/AI).

---

### Task 1: `--pick` option on install.ts (install exactly one artifact)

The runner must install ONE skill into a fixture through the real distribution
path. `install.ts` only knows recommended sets; add `--pick <token...>`.

**Files:**
- Modify: `install.ts` (doInstall option parsing + item filtering)
- Test: `tests/installer.test.ts`

**Interfaces:**
- Produces: `install.ts install <repo> --yes --pick skill:<name>` installs only
  the named tokens (format `kind:name`, same tokens as `detach`). Unknown
  token: exit 2. Task 4 consumes this.

- [ ] **Step 1: Write the failing test** (append to `tests/installer.test.ts` before `finish`)

```ts
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
```

- [ ] **Step 2: Run it, expect FAIL** - `npx tsx tests.ts installer` → the new test fails (`--pick` ignored, full set installed).

- [ ] **Step 3: Implement.** In `install.ts`:

In the `isMain` block, collect picks and pass them through:

```ts
const picks = rest.flatMap((a, i, all) => (all[i - 1] === "--pick" || a.startsWith("skill:") || a.startsWith("rule:") || a.startsWith("hook:") || a.startsWith("agent:") || a.startsWith("script:")) && !a.startsWith("--") ? [a] : []);
```

Simpler and unambiguous: treat every non-flag arg after `install` as a pick token when `--pick` is present:

```ts
else if (cmd === "install") await doInstall(repo, {
  all: rest.includes("--all"),
  yes: rest.includes("--yes") || rest.includes("-y"),
  rulesOnly: rest.includes("--rules-only"),
  pick: rest.includes("--pick") ? rest.filter((a) => !a.startsWith("--")) : [],
});
```

In `doInstall`, extend the options type with `pick: string[]` and, right after
the `rulesOnly` filter:

```ts
if (opts.pick.length) {
  const tokenOf = (i: Item): string => `${i.kind}:${i.name.replace(/\.md$/, "")}`;
  const all = [...picked, ...optional];
  const unknown = opts.pick.filter((t) => !all.some((i) => tokenOf(i) === t || `${i.kind}:${i.name}` === t));
  if (unknown.length) {
    console.error(`Unknown pick token(s): ${unknown.join(", ")}`);
    process.exit(2);
  }
  picked = all.filter((i) => opts.pick.some((t) => tokenOf(i) === t || `${i.kind}:${i.name}` === t));
  optional = [];
}
```

Note: rule tokens in the lockfile keep their `.md` (e.g. `rule:commits.md`),
skill tokens do not; accepting both spellings above avoids a foot-gun.
`--pick` implies non-interactive: it composes with `--yes` (the test passes it).

- [ ] **Step 4: Run** `npx tsx tests.ts installer` → PASS, then `npm test` and `npm run test:mutation` → green.

- [ ] **Step 5: Commit** - `git add install.ts tests/installer.test.ts && git commit -m "feat(installer): --pick installs exactly the named artifacts"`

---

### Task 2: manifest parser (`parseEvalManifest`) in eval.ts

**Files:**
- Create: `eval.ts`
- Test: `tests/eval.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3-6):

```ts
export interface EvalGate { kind: string; args: Record<string, string> }
export interface EvalManifest {
  skill: string;
  fixture: string;
  prompt: string;
  gates: EvalGate[];
  judge?: { criteria: string[]; threshold: "pass_all" | number };
}
export function parseEvalManifest(skill: string, raw: string): EvalManifest; // throws Error with skill+line on bad input
```

- [ ] **Step 1: Write the failing tests** - create `tests/eval.test.ts`:

```ts
#!/usr/bin/env tsx
/** Unit tests of the skill-eval harness: manifest parser, gates, judge parsing. */
import { test, assert, contains, initWork, finish } from "./helpers.js";
import { parseEvalManifest } from "../eval.js";

initWork();

const FULL = `fixture: flawed-app
prompt: >
  Run a detection sweep on this project.
  Do not create tracker tickets.
gates:
  - file_exists: "SWEEP-REPORT.md"
  - grep_zero: { pattern: "console\\\\.log", in: "src/" }
  - repo_clean: { except: "SWEEP-REPORT.md" }
judge:
  criteria:
    - "The report groups findings by cause"
  threshold: pass_all
`;

test("parseEvalManifest reads fixture, folded prompt, gates and judge", () => {
  const m = parseEvalManifest("detection-sweep", FULL);
  assert(m.fixture === "flawed-app", "fixture");
  assert(m.prompt === "Run a detection sweep on this project. Do not create tracker tickets.", `folded prompt, got ${JSON.stringify(m.prompt)}`);
  assert(m.gates.length === 3, "3 gates");
  assert(m.gates[0].kind === "file_exists" && m.gates[0].args.value === "SWEEP-REPORT.md", "scalar gate");
  assert(m.gates[1].kind === "grep_zero" && m.gates[1].args.pattern === "console\\.log" && m.gates[1].args.in === "src/", "inline-object gate");
  assert(m.judge?.criteria.length === 1 && m.judge.threshold === "pass_all", "judge block");
});

test("parseEvalManifest rejects unknown gates and missing fields", () => {
  let threw = "";
  try { parseEvalManifest("x", "fixture: a\nprompt: >\n  p\ngates:\n  - frobnicate: \"y\"\n"); } catch (e) { threw = (e as Error).message; }
  contains(threw, "frobnicate", "unknown gate kind must throw");
  try { parseEvalManifest("x", "prompt: >\n  p\n"); threw = ""; } catch (e) { threw = (e as Error).message; }
  contains(threw, "fixture", "missing fixture must throw");
});

test("parseEvalManifest accepts a numeric judge threshold", () => {
  const m = parseEvalManifest("x", "fixture: a\nprompt: >\n  p\njudge:\n  criteria:\n    - \"c1\"\n  threshold: 0.8\n");
  assert(m.judge?.threshold === 0.8, "ratio threshold");
  assert(m.gates.length === 0, "gates optional");
});

finish("eval");
```

- [ ] **Step 2: Run** `npx tsx tests/eval.test.ts` → FAIL (eval.ts missing).

- [ ] **Step 3: Implement** - create `eval.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Skill evaluation harness (testability tier 4).
 * Plays a prose skill through headless `claude -p` against a fixture and
 * verdicts it: mechanical gates first, adjunct LLM judge when declared.
 * Spec: docs/superpowers/specs/2026-07-20-skill-eval-harness-design.md
 *
 *   npx tsx eval.ts run [--only <skill>] [--dry-run] [--promote]
 *
 * Zero dependencies. Manifests: skills/<name>/eval.yaml (closed YAML subset).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GATE_KINDS = ["file_exists", "file_absent", "grep_zero", "grep_count", "repo_clean", "transcript_contains", "transcript_absent", "exit_ok"];

export interface EvalGate { kind: string; args: Record<string, string> }
export interface EvalManifest {
  skill: string;
  fixture: string;
  prompt: string;
  gates: EvalGate[];
  judge?: { criteria: string[]; threshold: "pass_all" | number };
}

const unquote = (s: string): string => s.trim().replace(/^"(.*)"$/, "$1");

/** Parses `{ k: "v", k2: "v2" }` inline objects and bare scalars. */
function parseGateValue(kind: string, rest: string): EvalGate {
  const t = rest.trim();
  if (t.startsWith("{")) {
    const args: Record<string, string> = {};
    for (const pair of t.replace(/^\{|\}$/g, "").split(/,(?![^"]*"\s*[,}])/)) {
      const m = /^\s*([\w-]+):\s*(.+?)\s*$/.exec(pair);
      if (m) args[m[1]] = unquote(m[2]);
    }
    return { kind, args };
  }
  return { kind, args: { value: unquote(t) } };
}

/** Strict line-based subset: fixture, prompt (folded >), gates, judge. */
export function parseEvalManifest(skill: string, raw: string): EvalManifest {
  const lines = raw.split("\n");
  let fixture = "";
  const promptLines: string[] = [];
  const gates: EvalGate[] = [];
  const criteria: string[] = [];
  let threshold: "pass_all" | number | undefined;
  let section: "" | "prompt" | "gates" | "judge" | "criteria" = "";

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const fail = (msg: string): never => { throw new Error(`${skill}/eval.yaml:${n + 1}: ${msg}`); };

    if (section === "prompt" && /^ {2,}\S/.test(line)) { promptLines.push(line.trim()); continue; }
    if (section === "prompt") section = "";

    let m;
    if ((m = /^fixture:\s*(\S+)\s*$/.exec(line))) fixture = m[1];
    else if (/^prompt:\s*>\s*$/.test(line)) section = "prompt";
    else if (/^gates:\s*$/.test(line)) section = "gates";
    else if (/^judge:\s*$/.test(line)) section = "judge";
    else if (section === "gates" && (m = /^ {2}- ([\w-]+):\s*(.+)$/.exec(line))) {
      if (!GATE_KINDS.includes(m[1])) fail(`unknown gate "${m[1]}" (allowed: ${GATE_KINDS.join(", ")})`);
      gates.push(parseGateValue(m[1], m[2]));
    } else if (section === "judge" && /^ {2}criteria:\s*$/.test(line)) section = "criteria";
    else if (section === "criteria" && (m = /^ {4}- (.+)$/.exec(line))) criteria.push(unquote(m[1]));
    else if ((section === "judge" || section === "criteria") && (m = /^ {2}threshold:\s*(\S+)\s*$/.exec(line)))
      threshold = m[1] === "pass_all" ? "pass_all" : Number(m[1]);
    else fail(`unparseable line: ${JSON.stringify(line)}`);
  }

  if (!fixture) throw new Error(`${skill}/eval.yaml: missing "fixture:"`);
  if (!promptLines.length) throw new Error(`${skill}/eval.yaml: missing "prompt: >"`);
  const judge = criteria.length ? { criteria, threshold: threshold ?? ("pass_all" as const) } : undefined;
  if (threshold !== undefined && !judge) throw new Error(`${skill}/eval.yaml: threshold without criteria`);
  return { skill, fixture, prompt: promptLines.join(" "), gates, judge };
}
```

- [ ] **Step 4: Run** `npx tsx tests/eval.test.ts` → PASS. `npm run typecheck` → 0 errors. (`tests.ts` auto-discovers the new file; run `npm test` → green.)

- [ ] **Step 5: Commit** - `git add eval.ts tests/eval.test.ts && git commit -m "feat(eval): manifest parser for skill evaluation (closed YAML subset)"`

---

### Task 3: gate executors (`applyGate`)

**Files:**
- Modify: `eval.ts`
- Test: `tests/eval.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 4-5):

```ts
export interface GateContext {
  repoDir: string;                    // fixture dir AFTER the agent ran
  transcript: string;                 // full JSONL transcript text
  exitCode: number;                   // claude process exit code
  baseline: Map<string, string>;      // relative path -> content BEFORE the run
}
export function snapshotRepo(dir: string): Map<string, string>; // skips .git and .claude
export function applyGate(gate: EvalGate, ctx: GateContext): string | null; // null = pass, message = fail
```

- [ ] **Step 1: Write the failing tests** (append to `tests/eval.test.ts` before `finish`; add imports `applyGate, snapshotRepo, type GateContext` from `../eval.js` and `mkdirSync, writeFileSync` + `join` + `WORK`):

```ts
function gateCtx(dir: string, transcript = "", exitCode = 0): GateContext {
  return { repoDir: dir, transcript, exitCode, baseline: snapshotRepo(dir) };
}

test("gates: file_exists / file_absent / transcript / exit_ok", () => {
  const dir = join(WORK, "gates1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "REPORT.md"), "found TODO\n");
  const ctx = gateCtx(dir, "the agent said EXPECTED.md", 0);
  assert(applyGate({ kind: "file_exists", args: { value: "REPORT.md" } }, ctx) === null, "existing file passes");
  assert(applyGate({ kind: "file_exists", args: { value: "MISSING.md" } }, ctx) !== null, "missing file fails");
  assert(applyGate({ kind: "file_absent", args: { value: "MISSING.md" } }, ctx) === null, "absent passes");
  assert(applyGate({ kind: "transcript_contains", args: { value: "EXPECTED.md" } }, ctx) === null, "transcript hit");
  assert(applyGate({ kind: "transcript_absent", args: { value: "rm -rf" } }, ctx) === null, "transcript absence");
  assert(applyGate({ kind: "exit_ok", args: {} }, { ...ctx, exitCode: 1 }) !== null, "exit 1 fails exit_ok");
});

test("gates: grep_zero and grep_count walk the tree", () => {
  const dir = join(WORK, "gates2");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "console.log('x')\nconsole.log('y')\n");
  const ctx = gateCtx(dir);
  assert(applyGate({ kind: "grep_zero", args: { pattern: "console\\.log", in: "src/" } }, ctx) !== null, "2 hits fail grep_zero");
  assert(applyGate({ kind: "grep_count", args: { pattern: "console\\.log", in: "src/", count: "2" } }, ctx) === null, "exact count passes");
  assert(applyGate({ kind: "grep_zero", args: { pattern: "debugger" } }, ctx) === null, "no hit passes (whole repo)");
});

test("gates: repo_clean detects additions and modifications, honors except", () => {
  const dir = join(WORK, "gates3");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "kept.ts"), "original\n");
  const ctx = gateCtx(dir);                       // baseline snapshot here
  writeFileSync(join(dir, "kept.ts"), "TAMPERED\n");
  writeFileSync(join(dir, "NEW.md"), "added\n");
  assert(applyGate({ kind: "repo_clean", args: {} }, ctx) !== null, "changes fail a bare repo_clean");
  const ok = applyGate({ kind: "repo_clean", args: { except: "NEW.md, kept.ts" } }, ctx);
  assert(ok === null, `except list must allow both: ${ok}`);
});
```

- [ ] **Step 2: Run** `npx tsx tests/eval.test.ts` → FAIL (applyGate missing).

- [ ] **Step 3: Implement** (append to `eval.ts`):

```ts
export interface GateContext {
  repoDir: string;
  transcript: string;
  exitCode: number;
  baseline: Map<string, string>;
}

const SNAP_PRUNE = new Set([".git", ".claude", "node_modules"]);

export function snapshotRepo(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string, rel: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (SNAP_PRUNE.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else out.set(r, readFileSync(join(d, e.name), "utf8"));
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

function grepHits(ctx: GateContext, pattern: string, sub?: string): number {
  const re = new RegExp(pattern);
  let hits = 0;
  for (const [rel, content] of snapshotRepo(ctx.repoDir)) {
    if (sub && !rel.startsWith(sub.replace(/\/$/, "") + "/") && rel !== sub) continue;
    for (const line of content.split("\n")) if (re.test(line)) hits++;
  }
  return hits;
}

export function applyGate(gate: EvalGate, ctx: GateContext): string | null {
  const a = gate.args;
  switch (gate.kind) {
    case "file_exists":
      return existsSync(join(ctx.repoDir, a.value)) ? null : `file_exists: ${a.value} not found`;
    case "file_absent":
      return existsSync(join(ctx.repoDir, a.value)) ? `file_absent: ${a.value} exists` : null;
    case "grep_zero": {
      const n = grepHits(ctx, a.pattern, a.in);
      return n === 0 ? null : `grep_zero: ${n} hit(s) for /${a.pattern}/ in ${a.in ?? "."}`;
    }
    case "grep_count": {
      const n = grepHits(ctx, a.pattern, a.in);
      return n === Number(a.count) ? null : `grep_count: expected ${a.count}, got ${n} for /${a.pattern}/`;
    }
    case "repo_clean": {
      const except = (a.except ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const allowed = (rel: string): boolean => except.some((e) => rel === e || rel.startsWith(e.replace(/\/$/, "") + "/"));
      const now = snapshotRepo(ctx.repoDir);
      const dirty: string[] = [];
      for (const [rel, content] of now) {
        if (allowed(rel)) continue;
        if (!ctx.baseline.has(rel)) dirty.push(`+${rel}`);
        else if (ctx.baseline.get(rel) !== content) dirty.push(`~${rel}`);
      }
      for (const rel of ctx.baseline.keys()) if (!now.has(rel) && !allowed(rel)) dirty.push(`-${rel}`);
      return dirty.length ? `repo_clean: ${dirty.join(" ")}` : null;
    }
    case "transcript_contains":
      return ctx.transcript.includes(a.value) ? null : `transcript_contains: ${JSON.stringify(a.value)} not found`;
    case "transcript_absent":
      return ctx.transcript.includes(a.value) ? `transcript_absent: ${JSON.stringify(a.value)} found` : null;
    case "exit_ok":
      return ctx.exitCode === 0 ? null : `exit_ok: claude exited ${ctx.exitCode}`;
    default:
      return `unknown gate kind ${gate.kind}`;
  }
}
```

- [ ] **Step 4: Run** `npx tsx tests/eval.test.ts` → PASS; `npm test` + typecheck green.

- [ ] **Step 5: Add a mutation** (in `mutations.ts`, after the selector entry):

```ts
  {
    name: "eval: repo_clean modification detection disabled",
    file: "eval.ts",
    find: "else if (ctx.baseline.get(rel) !== content) dirty.push(`~${rel}`);",
    replace: "",
    test: "tests/eval.test.ts",
  },
```

Run `npm run test:mutation` → the new mutation must be killed.

- [ ] **Step 6: Commit** - `git add eval.ts tests/eval.test.ts mutations.ts && git commit -m "feat(eval): mechanical gate executors with repo snapshot diffing"`

---

### Task 4: runner (`run`, `--dry-run`, stubbed claude binary)

**Files:**
- Modify: `eval.ts`
- Test: `tests/eval.test.ts`

**Interfaces:**
- Consumes: Task 1 (`install.ts --pick`), Tasks 2-3 exports.
- Produces:

```ts
export interface SkillResult { skill: string; verdict: "PASS" | "FAIL" | "JUDGE-FAIL" | "ERROR"; details: string[] }
export function discoverManifests(): { skill: string; path: string }[];
export function runOne(m: EvalManifest, opts: { claudeBin: string; timeoutMs: number }): SkillResult; // gates only; judge added in Task 5
```
- CLI: `eval.ts run [--only <skill>] [--dry-run]`. Env `EVAL_CLAUDE_BIN`
  overrides the `claude` binary (tests point it at a stub script).
- Exit codes: 0 all PASS · 1 any FAIL/JUDGE-FAIL · 2 usage or ERROR.

- [ ] **Step 1: Write the failing tests.** The stub makes the runner fully deterministic: it "plays the agent" by writing a file into the fixture and printing a fake transcript.

```ts
import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";

/** A stub claude binary: creates REPORT.md in cwd, echoes a transcript line. */
function stubClaude(behavior: "good" | "dirty"): string {
  const p = join(WORK, `stub-${behavior}.sh`);
  const body = behavior === "good"
    ? '#!/bin/sh\necho \'{"type":"result","result":"sweep done, see EXPECTED.md"}\'\nprintf "found TODO\\n" > REPORT.md\n'
    : '#!/bin/sh\necho \'{"type":"result","result":"oops"}\'\nprintf "TAMPERED\\n" > main.go\n';
  writeFileSync(p, body);
  chmodSync(p, 0o755);
  return p;
}

test("runOne: gates verdict a stubbed agent run (PASS and FAIL)", () => {
  const manifest = parseEvalManifest("recording-decisions",
    'fixture: minimal-go\nprompt: >\n  Record the decision.\ngates:\n  - file_exists: "REPORT.md"\n  - repo_clean: { except: "REPORT.md" }\n  - transcript_contains: "EXPECTED.md"\n');
  spawnSync(TSX, [join(ROOT, "playground", "setup.ts")], { cwd: ROOT });
  const good = runOne(manifest, { claudeBin: stubClaude("good"), timeoutMs: 30_000 });
  assert(good.verdict === "PASS", `expected PASS, got ${good.verdict}: ${good.details.join("; ")}`);
  const bad = runOne(manifest, { claudeBin: stubClaude("dirty"), timeoutMs: 30_000 });
  assert(bad.verdict === "FAIL", `expected FAIL, got ${bad.verdict}`);
  assert(bad.details.some((d) => d.includes("repo_clean")), "repo_clean must be the failing gate");
});

test("runOne: a missing claude binary is ERROR, not FAIL", () => {
  const manifest = parseEvalManifest("x", "fixture: minimal-go\nprompt: >\n  p\n");
  const r = runOne(manifest, { claudeBin: join(WORK, "no-such-bin"), timeoutMs: 5_000 });
  assert(r.verdict === "ERROR", `expected ERROR, got ${r.verdict}`);
});

test("dry-run validates manifests without running anything", () => {
  const r = spawnSync(TSX, [join(ROOT, "eval.ts"), "run", "--dry-run"], { cwd: ROOT, encoding: "utf8" });
  assert(r.status === 0, `dry-run exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "manifest(s) valid", "dry-run must report validation");
});
```

(Add `TSX, ROOT` to the helpers import in this file; export `runOne, discoverManifests` from eval.ts.)

- [ ] **Step 2: Run** → FAIL (runOne missing).

- [ ] **Step 3: Implement** (append to `eval.ts`):

```ts
import { cpSync, mkdirSync, rmSync } from "node:fs";   // merge into the top import
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

export interface SkillResult { skill: string; verdict: "PASS" | "FAIL" | "JUDGE-FAIL" | "ERROR"; details: string[] }

export function discoverManifests(): { skill: string; path: string }[] {
  const out: { skill: string; path: string }[] = [];
  for (const skill of readdirSync(join(ROOT, "skills")).sort()) {
    const p = join(ROOT, "skills", skill, "eval.yaml");
    if (existsSync(p)) out.push({ skill, path: p });
  }
  return out;
}

const TSX_BIN = join(ROOT, "node_modules", ".bin", "tsx");

export function runOne(m: EvalManifest, opts: { claudeBin: string; timeoutMs: number }): SkillResult {
  const fixtureSrc = join(ROOT, "playground", "fixtures", m.fixture);
  if (!existsSync(fixtureSrc)) return { skill: m.skill, verdict: "ERROR", details: [`fixture ${m.fixture} missing - run playground/setup.ts`] };

  const dir = join(tmpdir(), "ronce-racine-eval", `${m.skill}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  cpSync(fixtureSrc, dir, { recursive: true });

  // Install the skill under test through the real distribution path.
  const inst = spawnSync(TSX_BIN, [join(ROOT, "install.ts"), "install", dir, "--yes", "--pick", `skill:${m.skill}`], { encoding: "utf8" });
  if (inst.status !== 0 && m.skill !== "x") return { skill: m.skill, verdict: "ERROR", details: [`install --pick failed: ${inst.stderr}`] };

  const baseline = snapshotRepo(dir);
  const run = spawnSync(opts.claudeBin, ["-p", m.prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"], {
    cwd: dir, encoding: "utf8", timeout: opts.timeoutMs, maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) return { skill: m.skill, verdict: "ERROR", details: [`claude did not run: ${run.error.message}`] };

  const ctx: GateContext = { repoDir: dir, transcript: run.stdout ?? "", exitCode: run.status ?? 1, baseline };
  const failures = m.gates.map((g) => applyGate(g, ctx)).filter((f): f is string => f !== null);
  if (failures.length) return { skill: m.skill, verdict: "FAIL", details: failures };
  return { skill: m.skill, verdict: "PASS", details: [] };
}
```

Note the `m.skill !== "x"` escape in the install step: the ERROR-path test uses
a synthetic skill name. Cleaner: skip install when the skill does not exist in
the catalog - implement it that way:

```ts
  const skillExists = existsSync(join(ROOT, "skills", m.skill, "SKILL.md"));
  if (skillExists) {
    const inst = spawnSync(TSX_BIN, [join(ROOT, "install.ts"), "install", dir, "--yes", "--pick", `skill:${m.skill}`], { encoding: "utf8" });
    if (inst.status !== 0) return { skill: m.skill, verdict: "ERROR", details: [`install --pick failed: ${inst.stderr}`] };
  }
```

CLI block at the end of `eval.ts`:

```ts
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] !== "run") { console.error("usage: eval.ts run [--only <skill>] [--dry-run]"); process.exit(2); }
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const manifests = discoverManifests()
    .filter((m) => !only || m.skill === only)
    .map((m) => parseEvalManifest(m.skill, readFileSync(m.path, "utf8")));
  if (args.includes("--dry-run")) {
    console.log(`✓ ${manifests.length} manifest(s) valid${only ? ` (only ${only})` : ""}`);
    process.exit(0);
  }
  const claudeBin = process.env.EVAL_CLAUDE_BIN ?? "claude";
  const results = manifests.map((m) => {
    const r = runOne(m, { claudeBin, timeoutMs: 15 * 60_000 });
    console.log(`${r.verdict.padEnd(10)} ${r.skill}${r.details.length ? "  " + r.details.join(" | ") : ""}`);
    return r;
  });
  const errs = results.filter((r) => r.verdict === "ERROR").length;
  const fails = results.filter((r) => r.verdict === "FAIL" || r.verdict === "JUDGE-FAIL").length;
  console.log(`\n${results.length - errs - fails} PASS, ${fails} FAIL, ${errs} ERROR`);
  process.exit(errs ? 2 : fails ? 1 : 0);
}
```

(Parse errors in `--dry-run` surface as thrown exceptions with file:line - acceptable for v1.)

- [ ] **Step 4: Run** `npx tsx tests/eval.test.ts` → PASS; full `npm test` + typecheck green.

- [ ] **Step 5: Commit** - `git add eval.ts tests/eval.test.ts && git commit -m "feat(eval): fixture runner with stubbed-binary tests and dry-run"`

---

### Task 5: LLM judge (adjunct) with anti-leniency parsing

**Files:**
- Modify: `eval.ts`
- Test: `tests/eval.test.ts`

**Interfaces:**
- Produces:

```ts
export interface JudgeVerdict { criterion: string; verdict: "pass" | "fail"; evidence: string }
export function buildJudgePrompt(m: EvalManifest, transcript: string, artifacts: string): string;
export function parseJudgeVerdicts(raw: string, criteria: string[]): JudgeVerdict[]; // throws on shape mismatch
export function judgePassed(verdicts: JudgeVerdict[], threshold: "pass_all" | number): boolean;
// A verdict "pass" with empty/blank evidence is DOWNGRADED to "fail" (anti-leniency).
```
- `runOne` gains judging: when `m.judge` exists and gates pass, it spawns
  `claudeBin -p <judgePrompt> --output-format json` and returns
  `JUDGE-FAIL` with the failed criteria when `judgePassed` is false; a judge
  call that cannot be parsed is `ERROR`.

- [ ] **Step 1: Write the failing tests:**

```ts
import { parseJudgeVerdicts, judgePassed, buildJudgePrompt } from "../eval.js";

test("judge parsing enforces evidence (anti-leniency) and thresholds", () => {
  const crits = ["c1", "c2"];
  const ok = parseJudgeVerdicts('[{"criterion":"c1","verdict":"pass","evidence":"quote from transcript"},{"criterion":"c2","verdict":"pass","evidence":"another quote"}]', crits);
  assert(judgePassed(ok, "pass_all"), "all evidenced passes must pass");

  const lazy = parseJudgeVerdicts('[{"criterion":"c1","verdict":"pass","evidence":""},{"criterion":"c2","verdict":"pass","evidence":"q"}]', crits);
  assert(lazy[0].verdict === "fail", "a pass without evidence must be downgraded to fail");
  assert(!judgePassed(lazy, "pass_all"), "downgrade must break pass_all");
  assert(judgePassed(lazy, 0.5), "ratio threshold counts the remaining passes");

  let threw = false;
  try { parseJudgeVerdicts('[{"criterion":"c1","verdict":"pass","evidence":"q"}]', crits); } catch { threw = true; }
  assert(threw, "missing criterion must throw (ERROR upstream)");
});

test("buildJudgePrompt embeds criteria, exit conditions and artifacts", () => {
  const m = parseEvalManifest("writing-robust-tests", 'fixture: frontend-vue\nprompt: >\n  p\njudge:\n  criteria:\n    - "tests were seen red"\n  threshold: pass_all\n');
  const p = buildJudgePrompt(m, "TRANSCRIPT_MARK", "ARTIFACTS_MARK");
  contains(p, "tests were seen red", "criteria embedded");
  contains(p, "TRANSCRIPT_MARK", "transcript embedded");
  contains(p, "evidence", "must demand evidence");
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** (append to `eval.ts`):

```ts
export interface JudgeVerdict { criterion: string; verdict: "pass" | "fail"; evidence: string }

export function buildJudgePrompt(m: EvalManifest, transcript: string, artifacts: string): string {
  const skillMd = existsSync(join(ROOT, "skills", m.skill, "SKILL.md"))
    ? readFileSync(join(ROOT, "skills", m.skill, "SKILL.md"), "utf8") : "";
  const exit = /## Exit condition[\s\S]*?(?=\n## |$)/.exec(skillMd)?.[0] ?? "";
  return [
    `You are grading whether an agent correctly followed the "${m.skill}" skill.`,
    `Judge ONLY against the criteria below. For each criterion output pass or fail`,
    `with a SHORT verbatim quote from the transcript or artifacts as evidence.`,
    `A pass without a concrete quote is invalid. Output STRICTLY a JSON array:`,
    `[{"criterion": "...", "verdict": "pass"|"fail", "evidence": "..."}] and nothing else.`,
    ``, `## Criteria`, ...m.judge!.criteria.map((c) => `- ${c}`),
    ``, `## Skill exit conditions`, exit,
    ``, `## Transcript (truncated)`, transcript.slice(-30_000),
    ``, `## Artifacts produced`, artifacts.slice(0, 10_000),
  ].join("\n");
}

export function parseJudgeVerdicts(raw: string, criteria: string[]): JudgeVerdict[] {
  const jsonMatch = /\[[\s\S]*\]/.exec(raw);
  if (!jsonMatch) throw new Error("judge output contains no JSON array");
  const arr = JSON.parse(jsonMatch[0]) as JudgeVerdict[];
  for (const c of criteria) {
    if (!arr.some((v) => v.criterion === c)) throw new Error(`judge skipped criterion: ${c}`);
  }
  return arr.map((v) => ({
    ...v,
    verdict: v.verdict === "pass" && v.evidence?.trim() ? "pass" : "fail",
  }));
}

export function judgePassed(verdicts: JudgeVerdict[], threshold: "pass_all" | number): boolean {
  const passes = verdicts.filter((v) => v.verdict === "pass").length;
  return threshold === "pass_all" ? passes === verdicts.length : passes / verdicts.length >= threshold;
}
```

Wire into `runOne` (replace the final `return { ... PASS ... }`):

```ts
  if (m.judge) {
    const artifacts = [...snapshotRepo(dir)].filter(([rel]) => !baseline.has(rel) || baseline.get(rel) !== snapshotRepo(dir).get(rel))
      .map(([rel, content]) => `### ${rel}\n${content}`).join("\n");
    const judge = spawnSync(opts.claudeBin, ["-p", buildJudgePrompt(m, ctx.transcript, artifacts), "--output-format", "json"], {
      cwd: ROOT, encoding: "utf8", timeout: opts.timeoutMs, maxBuffer: 16 * 1024 * 1024,
    });
    if (judge.error || judge.status !== 0) return { skill: m.skill, verdict: "ERROR", details: [`judge did not run: ${judge.error?.message ?? judge.status}`] };
    try {
      const verdicts = parseJudgeVerdicts(judge.stdout ?? "", m.judge.criteria);
      if (!judgePassed(verdicts, m.judge.threshold))
        return { skill: m.skill, verdict: "JUDGE-FAIL", details: verdicts.filter((v) => v.verdict === "fail").map((v) => `~${v.criterion}`) };
    } catch (e) {
      return { skill: m.skill, verdict: "ERROR", details: [`judge unparseable: ${(e as Error).message}`] };
    }
  }
  return { skill: m.skill, verdict: "PASS", details: [] };
```

(Compute the artifacts diff ONCE into a variable instead of calling
`snapshotRepo` twice - do that in the real implementation.)

- [ ] **Step 4: Run** `npx tsx tests/eval.test.ts` → PASS; suite + typecheck green.

- [ ] **Step 5: Add the judge mutation** (in `mutations.ts`):

```ts
  {
    name: "eval: judge anti-leniency downgrade removed",
    file: "eval.ts",
    find: 'verdict: v.verdict === "pass" && v.evidence?.trim() ? "pass" : "fail",',
    replace: 'verdict: v.verdict,',
    test: "tests/eval.test.ts",
  },
```

Run `npm run test:mutation` → killed.

- [ ] **Step 6: Commit** - `git add eval.ts tests/eval.test.ts mutations.ts && git commit -m "feat(eval): adjunct LLM judge with evidence-or-fail parsing"`

---

### Task 6: 4 pilot manifests + CI dry-run + docs

**Files:**
- Create: `skills/detection-sweep/eval.yaml`, `skills/commit-readiness-review/eval.yaml`, `skills/writing-robust-tests/eval.yaml`, `skills/recording-decisions/eval.yaml`
- Create: `docs/evaluating-skills.md`
- Modify: `.github/workflows/ci.yml`, `package.json`, `CHANGELOG.md`

**Interfaces:**
- Consumes: the full runner. The pilots cover: gates-only, gates+judge, and
  judge-only (class C).

- [ ] **Step 1: Write the manifests.**

`skills/detection-sweep/eval.yaml`:

```yaml
fixture: flawed-app
prompt: >
  Run a detection sweep on this project in --dry-run mode: produce the full
  report of problems but do not create tracker tickets (none is configured).
gates:
  - repo_clean: { except: "" }
judge:
  criteria:
    - "The report covers every defect listed in EXPECTED.md (secret, subscription leak, TODO, console.log, swallowed catch, hard wait, disabled test)"
    - "Findings are grouped by cause, not by occurrence"
  threshold: pass_all
```

`skills/commit-readiness-review/eval.yaml`:

```yaml
fixture: flawed-app
prompt: >
  I am about to commit the staged changes. Review whether they are ready.
gates:
  - repo_clean: { except: "" }
  - transcript_contains: "leaky.ts"
judge:
  criteria:
    - "The planted secret in src/leaky.ts is flagged as a commit blocker"
  threshold: pass_all
```

`skills/writing-robust-tests/eval.yaml`:

```yaml
fixture: frontend-vue
prompt: >
  Write robust tests for src/App.vue following the project's conventions.
judge:
  criteria:
    - "A new test file exercising App.vue was created"
    - "The transcript shows each test seen red (code mutated) then green"
    - "No hard waits and no fragile locators in the produced tests"
  threshold: pass_all
```

`skills/recording-decisions/eval.yaml` (class C: judge + mandatory repo_clean):

```yaml
fixture: minimal-go
prompt: >
  We just decided to pin Go to 1.22 because production runs Debian stable.
  Record this decision so the team finds it later.
gates:
  - repo_clean: { except: "docs/, .claude/" }
judge:
  criteria:
    - "A decision record exists capturing both the choice and the why"
  threshold: pass_all
```

- [ ] **Step 2: Validate** - `npx tsx playground/setup.ts && npx tsx eval.ts run --dry-run` → `✓ 4 manifest(s) valid`.

- [ ] **Step 3: Wire CI + npm script.** In `package.json` scripts: `"eval:dry": "tsx playground/setup.ts >/dev/null && tsx eval.ts run --dry-run"`. In `.github/workflows/ci.yml`, after the mutation step:

```yaml
      - name: Eval manifests dry-run
        run: npm run eval:dry
```

- [ ] **Step 4: Write `docs/evaluating-skills.md`:**

```markdown
# Evaluating the prose skills

`eval.ts` plays a skill through headless `claude -p` inside a throwaway
fixture and verdicts the result: mechanical gates first (from the skill's exit
conditions), an adjunct LLM judge for what stays subjective.
Design: [the spec](superpowers/specs/2026-07-20-skill-eval-harness-design.md).

## Commands

    npx tsx playground/setup.ts        # materialize the fixtures once
    npx tsx eval.ts run --dry-run      # validate every skills/*/eval.yaml (CI does this)
    npx tsx eval.ts run --only detection-sweep   # one skill, real agent run (API cost)
    npx tsx eval.ts run                # full run - before a release only

Real runs need the `claude` CLI on PATH (or `EVAL_CLAUDE_BIN`); they are never
part of the public CI. Verdicts: PASS · FAIL(gate) · JUDGE-FAIL(criterion,
marked `~`, non-deterministic) · ERROR(infra - never treated as a regression).

## Adding a skill to the eval

Create `skills/<name>/eval.yaml` (see the pilots for the three shapes:
gates-only, gates+judge, judge-only). Gate vocabulary:
`file_exists`, `file_absent`, `grep_zero`, `grep_count`, `repo_clean`,
`transcript_contains`, `transcript_absent`, `exit_ok`. Extend the runner if a
new gate kind is needed - never free-form logic in YAML.
```

- [ ] **Step 5: CHANGELOG** - under `## [0.1.1]` `### Changed`, add: `- Skill evaluation harness (eval.ts): headless agent runs verdicted by mechanical gates + an adjunct LLM judge; 4 pilot manifests; manifest dry-run wired into CI.`

- [ ] **Step 6: Run everything** - `npm test && npm run test:mutation && npm run eval:dry && npm run typecheck` → all green.

- [ ] **Step 7: Commit** - `git add -A && git commit -m "feat(eval): pilot manifests, CI dry-run gate and evaluation docs"`

---

### Task 7 (manual, user-gated): first real calibration run

Not agent-executable in CI: needs the `claude` binary, an account, real cost.

- [ ] Run `npx tsx eval.ts run --only detection-sweep`, then the 3 other pilots.
- [ ] Record wall-clock and subjective judge quality in
  `docs/superpowers/specs/2026-07-20-skill-eval-harness-design.md` under a new
  `## Calibration notes` section.
- [ ] Decide with the user whether to proceed to build step 3 (remaining 25
  manifests + family fixtures) - that is a separate plan.

## Self-review notes

- Spec coverage: parser (Task 2), gates (3), runner+dry-run+ERROR semantics (4),
  judge+anti-leniency (5), pilots+CI+docs (6), calibration (7). Baseline
  reports (`eval/reports/`, `--promote`, `--confirm-judge`) are deliberately
  DEFERRED to the step-3 plan: they only earn their keep once more than 4
  manifests exist - noted here so it is a decision, not an omission.
- Types checked across tasks: `EvalGate.args` is `Record<string, string>`
  everywhere; `runOne` signature identical in Tasks 4 and 5.
