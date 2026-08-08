#!/usr/bin/env tsx
/**
 * Builds what ships: hooks/*.ts -> dist/hooks/*.js, install.ts -> dist/install.js.
 *
 * Hooks are authored in TypeScript but must never be compiled at run time.
 * Measured on a hook that fires on every prompt submit:
 *
 *   npx tsx                          527 ms
 *   node, runtime type stripping      99 ms
 *   node, pre-transpiled JS           38 ms   <- within 3 ms of a bare process
 *
 * Almost all of that was recompiling the same file on every keystroke-level
 * event. Building once also removes the target repo's need for `tsx`: an
 * adopting project needs Node and nothing else.
 *
 * Wired into `prepare`, so `npm install` / `npm ci` builds it. dist/ is
 * generated and gitignored: the source of truth stays hooks/*.ts.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "hooks");
const OUT = join(ROOT, "dist", "hooks");

/** The name a hook takes once built and shipped. */
export function shippedHookName(fileName: string): string {
  // .mjs, not .js: a target repo's package.json rarely declares "type":
  // "module", and a plain .js with ESM syntax there prints a Node
  // MODULE_TYPELESS_PACKAGE_JSON warning (and pays a reparse) on every hook fire.
  return fileName.replace(/\.ts$/, ".mjs");
}

export function transpile(source: string): string {
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // Sibling imports carry the .ts extension so plain `node` can run the sources
  // during development; the built hook copies are .mjs, so specifiers must follow.
  return out.replace(/(['"])(\.\/[\w.-]+)\.ts\1/g, "$1$2.mjs$1");
}

const CLI_SRC = join(ROOT, "install.ts");
const CLI_OUT = join(ROOT, "dist", "install.js");
const CLI_MODULES = join(ROOT, "src");
const CLI_MODULES_OUT = join(ROOT, "dist", "src");

/** The CLI ships built so `npx ronce-racine` needs no TypeScript runtime. */
function buildCli(): void {
  // The entrypoint imports its modules as "./src/<name>.js", so the built copies
  // must sit under dist/src for the same specifiers to resolve after the build.
  rmSync(CLI_MODULES_OUT, { recursive: true, force: true });
  mkdirSync(CLI_MODULES_OUT, { recursive: true });
  for (const f of readdirSync(CLI_MODULES).filter((f) => f.endsWith(".ts"))) {
    writeFileSync(join(CLI_MODULES_OUT, f.replace(/\.ts$/, ".js")), transpile(readFileSync(join(CLI_MODULES, f), "utf8")));
  }
  const js = transpile(readFileSync(CLI_SRC, "utf8"));
  // The source shebang runs it through tsx; the built one must be plain node.
  const withShebang = js.replace(/^#!.*\n/, "");
  writeFileSync(CLI_OUT, `#!/usr/bin/env node\n${withShebang}`);
  chmodSync(CLI_OUT, 0o755);
}

function main(): void {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const sources = readdirSync(SRC).filter((f) => f.endsWith(".ts"));
  for (const f of sources) {
    writeFileSync(join(OUT, shippedHookName(f)), transpile(readFileSync(join(SRC, f), "utf8")));
  }
  // The hooks README documents code that runs on the target's machine, so it
  // ships with them (see docs/developing.md, "What travels and what does not").
  writeFileSync(join(OUT, "README.md"), readFileSync(join(SRC, "README.md"), "utf8"));
  buildCli();
  // stderr, not stdout: lifecycle scripts (npm pack --json, npm publish) read
  // stdout as data, and this line would corrupt it.
  console.error(`✓ built ${sources.length} hooks + the CLI to dist/`);
}

main();
