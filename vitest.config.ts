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
    testTimeout: 30_000,
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
