import type { Fixture } from "../index.js";

export const minimalGo: Fixture = {
  name: "minimal-go",
  why: "bare Go backend, no tests/CI → minimal proposal",
  files: {
    "go.mod": "module example\n\ngo 1.22\n",
    "main.go": "package main\n\nfunc main() {}\n",
  },
};
