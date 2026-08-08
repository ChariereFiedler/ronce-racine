/**
 * Lockfile, canonical fingerprinting and the copy primitive the installer uses.
 */
import { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, lstatSync, readlinkSync, symlinkSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { SELF, BUILT_HOOKS, LOCKFILE, shippedHookName } from "./paths.js";

/** A lockfile written before the npm switch carries a bare git SHA. */
export type LockSource = string | { package: string; version: string; contentHash: string };

export interface Lock {
  source: LockSource;
  installed: string[]; // "kind:name" tokens
  detached: string[]; // tokens excluded from drift control (customized)
}

/**
 * Shape a token must have to be turned into a path.
 *
 * The lockfile is a committed file in the TARGET repository, so its tokens are
 * not ours to trust: they arrive from whatever branch the user checked out. A
 * name is therefore a single path segment with no separator and no `..`, which
 * is what keeps `uninstall` from being handed `hook:../../../etc/something` and
 * deleting it.
 */
const TOKEN_SHAPE = /^(rule|skill|agent|script|hook):[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export function isValidToken(token: string): boolean {
  return TOKEN_SHAPE.test(token) && !token.includes("..");
}

/** Resolves canonical + target for a "kind:name" token. */
export function tokenPaths(token: string, repo: string): { canon: string; inst: string; isDir: boolean } {
  // Callers reading a lockfile filter with isValidToken first and report what
  // they dropped; reaching here with a bad token is a bug, not user input.
  if (!isValidToken(token)) throw new Error(`refusing to resolve a malformed token: ${JSON.stringify(token)}`);
  const [kind, name] = token.split(":");
  if (kind === "rule") return { canon: join(SELF, "rules", name), inst: join(repo, ".claude/rules/shared", name), isDir: false };
  if (kind === "skill") return { canon: join(SELF, "skills", name), inst: join(repo, ".claude/skills", name), isDir: true };
  if (kind === "agent") return { canon: join(SELF, "agents", name), inst: join(repo, ".claude/agents", name), isDir: false };
  if (kind === "script") return { canon: join(SELF, "scripts", name), inst: join(repo, ".claude/scripts", name), isDir: false };
  // kind === "hook": one token per individual file
  return { canon: join(BUILT_HOOKS, shippedHookName(name)), inst: join(repo, ".claude/hooks", shippedHookName(name)), isDir: false };
}

/**
 * Fingerprint of the canonical content behind a set of tokens. The lockfile
 * records it next to the package version: with the version alone, `check`
 * compares "0.4.0" to "0.4.0" and reports nothing even when the package
 * content changed under the same number.
 * A missing canonical file (e.g. a hook token before `dist/` is built) is
 * folded in as an explicit absence marker rather than silently skipped, so
 * an unbuilt checkout cannot hash the same as a built one.
 */
export function canonicalHash(tokens: string[]): string {
  const h = createHash("sha256");
  for (const token of [...tokens].sort()) {
    const { canon, isDir } = tokenPaths(token, "");
    h.update(token);
    if (!existsSync(canon)) { h.update("\0absent"); continue; }
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

/** Version of the package this CLI belongs to. */
export function selfVersion(): string {
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

/** Names which part actually drifted, so the message is truthful and actionable. */
export function staleMessage(s: LockSource, repo: string): string {
  const reinstall = `re-run 'ronce-racine install ${repo}'`;
  if (typeof s !== "string" && s.version !== selfVersion()) {
    return `↑ stale: installed from ${describeSource(s)}, now running ${selfVersion()} - ${reinstall}.`;
  }
  const ver = typeof s === "string" ? describeSource(s) : s.version;
  return `↑ stale: same version (${ver}) but the canonical content changed - ${reinstall}.`;
}

/**
 * Recursive copy that overwrites - deliberately NOT fs.cpSync.
 *
 * cpSync fails when the destination already exists AND the absolute path
 * contains a non-ASCII character on Windows: its native override path calls
 * unlink and reports `errno 0, code '', syscall 'unlink'` (reported on
 * Node 24.13.0 / Windows 10, any accented user name - issue #1). Copying onto
 * a non-existent destination works, which is why a first install got far
 * enough to look successful. `copyFileSync` overwrites through a different
 * binding and is unaffected, so every copy here goes through it.
 *
 * `filter` keeps cpSync's semantics: it receives the SOURCE path, and a
 * directory it rejects prunes that whole subtree.
 *
 * `lstat`, not `stat`, and symlinks recreated rather than followed - also
 * cpSync's behavior without `dereference`. This matters on the backup call,
 * which walks the TARGET repo: user content we do not control. A dangling
 * symlink there made `stat` throw ENOENT and aborted the whole install.
 */
export function copyPath(src: string, dst: string, filter?: (s: string) => boolean): void {
  if (filter && !filter(src)) return;
  const stats = lstatSync(src);
  if (stats.isSymbolicLink()) {
    mkdirSync(dirname(dst), { recursive: true });
    if (existsSync(dst) || lstatSync(dst, { throwIfNoEntry: false })) rmSync(dst, { force: true });
    symlinkSync(readlinkSync(src), dst);
    return;
  }
  if (stats.isDirectory()) {
    mkdirSync(dst, { recursive: true });
    for (const e of readdirSync(src, { withFileTypes: true })) {
      copyPath(join(src, e.name), join(dst, e.name), filter);
    }
    return;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}

export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else out.push(r);
    }
  };
  if (existsSync(root)) walk(root, "");
  return out.sort();
}

/** null if compliant, otherwise a description of the drift. */
export function compareToken(token: string, repo: string): string | null {
  const { canon, inst, isDir } = tokenPaths(token, repo);
  if (!existsSync(inst)) return "absent";
  if (!existsSync(canon)) return "canonical-removed";
  if (!isDir) return readFileSync(canon).equals(readFileSync(inst)) ? null : "modified";
  // Test procedures and eval manifests are never distributed (see copyToken) - exclude them from drift.
  const canonFiles = listFiles(canon).filter((f) => !f.endsWith(".test.ts") && f !== "eval.yaml" && f !== "README.md");
  const probs = [
    ...canonFiles.filter((f) => !existsSync(join(inst, f))).map((f) => `-${f}`),
    ...canonFiles.filter((f) => existsSync(join(inst, f)) && !readFileSync(join(canon, f)).equals(readFileSync(join(inst, f)))).map((f) => `~${f}`),
    ...listFiles(inst).filter((f) => !canonFiles.includes(f)).map((f) => `+${f}`),
  ];
  return probs.length ? probs.join(" ") : null;
}

/**
 * Reading a lockfile has three outcomes, and collapsing them loses the one that
 * matters: "absent" means there is nothing to do, "unreadable" means there is
 * an installation on disk that no command can safely act on. Reporting the
 * second as the first told users there was nothing to uninstall while their
 * .claude/ was full.
 */
export type LockRead =
  | { status: "absent" }
  | { status: "unreadable"; reason: string }
  | { status: "ok"; lock: Lock };

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/**
 * The single parsing boundary for the lockfile, validation included.
 *
 * Validating inside one command is not enough: the file is committed in the
 * target repository, so every command reads untrusted content and each one that
 * skipped the check either crashed with a stack trace or copied a malformed
 * token forward into a fresh lockfile.
 */
export function loadLock(repo: string): LockRead {
  const p = join(repo, LOCKFILE);
  if (!existsSync(p)) return { status: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    return { status: "unreadable", reason: `not valid JSON (${(err as Error).message})` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "unreadable", reason: "not a JSON object" };
  const l = parsed as Partial<Lock>;
  if (!isStringList(l.installed) || !isStringList(l.detached)) {
    return { status: "unreadable", reason: "'installed' and 'detached' must both be lists of strings" };
  }
  const malformed = [...l.installed, ...l.detached].filter((t) => !isValidToken(t));
  if (malformed.length) {
    return { status: "unreadable", reason: `malformed token(s): ${malformed.map((t) => JSON.stringify(t)).join(", ")}` };
  }
  return { status: "ok", lock: { source: l.source as LockSource, installed: l.installed, detached: l.detached } };
}
