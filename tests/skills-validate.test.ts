#!/usr/bin/env tsx
/**
 * Unit tests of the skill-contract validator's link resolution.
 * The command itself (`tools/skills.ts validate`) runs in CI over the real
 * skills/ tree; what needs a test of its own is the path arithmetic, because
 * it decides what an author is allowed to WRITE in a SKILL.md.
 */
import { test, assert, absent, initWork, finish, ROOT } from "./helpers.js";
import { crossSkillPaths } from "../tools/skills.js";
import { isDistributed } from "../src/lock.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS = join(ROOT, "skills");

initWork();

test("a cross-skill ref resolves from skills/, bare or prefixed with ../", () => {
  // An installed skill sees its siblings one level up (.claude/skills/<other>),
  // so `../audit-report/reference/x.md` is the path the agent actually needs.
  // Rejecting it forced the pointer to spell out two paths for one file.
  const bare = crossSkillPaths("Read `audit-report/reference/apparatus.md` first.");
  const relative = crossSkillPaths("Read `../audit-report/reference/apparatus.md` first.");
  assert(bare[0] === "audit-report/reference/apparatus.md", `bare form, got ${bare.join(",")}`);
  assert(relative[0] === "audit-report/reference/apparatus.md", `../ form, got ${relative.join(",")}`);
  assert(relative.length === 1, `the ../ form is one ref, not two: ${relative.join(",")}`);
});

test("the resolved cross-skill ref names a file that exists under skills/", () => {
  const [ref] = crossSkillPaths("see `../audit-report/reference/scoring-model.md`");
  assert(existsSync(join(ROOT, "skills", ref)), `${ref} must resolve under skills/`);
});

test("a skill's own material is not read as a cross-skill ref", () => {
  assert(crossSkillPaths("see [reference/grids.md](reference/grids.md)").length === 0,
    "a bare reference/ path belongs to the skill itself");
});

finish("skills-validate");

test("a skill's changelog lives beside it, not inside the text the agent reads", () => {
  // Every SKILL.md carried a `## Changelog` at the bottom: a few hundred bytes
  // of history, 4% of the file in the median and 9% at worst, that the agent
  // reads and can do nothing with. It says what changed on 8 August, not what
  // to do. On skills where the fight is to get the procedure followed to the
  // end - and 0 of 12 trials produced the guardrail their exit condition
  // demanded - history in the same file competes with the instruction.
  //
  // It moves to skills/<name>/CHANGELOG.md, beside the README, and is not
  // distributed. No pointer is left behind: in a repository where the skill is
  // installed the file is absent, so a pointer would dangle in every consumer -
  // the same defect as a skill pointing at a sibling that was never staged.
  for (const dir of readdirSync(SKILLS)) {
    const skill = join(SKILLS, dir, "SKILL.md");
    if (!existsSync(skill)) continue;
    absent(readFileSync(skill, "utf8"), "## Changelog", `${dir}: the changelog must not sit in the text the agent reads`);
    assert(existsSync(join(SKILLS, dir, "CHANGELOG.md")), `${dir}: CHANGELOG.md must exist beside the skill`);
  }
});

test("a per-skill changelog is never distributed", () => {
  assert(!isDistributed("skills/x/CHANGELOG.md"), "the changelog stays in the canonical repo");
  assert(isDistributed("skills/x/SKILL.md"), "the skill itself still ships");
});
