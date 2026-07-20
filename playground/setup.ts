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
    name: "minimal-go",
    why: "bare Go backend, no tests/CI → minimal proposal",
    files: {
      "go.mod": "module example\n\ngo 1.22\n",
      "main.go": "package main\n\nfunc main() {}\n",
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
  console.log(`✓ ${f.name.padEnd(14)} — ${f.why}`);
}

const install = join(HERE, "..", "install.ts");
console.log(`\n${FIXTURES_DEF.length} target repos in playground/fixtures/. Examples:`);
console.log(`  npx tsx ${install} plan    playground/fixtures/frontend-vue   # proposal (read-only)`);
console.log(`  npx tsx ${install} install playground/fixtures/frontend-vue   # interactive selector (TTY)`);
console.log(`  npx tsx ${install} install playground/fixtures/backend-node --yes   # defaults, no prompt`);
console.log(`  npx tsx ${install} check   playground/fixtures/frontend-vue   # drift vs canonical (after install)`);
console.log(`\nRe-running this script resets the fixtures.`);
