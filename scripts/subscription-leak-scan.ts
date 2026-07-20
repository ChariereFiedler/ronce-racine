#!/usr/bin/env -S npx tsx
/**
 * Détecte les souscriptions / listeners / timers sans teardown dans le diff stagé.
 * Lecture seule. Pair de la rule subscription-cleanup.md.
 *
 *   npx tsx subscription-leak-scan.ts            # scanne `git diff --cached`
 *   npx tsx subscription-leak-scan.ts --all      # inclut le non-stagé
 *   npx tsx subscription-leak-scan.ts --strict   # exit 1 si fuite (CI / pre-commit)
 *
 * Heuristique ligne à ligne (ne suit pas un subscribe multi-lignes) : exclure une
 * ligne avec un commentaire `leak-scan:allow`.
 */
import { execSync } from "node:child_process";

const all = process.argv.includes("--all");
const strict = process.argv.includes("--strict");
const range = all ? "HEAD" : "--cached";

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? "";
  }
}

const added = sh(`git diff ${range} -U0`)
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .map((l) => l.slice(1))
  .filter((l) => !/leak-scan:allow/.test(l));

const TEARDOWN = /take\(\s*1\s*\)|takeUntil(Destroyed)?\(|\|\s*async\b|firstValueFrom|\.unsubscribe\(/;

interface Leak { kind: string; line: string }
const leaks: Leak[] = [];
for (const line of added) {
  if (/\.subscribe\(/.test(line) && !TEARDOWN.test(line))
    leaks.push({ kind: "subscribe sans teardown", line });
  else if (/addEventListener\(/.test(line))
    leaks.push({ kind: "addEventListener (vérifier removeEventListener)", line });
  else if (/setInterval\(/.test(line))
    leaks.push({ kind: "setInterval (vérifier clearInterval)", line });
}

if (!leaks.length) {
  console.log("✓ Aucune souscription/listener/timer sans teardown apparent dans le périmètre.");
  process.exit(0);
}
console.log(`⚠ ${leaks.length} fuite(s) potentielle(s) (subscription-cleanup) :`);
for (const l of leaks) console.log(`    [${l.kind}] ${l.line.trim()}`);
console.log("→ Ajouter un teardown, ou annoter la ligne `leak-scan:allow` si justifié.");
process.exit(strict ? 1 : 0);
