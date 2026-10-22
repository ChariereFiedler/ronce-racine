#!/usr/bin/env tsx
/**
 * Generates Harbor tasks from the eval manifests.
 *
 *   npx tsx tools/eval-tasks.ts <out-dir> [--only <skill>|<skill>/<scenario>] [--agent-timeout <sec>]
 *   npx tsx tools/eval-tasks.ts <out-dir> --only <skill>/<scenario> --job job.yaml --arms "nothing:;mono:<dir>;thin:<dir>,<dir>"
 *
 * The manifests stay the single source of truth - `skills/<name>/eval.yaml` for
 * a skill's default scenario, `skills/<name>/evals/<scenario>.eval.yaml` for the
 * others; everything under <out-dir> is derived and safe to delete. Nothing here
 * calls an agent.
 *
 * Four things the generated task must get right, each learned the hard way:
 *
 *  - The image satisfies Harbor's agent-setup packages up front. Harbor runs
 *    `apt-get install -y curl bash nodejs npm procps` inside every trial; on a
 *    base where node came from elsewhere, apt reinstalls it and the setup
 *    times out.
 *  - The manifest ships in tests/, never in the image. It reaches the container
 *    with the verifier, after the agent is done, so the agent cannot read the
 *    oracle that grades it.
 *  - EXPECTED.md is stripped. It is the fixture's ground truth, written for the
 *    eval author, not for the agent under test.
 *  - The agent's time budget follows the fixture (see fixtureBudget). Fixed at
 *    1200s it fits a 30-line fixture and starves a 40-file one, and a trial
 *    that times out on both arms is a null result that reads as "no lift".
 *    `--agent-timeout <sec>` overrides it for the fixture whose cost the
 *    formula cannot see.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SUBJECT, parseEvalManifest, discoverManifests, snapshotRepo, type EvalManifest, type ManifestRef } from "./eval.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The scenario id as a single path/name segment. A Harbor task name, a task
 * directory and a job file all take one, and `<skill>/<scenario>` would read as
 * two segments in each of them.
 */
export const slugOf = (id: string): string => id.replace(/\//g, "--");

/** Default job name: one job per scenario, never per skill. */
export const jobNameOf = (id: string): string => `lift-${slugOf(id)}`;

/** Where the job of scenario `id` is written when one path serves several. */
export const jobFileOf = (jobPath: string, id: string): string =>
  jobPath.replace(/(\.ya?ml)?$/, `-${slugOf(id)}.yaml`);

/**
 * `--only audit-security` takes every scenario of the skill, `--only
 * audit-security/runtime-out-of-reach` takes exactly one.
 */
export const selectedBy = (ref: ManifestRef, only: string | undefined): boolean =>
  !only || ref.id === only || ref.skill === only;

/**
 * Where a manifest lives, resolved the way eval-judge.ts resolves it from
 * checks.json. Callers that already hold the discovered path pass it instead.
 */
export function manifestPathOf(m: EvalManifest): string {
  return m.scenario
    ? join(ROOT, SUBJECT.dir, m.skill, "evals", `${m.scenario}.eval.yaml`)
    : join(ROOT, SUBJECT.dir, m.skill, "eval.yaml");
}

/** Packages Harbor's installed-agent setup expects to already be there. */
const AGENT_SETUP_PACKAGES = "git ca-certificates curl bash nodejs npm procps";
const TSX_VERSION = "4.20.3";

/**
 * What a fixture costs the agent, and the wall clock it is granted for it.
 * `files` and `kib` are kept so a finished trial can be read back without
 * running this over a fixture that may since have grown.
 */
export interface FixtureBudget { files: number; kib: number; timeoutSec: number }

/**
 * The budget every recorded run so far was given. Kept as the floor: a formula
 * that handed today's 2-to-10-file fixtures LESS would quietly change the
 * conditions those results were measured under.
 */
const AGENT_TIMEOUT_FLOOR_SEC = 1200;
/**
 * One tool round trip per file, whatever its size - orientation on an
 * unfamiliar repo opens nearly every file before the first edit.
 */
const AGENT_TIMEOUT_PER_FILE_SEC = 20;
/** What those round trips carry: a 2000-line file is one round trip, not one read. */
const AGENT_TIMEOUT_PER_KIB_SEC = 6;
/**
 * A trial still running after an hour is stuck, not slow, and the sweep pays
 * for it arms x attempts times over. Reaching the cap is reported, never silent.
 */
export const AGENT_TIMEOUT_CAP_SEC = 3600;

/**
 * The agent's wall clock, derived from the fixture instead of fixed at 1200s.
 *
 * A constant was right while every fixture was 6 to 33 lines: the agent read
 * the whole repo in one call. On a realistic one - 20+ files, several hundred
 * lines - orientation alone burns minutes, and a trial that times out on BOTH
 * arms scores zero on both. That null result is indistinguishable from "the
 * skill does not help", the most expensive answer this harness can produce.
 *
 * Keyed on what the agent must pull into context: a per-file term for the
 * round trips, a per-KiB term for what those round trips carry. NOT on commit
 * count - history arrives through `git log`, one call that costs the same at 3
 * commits or 300, and a fixture whose history matters pays for it through the
 * files those commits touch. Measured over what the agent actually sees, so
 * .git, node_modules and build output cost nothing (snapshotRepo already draws
 * that line for the grader).
 *
 * The coefficients are an engineering estimate, not a measurement: no run on a
 * large fixture exists yet to fit them to. They are deliberately generous -
 * unused budget costs nothing, an exhausted one costs the trial - and every
 * task records what it was granted, so the first large sweep can correct them
 * against real trial durations.
 */
export function fixtureBudget(repoDir: string, overrideSec?: number): FixtureBudget {
  if (overrideSec !== undefined && (!Number.isFinite(overrideSec) || overrideSec <= 0)) {
    throw new Error(`agent timeout override ${JSON.stringify(overrideSec)}: expected a positive number of seconds`);
  }
  const contents = snapshotRepo(repoDir);
  let bytes = 0;
  for (const c of contents.values()) bytes += Buffer.byteLength(c);
  const kib = bytes / 1024;

  const derived = AGENT_TIMEOUT_FLOOR_SEC
    + AGENT_TIMEOUT_PER_FILE_SEC * contents.size
    + AGENT_TIMEOUT_PER_KIB_SEC * kib;
  const timeoutSec = overrideSec ?? Math.min(AGENT_TIMEOUT_CAP_SEC, Math.round(derived));
  // One decimal, not a whole KiB: today's fixtures are all under 2 KiB and
  // would every one of them read as "1" in the metadata that has to explain a
  // budget.
  return { files: contents.size, kib: Math.round(kib * 10) / 10, timeoutSec };
}

export function taskToml(m: EvalManifest, budget: FixtureBudget): string {
  return `schema_version = "1.4"
artifacts = []

[task]
name = "ronce-racine/${slugOf(m.id)}"
version = "1.0.0"
description = "Skill eval: ${m.id} against the ${m.fixture} fixture"
authors = []
keywords = []

# What the agent was granted, and what earned it. A trial that got 20 minutes
# and one that got 45 are otherwise indistinguishable once the run is over, and
# a timeout would read as the agent failing rather than the budget binding.
[metadata]
fixture_files = ${budget.files}
fixture_kib = ${budget.kib}
agent_timeout_sec = ${budget.timeoutSec}

[verifier]
timeout_sec = 300.0
collect = []

[verifier.env]

[agent]
timeout_sec = ${budget.timeoutSec}.0

[environment]
network_mode = "public"
build_timeout_sec = 900.0
os = "linux"
mcp_servers = []

[environment.env]

[solution.env]
`;
}

export function dockerfile(): string {
  return `FROM debian:bookworm-slim

# Harbor's agent setup runs \`apt-get install -y curl bash nodejs npm procps\`
# in every trial. Installing them here from the same source makes that a no-op
# instead of a multi-minute reinstall that blows the setup timeout.
RUN apt-get update && apt-get install -y --no-install-recommends ${AGENT_SETUP_PACKAGES} \\
    && rm -rf /var/lib/apt/lists/* \\
    && npm install -g tsx@${TSX_VERSION}

# The grader sits outside /app so the agent's tree is exactly the fixture. It
# carries no manifest: the oracle arrives with the verifier, once the agent is
# finished.
COPY grader/ /grader/

WORKDIR /app
COPY repo/ /app/

# Snapshot before the agent exists, so repo_clean has a baseline to diff.
RUN tsx /grader/eval-grade.ts snapshot /app /grader/baseline.json
`;
}

/**
 * `--scenario` is empty for a skill's default manifest. The container sees the
 * manifest as `/tests/eval.yaml` whatever its origin, so this argument is the
 * only thing that lets the grader record which one produced the scores.
 */
export function testScript(skill: string, scenario: string | null): string {
  return `#!/bin/bash
# The manifest reaches the container only now, with the verifier.
mkdir -p /logs/verifier

tsx /grader/eval-grade.ts grade /tests/eval.yaml /app \\
  --baseline /grader/baseline.json \\
  --skill ${skill} \\
  --scenario "${scenario ?? ""}" \\
  --out /logs/verifier/reward.json \\
  --artifacts /logs/verifier/artifacts.md

# Fail closed: a grader that produced no reward is an infrastructure fault and
# must not be read as a score of zero.
if [ ! -s /logs/verifier/reward.json ]; then
  echo "grader produced no reward" >&2
  exit 1
fi
cat /logs/verifier/reward.json
`;
}

/** One agent of a job: a name the report can group by, and what it installs. */
export interface Arm { name: string; skills: string[] }

/**
 * Harbor resolves `name` against its agent registry, so an arm named after
 * what it tests needs the class spelled out. The default arms keep the
 * registry name and need nothing more.
 */
const HARBOR_AGENT_NAME = "claude-code";
const HARBOR_AGENT_CLASS = "harbor.agents.installed.claude_code:ClaudeCode";
const ARM_SEPARATOR = ";";
const SKILL_SEPARATOR = ",";
/** Anything Harbor could not carry as an agent name, or the report as a label. */
const ARM_NAME = /^[A-Za-z0-9_-]+$/;
const MIN_ARMS = 2;

/**
 * The two arms of a paired job. They differ by `skills` and nothing else, so
 * whatever separates their scores is the skill's doing.
 */
export function pairedArms(skillDir: string): Arm[] {
  return [
    { name: HARBOR_AGENT_NAME, skills: [] },
    { name: HARBOR_AGENT_NAME, skills: [skillDir, ...siblingDirs(skillDir)] },
  ];
}

/** `../<skill>/...` inside a SKILL.md - the thin-skill pointer, as written. */
const SIBLING_POINTER = /\.\.\/([a-z0-9][a-z0-9-]*)\//g;

/**
 * The sibling skill directories a thin skill delegates to, staged beside it.
 *
 * Harbor uploads a staged skill directory verbatim and nothing else, so a
 * skill whose apparatus lives next door - `audit-security` and `audit-testing`
 * both send the reader to `../audit-report/reference/apparatus.md` for the
 * score rule, the confidence levels and the handling of non-auditable items -
 * arrives in the image with its central pointer dangling. The with-skill arm
 * then measures a broken skill, and the audit scenarios gate exactly what that
 * file defines. `--arms` can stage two directories by hand; asking the operator
 * to remember that per skill is not a fix when the pointer is a literal path in
 * the skill's own text.
 *
 * A pointer to something absent is dropped rather than staged: a path Harbor
 * cannot upload turns a skill defect into an infrastructure error, which the
 * report is required to treat as never-a-regression and would hide it.
 */
export function siblingDirs(skillDir: string): string[] {
  const skillMd = join(skillDir, SUBJECT.doc);
  if (!existsSync(skillMd)) return [];
  const parent = dirname(skillDir);
  const self = basename(skillDir);
  const names = new Set<string>();
  for (const [, name] of readFileSync(skillMd, "utf8").matchAll(SIBLING_POINTER)) {
    if (name !== self && existsSync(join(parent, name))) names.add(name);
  }
  return [...names].sort().map((n) => join(parent, n));
}

/**
 * `nothing:;mono:/s/mono;thin:/s/thin/a,/s/thin/b` - name, colon, the skill
 * dirs the arm installs. An arm installing two dirs is how a skill that points
 * at a sibling (`../audit-report/...`) gets its target into the image.
 */
export function parseArms(spec: string): Arm[] {
  const arms = spec.split(ARM_SEPARATOR).filter((s) => s.trim() !== "").map((entry) => {
    const colon = entry.indexOf(":");
    if (colon === -1) throw new Error(`arm ${JSON.stringify(entry)}: expected <name>:<dir>[,<dir>]`);
    const name = entry.slice(0, colon).trim();
    if (!ARM_NAME.test(name)) throw new Error(`arm name ${JSON.stringify(name)}: use letters, digits, - or _`);
    const skills = entry.slice(colon + 1).split(SKILL_SEPARATOR).map((d) => d.trim()).filter(Boolean);
    return { name, skills };
  });
  if (arms.length < MIN_ARMS) throw new Error(`--arms needs at least ${MIN_ARMS} arms to contrast`);
  const names = arms.map((a) => a.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`arm name ${JSON.stringify(dup)} used twice - the report could not tell them apart`);
  return arms;
}

function armYaml(arm: Arm, model: string): string {
  const skills = arm.skills.length ? `skills:\n${arm.skills.map((d) => `      - ${d}`).join("\n")}` : "skills: []";
  const importPath = arm.name === HARBOR_AGENT_NAME ? [] : [`    import_path: ${HARBOR_AGENT_CLASS}`];
  return [`  - name: ${arm.name}`, ...importPath, `    model_name: ${model}`, `    ${skills}`].join("\n");
}

export function jobConfig(taskDir: string, arms: Arm[], opts: { model: string; attempts: number; concurrent: number; jobName: string; jobsDir: string }): string {
  // One task, one skill. Installing the whole catalogue in the with-arm would
  // measure "the toolkit vs nothing" - it could not attribute a gap to any
  // skill, and would let the agent reach for a different one than the task is
  // there to exercise.
  const taskDirs = [taskDir];
  const explicit = arms.some((a) => a.name !== HARBOR_AGENT_NAME);
  const armsNote = explicit
    ? `# Named arms: the name lands in each trial's result.json (config.agent.name),
# which is how eval-report.ts --contrast <a>:<b> pairs them. An arm listing
# two dirs installs both: a skill that reads a sibling skill's reference file
# has that sibling staged next to it, or the pointer dangles in the image.
`
    : "";
  return `job_name: ${opts.jobName}
jobs_dir: ${opts.jobsDir}
n_attempts: ${opts.attempts}
n_concurrent_trials: ${opts.concurrent}
agent_setup_timeout_multiplier: 3.0

# The arms differ by their skills list. Same task, same model, same
# permissions, a fresh container each - so any gap is attributable to what
# the skills list changed.
${armsNote}agents:
${arms.map((a) => armYaml(a, opts.model)).join("\n")}

tasks:
${taskDirs.map((d) => `  - path: ${d}`).join("\n")}
`;
}

/** Materializes one task directory. Returns where it landed. */
export function generateTask(m: EvalManifest, outDir: string, manifestPath: string = manifestPathOf(m), agentTimeoutSec?: number): string {
  const fixture = join(ROOT, "playground", "fixtures", m.fixture);
  if (!existsSync(fixture)) throw new Error(`fixture ${m.fixture} missing - run playground/setup.ts`);

  // Keyed on the bare skill, the rmSync below deleted the previous scenario's
  // task and both jobs then pointed at whichever was generated last.
  const dir = join(outDir, slugOf(m.id));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "environment", "grader"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });

  cpSync(fixture, join(dir, "environment", "repo"), { recursive: true });
  // Ground truth for the eval author, not for the agent under test.
  rmSync(join(dir, "environment", "repo", "EXPECTED.md"), { force: true });

  for (const tool of ["eval.ts", "eval-grade.ts"]) {
    cpSync(join(ROOT, "tools", tool), join(dir, "environment", "grader", tool));
  }
  // This scenario's own manifest. Reading skills/<skill>/eval.yaml here graded
  // every scenario against the default one's gates - both files parse, so the
  // wrong answer was silent.
  cpSync(manifestPath, join(dir, "tests", "eval.yaml"));

  // Measured on the staged copy, after EXPECTED.md is stripped: the budget pays
  // for the tree the agent gets, not for the one the author keeps.
  const budget = fixtureBudget(join(dir, "environment", "repo"), agentTimeoutSec);
  if (agentTimeoutSec === undefined && budget.timeoutSec === AGENT_TIMEOUT_CAP_SEC) {
    console.warn(`! ${m.id}: fixture ${m.fixture} (${budget.files} files, ${budget.kib} KiB) asks for more than the ${AGENT_TIMEOUT_CAP_SEC}s cap - both arms may time out, which would read as no lift`);
  }
  writeFileSync(join(dir, "task.toml"), taskToml(m, budget));
  writeFileSync(join(dir, "instruction.md"), `${m.prompt}\n`);
  writeFileSync(join(dir, "environment", "Dockerfile"), dockerfile());
  writeFileSync(join(dir, "tests", "test.sh"), testScript(m.skill, m.scenario), { mode: 0o755 });
  return dir;
}

const flag = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  if (!outDir || outDir.startsWith("-")) {
    console.error("usage: eval-tasks.ts <out-dir> [--only <skill>|<skill>/<scenario>] [--model id] [--attempts n] [--agent-timeout sec] [--job f --skills-dir d | --job f --arms spec]");
    process.exit(2);
  }

  const only = flag(args, "--only");
  const refs = discoverManifests().filter((d) => selectedBy(d, only));
  const manifests = refs.map((d) => parseEvalManifest(d, readFileSync(d.path, "utf8")));

  if (!manifests.length) {
    console.error(only ? `no manifest for ${only}` : "no manifests found");
    process.exit(2);
  }

  // The discovered path, not one re-derived from the skill: the task must ship
  // the manifest that will grade it.
  // The exception the formula cannot see - a fixture whose cost is a build or a
  // long test suite rather than its file count. The derived budget is the rule.
  const override = flag(args, "--agent-timeout");
  const agentTimeoutSec = override === undefined ? undefined : Number(override);
  const dirs = manifests.map((m, i) => generateTask(m, outDir, refs[i].path, agentTimeoutSec));
  for (const d of dirs) {
    const budget = fixtureBudget(join(d, "environment", "repo"), agentTimeoutSec);
    console.log(`✓ ${d} (${budget.files} files, ${budget.kib} KiB → ${budget.timeoutSec}s for the agent)`);
  }
  console.log(`\n${dirs.length} task(s) generated.`);

  // Skills are staged through install.ts, never pointed at skills/<name>
  // directly: the shipped copy is the one without eval.yaml in it.
  const staging = flag(args, "--skills-dir");
  const armsSpec = flag(args, "--arms");
  const jobPath = flag(args, "--job");
  if (!jobPath) {
    console.log("\nStage the skills, then generate a job:");
    // One pick per SKILL: two scenarios of one skill stage the same directory.
    const picks = [...new Set(manifests.map((m) => `skill:${m.skill}`))];
    console.log(`  npx tsx install.ts install <staging> --yes --pick ${picks.join(" ")}`);
    console.log(`  npx tsx tools/eval-tasks.ts ${outDir} --job job.yaml --skills-dir <staging>/.claude/skills`);
    console.log(`  npx tsx tools/eval-tasks.ts ${outDir} --only <skill>/<scenario> --job job.yaml --arms "nothing:;mono:<dir>;thin:<dir>,<dir>"`);
  } else {
    const opts = {
      model: flag(args, "--model") ?? "claude-sonnet-5",
      attempts: Number(flag(args, "--attempts") ?? 6),
      concurrent: Number(flag(args, "--concurrent") ?? 4),
      jobsDir: flag(args, "--jobs-dir") ?? join(outDir, "jobs"),
    };
    const jobName = (id: string): string => flag(args, "--job-name") ?? jobNameOf(id);
    const requireStaged = (dirs: string[]): void => {
      const missing = dirs.filter((d) => !existsSync(d));
      if (missing.length) { console.error(`not staged: ${missing.join(", ")}`); process.exit(2); }
    };

    if (armsSpec) {
      // An arms list names specific staged dirs, so it describes one scenario's
      // job; the one-job-per-scenario rule holds by construction.
      if (manifests.length > 1) { console.error("--arms describes one scenario's arms; add --only <skill>/<scenario>"); process.exit(2); }
      const arms = parseArms(armsSpec);
      requireStaged(arms.flatMap((a) => a.skills));
      writeFileSync(jobPath, jobConfig(dirs[0], arms, { ...opts, jobName: jobName(manifests[0].id) }));
      console.log(`✓ ${jobPath}`);
    } else {
      if (!staging) { console.error("--job needs --skills-dir (a staging tree produced by install.ts) or --arms"); process.exit(2); }
      const skillDirs = manifests.map((m) => join(staging, m.skill));
      requireStaged(skillDirs);

      // One job per scenario: a job's skills list applies to every task in it,
      // so a single job over N tasks would install all N skills for each of
      // them - and two scenarios of one skill would share a job file.
      const multi = manifests.length > 1;
      for (const [i, m] of manifests.entries()) {
        const path = multi ? jobFileOf(jobPath, m.id) : jobPath;
        writeFileSync(path, jobConfig(dirs[i], pairedArms(skillDirs[i]), { ...opts, jobName: jobName(m.id) }));
        console.log(`✓ ${path}`);
      }
    }
  }
}
