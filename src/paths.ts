/**
 * Filesystem anchors shared by every installer module.
 *
 * They live apart from the CLI entrypoint so a split module never has to import
 * install.ts back for a path, which would make the import graph circular.
 */
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// This module runs as src/paths.ts from the repo root, and as dist/src/paths.js
// once built for npm. Artifacts always live at the root, so climb out of dist/.
export const IS_BUILT = basename(dirname(MODULE_DIR)) === "dist";
export const SELF = IS_BUILT ? join(MODULE_DIR, "..", "..") : join(MODULE_DIR, "..");
/** Directory the CLI entrypoint itself runs from. */
export const HERE = IS_BUILT ? join(SELF, "dist") : SELF;
/** How the user invoked this CLI: `install.ts` from a clone, `ronce-racine` from the package. */
export const INVOCATION = IS_BUILT ? "ronce-racine" : "install.ts";
export const LOCKFILE = ".claude/.ronce-racine.json";
/** Header of the generated rules manifest. Written on install, rewritten on uninstall. */
export const ADOPTED_HEADER = `# Generic rules adopted (ronce-racine). Resync: ${INVOCATION} install --rules-only .\n`;
// Hooks ship BUILT (dist/hooks/*.mjs), never as TypeScript. Compiling them at
// run time cost ~490 ms on every prompt and forced tsx onto the target repo;
// built JS runs in 34 ms on plain node. Build: tools/build.ts.
export const BUILT_HOOKS = join(SELF, "dist", "hooks");
export const shippedHookName = (f: string): string => f.replace(/\.ts$/, ".mjs");
