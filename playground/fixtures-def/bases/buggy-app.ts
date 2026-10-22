import type { Fixture } from "../index.js";

export const buggyApp: Fixture = {
  name: "buggy-app",
  why: "reproducible bug + repeated fixes on one scope → bug-* family evals",
  files: {
    "package.json": JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }, null, 2),
    "src/cart.ts": "export function totalItems(items: unknown[]): number {\n  let count = 0\n  for (let i = 0; i < items.length - 1; i++) count++ // planted off-by-one: under-counts by 1\n  return count\n}\n",
    "src/cart.test.ts": "import { test, expect } from 'vitest'\nimport { totalItems } from './cart'\ntest('counts all items', () => expect(totalItems(['a', 'b', 'c'])).toBe(3))\n",
    "EXPECTED.md": "# Ground truth\n\n- Bug: off-by-one in `src/cart.ts` `totalItems` (loop stops at `items.length - 1`), under-counts by 1.\n- Reproduce: `npx vitest run` → the `counts all items` test fails (returns 2, expected 3).\n- Git history shows 3 prior `fix(cart)` commits on this same scope, none of which fixed the actual off-by-one → evidence for a recurring-bug-root-cause eval.\n",
  },
  // Three plausible fixes on the same scope, none touching the off-by-one:
  // the pattern a recurring-bug eval needs the agent to recognise.
  extraCommits: [
    {
      message: "fix(cart): adjust rounding",
      changes: {
        "src/cart.ts": "export function totalItems(items: unknown[]): number {\n  let count = 0\n  for (let i = 0; i < items.length - 1; i++) count++ // planted off-by-one: under-counts by 1\n  return count\n}\n\nexport function subtotal(prices: number[]): number {\n  return Math.round(prices.reduce((a, b) => a + b, 0) * 100) / 100\n}\n",
      },
    },
    {
      message: "fix(cart): handle empty basket",
      changes: {
        "src/cart.ts": "export function totalItems(items: unknown[]): number {\n  if (items.length === 0) return 0\n  let count = 0\n  for (let i = 0; i < items.length - 1; i++) count++ // planted off-by-one: under-counts by 1\n  return count\n}\n\nexport function subtotal(prices: number[]): number {\n  return Math.round(prices.reduce((a, b) => a + b, 0) * 100) / 100\n}\n",
      },
    },
    {
      message: "fix(cart): correct discount order",
      changes: {
        "src/cart.ts": "export function totalItems(items: unknown[]): number {\n  if (items.length === 0) return 0\n  let count = 0\n  for (let i = 0; i < items.length - 1; i++) count++ // planted off-by-one: under-counts by 1\n  return count\n}\n\nexport function subtotal(prices: number[], discount = 0): number {\n  const gross = prices.reduce((a, b) => a + b, 0)\n  return Math.round(gross * (1 - discount) * 100) / 100\n}\n",
      },
    },
  ],
};
