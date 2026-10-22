import type { Fixture } from "../index.js";

export const backendNode: Fixture = {
  name: "backend-node",
  why: "backend (NestJS + SQL + migrations) → clean-archi, DDD, no-raw-sql, migrations",
  files: {
    "package.json": JSON.stringify({ dependencies: { "@nestjs/core": "^10.0.0" }, devDependencies: { jest: "^29.0.0" } }, null, 2),
    "src/main.ts": "export const port = 3000\n",
    "migrations/001_init.sql": "CREATE TABLE users (id uuid PRIMARY KEY);\n",
    "Dockerfile": "FROM node:22\n",
  },
};
