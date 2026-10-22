import type { Fixture } from "../index.js";

export const flawedApp: Fixture = {
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
};
