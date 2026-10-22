#!/usr/bin/env tsx
/**
 * The format probe: grade a deliverable that carries the skill's own output
 * format and nothing else, and see which gates still go green. Every one that
 * does scores vocabulary rather than work, which is why a monolithic skill and
 * a thin one delegating to a reference file measured EXACTLY the same over six
 * pairs (2026-09-02).
 */
import { test, assert, contains, absent, initWork, finish, WORK, ROOT } from "./helpers.js";
import { parseEvalManifest, discoverManifests } from "../tools/eval.js";
import { formatSkeleton, probeManifest, deliverablePaths, blocking } from "../tools/eval-probe.js";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

initWork();

/** Writes a file under WORK, parents included. */
function put(rel: string, content: string): string {
  const path = join(WORK, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** A skill directory whose SKILL.md prescribes a template and an exit condition. */
function glossarySkill(name: string): string {
  put(`${name}/SKILL.md`, [
    "# Glossary",
    "",
    "## Overview",
    "",
    "Resolve the Stripe webhook vocabulary of this codebase.",
    "",
    "## Templates",
    "",
    "```markdown",
    "| **We do not say** | `<rejected term>` - <why> |",
    "| **Status** | settled / provisional (no arbiter yet) |",
    "```",
    "",
    "## Exit condition",
    "",
    "- [ ] Unsettled terms marked provisional rather than presented as decided",
    "",
  ].join("\n"));
  return join(WORK, name);
}

/** A fixture with source but no deliverable, as a trial image is. */
function pristineFixture(name: string): string {
  put(`${name}/src/app.ts`, "export const app = 1\n");
  return join(WORK, name);
}

const manifest = (yaml: string) => parseEvalManifest("x", `fixture: f\nprompt: >\n  p\n${yaml}`);

/** The verdict the probe reached for the gate whose label contains `needle`. */
function verdictOf(gates: ReturnType<typeof probeManifest>, needle: string): string {
  const hit = gates.filter((g) => g.label.includes(needle));
  assert(hit.length === 1, `one gate matching ${needle}, got ${JSON.stringify(gates)}`);
  return hit[0].verdict;
}

test("the skeleton carries the skill's own template and exit condition, not its prose", () => {
  const skeleton = formatSkeleton(glossarySkill("skill-template"));

  contains(skeleton, "provisional", "the template's own vocabulary is what a format gate scores");
  contains(skeleton, "rejected term", "the template block is copied verbatim");
  contains(skeleton, "Unsettled terms marked provisional", "the exit condition is prescribed wording too");
  absent(skeleton, "Stripe", "domain prose is not format - harvesting it would indict gates that measure work");
});

test("the skeleton follows the skill's link to a shared apparatus", () => {
  // audit-security prescribes no format of its own: it points at
  // ../audit-report/reference/apparatus.md, where the table header carrying
  // "Confidence" lives. A probe that stopped at SKILL.md would miss it.
  put("shared-apparatus/reference/apparatus.md", [
    "# Apparatus", "", "## Output format", "", "```markdown",
    "| Code | Level | Confidence |", "```", "",
  ].join("\n"));
  put("skill-linked/SKILL.md", [
    "# Linked", "", "## Report apparatus", "",
    "Read [apparatus](../shared-apparatus/reference/apparatus.md) before writing the report.",
    "", "## Exit condition", "", "- [ ] Report produced", "",
  ].join("\n"));

  contains(formatSkeleton(join(WORK, "skill-linked")), "Confidence", "the linked apparatus is part of the prescribed format");
});

test("the skeleton includes the template files the skill ships", () => {
  // Ten skills keep their deliverable shape in templates/*.md rather than in a
  // fenced block, and a probe blind to those calls their gates measured.
  put("skill-shipped/SKILL.md", ["# Shipped", "", "## Templates", "",
    "- `templates/inventory.md` - table to paste into the MR", "",
    "## Exit condition", "", "- [ ] Inventory pasted", ""].join("\n"));
  put("skill-shipped/templates/inventory.md", "| Family | Co-deployed? | Status |\n|---|---|---|\n");

  contains(formatSkeleton(join(WORK, "skill-shipped")), "Co-deployed?", "a shipped template is format, whole");
});

test("a gate that greps a word from the skill's own template is a format gate", () => {
  const skeleton = formatSkeleton(glossarySkill("skill-fmt"));
  const dir = pristineFixture("fixture-fmt");
  const m = manifest([
    "gates:",
    '  - file_exists: "GLOSSARY.md"',
    '  - grep_min: { pattern: "[Pp]rovisional", in: "GLOSSARY.md", count: "1" }',
    '  - grep_min: { pattern: "OrderLine", in: "GLOSSARY.md", count: "1" }',
  ].join("\n"));

  const gates = probeManifest(m, dir, skeleton);
  assert(verdictOf(gates, "rovisional") === "format", `the template already says provisional: ${JSON.stringify(gates)}`);
  assert(verdictOf(gates, "OrderLine") === "content", "a term only the fixture can supply survives the probe");
  assert(verdictOf(gates, "GLOSSARY.md") === "format", "an empty file at the right path satisfies file_exists");
});

test("the probe writes its deliverable where the gates point, dir-shaped scopes included", () => {
  const skeleton = formatSkeleton(glossarySkill("skill-dirs"));
  const dir = pristineFixture("fixture-dirs");
  const m = manifest([
    "gates:",
    '  - repo_clean: { except: "TICKETS/" }',
    '  - grep_min: { pattern: "provisional", in: "TICKETS", count: "1" }',
  ].join("\n"));

  contains(deliverablePaths(m).join(" "), "TICKETS", "a repo_clean except entry names the deliverable");
  const gates = probeManifest(m, dir, skeleton);
  assert(verdictOf(gates, "provisional") === "format", `a directory scope must receive the skeleton: ${JSON.stringify(gates)}`);
  assert(verdictOf(gates, "repo_clean") === "trivial", "not overstepping is not a format gate - eval-lint already indicts it");
});

test("absence gates are reported as trivial, never as format", () => {
  const skeleton = formatSkeleton(glossarySkill("skill-absence"));
  const dir = pristineFixture("fixture-absence");
  const m = manifest([
    "gates:",
    '  - grep_zero: { pattern: "console\\\\.log", in: "src" }',
    "  - exit_ok: true",
  ].join("\n"));

  const gates = probeManifest(m, dir, skeleton);
  assert(gates.every((g) => g.verdict === "trivial"), `absence and exit gates hold on any well-behaved run: ${JSON.stringify(gates)}`);
});

test("an absence gate the fixture itself violates survives the probe", () => {
  // grep_zero on a defect the fixture plants demands that the agent REMOVE it.
  // The content-free deliverable does not, so the gate measures work - calling
  // it unprobed alongside the gates the probe's own writes tripped would hide
  // the only absence gates that carry signal.
  const skeleton = formatSkeleton(glossarySkill("skill-planted"));
  const dir = pristineFixture("fixture-planted");
  put("fixture-planted/src/cart.ts", "console.log(items.length - 1)\n");
  const m = manifest('gates:\n  - grep_zero: { pattern: "items\\\\.length - 1", in: "src" }\n');

  assert(verdictOf(probeManifest(m, dir, skeleton), "grep_zero") === "content", "the planted defect is still there");
});

test("an absence gate the probe's own writes trip is reported unprobed", () => {
  const skeleton = formatSkeleton(glossarySkill("skill-tripped"));
  const dir = pristineFixture("fixture-tripped");
  const m = manifest([
    "gates:",
    '  - grep_min: { pattern: "provisional", in: "REPORT.md", count: "1" }',
    '  - repo_clean: { except: "NOTHING.md" }',
  ].join("\n"));

  const gates = probeManifest(m, dir, skeleton);
  assert(verdictOf(gates, "repo_clean") === "unprobed", `the deliverable itself is what dirtied the repo: ${JSON.stringify(gates)}`);
});

test("a transcript gate keyed on template wording is a format gate too", () => {
  // The agent that writes the deliverable also says it, so the transcript
  // carries the same vocabulary and the same disease.
  const skeleton = formatSkeleton(glossarySkill("skill-transcript"));
  const dir = pristineFixture("fixture-transcript");
  const m = manifest('gates:\n  - transcript_contains: "provisional"\n');

  assert(verdictOf(probeManifest(m, dir, skeleton), "provisional") === "format", "template words reach the transcript unearned");
});

test("file_matching is probed with a path synthesized from its own pattern", () => {
  const skeleton = formatSkeleton(glossarySkill("skill-matching"));
  const dir = pristineFixture("fixture-matching");
  const m = manifest('gates:\n  - file_matching: { pattern: "(^|/)(\\\\.githooks/|\\\\.husky/)" }\n');

  // The gate reads the path and never the content, so an empty artifact in the
  // right place passes it. That is `shallow`, not `format`: putting a file
  // there is an act, not a word, and folding the two together contradicted a
  // measurement - "a BLOCKING guardrail exists" went 0/7 unaided against 7/7
  // aided over 14 paired trials on 2026-08-24, so the act is not free.
  const gates = probeManifest(m, dir, skeleton);
  assert(gates[0].verdict === "shallow", `a path-keyed gate is shallow, not a format gate: ${JSON.stringify(gates)}`);
});

test("a file_matching pattern no path can be synthesized from is reported unprobed", () => {
  // Silence beats a wrong bucket: calling it a content gate would credit the
  // manifest with signal the probe never tested.
  const skeleton = formatSkeleton(glossarySkill("skill-uninvertible"));
  const dir = pristineFixture("fixture-uninvertible");
  const m = manifest('gates:\n  - file_matching: { pattern: "^[0-9]{8}-report\\\\.md$" }\n');

  const gates = probeManifest(m, dir, skeleton);
  assert(gates[0].verdict === "unprobed", `an uninvertible pattern must abstain: ${JSON.stringify(gates)}`);
  contains(gates[0].failure ?? "", "no path", "the reason for abstaining is stated");
});

test("the probe never mutates the fixture it was handed a copy of", () => {
  const skeleton = formatSkeleton(glossarySkill("skill-isolation"));
  const dir = pristineFixture("fixture-isolation");
  const m = manifest('gates:\n  - grep_min: { pattern: "provisional", in: "GLOSSARY.md", count: "1" }\n');

  probeManifest(m, dir, skeleton);
  assert(existsSync(join(dir, "GLOSSARY.md")), "the probe writes its deliverable into the directory it is given");
  assert(readFileSync(join(dir, "src", "app.ts"), "utf8") === "export const app = 1\n", "and touches nothing else");
});

test("a file_matching gate is shallow, never format: creating the file is an act", () => {
  // The probe used to synthesize a path the pattern accepts, write the skeleton
  // there, and then report the gate as a format gate because it passed. That is
  // the probe performing the outcome and grading itself on it: file_matching
  // never reads content, so no deliverable of any wording can satisfy it.
  //
  // It condemned the one gate in this repo with the strongest measurement
  // behind it - "a BLOCKING guardrail exists", 0/7 unaided against 7/7 aided
  // over 14 paired trials on 2026-08-24. When a new instrument contradicts a
  // measurement that clean, the instrument is what is wrong.
  const skeleton = formatSkeleton(glossarySkill("skill-file-matching"));
  const dir = pristineFixture("fixture-file-matching");
  const m = manifest('gates:\n  - file_matching: { pattern: "(^|/)(\\\\.githooks/|hooks/)" }\n');

  const [gate] = probeManifest(m, dir, skeleton);
  assert(gate.verdict === "shallow", `a path-keyed gate must not be condemned as a format gate, got ${gate.verdict}`);
});

test("every shipped manifest and skill can be probed", () => {
  // A crash on one real manifest would silently shrink the evidence list, and
  // the discovery already covers skills/<skill>/evals/<scenario>.eval.yaml.
  for (const ref of discoverManifests(ROOT)) {
    const m = parseEvalManifest(ref, readFileSync(ref.path, "utf8"));
    const skeleton = formatSkeleton(join(ROOT, "skills", m.skill));
    const dir = pristineFixture(`shipped-${m.id.replace(/\//g, "-")}`);
    const gates = probeManifest(m, dir, skeleton);
    assert(gates.length === m.gates.length, `${m.id}: every gate gets a verdict`);
    for (const g of gates) {
      assert(["format", "shallow", "content", "trivial", "unprobed"].includes(g.verdict), `${m.id}: unknown verdict ${g.verdict}`);
    }
  }
});

finish("eval-probe");

test("blocking findings follow the tier the manifest claims", () => {
  // The probe cannot block on every format gate today: 43 of the 58 gates in
  // the base are format gates, which is the finding that justifies rebuilding
  // it, not a reason to keep the check out of CI until the rebuild lands.
  //
  // So severity follows the tier, exactly as the citation lint's does. An
  // untiered manifest grades as `probed` and its format gates are reported and
  // not blocking; the day a manifest claims `measured` or `anchor` - the day it
  // may publish a causal verdict - a gate a content-free deliverable passes
  // becomes an error. The check arrives before the base it will guard.
  const probed = manifest('gates:\n  - grep_min: { pattern: "[Pp]rovisional", in: "GLOSSARY.md", count: "1" }\n');
  const measured = manifest('tier: measured\ngates:\n  - grep_min: { pattern: "[Pp]rovisional", in: "GLOSSARY.md", count: "1" }\n');
  const skeleton = formatSkeleton(glossarySkill("skill-tiered"));

  const gatesOf = (m: typeof probed) => probeManifest(m, pristineFixture(`fixture-${m.tier}`), skeleton);
  assert(gatesOf(probed).some((g) => g.verdict === "format"), "the probe still reports the format gate at any tier");
  assert(blocking([{ id: "a", skill: "s", fixture: "f", skeleton: 1, gates: gatesOf(probed), tier: "probed" }]).length === 0,
    "a probed manifest's format gate is reported, never blocking");
  assert(blocking([{ id: "b", skill: "s", fixture: "f", skeleton: 1, gates: gatesOf(measured), tier: "measured" }]).length === 1,
    "a measured manifest may not carry a gate a content-free deliverable passes");
});
