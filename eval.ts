#!/usr/bin/env tsx
/**
 * Skill evaluation harness (testability tier 4).
 * Plays a prose skill through headless `claude -p` against a fixture and
 * verdicts it: mechanical gates first, adjunct LLM judge when declared.
 * Spec: docs/superpowers/specs/2026-07-20-skill-eval-harness-design.md
 *
 *   npx tsx eval.ts run [--only <skill>] [--dry-run]
 *
 * Zero dependencies. Manifests: skills/<name>/eval.yaml (closed YAML subset).
 */
import { readFileSync, existsSync, readdirSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

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

const unquote = (s: string): string => {
  const trimmed = s.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    let result = trimmed.slice(1, -1);
    // Unescape YAML escape sequences in double-quoted strings
    result = result.replace(/\\\\/g, '\\');
    result = result.replace(/\\"/g, '"');
    return result;
  }
  return trimmed;
};

/** Parses `{ k: "v", k2: "v2" }` inline objects and bare scalars. */
function parseGateValue(kind: string, rest: string): EvalGate {
  const t = rest.trim();
  if (t.startsWith("{")) {
    const args: Record<string, string> = {};
    for (const pair of t.replace(/^\{|\}$/g, "").matchAll(/([\w-]+):\s*("(?:[^"\\]|\\.)*"|[^,}]+)/g)) {
      args[pair[1]] = unquote(pair[2].trim());
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
      try {
        const n = grepHits(ctx, a.pattern, a.in);
        return n === 0 ? null : `grep_zero: ${n} hit(s) for /${a.pattern}/ in ${a.in ?? "."}`;
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return `grep_zero: invalid pattern /${a.pattern}/: ${err}`;
      }
    }
    case "grep_count": {
      try {
        const n = grepHits(ctx, a.pattern, a.in);
        return n === Number(a.count) ? null : `grep_count: expected ${a.count}, got ${n} for /${a.pattern}/`;
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return `grep_count: invalid pattern /${a.pattern}/: ${err}`;
      }
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

export interface SkillResult { skill: string; verdict: "PASS" | "FAIL" | "JUDGE-FAIL" | "ERROR"; details: string[] }

export interface JudgeVerdict { criterion: string; verdict: "pass" | "fail"; evidence: string }

const JUDGE_TRANSCRIPT_TAIL = 30_000;
const JUDGE_ARTIFACTS_HEAD = 10_000;

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
    ``, `## Transcript (truncated)`, transcript.slice(-JUDGE_TRANSCRIPT_TAIL),
    ``, `## Artifacts produced`, artifacts.slice(0, JUDGE_ARTIFACTS_HEAD),
  ].join("\n");
}

/**
 * `claude -p --output-format json` emits {"type":"result","result":"<text>"} -
 * the model's actual text is an escaped string inside .result. Unwrap it so
 * callers parse the model's output, not the envelope. Non-JSON stdout (e.g.
 * --output-format text stubs) passes through unchanged.
 */
export function unwrapClaudeJsonEnvelope(raw: string): string {
  try {
    const envelope = JSON.parse(raw);
    if (envelope && typeof envelope === "object" && typeof envelope.result === "string") return envelope.result;
  } catch {
    // raw stdout is not a JSON envelope - fall through and use it as-is
  }
  return raw;
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

  const dir = join(tmpdir(), "ronce-racine-eval", `${m.skill}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  cpSync(fixtureSrc, dir, { recursive: true });

  try {
    // Install the skill under test through the real distribution path.
    // Skip when the skill is not in the catalog (used by ERROR-path tests with synthetic names).
    const skillExists = existsSync(join(ROOT, "skills", m.skill, "SKILL.md"));
    if (skillExists) {
      const inst = spawnSync(TSX_BIN, [join(ROOT, "install.ts"), "install", dir, "--yes", "--pick", `skill:${m.skill}`], { encoding: "utf8" });
      if (inst.status !== 0) return { skill: m.skill, verdict: "ERROR", details: [`install --pick failed: ${inst.stderr}`] };
    }

    const baseline = snapshotRepo(dir);
    const run = spawnSync(opts.claudeBin, ["-p", m.prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"], {
      cwd: dir, encoding: "utf8", timeout: opts.timeoutMs, maxBuffer: 64 * 1024 * 1024,
    });
    if (run.error) return { skill: m.skill, verdict: "ERROR", details: [`claude did not run: ${run.error.message}`] };

    const ctx: GateContext = { repoDir: dir, transcript: run.stdout ?? "", exitCode: run.status ?? 1, baseline };
    const failures = m.gates.map((g) => applyGate(g, ctx)).filter((f): f is string => f !== null);
    if (failures.length) return { skill: m.skill, verdict: "FAIL", details: failures };

    if (m.judge) {
      const after = snapshotRepo(dir);
      const artifacts = [...after]
        .filter(([rel, content]) => !baseline.has(rel) || baseline.get(rel) !== content)
        .map(([rel, content]) => `### ${rel}\n${content}`).join("\n");
      const judge = spawnSync(opts.claudeBin, ["-p", buildJudgePrompt(m, ctx.transcript, artifacts), "--output-format", "json"], {
        cwd: ROOT, encoding: "utf8", timeout: opts.timeoutMs, maxBuffer: 16 * 1024 * 1024,
      });
      if (judge.error || judge.status !== 0) return { skill: m.skill, verdict: "ERROR", details: [`judge did not run: ${judge.error?.message ?? judge.status}`] };
      try {
        // `claude -p --output-format json` wraps the model's text in an envelope
        // ({"type":"result","result":"<escaped text>"}); the actual verdict JSON
        // lives inside .result. Fall back to raw stdout for plain-text output
        // (e.g. --output-format text, or stubs that skip the envelope).
        const judgeOutput = unwrapClaudeJsonEnvelope(judge.stdout ?? "");
        const verdicts = parseJudgeVerdicts(judgeOutput, m.judge.criteria);
        if (!judgePassed(verdicts, m.judge.threshold))
          return { skill: m.skill, verdict: "JUDGE-FAIL", details: verdicts.filter((v) => v.verdict === "fail").map((v) => `~${v.criterion}`) };
      } catch (e) {
        return { skill: m.skill, verdict: "ERROR", details: [`judge unparseable: ${(e as Error).message}`] };
      }
    }
    return { skill: m.skill, verdict: "PASS", details: [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] !== "run") { console.error("usage: eval.ts run [--only <skill>] [--dry-run]"); process.exit(2); }

  let only: string | undefined;
  if (args.includes("--only")) {
    const idx = args.indexOf("--only");
    const next = args[idx + 1];
    if (!next || next.startsWith("-")) {
      console.error("usage: eval.ts run [--only <skill>] [--dry-run]");
      process.exit(2);
    }
    only = next;
  }

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
