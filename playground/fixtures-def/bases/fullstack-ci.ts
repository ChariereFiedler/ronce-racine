import type { Fixture } from "../index.js";

export const fullstackCi: Fixture = {
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
};
