import type { Fixture } from "../index.js";

export const auditTarget: Fixture = {
  name: "audit-target",
  why: "defects spread across audit domains → audit family evals",
  files: {
    "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }, null, 2),
    "src/server.js": "const express = require('express')\nconst app = express()\nconst apiKey = \"demo-\" + \"not-a-real-key\" // planted: hardcoded secret\napp.get('/user', (req, res) => {\n  const user = { email: 'a@b.com' }\n  console.log('user', user.email) // planted: PII in logs\n  res.json(user)\n})\n",
    "Dockerfile": "FROM node:22\nCOPY . .\nCMD [\"node\", \"src/server.js\"]\n",
    "EXPECTED.md": "# Ground truth\n\n| Gap | Evidence |\n|---|---|\n| No CI pipeline | no `.gitlab-ci.yml` / `.github/workflows` |\n| No tests | no test script, no test devDeps in package.json |\n| Secret in source | `apiKey` hardcoded in src/server.js |\n| PII in logs | `console.log('user', user.email)` in src/server.js |\n| Container runs as root | Dockerfile has no `USER` directive |\n| No healthcheck | Dockerfile has no `HEALTHCHECK` |\n| No ADR / decision record | no docs/adr directory |\n",
  },
};
