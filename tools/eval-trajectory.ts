#!/usr/bin/env tsx
/**
 * Grades what an agent DID, from the trajectory Harbor writes after the run.
 *
 * The verifier inside the container sees the repository and nothing else, so
 * everything a skill prescribes about the WORK - run this script, gather that
 * context before acting, never commit - was unmeasured. Counted over the twelve
 * trials of the 2026-09-03 anchor run: 480 steps carrying 598 tool calls, none
 * of which reached any check or the judge.
 *
 * This runs in the post-pass, beside the judge, for the reason the two
 * `transcript_*` gate kinds were always dead on the paired path: Harbor writes
 * `agent/trajectory.json` after the agent phase ends, so no in-container check
 * can ever see it. They were not unavailable. They were in the wrong moment.
 *
 * One rule keeps these honest, and it is the trajectory version of the
 * format-gate rule: a check names an ACTION, never a word the agent might say.
 * A grep over the agent's prose is a format gate in a trajectory costume.
 */
import { readFileSync } from "node:fs";
import type { EvalGate } from "./eval.js";

export interface TrajectoryToolCall {
  /** Joins a call to the result the NEXT step reports for it. */
  tool_call_id?: string;
  function_name?: string;
  arguments?: Record<string, unknown>;
}
export interface TrajectoryStep {
  source?: string;
  message?: string;
  tool_calls?: TrajectoryToolCall[];
  /** What the calls of the PREVIOUS step returned, keyed back by call id. */
  observation?: { results?: { source_call_id?: string; content?: string }[] };
}

/**
 * A trajectory as the checks see it.
 *
 * `readable` is not decoration. A trial whose trajectory is missing or corrupt
 * must fail every check rather than satisfy the absence ones for free - a
 * silent pass there would score a lost trial like a perfect one.
 */
export interface Trajectory { readable: boolean; steps: TrajectoryStep[]; actions: string[] }

/**
 * One searchable line per tool call, tool name and arguments together.
 *
 * `Bash(command=git log --oneline)` and `Edit(file_path=build.config.json)`
 * both have to be matchable by a check that names `git log` or the file, and an
 * author should not have to know which tool the agent happened to reach for.
 */
function actionsOf(steps: TrajectoryStep[]): string[] {
  const out: string[] = [];
  for (const s of steps) {
    for (const c of s.tool_calls ?? []) {
      const args = Object.entries(c.arguments ?? {})
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ");
      out.push(`${c.function_name ?? "?"}(${args})`);
    }
  }
  return out;
}

export function parseTrajectory(raw: string): Trajectory {
  try {
    const t = JSON.parse(raw) as { steps?: TrajectoryStep[] };
    if (!Array.isArray(t.steps)) return { readable: false, steps: [], actions: [] };
    return { readable: true, steps: t.steps, actions: actionsOf(t.steps) };
  } catch {
    return { readable: false, steps: [], actions: [] };
  }
}

export function readTrajectory(path: string): Trajectory {
  try {
    return parseTrajectory(readFileSync(path, "utf8"));
  } catch {
    return { readable: false, steps: [], actions: [] };
  }
}

/** Substring, not regex: a check names a command or a path, never a pattern. */
const hits = (t: Trajectory, needle: string): number[] =>
  t.actions.map((a, i) => (a.includes(needle) ? i : -1)).filter((i) => i >= 0);

/**
 * Tool calls, kept structured, because a file check has to know WHICH tool
 * touched a path and not merely that the path appeared somewhere in the line.
 */
function calls(t: Trajectory): { name: string; args: Record<string, unknown> }[] {
  return t.steps.flatMap((s) => (s.tool_calls ?? []).map((c) => ({
    name: c.function_name ?? "?",
    args: c.arguments ?? {},
  })));
}

const READING_TOOLS = new Set(["Read", "NotebookRead", "Glob", "Grep"]);
const WRITING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/**
 * A shell command that writes to the path rather than reading it.
 *
 * The heuristic is deliberately narrow: a redirect onto the path, a `tee` into
 * it, an in-place `sed`, a move or a delete. Everything else that names a path
 * in a shell - `cat`, `grep`, `sed -n`, `head`, `git show` - is a read. The
 * cost of being wrong in this direction is a read miscounted as a read; the
 * cost of the other direction is a `read_file` check that a `>` satisfies.
 */
const shellWrite = (cmd: string, path: string): boolean =>
  new RegExp(`(>>?|\\btee\\b[^|]*)\\s*['"]?${escapeLiteral(path)}`).test(cmd)
  || new RegExp(`\\bsed\\b[^|]*-i[^|]*${escapeLiteral(path)}`).test(cmd)
  || new RegExp(`\\b(rm|mv|cp)\\b[^|]*${escapeLiteral(path)}`).test(cmd);

const escapeLiteral = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Steps at which the path was READ, by the dedicated tool or through a shell. */
function readsOf(t: Trajectory, path: string): number[] {
  const out: number[] = [];
  calls(t).forEach((c, i) => {
    const argText = Object.values(c.args).map((v) => (typeof v === "string" ? v : JSON.stringify(v) ?? "")).join(" ");
    if (!argText.includes(path)) return;
    if (WRITING_TOOLS.has(c.name)) return;
    if (READING_TOOLS.has(c.name)) { out.push(i); return; }
    // Anything else naming the path is a shell: a read unless it writes.
    const cmd = typeof c.args.command === "string" ? c.args.command : argText;
    if (!shellWrite(cmd, path)) out.push(i);
  });
  return out;
}

/** Steps at which the path was WRITTEN, by a writing tool or a shell redirect. */
function writesOf(t: Trajectory, path: string): number[] {
  const out: number[] = [];
  calls(t).forEach((c, i) => {
    const argText = Object.values(c.args).map((v) => (typeof v === "string" ? v : JSON.stringify(v) ?? "")).join(" ");
    if (!argText.includes(path)) return;
    if (WRITING_TOOLS.has(c.name)) { out.push(i); return; }
    const cmd = typeof c.args.command === "string" ? c.args.command : argText;
    if (shellWrite(cmd, path)) out.push(i);
  });
  return out;
}

/**
 * Every call paired with what it returned.
 *
 * The trajectory carries tool RESULTS as well as tool calls - 47 of 50 steps in
 * a real trial - and they are what makes a promise like "each test seen red
 * then green" checkable at all. The tree cannot hold it: a suite that went red
 * then green and one that was green twice leave the same passing tests behind.
 * Counting two runs does not hold it either, which is what the manifest did.
 *
 * Results arrive in the step AFTER the call and refer back by id, so the two
 * are joined here rather than read positionally.
 */
function outcomes(t: Trajectory): { command: string; output: string }[] {
  const byId = new Map<string, string>();
  for (const s of t.steps) {
    for (const r of s.observation?.results ?? []) {
      if (r.source_call_id) byId.set(r.source_call_id, r.content ?? "");
    }
  }
  const out: { command: string; output: string }[] = [];
  for (const s of t.steps) {
    for (const c of s.tool_calls ?? []) {
      const command = Object.values(c.arguments ?? {})
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .join(" ");
      out.push({ command, output: byId.get(c.tool_call_id ?? "") ?? "" });
    }
  }
  return out;
}

/**
 * Applies one check. Returns null when it holds, the failure otherwise - the
 * same contract as `applyGate`, so a caller can treat the two alike.
 */
export function applyTrajectoryCheck(check: EvalGate, t: Trajectory): string | null {
  if (!t.readable) return `${check.kind}: no readable trajectory for this trial`;
  const { kind, args } = check;

  if (kind === "tool_used") {
    const name = args.name ?? "";
    const min = Number(args.min ?? "1");
    // `arg` scopes the match: "ran grep" and "ran grep for the thing that
    // matters" are different claims, and only the second is worth gating.
    const n = args.arg === undefined
      ? hits(t, name).length
      : calls(t).filter((c) => c.name.includes(name)
          && Object.values(c.args).some((v) => String(v).includes(args.arg as string))).length;
    const what = args.arg === undefined ? name : `${name}(${args.arg})`;
    return n >= min ? null : `tool_used ${what}: ran ${n} time(s), needed ${min}`;
  }

  if (kind === "read_file") {
    const path = args.path ?? "";
    const n = readsOf(t, path).length;
    return n > 0 ? null : `read_file ${path}: never opened`;
  }

  if (kind === "wrote_file") {
    const path = args.path ?? "";
    const n = writesOf(t, path).length;
    return n > 0 ? null : `wrote_file ${path}: never written`;
  }

  if (kind === "observed") {
    const of = args.of ?? "";
    const matches = new RegExp(args.matches ?? "");
    const runs = outcomes(t).filter((o) => o.command.includes(of));
    const firstAt = runs.findIndex((o) => matches.test(o.output));
    if (firstAt === -1) return `observed ${of}: never returned /${args.matches}/ in ${runs.length} run(s)`;

    // `then_matches` is the ordering half: a LATER run of the same command whose
    // output matches. That is the whole of "seen red, then green", and the
    // direction matters - green then red is a regression, not the discipline.
    if (args.then_matches === undefined) return null;
    const after = new RegExp(args.then_matches);
    const laterAt = runs.findIndex((o, i) => i > firstAt && after.test(o.output));
    return laterAt === -1
      ? `observed ${of}: /${args.matches}/ at run ${firstAt + 1}, then /${args.then_matches}/ never after it`
      : null;
  }

  if (kind === "tool_absent") {
    const name = args.name ?? "";
    const n = hits(t, name).length;
    return n === 0 ? null : `tool_absent ${name}: ran ${n} time(s)`;
  }

  if (kind === "before") {
    const first = args.first ?? "";
    const then = args.then ?? "";
    const firstAt = hits(t, first)[0];
    const thenAt = hits(t, then)[0];
    // A `then` that never happened is not a violation: the ordering claim is
    // about what precedes the act, and an act that never came cannot be early.
    if (thenAt === undefined) return null;
    if (firstAt === undefined) return `before ${first} -> ${then}: ${first} never happened`;
    return firstAt < thenAt ? null : `before ${first} -> ${then}: came after it, at step ${firstAt} against ${thenAt}`;
  }

  if (kind === "step_budget") {
    const max = Number(args.max ?? "0");
    return t.steps.length <= max ? null : `step_budget: ${t.steps.length} steps against a budget of ${max}`;
  }

  return `unknown trajectory check "${kind}"`;
}
