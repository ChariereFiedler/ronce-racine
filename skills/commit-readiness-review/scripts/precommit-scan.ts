#!/usr/bin/env -S npx tsx
/**
 * Scan the staged diff before commit: secrets, sensitive files, debug leftovers.
 * Read-only. Paired with the commit-readiness-review skill (step 2 "secret scan" + step 4 "patterns").
 *
 *   npx tsx precommit-scan.ts          # scans `git diff --cached`
 *   npx tsx precommit-scan.ts --all    # also scans the unstaged tree (git diff)
 *
 * Exit 1 if at least one staged secret or sensitive file; 0 otherwise
 * (debug patterns are reported but non-blocking - human decision).
 */
import { execSync } from "node:child_process";

const all = process.argv.includes("--all");
const range = all ? "HEAD" : "--cached";

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? "";
  }
}
function installed(bin: string): boolean {
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const addedLines = sh(`git diff ${range} -U0`)
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"));

// Secrets: gitleaks first (widest coverage), otherwise grep fallback.
let secretHits = 0;
if (installed("gitleaks")) {
  try {
    execSync("gitleaks protect --staged --no-banner", { stdio: "ignore" });
  } catch {
    console.log("✗ SECRET - gitleaks detected a staged secret. Detail: gitleaks protect --staged --verbose");
    secretHits = 1;
  }
} else {
  const secretRe =
    /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk_live_[0-9a-zA-Z]+|glpat-[0-9a-zA-Z_-]{20}|ghp_[0-9a-zA-Z]{36}|(password|secret|api[_-]?key|token)\s*[:=]\s*\S/i;
  const hits = addedLines.filter((l) => secretRe.test(l));
  if (hits.length) {
    console.log("✗ Potential SECRET (grep fallback - install gitleaks for reliability):");
    hits.forEach((l) => console.log("    " + l));
    secretHits = 1;
  }
}

// Sensitive files added to the staging area.
const sensitive = sh("git diff --cached --name-only")
  .split("\n")
  .filter((f) => /(^|\/)\.env($|\.)|\.pem$|\.key$|id_rsa|credentials/i.test(f));
let sensitiveHits = 0;
if (sensitive.length) {
  console.log("✗ SENSITIVE FILE staged:");
  sensitive.forEach((f) => console.log("    " + f));
  sensitiveHits = 1;
}

// Debug leftovers in the added lines (non-blocking).
const debugRe =
  /console\.(log|debug)|debugger;|dbg!\(|[^a-zA-Z]print\(|System\.out\.print|fmt\.Print|var_dump|binding\.pry/;
const dbg = addedLines.filter((l) => debugRe.test(l));
if (dbg.length) {
  console.log("⚠ DEBUG - potential leftovers (check, remove if unwanted):");
  dbg.forEach((l) => console.log("    " + l));
}

if (secretHits + sensitiveHits > 0) {
  console.log("→ Blocking: remove the secret/sensitive file before committing.");
  process.exit(1);
}
console.log("✓ No secret or sensitive file in the staged scope.");
