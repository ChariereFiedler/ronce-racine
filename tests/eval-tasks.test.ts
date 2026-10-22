#!/usr/bin/env tsx
/**
 * Locks the generated-task contract. Each assertion here corresponds to a
 * failure observed on a real Harbor run, not to a hypothetical.
 */
import { test, assert, contains, initWork, finish, cli, WORK, ROOT } from "./helpers.js";
import { discoverManifests, parseEvalManifest, type EvalManifest } from "../tools/eval.js";
import { generateTask, dockerfile, jobConfig, pairedArms, parseArms, taskToml, testScript, slugOf, jobNameOf, jobFileOf, selectedBy, fixtureBudget, AGENT_TIMEOUT_CAP_SEC } from "../tools/eval-tasks.js";
import { grade } from "../tools/eval-grade.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { execSync } from "node:child_process";

initWork();

/**
 * A real catalogue manifest, used here as a sample input to the task generator.
 * Discovery goes through `discoverManifests` rather than a second copy of the
 * layout rule: since the base gained per-scenario manifests, most skills have no
 * default `eval.yaml` at all, and a helper that assumed one made five of these
 * tests fail on a missing file rather than on anything they assert.
 */
const manifestOf = (skill: string): EvalManifest => {
  const ref = discoverManifests().find((r) => r.skill === skill);
  assert(ref !== undefined, `no manifest in the catalogue for ${skill}`);
  return parseEvalManifest(ref, readFileSync(ref.path, "utf8"));
};

/**
 * A manifest that exists only on disk under WORK, so a scenario can be
 * exercised without adding one to the catalogue. Returns both the parsed
 * manifest and the file it came from - the task generator has to copy THAT
 * file, not one it guessed from the skill name.
 */
function scenarioManifest(id: string, body: string): { m: EvalManifest; path: string } {
  const [skill, scenario] = id.split("/");
  const path = join(WORK, "manifests", `${slugOf(id)}.eval.yaml`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return { m: parseEvalManifest({ skill, scenario: scenario ?? null, id, path }, body), path };
}

const ONE = "fixture: minimal-go\nprompt: >\n  do one\ngates:\n  - file_exists: ONE.md\n";
const TWO = "fixture: minimal-go\nprompt: >\n  do two\ngates:\n  - file_exists: TWO.md\n";

/** Every file the agent could reach, i.e. everything baked into the image. */
function imageFiles(taskDir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else out.push(r);
    }
  };
  walk(join(taskDir, "environment"), "");
  return out;
}

test("the generated image never contains the manifest grading the agent", () => {
  // Harbor uploads a skill directory verbatim, and an image is equally literal:
  // anything copied in is readable by the agent for the whole run.
  const dir = generateTask(manifestOf("recurring-bug-root-cause"), join(WORK, "tasks1"));
  const inImage = imageFiles(dir);
  assert(!inImage.some((f) => f.endsWith("eval.yaml")), `eval.yaml must not be in the image: ${inImage.join(", ")}`);
  assert(existsSync(join(dir, "tests", "eval.yaml")), "it belongs in tests/, uploaded with the verifier");
});

test("the generated image strips the fixture's ground truth", () => {
  const dir = generateTask(manifestOf("recurring-bug-root-cause"), join(WORK, "tasks2"));
  assert(!imageFiles(dir).some((f) => f.endsWith("EXPECTED.md")), "EXPECTED.md is for the eval author, not the agent");
});

test("the ground truth is not reachable through git either", () => {
  // Found 2026-09-02: the worktree copy was removed, but the fixture had been
  // `git add -A`ed, so `git show :EXPECTED.md` printed the answer key inside
  // the image - and on a fixture with commits it sat in HEAD as well.
  for (const skill of ["recurring-bug-root-cause", "detection-sweep"]) {
    const dir = generateTask(manifestOf(skill), join(WORK, `tasks2-git-${skill}`));
    const repo = join(dir, "environment", "repo");
    const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    assert(git("ls-files EXPECTED.md") === "", `${skill}: EXPECTED.md is in the index`);
    assert(git("log --all --oneline -- EXPECTED.md") === "", `${skill}: EXPECTED.md is in the history`);
  }
});

test("the instruction is the manifest prompt, verbatim", () => {
  // If the trial asks something else than the eval declares, the measurement is
  // of a different task.
  const m = manifestOf("recurring-bug-root-cause");
  const dir = generateTask(m, join(WORK, "tasks3"));
  assert(readFileSync(join(dir, "instruction.md"), "utf8").trim() === m.prompt.trim(), "instruction must match the manifest prompt");
});

test("the test script is executable, or Harbor cannot run the verifier", () => {
  const dir = generateTask(manifestOf("recurring-bug-root-cause"), join(WORK, "tasks4"));
  const mode = statSync(join(dir, "tests", "test.sh")).mode;
  assert((mode & 0o111) !== 0, `test.sh must be executable, got mode ${(mode & 0o777).toString(8)}`);
});

test("the image pre-installs what Harbor's agent setup would otherwise apt-get", () => {
  // Measured 2026-08-24: on a base whose node did not come from apt, the setup
  // step reinstalled it and blew the 360s timeout on both arms.
  const df = dockerfile();
  for (const pkg of ["curl", "bash", "nodejs", "npm", "procps"]) {
    contains(df, pkg, `${pkg} must be present before the agent setup runs`);
  }
});

test("the two job arms differ only by their skills list", () => {
  const yaml = jobConfig("/t/task", pairedArms("/s/skill"), {
    model: "claude-sonnet-5", attempts: 6, concurrent: 4, jobName: "j", jobsDir: "/j",
  });
  const arms = yaml.split("- name: claude-code").slice(1);
  assert(arms.length === 2, `expected 2 arms, got ${arms.length}`);

  // Everything an arm declares before its skills list must match its twin.
  const beforeSkills = arms.map((a) => a.slice(0, a.indexOf("skills:")));
  assert(beforeSkills[0] === beforeSkills[1], `arms must be identical apart from skills:\n${beforeSkills[0]}\n---\n${beforeSkills[1]}`);
  assert(arms[0].includes("skills: []"), "the first arm runs without the skill");
  assert(arms[1].includes("/s/skill"), "the second arm installs it");
});

test("a job pairs one task with its own skill, never with the whole catalogue", () => {
  // Putting every skill in the with-arm would measure "the toolkit vs nothing"
  // and say nothing about which skill contributed - and it would let the agent
  // invoke a different one than the task is meant to exercise.
  const yaml = jobConfig("/t/alpha", pairedArms("/s/alpha"), {
    model: "m", attempts: 2, concurrent: 4, jobName: "j", jobsDir: "/j",
  });
  assert(!yaml.includes("/s/beta"), `a job for alpha must not install beta:\n${yaml}`);
});

test("parseArms reads name, colon, comma-separated skill dirs; empty means no skill", () => {
  const arms = parseArms("nothing:;mono:/s/mono;thin:/s/thin/a,/s/thin/b");
  assert(arms.length === 3, `expected 3 arms, got ${arms.length}`);
  assert(arms[0].name === "nothing" && arms[0].skills.length === 0, "an empty list is the no-skill arm");
  assert(arms[1].name === "mono" && arms[1].skills.join() === "/s/mono", "one dir");
  assert(arms[2].name === "thin" && arms[2].skills.join() === "/s/thin/a,/s/thin/b", "two dirs, both kept in order");
});

test("parseArms rejects what would make arms indistinguishable in the report", () => {
  const rejects = (spec: string, why: string) => {
    let message = "";
    try { parseArms(spec); } catch (e) { message = String(e); }
    assert(message.includes("arm") && !message.includes("is not a function"), `${why}: ${JSON.stringify(spec)} must be rejected, got ${JSON.stringify(message)}`);
  };
  rejects("a:/x;a:/y", "two arms with the same name");
  rejects(":/x", "an arm without a name");
  rejects("solo:/x", "a single arm has nothing to contrast with");
  rejects("with skill:/x", "a name Harbor could not carry as an agent name");
});

test("explicit arms keep their names in the job, so result.json can tell them apart", () => {
  // Harbor writes config.agent.name into every trial's result.json. Two arms
  // both called claude-code can only be told apart by their skills list, which
  // stops working the moment two arms install skills.
  const yaml = jobConfig("/t/task", parseArms("nothing:;mono:/s/mono;thin:/s/thin/a,/s/thin/b"), {
    model: "claude-sonnet-5", attempts: 6, concurrent: 4, jobName: "j", jobsDir: "/j",
  });
  const arms = yaml.split(/\n {2}- name: /).slice(1);
  assert(arms.length === 3, `expected 3 agents, got ${arms.length}`);
  assert(arms.map((a) => a.split("\n")[0]).join() === "nothing,mono,thin", "each agent carries its arm name");

  // A name Harbor does not know must come with the class to run, or the trial
  // fails at agent creation. Every explicit arm gets the same one.
  for (const a of arms) contains(a, "import_path: harbor.agents.installed.claude_code:ClaudeCode", "explicit arm resolves to claude-code");
  const beforeSkills = arms.map((a) => a.slice(a.indexOf("\n"), a.indexOf("skills:")));
  assert(new Set(beforeSkills).size === 1, `arms must be identical apart from name and skills:\n${beforeSkills.join("\n---\n")}`);

  contains(arms[0], "skills: []", "the nothing arm installs no skill");
  assert(/skills:\n {6}- \/s\/mono$/m.test(arms[1]), `mono installs its one dir:\n${arms[1]}`);
  assert(/skills:\n {6}- \/s\/thin\/a\n {6}- \/s\/thin\/b$/m.test(arms[2]), `thin installs both dirs:\n${arms[2]}`);
});

test("the default arms are unchanged by the arms machinery", () => {
  // The running sweep and every recorded run use this shape; a report reads
  // an arm named claude-code by its skills list, so the name must stay.
  const yaml = jobConfig("/t/task", pairedArms("/s/skill"), {
    model: "m", attempts: 2, concurrent: 4, jobName: "j", jobsDir: "/j",
  });
  assert(yaml.split("- name: claude-code").length === 3, "both default arms are named claude-code");
  assert(!yaml.includes("import_path"), "the default arms need no import path");
});

test("two scenarios of one skill generate two task dirs, neither overwriting the other", () => {
  // generateTask rmSync's its own dir first. Keyed on the bare skill name, the
  // second scenario deleted the first scenario's task and both jobs then ran
  // whichever one was generated last.
  const out = join(WORK, "tasks-scenarios");
  const one = scenarioManifest("alpha/one", ONE);
  const two = scenarioManifest("alpha/two", TWO);

  const dirOne = generateTask(one.m, out, one.path);
  const dirTwo = generateTask(two.m, out, two.path);

  assert(basename(dirOne) === "alpha--one", `first task dir was ${basename(dirOne)}`);
  assert(basename(dirTwo) === "alpha--two", `second task dir was ${basename(dirTwo)}`);
  assert(existsSync(join(dirOne, "task.toml")), "generating the second scenario deleted the first task");
  contains(readFileSync(join(dirOne, "instruction.md"), "utf8"), "do one", "the first task kept its own prompt");
});

test("each task ships the manifest of ITS scenario, byte for byte", () => {
  // The oracle used to be read from skills/<skill>/eval.yaml whatever the
  // scenario, so a scenario was graded against another scenario's gates - a
  // silent wrong answer, since both files parse.
  const out = join(WORK, "tasks-own-manifest");
  const one = scenarioManifest("alpha/one", ONE);
  const two = scenarioManifest("alpha/two", TWO);

  const shipped = (dir: string) => readFileSync(join(dir, "tests", "eval.yaml"), "utf8");
  assert(shipped(generateTask(one.m, out, one.path)) === ONE, "scenario one must be graded by its own manifest");
  assert(shipped(generateTask(two.m, out, two.path)) === TWO, "scenario two must be graded by its own manifest");
});

test("the default manifest still lands under the bare skill name", () => {
  // Every recorded run and every job on disk names its task directory after the
  // skill; a slug that changed for the default manifest would orphan them.
  const dir = generateTask(manifestOf("recurring-bug-root-cause"), join(WORK, "tasks-default"));
  assert(basename(dir) === "recurring-bug-root-cause", `default task dir was ${basename(dir)}`);
});

test("the Harbor task name carries the scenario slug, so the report groups them apart", () => {
  // task.toml's name is what lands in result.json.task_name, which is
  // eval-report.ts's grouping key. Two scenarios sharing it pool into one
  // measurement. A slash would also make it a two-segment Harbor name.
  const one = scenarioManifest("alpha/one", ONE);
  const budget = fixtureBudget(join(ROOT, "playground", "fixtures", "minimal-go"));
  const toml = taskToml(one.m, budget);
  contains(toml, 'name = "ronce-racine/alpha--one"', "the task name is the slug");
  assert(!toml.includes('name = "ronce-racine/alpha"\n'), `the bare skill name must not be the task name:\n${toml}`);
  contains(toml, "alpha/one", "the description names the scenario, not just the skill");

  contains(taskToml(manifestOf("recurring-bug-root-cause"), budget), 'name = "ronce-racine/recurring-bug-root-cause"', "a default manifest keeps its name");
});

test("the verifier tells the grader which scenario it is grading", () => {
  // The container sees only /tests/eval.yaml, whose name says nothing. Without
  // --scenario, checks.json cannot say which manifest produced it and the judge
  // pass resolves the wrong criteria.
  // Quoted, always: an unquoted empty value would shift --out into --scenario's
  // slot and the grader would read its own output path as the scenario name.
  contains(testScript("alpha", "one"), '--scenario "one"', "a scenario is passed through");
  contains(testScript("alpha", null), '--scenario ""', "the default manifest passes an empty scenario");
});

test("grade() splits the id, so checks.json names the skill and the scenario apart", () => {
  // The judge resolves skills/<skill>/evals/<scenario>.eval.yaml from these two
  // fields; a single glued string would not tell it where to look.
  const ctx = { repoDir: join(WORK, "nonexistent-repo"), transcript: "", exitCode: 0, baseline: new Map<string, string>() };
  const scoped = grade(ONE.replace("gates:\n  - file_exists: ONE.md\n", ""), "alpha/one", ctx);
  assert(scoped.skill === "alpha", `skill was ${scoped.skill}`);
  assert(scoped.scenario === "one", `scenario was ${scoped.scenario}`);

  const dflt = grade(ONE.replace("gates:\n  - file_exists: ONE.md\n", ""), "alpha", ctx);
  assert(dflt.skill === "alpha" && dflt.scenario === null, `default manifest reported ${JSON.stringify(dflt.scenario)}`);
});

test("the grader writes the scenario into checks.json", () => {
  // checks.json is the only channel from inside the container to the later,
  // out-of-container judge pass.
  const repo = join(WORK, "graded-repo");
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, "ONE.md"), "done\n");
  const manifest = join(WORK, "graded.eval.yaml");
  writeFileSync(manifest, ONE);

  const readChecks = (args: string[], out: string) => {
    const r = cli([join(ROOT, "tools", "eval-grade.ts"), "grade", manifest, repo, "--out", out, ...args]);
    assert(r.status === 0, `grade exited ${r.status}: ${r.stderr}`);
    return JSON.parse(readFileSync(out.replace(/reward\.json$/, "checks.json"), "utf8"));
  };

  const scoped = readChecks(["--skill", "alpha", "--scenario", "one"], join(WORK, "out-scoped", "reward.json"));
  assert(scoped.skill === "alpha" && scoped.scenario === "one", `checks.json said ${JSON.stringify(scoped.skill)}/${JSON.stringify(scoped.scenario)}`);

  // Both the absent flag and the empty one the generated verifier ships mean
  // "the skill's own eval.yaml", never a scenario literally named "".
  const omitted = readChecks(["--skill", "alpha"], join(WORK, "out-omitted", "reward.json"));
  assert(omitted.scenario === null, `an omitted --scenario must record null, got ${JSON.stringify(omitted.scenario)}`);
  const empty = readChecks(["--skill", "alpha", "--scenario", ""], join(WORK, "out-empty", "reward.json"));
  assert(empty.skill === "alpha" && empty.scenario === null, `an empty --scenario must record null, got ${JSON.stringify(empty.scenario)}`);
});

test("the job name and the job file carry the slug", () => {
  // Both defaulted to the skill name: two scenarios wrote the same job file and
  // Harbor saw one job name for two measurements.
  assert(jobNameOf("alpha/one") === "lift-alpha--one", `job name was ${jobNameOf("alpha/one")}`);
  assert(jobNameOf("alpha") === "lift-alpha", `default job name was ${jobNameOf("alpha")}`);
  assert(jobFileOf("job.yaml", "alpha/one") === "job-alpha--one.yaml", `job file was ${jobFileOf("job.yaml", "alpha/one")}`);
  assert(jobFileOf("job.yaml", "alpha/two") !== jobFileOf("job.yaml", "alpha/one"), "two scenarios must not share a job file");
});

test("--only selects a whole skill or a single scenario", () => {
  const ref = { skill: "alpha", scenario: "one", id: "alpha/one", path: "x" };
  assert(selectedBy(ref, undefined), "no --only selects everything");
  assert(selectedBy(ref, "alpha"), "--only <skill> selects every scenario of it");
  assert(selectedBy(ref, "alpha/one"), "--only <skill>/<scenario> selects that one");
  assert(!selectedBy(ref, "alpha/two"), "a sibling scenario is not selected");
  assert(!selectedBy(ref, "beta"), "another skill is not selected");
});


/** A synthetic fixture of a chosen shape, to size a budget against. */
function fixtureOfSize(name: string, files: number, bytesPerFile: number): string {
  const dir = join(WORK, "sized", name);
  mkdirSync(join(dir, "src"), { recursive: true });
  for (let i = 0; i < files; i++) {
    writeFileSync(join(dir, "src", `mod-${i}.ts`), "x".repeat(bytesPerFile));
  }
  return dir;
}

test("the agent budget grows with the fixture, not with a constant", () => {
  // Found by the fixture-realism audit (2026-09-02): timeout_sec was hardcoded
  // at 1200s, sized for 2-to-10-file fixtures. On a 20+ file repository both
  // arms time out and score zero, which reads exactly like "no lift".
  const small = fixtureBudget(fixtureOfSize("small", 3, 400));
  const realistic = fixtureBudget(fixtureOfSize("realistic", 40, 3000));

  assert(realistic.timeoutSec > small.timeoutSec, `a 40-file fixture must get more than a 3-file one: ${realistic.timeoutSec} vs ${small.timeoutSec}`);
  assert(realistic.timeoutSec >= 40 * 60, `a 40-file, ~120 KiB fixture needs well past the old 20 minutes, got ${realistic.timeoutSec}s`);
});

test("the budget keys on both file count and size, so neither alone can fool it", () => {
  const base = fixtureBudget(fixtureOfSize("base", 10, 1000)).timeoutSec;
  const moreFiles = fixtureBudget(fixtureOfSize("more-files", 30, 1000)).timeoutSec;
  const biggerFiles = fixtureBudget(fixtureOfSize("bigger-files", 10, 20_000)).timeoutSec;

  assert(moreFiles > base, `20 extra files must buy time: ${moreFiles} vs ${base}`);
  assert(biggerFiles > base, `the same 10 files, 20x longer, must buy time: ${biggerFiles} vs ${base}`);
});

test("no fixture drops below the budget every recorded run was given", () => {
  // Both arms of a recorded run had 1200s. A formula that handed today's tiny
  // fixtures less would silently change the conditions those results were
  // measured under.
  const empty = join(WORK, "sized", "empty");
  mkdirSync(empty, { recursive: true });
  assert(fixtureBudget(empty).timeoutSec >= 1200, `floor must hold, got ${fixtureBudget(empty).timeoutSec}`);
});

test("the budget is capped, so a runaway fixture cannot stall the whole sweep", () => {
  const huge = fixtureBudget(fixtureOfSize("huge", 500, 100_000));
  assert(huge.timeoutSec === AGENT_TIMEOUT_CAP_SEC, `expected the cap ${AGENT_TIMEOUT_CAP_SEC}, got ${huge.timeoutSec}`);
});

test("an explicit override wins over the derived budget, and garbage is refused", () => {
  // The escape hatch for the fixture whose cost the formula cannot see - a
  // build to run, a long test suite - without every author having to think
  // about the budget for the ordinary case.
  const dir = fixtureOfSize("overridden", 3, 400);
  assert(fixtureBudget(dir, 2700).timeoutSec === 2700, "an override is taken verbatim");

  for (const bad of [0, -60, Number.NaN, Number.POSITIVE_INFINITY]) {
    let message = "";
    try { fixtureBudget(dir, bad); } catch (e) { message = String(e); }
    assert(message.includes("timeout"), `${bad} must be refused, got ${JSON.stringify(message)}`);
  }
});

test("the task carries its own budget, and a bigger fixture gets a bigger one", () => {
  const lean = taskToml(manifestOf("recording-decisions"), fixtureBudget(join(ROOT, "playground", "fixtures", "minimal-go")));
  const fuller = taskToml(manifestOf("domain-glossary"), fixtureBudget(join(ROOT, "playground", "fixtures", "mixed-vocabulary")));
  const agentTimeout = (toml: string): number =>
    Number(/\[agent\]\ntimeout_sec = ([\d.]+)/.exec(toml)?.[1] ?? Number.NaN);

  assert(Number.isFinite(agentTimeout(lean)), `no agent timeout in:\n${lean}`);
  assert(agentTimeout(fuller) > agentTimeout(lean), `the 6-file fixture must outrank the 2-file one: ${agentTimeout(fuller)} vs ${agentTimeout(lean)}`);
});

test("the granted budget is readable after the fact, without re-deriving it", () => {
  // A trial that got 20 minutes and one that got 45 are otherwise
  // indistinguishable once the run is over, and a timeout would be blamed on
  // the agent rather than on the budget.
  const dir = generateTask(manifestOf("domain-glossary"), join(WORK, "tasks-budget"));
  const toml = readFileSync(join(dir, "task.toml"), "utf8");
  const budget = fixtureBudget(join(dir, "environment", "repo"));

  contains(toml, `agent_timeout_sec = ${budget.timeoutSec}`, "the granted budget is recorded in the task metadata");
  contains(toml, `fixture_files = ${budget.files}`, "and what it was derived from");
  contains(toml, `fixture_kib = ${budget.kib}`, "and what it was derived from");
  assert(budget.files > 0, "the fixture the agent sees must be measured, not the empty dir");
});

test("the generated task's budget is the one its own fixture earned", () => {
  const lean = generateTask(manifestOf("recording-decisions"), join(WORK, "tasks-budget-lean"));
  const fuller = generateTask(manifestOf("domain-glossary"), join(WORK, "tasks-budget-fuller"));
  const agentTimeout = (dir: string): number =>
    Number(/\[agent\]\ntimeout_sec = ([\d.]+)/.exec(readFileSync(join(dir, "task.toml"), "utf8"))?.[1] ?? Number.NaN);
  assert(agentTimeout(fuller) > agentTimeout(lean), `${agentTimeout(fuller)} vs ${agentTimeout(lean)}`);
});

test("generateTask takes the override too, so --agent-timeout reaches the task", () => {
  const dir = generateTask(manifestOf("recording-decisions"), join(WORK, "tasks-budget-override"), undefined, 2700);
  contains(readFileSync(join(dir, "task.toml"), "utf8"), "timeout_sec = 2700", "the override reaches task.toml");
});

finish("eval-tasks");

test("pairedArms stages the sibling a thin skill delegates its apparatus to", () => {
  // Two skills keep their scoring apparatus next door: audit-security and
  // audit-testing both say to read `../audit-report/reference/apparatus.md`,
  // and the score rule, the confidence levels and the handling of
  // non-auditable items live there and nowhere else. Harbor uploads a staged
  // skill directory verbatim, so staging one directory ships a skill whose
  // central pointer dangles - and the audit scenarios gate exactly what that
  // file defines. The escape hatch exists (`--arms` takes two dirs) and asking
  // the operator to remember it per skill is not a fix: the pointer is a
  // literal `../<skill>/` in the skill's own text, so the generator can see it.
  const staging = join(WORK, "thin-skill-staging");
  mkdirSync(join(staging, "audit-thin"), { recursive: true });
  mkdirSync(join(staging, "audit-apparatus", "reference"), { recursive: true });
  writeFileSync(join(staging, "audit-thin", "SKILL.md"),
    "Read `../audit-apparatus/reference/grid.md` before writing the report.\n");
  writeFileSync(join(staging, "audit-apparatus", "reference", "grid.md"), "the grid\n");

  const arms = pairedArms(join(staging, "audit-thin"));
  const withSkill = arms[1].skills;
  assert(withSkill.length === 2, `the sibling must be staged too, got ${JSON.stringify(withSkill)}`);
  assert(withSkill.some((d) => d.endsWith("audit-apparatus")), `the sibling is missing: ${JSON.stringify(withSkill)}`);
  assert(arms[0].skills.length === 0, "the no-skill arm stays empty");
});

test("pairedArms ignores a pointer to a sibling that is not staged", () => {
  // A dangling pointer in the text must not put a path that does not exist
  // into the job: Harbor would fail the upload rather than the measurement,
  // which turns a skill defect into an infrastructure error.
  const staging = join(WORK, "thin-skill-dangling");
  mkdirSync(join(staging, "lonely"), { recursive: true });
  writeFileSync(join(staging, "lonely", "SKILL.md"), "Read `../gone/reference/x.md`.\n");

  const arms = pairedArms(join(staging, "lonely"));
  assert(arms[1].skills.length === 1, `only what exists is staged, got ${JSON.stringify(arms[1].skills)}`);
});
