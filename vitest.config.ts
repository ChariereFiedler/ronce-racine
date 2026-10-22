import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Behavioral tests of the toolkit, plus the per-skill detection scripts.
    include: ["tests/**/*.test.ts", "skills/**/scripts/*.test.ts"],
    isolate: true,
    // Files run one at a time, as the previous bespoke runner did. These are
    // behavioral tests: they spawn the real CLI and the real hooks against
    // shared repo state (playground/fixtures, dist/hooks), so running files
    // concurrently makes them race and fail on ENOTEMPTY.
    fileParallelism: false,
    // 30_000 until the eval base was rebuilt onto five worlds of 59-79 files
    // with real commit history: `playground/setup.ts` measures 35 s alone now,
    // and nine tests spawn it (four in fixtures.test.ts, five in eval.test.ts),
    // so three of them timed out on a dependency rather than on their subject.
    // 120_000 is ~3x the measured cost - still short enough to catch a hang.
    testTimeout: 120_000,
    // `npm run coverage`. Only the modules a test IMPORTS are visible here: the
    // behavioral tests spawn the real CLI and the real hooks as subprocesses,
    // which v8 coverage of this process cannot see. Read it as coverage of the
    // pure layer, never as coverage of the toolkit - `npm run test:mutation`
    // is what measures the subprocess-tested code.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["tools/*.ts", "install.ts", "src/*.ts", "hooks/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: {
        "tools/eval.ts": { lines: 75 },
      },
    },
  },
});
