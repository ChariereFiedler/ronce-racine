import type { Fixture } from "../index.js";

export const frontendVue: Fixture = {
  name: "frontend-vue",
  why: "frontend (Vue + Vitest) → rules UI, skills frontend, seed subscription-leak-scan",
  files: {
    // `test` runs on plain `node --test`: the fixture has no node_modules and
    // the image installs none, so a runner that needs installing would make
    // the "see the test red, then green" discipline impossible to demonstrate.
    // Not because the trial is offline - it is not, eval-tasks.ts:90 sets
    // `network_mode = "public"` because the agent needs the API. An install at
    // run time is possible and still wrong: it spends the agent's 1200s budget
    // and makes the two arms' token costs incomparable.
    "package.json": JSON.stringify({
      scripts: { test: "node --test" },
      dependencies: { vue: "^3.4.0" },
      devDependencies: { vitest: "^1.0.0" },
    }, null, 2),
    "src/App.vue": "<script setup lang=\"ts\">\nimport { onMounted } from 'vue'\nonMounted(() => stream.subscribe(v => console.log(v)))\n</script>\n",
    "src/App.spec.ts": "import { test, expect } from 'vitest'\ntest('placeholder', () => expect(1).toBe(1))\n",
    // Plain-JS module with zero coverage: the subject for a test-writing eval.
    "src/pricing.js": "export function priceWithTax(cents, ratePercent) {\n  if (!Number.isInteger(cents) || cents < 0) throw new RangeError('cents must be a non-negative integer')\n  if (ratePercent < 0 || ratePercent > 100) throw new RangeError('rate out of range')\n  return Math.round(cents * (1 + ratePercent / 100))\n}\n",
  },
};
