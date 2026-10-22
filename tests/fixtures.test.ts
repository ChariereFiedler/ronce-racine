#!/usr/bin/env tsx
/**
 * Locks the flawed-app fixture contract: every detector finds EXACTLY the
 * planted defects listed in its EXPECTED.md (1 per detector) - a miss is a
 * detector regression, an extra is a false positive.
 */
import { join } from "node:path";
import { readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test, assert, contains, absent, skillScript, initWork, finish, ROOT, TSX, WORK } from "./helpers.js";
import { BASES, OVERLAYS, resolve, type FileEdit, type Fixture, type FixtureInvariant, type Overlay } from "../playground/fixtures-def/index.js";
import { applyGate, snapshotRepo, type GateContext } from "../tools/eval.js";
import { materialise } from "../playground/setup.js";

initWork();

const FLAWED = join(ROOT, "playground", "fixtures", "flawed-app");

test("playground setup regenerates the fixtures", () => {
  const r = spawnSync(TSX, [join(ROOT, "playground", "setup.ts")], { cwd: ROOT, encoding: "utf8" });
  assert(r.status === 0, `setup exit ${r.status}: ${r.stderr}`);
  contains(r.stdout, "flawed-app", "the known-defect fixture must be generated");
});

test("every base fixture is declared in its own module and materialises", () => {
  // The definitions live outside setup.ts so a task adding a fixture never
  // edits the materializer, and two tasks adding two fixtures never collide.
  const defs = join(ROOT, "playground", "fixtures-def", "bases");
  const declared = BASES.map((f) => f.name).sort();
  const modules = readdirSync(defs).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, "")).sort();
  assert(
    JSON.stringify(declared) === JSON.stringify(modules),
    `one module per base: declared ${declared.join(",")} vs modules ${modules.join(",")}`,
  );
  const materialised = readdirSync(join(ROOT, "playground", "fixtures"));
  for (const name of declared) {
    assert(materialised.includes(name), `${name} is declared but never materialised`);
  }
});

test("setup.ts holds the materializer, not the fixture content", () => {
  // 69 scenarios' worth of inlined fixtures would make this file unmergeable;
  // the split is the point of the module layout, so it is locked here.
  const src = readFileSync(join(ROOT, "playground", "setup.ts"), "utf8");
  assert(src.includes("fixtures-def/index.js"), "setup.ts must read the definitions from fixtures-def/");
  assert(!/^\s*files: \{/m.test(src), "no fixture file map may live in setup.ts");
});

test("sweep finds exactly the planted defects (1 per detector)", () => {
  const r = skillScript("detection-sweep/scripts/sweep.ts", [FLAWED], ROOT);
  assert(r.status === 0, `sweep exit ${r.status}`);
  for (const row of ["TODO/FIXME/HACK", "Debug statements", "Hardcoded waits", "Disabled tests", "Swallowed errors / unwrap", "Secret patterns"]) {
    assert(new RegExp(`${row.replace(/[/()]/g, (c) => `\\${c}`)}\\s+1\\b`).test(r.stdout), `"${row}" must count exactly 1: ${r.stdout.slice(0, 400)}`);
  }
});

test("subscription-leak-scan flags the planted leak in the staged fixture", () => {
  const r = spawnSync(TSX, [join(ROOT, "scripts", "subscription-leak-scan.ts"), "--strict"], { cwd: FLAWED, encoding: "utf8" });
  assert(r.status === 1, `--strict must exit 1 on the planted leak (got ${r.status}): ${r.stdout}`);
  contains(r.stdout, "subscribe without teardown", "the planted subscription must be named");
});

test("buggy-app's prior fix(cart) commits touch the code they claim to fix", () => {
  // Empty commits satisfy the EXPECTED.md wording and betray its intent: an
  // agent notices "these diffs are empty" and root-causes that instead of the
  // recurring symptomatic-patch pattern the fixture exists to present.
  // Observed on both arms of the first real paired run, 2026-08-24.
  const repo = join(ROOT, "playground", "fixtures", "buggy-app");
  const log = spawnSync("git", ["log", "--format=%H %s"], { cwd: repo, encoding: "utf8" });
  assert(log.status === 0, `git log failed: ${log.stderr}`);

  const fixes = log.stdout.trim().split("\n").filter((l) => l.includes("fix(cart)"));
  assert(fixes.length === 3, `expected 3 fix(cart) commits, got ${fixes.length}`);

  for (const line of fixes) {
    const sha = line.split(" ")[0];
    const stat = spawnSync("git", ["show", "--stat", "--format=", sha], { cwd: repo, encoding: "utf8" });
    assert(stat.stdout.trim().length > 0, `commit ${line} is an empty diff - it teaches the wrong lesson`);
  }
});

test("the planted off-by-one survives every prior fix", () => {
  // The point of the fixture: three fixes went by and the real defect is still
  // there. If a prior commit removed it, the scenario collapses.
  const repo = join(ROOT, "playground", "fixtures", "buggy-app");
  const cart = spawnSync("git", ["show", "HEAD:src/cart.ts"], { cwd: repo, encoding: "utf8" });
  contains(cart.stdout, "items.length - 1", "the off-by-one must still be present at HEAD");
});

/** Runs git inside a materialised fixture and fails loudly rather than silently. */
function gitOut(repo: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  assert(r.status === 0, `git ${args.join(" ")} exit ${r.status}: ${r.stderr}`);
  return r.stdout;
}

test("every overlay names an existing base and a free directory name", () => {
  // Both mistakes are silent otherwise: an unknown base would materialise a
  // fixture with no content, a duplicate name would overwrite the first.
  const bases = new Set(BASES.map((b) => b.name));
  const seen = new Set(bases);
  for (const o of OVERLAYS) {
    assert(bases.has(o.base), `${o.name} overlays "${o.base}", which is not a base`);
    assert(!seen.has(o.name), `${o.name} is declared twice - the second would overwrite the first`);
    seen.add(o.name);
  }
  let threw = "";
  try {
    resolve({ name: "orphan", base: "no-such-base", why: "guard", files: {} });
  } catch (e) {
    threw = String(e);
  }
  contains(threw, "no-such-base", "resolve() must refuse an unknown base rather than yield an empty fixture");
});

test("an overlay file replaces the base's, and its EXPECTED.md stays out of git", () => {
  const overlay: Overlay = {
    name: "minimal-go-overlaid",
    base: "minimal-go",
    why: "T8 contract: overlay files win, the answer key is never committed",
    files: {
      "main.go": "package main\n\nfunc main() { println(1) }\n",
      "EXPECTED.md": "# Ground truth\n\nthe overlay answer key\n",
    },
  };
  const f = resolve(overlay);
  assert(f.files["go.mod"] !== undefined, "the base files must survive the overlay");

  materialise(f, WORK);
  const repo = join(WORK, overlay.name);
  contains(readFileSync(join(repo, "main.go"), "utf8"), "println(1)", "the overlay file must replace the base's");
  assert(existsSync(join(repo, "EXPECTED.md")), "the answer key must exist in the worktree");
  absent(gitOut(repo, ["ls-files"]), "EXPECTED.md", "the answer key must never be tracked");
  assert(
    gitOut(repo, ["log", "--all", "--", "EXPECTED.md"]).trim() === "",
    "no commit may carry EXPECTED.md: `git show :EXPECTED.md` would print it inside the image",
  );
});

test("the base's extraCommits replay before the overlay's", () => {
  const overlay: Overlay = {
    name: "buggy-app-layered",
    base: "buggy-app",
    why: "T8 contract: inherited history first, overlay history on top",
    files: { "src/invoice.ts": "export const rate = 0.2\n" },
    extraCommits: [{ message: "feat(invoice): add the rate", changes: { "src/invoice.ts": "export const rate = 0.21\n" } }],
  };
  materialise(resolve(overlay), WORK);
  const repo = join(WORK, overlay.name);
  const log = gitOut(repo, ["log", "--format=%s", "--reverse"]).trim().split("\n");
  assert(
    JSON.stringify(log) === JSON.stringify([
      "chore: initial import",
      "fix(cart): adjust rounding",
      "fix(cart): handle empty basket",
      "fix(cart): correct discount order",
      "feat(invoice): add the rate",
    ]),
    `inherited history must come first, got ${log.join(" | ")}`,
  );
});

test("inheritCommits: false keeps the base tree but drops its history", () => {
  // design-detection.md wants one base BOTH ways: with its layered history, and
  // with the whole tree in a single commit.
  const overlay: Overlay = {
    name: "buggy-app-flat",
    base: "buggy-app",
    why: "T8 contract: the same tree without the prior fixes",
    files: {},
    inheritCommits: false,
    extraCommits: [{ message: "chore: one more", changes: { "src/note.ts": "export const n = 1\n" } }],
  };
  materialise(resolve(overlay), WORK);
  const repo = join(WORK, overlay.name);
  const log = gitOut(repo, ["log", "--format=%s"]).trim().split("\n");
  assert(!log.some((l) => l.includes("fix(cart)")), `the base history must be dropped, got ${log.join(" | ")}`);
  contains(readFileSync(join(repo, "src", "cart.ts"), "utf8"), "items.length - 1", "the base tree must still be there");
});

test("an overlay can leave a change unstaged after its commits", () => {
  // commit-readiness-review/nothing-staged needs a repo whose index is empty
  // while the worktree is dirty; there is no other way to express "nothing
  // staged" in a fixture, since every materialised file is git add -A'd.
  const overlay: Overlay = {
    name: "buggy-app-dirty",
    base: "buggy-app",
    why: "T8 contract: dirty worktree, empty index",
    files: {},
    unstaged: {
      "src/cart.ts": "export function totalItems(): number {\n  return 0\n}\n",
      ".env": "API_TOKEN=not-a-real-token\n",
    },
  };
  materialise(resolve(overlay), WORK);
  const repo = join(WORK, overlay.name);
  const status = gitOut(repo, ["status", "--porcelain"]);
  contains(status, " M src/cart.ts", "the unstaged edit must show as an unstaged modification");
  contains(status, "?? .env", "an unstaged new file must show as untracked");
  assert(gitOut(repo, ["diff", "--cached", "--name-only"]).trim() === "", "nothing may be left in the index");
});

test("--only rebuilds one fixture without wiping the others", () => {
  // Regenerating 79 fixtures to author one scenario is the cost this flag
  // removes; skipping the wipe is the whole point, so it is locked here.
  const fixtures = join(ROOT, "playground", "fixtures");
  const witness = join(fixtures, "frontend-vue", "T8-WITNESS.txt");
  writeFileSync(witness, "survives a targeted rebuild\n");
  const target = join(fixtures, "minimal-go", "main.go");
  rmSync(target);
  try {
    const r = spawnSync(TSX, [join(ROOT, "playground", "setup.ts"), "--only", "minimal-go"], { cwd: ROOT, encoding: "utf8" });
    assert(r.status === 0, `setup --only exit ${r.status}: ${r.stderr}`);
    assert(existsSync(target), "the named fixture must be rebuilt");
    assert(existsSync(witness), "the other fixtures must be left alone");
    absent(r.stdout, "frontend-vue", "only the selected fixture is reported");
  } finally {
    rmSync(witness, { force: true });
  }
});

test("an unrecognised flag fails instead of silently rebuilding everything", () => {
  // A flag this script does not know must not read as a bare full run: the
  // wipe would delete the 79 fixtures the author was iterating on.
  const r = spawnSync(TSX, [join(ROOT, "playground", "setup.ts"), "--dry-run"], { cwd: ROOT, encoding: "utf8" });
  assert(r.status !== 0, `an unknown flag must fail, exited ${r.status}: ${r.stdout.slice(0, 200)}`);
});

test("--only rejects a name no fixture declares", () => {
  const r = spawnSync(TSX, [join(ROOT, "playground", "setup.ts"), "--only", "no-such-fixture"], { cwd: ROOT, encoding: "utf8" });
  assert(r.status !== 0, "an unknown --only name must fail rather than silently rebuild nothing");
});

/**
 * Runs an invariant through the harness' OWN gate machinery rather than a
 * private grep: `applyGate` is the exact code path a manifest's `grep_count`
 * takes, including snapshotRepo's pruning and grepHits' per-LINE counting. A
 * change to either would move the gates and these invariants together, which
 * is the point - a fixture invariant that counts differently from the gate it
 * protects protects nothing.
 */
function invariantFailures(repo: string, invariants: FixtureInvariant[] = []): string[] {
  const ctx: GateContext = { repoDir: repo, transcript: "", exitCode: 0, baseline: new Map() };
  const out: string[] = [];
  for (const inv of invariants) {
    const args: Record<string, string> = { pattern: inv.pattern, count: String(inv.count) };
    if (inv.in) args.in = inv.in;
    const err = applyGate({ kind: "grep_count", args }, ctx);
    if (err) out.push(`${inv.in ?? "."}: ${err}`);
  }
  return out;
}

/** Every fixture that is on disk, paired with the definition that produced it. */
function materialisedFixtures(): { fixture: Fixture; repo: string }[] {
  return [...BASES, ...OVERLAYS.map(resolve)].map((fixture) => ({
    fixture,
    repo: join(ROOT, "playground", "fixtures", fixture.name),
  }));
}

test("every fixture on disk is declared, and every declared fixture is on disk", () => {
  // The invariant loops below iterate the DECLARATIONS; without this, deleting a
  // declaration would silently stop checking a directory that still ships.
  const declared = materialisedFixtures().map((e) => e.fixture.name).sort();
  const onDisk = readdirSync(join(ROOT, "playground", "fixtures")).sort();
  assert(
    JSON.stringify(declared) === JSON.stringify(onDisk),
    `declared ${declared.join(",")} vs on disk ${onDisk.join(",")}`,
  );
});

test("EXPECTED.md is on disk and provably absent from git in every fixture", () => {
  // Generalises the per-task guard (tests/eval-tasks.test.ts) to every fixture:
  // eval-tasks.ts deletes the worktree copy, but a TRACKED answer key survives
  // that - `git show :EXPECTED.md` printed it inside the image on 2026-09-02.
  let checked = 0;
  for (const { fixture, repo } of materialisedFixtures()) {
    const key = join(repo, "EXPECTED.md");
    if (fixture.files["EXPECTED.md"] !== undefined) {
      assert(existsSync(key), `${fixture.name}: EXPECTED.md is declared but missing from the worktree`);
      checked++;
    }
    assert(gitOut(repo, ["ls-files", "EXPECTED.md"]).trim() === "", `${fixture.name}: EXPECTED.md is tracked`);
    assert(
      gitOut(repo, ["log", "--all", "--", "EXPECTED.md"]).trim() === "",
      `${fixture.name}: a commit carries EXPECTED.md`,
    );
  }
  assert(checked > 0, "no fixture declares an EXPECTED.md - this check would be vacuous");
});

test("every declared extra commit exists and carries a real diff", () => {
  // Generalises the hand-written buggy-app case: an empty commit satisfies the
  // wording of an EXPECTED.md and teaches the opposite lesson, and the agent
  // notices. Checked for every fixture that declares history, not just one.
  let checked = 0;
  for (const { fixture, repo } of materialisedFixtures()) {
    const declared = fixture.extraCommits ?? [];
    if (declared.length === 0) continue;
    const log = gitOut(repo, ["log", "--format=%H %s", "--reverse"]).trim().split("\n");
    const subjects = log.map((l) => l.slice(l.indexOf(" ") + 1));
    assert(
      JSON.stringify(subjects) === JSON.stringify(["chore: initial import", ...declared.map((c) => c.message)]),
      `${fixture.name}: history is ${subjects.join(" | ")}`,
    );
    for (const line of log.slice(1)) {
      const sha = line.split(" ")[0];
      const stat = spawnSync("git", ["show", "--stat", "--format=", sha], { cwd: repo, encoding: "utf8" });
      assert(stat.stdout.trim().length > 0, `${fixture.name}: "${line}" is an empty diff`);
      checked++;
    }
  }
  assert(checked > 0, "no fixture declares extraCommits - this check would be vacuous");
});

test("every declared invariant holds in the materialised fixture", () => {
  // The declarative half of the ground truth: an overlay states the counts its
  // gates were computed against ("3 routes, 1 secret"), and a content edit that
  // moves one of them fails HERE instead of silently rewriting what a gate
  // measures six scenarios later.
  const failures: string[] = [];
  for (const { fixture, repo } of materialisedFixtures()) {
    for (const f of invariantFailures(repo, fixture.invariants)) failures.push(`${fixture.name} ${f}`);
  }
  assert(failures.length === 0, `fixture content drifted:\n  ${failures.join("\n  ")}`);
});

test("every invariant is scoped to a path the gates can actually see", () => {
  // grepHits() counts zero for a scope that matches no file, so an invariant
  // whose `in` is a typo, or names a directory snapshotRepo PRUNES (build,
  // dist, coverage, target...), passes without measuring anything - and a
  // `count: 0` invariant passes forever. Three of the six world builders
  // reported nearly losing a whole tool under a pruned name; this is the case
  // that would have caught it.
  const failures: string[] = [];
  for (const { fixture, repo } of materialisedFixtures()) {
    const seen = [...snapshotRepo(repo).keys()];
    for (const inv of fixture.invariants ?? []) {
      if (!inv.in) continue;
      const scope = inv.in.replace(/\/$/, "");
      if (!seen.some((rel) => rel === scope || rel.startsWith(`${scope}/`))) {
        failures.push(`${fixture.name}: in="${inv.in}" matches no file the gates can read`);
      }
    }
  }
  assert(failures.length === 0, `an invariant that measures nothing:\n  ${failures.join("\n  ")}`);
});

test("every world in the measurement base declares what its gates key on", () => {
  // The six worlds of docs/superpowers/plans/2026-09-03-eval-base-rebuild.md.
  // A world with no declared count is a world where a later content edit moves
  // what a gate measures and nothing goes red, which is the whole reason the
  // invariant mechanism exists. The ten fixtures that predate the rebuild are
  // deliberately not listed: their manifests are being replaced, not pinned.
  const WORLDS = ["incident", "maturity", "platform", "service", "shopfront", "surface"];
  for (const name of WORLDS) {
    const world = BASES.find((b) => b.name === name);
    assert(world !== undefined, `${name} is in the measurement base but declares no fixture`);
    assert((world.invariants ?? []).length > 0, `${name} declares no invariant: nothing pins what its gates count`);
  }
});

test("a drifting fixture fails its declared invariants", () => {
  // Proves the loop above is not vacuous while no fixture declares invariants
  // yet: the same machinery, on a fixture edited under it, must go red.
  const overlay: Overlay = {
    name: "buggy-app-invariant",
    base: "buggy-app",
    why: "T9 contract: a declared count is checked with the gates' own semantics",
    files: {},
    invariants: [{ pattern: "items\\.length - 1", in: "src/cart.ts", count: 1 }],
  };
  const f = resolve(overlay);
  materialise(f, WORK);
  const repo = join(WORK, overlay.name);
  assert(invariantFailures(repo, f.invariants).length === 0, "the declared count must hold as materialised");

  const cart = join(repo, "src", "cart.ts");
  // The drift has to violate the DECLARED invariant, not merely resemble it:
  // a second `items.length - 1` is what moves the count the gate keys on.
  writeFileSync(cart, `${readFileSync(cart, "utf8")}\nexport const alsoOffByOne = (items: number[]) => items.length - 1\n`);
  const drifted = invariantFailures(repo, f.invariants);
  assert(drifted.length === 1, `an edited fixture must fail its invariant, got ${drifted.length} failure(s)`);
  contains(drifted[0], "expected 1, got 2", "the failure must name the count that moved");
});

test("an overlay inherits its base's invariants unless it overrode the file they key on", () => {
  // Rule 3 of the ground truth: an overlay that does not touch a file keeps the
  // base's guarantees about it for free, and an overlay that DOES rewrite it
  // must restate the count rather than inherit a stale one.
  const base = BASES.find((b) => b.name === "minimal-go");
  assert(base !== undefined, "minimal-go must exist for this contract test");
  // No base declares invariants yet (Phase D fills them in); annotate one for
  // the length of this case rather than pinning a real base's content here.
  base.invariants = [
    { pattern: "^module ", in: "go.mod", count: 1 },
    { pattern: "^package main", in: "main.go", count: 1 },
  ];
  try {
    const kept = resolve({ name: "go-untouched", base: "minimal-go", why: "t", files: { "README.md": "x\n" } });
    assert(kept.invariants?.length === 2, `an untouched base keeps both invariants, got ${kept.invariants?.length}`);

    const overridden = resolve({
      name: "go-rewritten",
      base: "minimal-go",
      why: "t",
      files: { "main.go": "package main\n\nfunc main() {}\n" },
    });
    assert(
      JSON.stringify(overridden.invariants) === JSON.stringify([{ pattern: "^module ", in: "go.mod", count: 1 }]),
      `only the invariant keyed on the rewritten file is dropped, got ${JSON.stringify(overridden.invariants)}`,
    );

    const committed = resolve({
      name: "go-committed",
      base: "minimal-go",
      why: "t",
      files: {},
      extraCommits: [{ message: "chore: touch", changes: { "go.mod": "module x\n" } }],
    });
    assert(
      committed.invariants?.length === 1 && committed.invariants[0].in === "main.go",
      "a file rewritten by an extra commit drops its base invariant too",
    );

    const own = resolve({
      name: "go-own",
      base: "minimal-go",
      why: "t",
      files: { "main.go": "package main\n" },
      invariants: [{ pattern: "^package main", in: "main.go", count: 1 }],
    });
    assert(own.invariants?.length === 2, "the overlay's own invariants are appended to what it inherited");
  } finally {
    base.invariants = undefined;
  }
});

test("a commit can patch a file instead of restating it", () => {
  // The reason the primitive exists: at 30 commits over 15-40 line files, a
  // history written with `changes` alone restates every touched file in full,
  // and editing one line means propagating it by hand through every later
  // commit that restates it.
  const overlay: Overlay = {
    name: "buggy-app-patched",
    base: "buggy-app",
    why: "T10 contract: edits patch the file as the previous commit left it",
    files: {},
    inheritCommits: false,
    extraCommits: [
      {
        message: "fix(cart): count the last item",
        edits: { "src/cart.ts": [{ find: "items.length - 1", replace: "items.length" }] },
      },
      {
        message: "feat(cart): expose the item count",
        edits: { "src/cart.ts": [{ append: "\nexport const countOf = totalItems\n" }] },
      },
    ],
  };
  materialise(resolve(overlay), WORK);
  const cart = readFileSync(join(WORK, overlay.name, "src", "cart.ts"), "utf8");
  absent(cart, "items.length - 1", "the edit must have replaced the anchor");
  contains(cart, "i < items.length; i++", "the rest of the line must survive the substitution");
  contains(cart, "export const countOf = totalItems", "append must add to the file as it stood");
  contains(cart, "planted off-by-one", "the untouched lines must survive verbatim");
});

test("an edit whose anchor does not match exactly once fails instead of committing a no-op", () => {
  // An edit that silently matches nothing is the empty-commit failure this
  // suite already guards against elsewhere, dressed as a patch: the history
  // would still read "fix(cart): ..." and carry no diff at all.
  for (const [why, edit] of [
    ["absent", { find: "no such anchor", replace: "x" }],
    ["ambiguous", { find: "count", replace: "x" }],
  ] as [string, FileEdit][]) {
    let threw = "";
    try {
      materialise(resolve({
        name: "buggy-app-bad-edit",
        base: "buggy-app",
        why: "T10 contract: a patch that measures nothing must fail loudly",
        files: {},
        inheritCommits: false,
        extraCommits: [{ message: "fix(cart): nothing", edits: { "src/cart.ts": [edit] } }],
      }), WORK);
    } catch (e) {
      threw = String(e);
    }
    contains(threw, "src/cart.ts", `an ${why} anchor must name the file it failed on`);
  }
});

test("a commit can delete a file, so a history can move one", () => {
  // "this commit moved auth.ts into auth/" is unwritable without deletion, and
  // a move is the single most common shape in a real 30-commit history.
  const overlay: Overlay = {
    name: "buggy-app-moved",
    base: "buggy-app",
    why: "T10 contract: a commit removes paths as well as writing them",
    files: {},
    inheritCommits: false,
    extraCommits: [
      {
        message: "refactor(cart): move cart into its own module",
        changes: { "src/cart/index.ts": "export * from './total.js'\n" },
        deletes: ["src/cart.ts"],
      },
    ],
  };
  materialise(resolve(overlay), WORK);
  const repo = join(WORK, overlay.name);
  assert(!existsSync(join(repo, "src", "cart.ts")), "the deleted file must be gone from the worktree");
  assert(gitOut(repo, ["ls-files", "src/cart.ts"]).trim() === "", "the deleted file must be gone from the index");
  contains(gitOut(repo, ["show", "--stat", "--format=", "HEAD"]), "src/cart.ts", "the commit must carry the deletion");
});

test("deleting a path no commit ever wrote fails instead of producing a phantom move", () => {
  let threw = "";
  try {
    materialise(resolve({
      name: "buggy-app-phantom-delete",
      base: "buggy-app",
      why: "T10 contract: a delete that removes nothing is a silent no-op",
      files: {},
      inheritCommits: false,
      extraCommits: [{ message: "refactor: drop it", deletes: ["src/never-existed.ts"] }],
    }), WORK);
  } catch (e) {
    threw = String(e);
  }
  contains(threw, "src/never-existed.ts", "a delete of an absent path must name it");
});

test("a commit message survives quotes, backticks and command substitution verbatim", () => {
  // The message used to be interpolated into a shell string under execSync.
  // Every message was a tame `fix(cart): ...`; a hand-written realistic one
  // ("don't drop the user's \"pending\" flag") breaks the command, and `$(...)`
  // runs inside the fixture repo.
  const canary = join(WORK, "injection-canary.txt");
  rmSync(canary, { force: true });
  const message = `fix(cart): don't drop the user's "pending" flag \`now\` $(touch ${canary})`;
  const overlay: Overlay = {
    name: "buggy-app-hostile-message",
    base: "buggy-app",
    why: "T10 contract: the commit message is data, never shell",
    files: {},
    inheritCommits: false,
    extraCommits: [{ message, changes: { "src/note.ts": "export const n = 1\n" } }],
  };
  materialise(resolve(overlay), WORK);
  const repo = join(WORK, overlay.name);
  assert(!existsSync(canary), "$( ) in a commit message must never execute");
  assert(
    gitOut(repo, ["log", "-1", "--format=%s"]).trim() === message,
    `the message must land verbatim, got ${gitOut(repo, ["log", "-1", "--format=%s"]).trim()}`,
  );
});

test("an overlay drops a base invariant keyed on a file it patches or deletes", () => {
  // Same rule as a full rewrite, for the same reason: an inherited count over
  // content the overlay changed is a stale claim, not a guarantee.
  const base = BASES.find((b) => b.name === "minimal-go");
  assert(base !== undefined, "minimal-go must exist for this contract test");
  base.invariants = [
    { pattern: "^module ", in: "go.mod", count: 1 },
    { pattern: "^package main", in: "main.go", count: 1 },
  ];
  try {
    const patched = resolve({
      name: "go-patched", base: "minimal-go", why: "t", files: {},
      extraCommits: [{ message: "chore: patch", edits: { "main.go": [{ append: "\n" }] } }],
    });
    assert(
      patched.invariants?.length === 1 && patched.invariants[0].in === "go.mod",
      `a patched file drops its base invariant, got ${JSON.stringify(patched.invariants)}`,
    );
    const deleted = resolve({
      name: "go-deleted", base: "minimal-go", why: "t", files: {},
      extraCommits: [{ message: "chore: drop", deletes: ["main.go"] }],
    });
    assert(
      deleted.invariants?.length === 1 && deleted.invariants[0].in === "go.mod",
      `a deleted file drops its base invariant, got ${JSON.stringify(deleted.invariants)}`,
    );
  } finally {
    base.invariants = undefined;
  }
});

test("every base fixture materialises the exact bytes it declares", () => {
  // The primitives below rewrite the materializer; this pins that a fixture
  // written with the old ones still lands byte for byte. Compared against the
  // LAST declaration of each path, since a later commit legitimately supersedes
  // what `files` wrote.
  let checked = 0;
  for (const f of BASES) {
    const expected = new Map(Object.entries(f.files));
    // A path a later step PATCHES has no declared final content to compare
    // against - short of folding the edits here, which would just re-implement
    // the materializer. Its fidelity is the edit contract's job, above.
    const patched = new Set<string>();
    for (const step of f.extraCommits ?? []) {
      for (const [rel, body] of Object.entries(step.changes ?? {})) expected.set(rel, body);
      for (const rel of Object.keys(step.edits ?? {})) patched.add(rel);
      for (const rel of step.deletes ?? []) expected.delete(rel);
    }
    for (const [rel, body] of Object.entries(f.unstaged ?? {})) expected.set(rel, body);
    materialise(f, WORK);
    for (const [rel, body] of expected) {
      if (patched.has(rel)) continue;
      assert(
        readFileSync(join(WORK, f.name, rel), "utf8") === body,
        `${f.name}/${rel} did not materialise byte for byte`,
      );
      checked++;
    }
  }
  assert(checked > 30, `only ${checked} declared files were compared - the fold dropped most of them`);
});

finish("fixtures");

test("no fixture carries anything traceable to the private project it was transposed from", () => {
  // The realism of these fixtures is transposed, never copied: the difficulty
  // structure of a real episode crosses, and nothing else does. This repo ships
  // public under MIT; the project the episodes came from is private and its
  // artifacts carry production code, real ticket numbers and unpublished
  // security findings.
  //
  // A denylist is a weak proof and the right one to have anyway: it cannot
  // establish that a transposition is clean, but it makes the mechanical
  // tells - a pasted path, a commit hash, a ticket reference - impossible to
  // land by accident. The judgement call stays with the author.
  const FORBIDDEN: [RegExp, string][] = [
    [/\bgranit[- _]?golem\b/i, "the source project's name"],
    [/\btordu[- _]?jardin\b/i, "the source infrastructure's name"],
    [/\bbasalt[- _]?beholder\b/i, "a sibling private project"],
    [/\bsioule\b/i, "a client project"],
    [/#\d{3,4}\b/, "a ticket number from the source tracker"],
    // Two shapes, because the first alternative alone missed the commonest
    // one. Its `(?![.\w])` is there so `abcdef12.json` does not read as a
    // hash, and it also let `introduced in 9f3ab27c1d0e4b5a.` through - a hash
    // at the end of a sentence, which is precisely where a pasted one lands in
    // prose. The second alternative catches that; it excludes an all-letter
    // run so an English word spelled in a-f is not a finding, which is why the
    // first is kept beside it. Verified by injecting a violation into a
    // materialised world and watching this case go red, 2026-09-03.
    [/\b[0-9a-f]{8,40}\b(?![.\w])|\b(?![a-f]{8,40}\b)[0-9a-f]{8,40}\b/, "what reads as a commit hash"],
  ];
  const offenders: string[] = [];
  for (const { fixture, repo } of materialisedFixtures()) {
    for (const [rel, body] of snapshotRepo(repo)) {
      for (const [re, why] of FORBIDDEN) {
        const hit = re.exec(body);
        if (hit) offenders.push(`${fixture.name}/${rel}: ${why} (${hit[0]})`);
      }
    }
  }
  assert(offenders.length === 0, `private material must not cross into a public fixture:\n  ${offenders.join("\n  ")}`);
});

test("no fixture hides content under a name the snapshot prunes", () => {
  // `snapshotRepo` skips any entry named .git, .claude, node_modules, a
  // lockfile, dist, build, coverage, .next, .nuxt or target. That is right for
  // a repository under evaluation - an agent's `npm install` must not dirty
  // repo_clean - and it is a trap for a fixture AUTHOR: source placed under one
  // of those names is invisible to every gate, to the fixture invariants, and
  // to the transposition denylist above. Nothing fails; the checks simply never
  // see it.
  //
  // Two of the six world authors hit this independently on 2026-09-03, one with
  // the renderer under `tools/build/` and one about to put quality data under
  // `coverage/`. Both were caught by an invariant that counted zero, which is a
  // lucky way to find out. This says it directly instead.
  const pruned = new Set([".claude", "node_modules", "dist", "build", "coverage", ".next", ".nuxt", "target"]);
  const offenders: string[] = [];
  for (const { fixture, repo } of materialisedFixtures()) {
    const walk = (dir: string, rel: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === ".git") continue;
        const child = join(dir, e.name);
        if (!e.isDirectory()) continue;
        if (pruned.has(e.name)) {
          const held = readdirSync(child).length;
          if (held) offenders.push(`${fixture.name}/${rel}${e.name}/ (${held} entr${held === 1 ? "y" : "ies"})`);
          continue;
        }
        walk(child, `${rel}${e.name}/`);
      }
    };
    walk(repo, "");
  }
  assert(offenders.length === 0, `content under a pruned name is invisible to every check:\n  ${offenders.join("\n  ")}`);
});
