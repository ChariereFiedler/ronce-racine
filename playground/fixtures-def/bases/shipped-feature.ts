import type { Fixture } from "../index.js";

export const shippedFeature: Fixture = {
  name: "shipped-feature",
  why: "feature implemented with green unit tests but zero end-to-end evidence → validation/challenge evals",
  files: {
    "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" }, devDependencies: { vitest: "^1.0.0" } }, null, 2),
    "src/discount.ts": "export function applyDiscount(price: number, code: string): number {\n  if (code === 'SAVE10') return price * 0.9\n  return price\n}\n",
    "src/discount.test.ts": "import { test, expect } from 'vitest'\nimport { applyDiscount } from './discount'\ntest('applies known code', () => expect(applyDiscount(100, 'SAVE10')).toBe(90))\n",
    "EXPECTED.md": "# Ground truth\n\nThe feature is \"done\" per the unit test (happy path only), but these edge cases are unvalidated:\n\n- negative `price`\n- unknown `code`\n- empty `code`\n\nThere is no e2e or API-level proof the feature works end to end - only an isolated unit test.\n",
  },
};
