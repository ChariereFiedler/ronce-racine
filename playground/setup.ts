#!/usr/bin/env -S npx tsx
/**
 * Generates throwaway target repos to try the installer by hand.
 *
 *   npx tsx playground/setup.ts          # (re)creates playground/fixtures/<stack>/
 *
 * Each fixture is a real git repo with a distinct stack, to observe
 * what `install.ts plan/install` detects and proposes. Idempotent: the
 * fixtures/ folder is fully recreated on each run (it is gitignored).
 */
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

interface Fixture {
  name: string;
  why: string;
  files: Record<string, string>;
  extraCommits?: string[];
}

const FIXTURES_DEF: Fixture[] = [
  {
    name: "frontend-vue",
    why: "frontend (Vue + Vitest) → rules UI, skills frontend, seed subscription-leak-scan",
    files: {
      "package.json": JSON.stringify({ dependencies: { vue: "^3.4.0" }, devDependencies: { vitest: "^1.0.0" } }, null, 2),
      "src/App.vue": "<script setup lang=\"ts\">\nimport { onMounted } from 'vue'\nonMounted(() => stream.subscribe(v => console.log(v)))\n</script>\n",
      "src/App.spec.ts": "import { test, expect } from 'vitest'\ntest('placeholder', () => expect(1).toBe(1))\n",
    },
  },
  {
    name: "backend-node",
    why: "backend (NestJS + SQL + migrations) → clean-archi, DDD, no-raw-sql, migrations",
    files: {
      "package.json": JSON.stringify({ dependencies: { "@nestjs/core": "^10.0.0" }, devDependencies: { jest: "^29.0.0" } }, null, 2),
      "src/main.ts": "export const port = 3000\n",
      "migrations/001_init.sql": "CREATE TABLE users (id uuid PRIMARY KEY);\n",
      "Dockerfile": "FROM node:22\n",
    },
  },
  {
    name: "fullstack-ci",
    why: "frontend + backend + CI + infra → large palette (rules, skills ops, agents)",
    files: {
      "package.json": JSON.stringify(
        { dependencies: { react: "^18.0.0", express: "^4.0.0" }, devDependencies: { playwright: "^1.40.0" } },
        null,
        2,
      ),
      ".gitlab-ci.yml": "stages: [test]\n",
      "docker-compose.yml": "services:\n  web:\n    image: node:22\n",
      "src/index.tsx": "export const x = 1\n",
      "src/index.test.tsx": "test('x', () => {})\n",
    },
  },
  {
    name: "flawed-app",
    why: "planted defects (known ground truth) → exercise detection scripts and audit grids against expected findings",
    files: {
      "package.json": JSON.stringify({ dependencies: { vue: "^3.4.0" }, devDependencies: { vitest: "^1.0.0" } }, null, 2),
      // Ground truth, one defect per line (the scripts must find exactly these):
      // - 1 secret-shaped literal      → precommit-scan / sweep "Secret patterns"
      // - 1 subscription w/o teardown  → subscription-leak-scan
      // - 1 TODO + 1 console.log       → sweep "Flagged debt" + "Debug leftovers"
      // - 1 hardcoded wait + 1 .skip   → sweep "Fragile / disabled tests"
      // - 1 swallowed error            → sweep "Suspicious error handling"
      "src/config.ts": 'export const key = "AKIA" + "QQQQQQQQQQQQQQQQ" // planted: split so only sweep\'s regex on the BUILT value stays inert; see leaky.ts\n',
      "src/leaky.ts": 'const token = "ghp_' + "0000000000000000000000000000000000000000" + '" // planted secret\nstream.subscribe((v) => console.log(v)) // planted leak + debug\n// TODO planted debt\ntry { risky() } catch (e) {}\n',
      "e2e/app.spec.ts": "test.skip('planted disabled', () => {})\nawait page.waitForTimeout(3000) // planted hard wait\n",
      "EXPECTED.md": "# Ground truth\n\n| Defect | File | Detector |\n|---|---|---|\n| secret (ghp_…) | src/leaky.ts | precommit-scan, sweep |\n| subscribe without teardown | src/leaky.ts | subscription-leak-scan |\n| console.log | src/leaky.ts | sweep |\n| TODO | src/leaky.ts | sweep |\n| swallowed catch | src/leaky.ts | sweep |\n| waitForTimeout | e2e/app.spec.ts | sweep, test-discipline rule |\n| test.skip | e2e/app.spec.ts | sweep |\n\nRun the detection scripts against this fixture and compare with this table:\nany missed line = detector regression; any extra finding = false positive to triage.\n",
    },
  },
  {
    name: "minimal-go",
    why: "bare Go backend, no tests/CI → minimal proposal",
    files: {
      "go.mod": "module example\n\ngo 1.22\n",
      "main.go": "package main\n\nfunc main() {}\n",
    },
  },
  {
    name: "buggy-app",
    why: "reproducible bug + repeated fixes on one scope → bug-* family evals",
    files: {
      "package.json": JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }, null, 2),
      "src/cart.ts": "export function totalItems(items: unknown[]): number {\n  let count = 0\n  for (let i = 0; i < items.length - 1; i++) count++ // planted off-by-one: under-counts by 1\n  return count\n}\n",
      "src/cart.test.ts": "import { test, expect } from 'vitest'\nimport { totalItems } from './cart'\ntest('counts all items', () => expect(totalItems(['a', 'b', 'c'])).toBe(3))\n",
      "EXPECTED.md": "# Ground truth\n\n- Bug: off-by-one in `src/cart.ts` `totalItems` (loop stops at `items.length - 1`), under-counts by 1.\n- Reproduce: `npx vitest run` → the `counts all items` test fails (returns 2, expected 3).\n- Git history shows 3 prior `fix(cart)` commits on this same scope, none of which fixed the actual off-by-one → evidence for a recurring-bug-root-cause eval.\n",
    },
    extraCommits: ["fix(cart): adjust rounding", "fix(cart): handle empty basket", "fix(cart): correct discount order"],
  },
  {
    name: "shipped-feature",
    why: "feature implemented with green unit tests but zero end-to-end evidence → validation/challenge evals",
    files: {
      "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" }, devDependencies: { vitest: "^1.0.0" } }, null, 2),
      "src/discount.ts": "export function applyDiscount(price: number, code: string): number {\n  if (code === 'SAVE10') return price * 0.9\n  return price\n}\n",
      "src/discount.test.ts": "import { test, expect } from 'vitest'\nimport { applyDiscount } from './discount'\ntest('applies known code', () => expect(applyDiscount(100, 'SAVE10')).toBe(90))\n",
      "EXPECTED.md": "# Ground truth\n\nThe feature is \"done\" per the unit test (happy path only), but these edge cases are unvalidated:\n\n- negative `price`\n- unknown `code`\n- empty `code`\n\nThere is no e2e or API-level proof the feature works end to end - only an isolated unit test.\n",
    },
  },
  {
    name: "design-system",
    why: "shared component with several call sites → frontend family evals",
    files: {
      "package.json": JSON.stringify({ devDependencies: { vue: "^3.4.0" } }, null, 2),
      "src/components/BaseButton.vue": "<script setup lang=\"ts\">\ndefineProps<{ label: string; kind: string }>()\n</script>\n<template>\n  <button :class=\"kind\">{{ label }}</button>\n</template>\n",
      "src/pages/Home.vue": "<template>\n  <BaseButton label=\"Go\" kind=\"primary\" />\n</template>\n",
      "src/pages/Settings.vue": "<template>\n  <base-button label=\"Save\" kind=\"ghost\" />\n</template>\n",
      "src/pages/Dyn.vue": "<template>\n  <component :is=\"'BaseButton'\" />\n</template>\n",
      "src/tokens.css": ":root {\n  --color-primary: #3b82f6;\n  --radius: 4px;\n}\n",
      "EXPECTED.md": "# Ground truth\n\n`BaseButton` call sites a full sweep must find:\n\n| File | Form |\n|---|---|\n| src/pages/Home.vue | PascalCase `<BaseButton>` |\n| src/pages/Settings.vue | kebab-case `<base-button>` |\n| src/pages/Dyn.vue | dynamic `<component :is=\"'BaseButton'\" />` |\n",
    },
  },
  {
    name: "audit-target",
    why: "defects spread across audit domains → audit family evals",
    files: {
      "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }, null, 2),
      "src/server.js": "const express = require('express')\nconst app = express()\nconst apiKey = \"demo-\" + \"not-a-real-key\" // planted: hardcoded secret\napp.get('/user', (req, res) => {\n  const user = { email: 'a@b.com' }\n  console.log('user', user.email) // planted: PII in logs\n  res.json(user)\n})\n",
      "Dockerfile": "FROM node:22\nCOPY . .\nCMD [\"node\", \"src/server.js\"]\n",
      "EXPECTED.md": "# Ground truth\n\n| Gap | Evidence |\n|---|---|\n| No CI pipeline | no `.gitlab-ci.yml` / `.github/workflows` |\n| No tests | no test script, no test devDeps in package.json |\n| Secret in source | `apiKey` hardcoded in src/server.js |\n| PII in logs | `console.log('user', user.email)` in src/server.js |\n| Container runs as root | Dockerfile has no `USER` directive |\n| No healthcheck | Dockerfile has no `HEALTHCHECK` |\n| No ADR / decision record | no docs/adr directory |\n",
    },
  },
];

function git(repo: string, cmd: string): void {
  execSync(`git ${cmd}`, { cwd: repo, stdio: "ignore" });
}

rmSync(FIXTURES, { recursive: true, force: true });
mkdirSync(FIXTURES, { recursive: true });

for (const f of FIXTURES_DEF) {
  const repo = join(FIXTURES, f.name);
  for (const [rel, content] of Object.entries(f.files)) {
    const dst = join(repo, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, content);
  }
  git(repo, "init -q");
  git(repo, "add -A");
  for (const msg of f.extraCommits ?? []) {
    git(repo, `-c user.email=t@t.dev -c user.name=t commit --allow-empty -q -m "${msg}"`);
  }
  console.log(`✓ ${f.name.padEnd(14)} - ${f.why}`);
}

const install = join(HERE, "..", "install.ts");
console.log(`\n${FIXTURES_DEF.length} target repos in playground/fixtures/. Examples:`);
console.log(`  npx tsx ${install} plan    playground/fixtures/frontend-vue   # proposal (read-only)`);
console.log(`  npx tsx ${install} install playground/fixtures/frontend-vue   # interactive selector (TTY)`);
console.log(`  npx tsx ${install} install playground/fixtures/backend-node --yes   # defaults, no prompt`);
console.log(`  npx tsx ${install} check   playground/fixtures/frontend-vue   # drift vs canonical (after install)`);
console.log(`\nRe-running this script resets the fixtures.`);
