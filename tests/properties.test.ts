#!/usr/bin/env tsx
/**
 * Property-based tests (fast-check) over the pure logic.
 *
 * The rest of the suite is example-based: it pins the cases we thought of. These
 * cover the cases we did not - the manifest parser sees 35 hand-written files in
 * practice, and the selector sees whatever a user types. Both are given
 * thousands of generated inputs here instead.
 *
 * Only invariants belong here. "Some concrete input maps to some concrete
 * output" stays an example test, where the expectation is readable.
 */
import fc from "fast-check";
import { test, assert, finish } from "./helpers.js";
import { parseEvalManifest } from "../tools/eval.js";
import { canonicalHash, applySelectorKey, type Item, type SelectorState } from "../install.js";

/** Identifier-shaped, so generated values never collide with YAML syntax. */
const word = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);

test("the manifest parser round-trips every manifest it accepts", () => {
  fc.assert(
    fc.property(word, fc.array(word, { minLength: 1, maxLength: 6 }), fc.array(word, { maxLength: 4 }), (fixture, promptWords, criteria) => {
      const prompt = promptWords.join(" ");
      const yaml = [
        `fixture: ${fixture}`,
        "prompt: >",
        `  ${prompt}`,
        "gates:",
        `  - file_exists: ${fixture}.md`,
        ...(criteria.length ? ["judge:", "  criteria:", ...criteria.map((c) => `    - "${c}"`)] : []),
      ].join("\n");

      const m = parseEvalManifest("generated", yaml);
      assert(m.fixture === fixture, "the fixture must survive the round-trip");
      assert(m.prompt === prompt, "the prompt must survive the round-trip");
      assert(m.gates.length === 1 && m.gates[0].kind === "file_exists", "the declared gate must survive");
      assert((m.judge?.criteria ?? []).join("|") === criteria.join("|"), "the criteria must survive in order");
      // A manifest with criteria and no explicit threshold defaults to pass_all.
      assert(!criteria.length || m.judge?.threshold === "pass_all", "the default threshold must be pass_all");
    }),
  );
});

test("the manifest parser rejects, never accepts silently", () => {
  fc.assert(
    fc.property(fc.string(), (raw) => {
      // Whatever the input, the parser either produces a manifest carrying the
      // two mandatory fields, or throws. It must never return a half-manifest.
      try {
        const m = parseEvalManifest("generated", raw);
        assert(!!m.fixture && !!m.prompt, "an accepted manifest must carry a fixture and a prompt");
      } catch (e) {
        assert(e instanceof Error && e.message.includes("generated/eval.yaml"), "a rejection must name the manifest");
      }
    }),
  );
});

test("canonicalHash depends on the token set, not on its order", () => {
  const tokens = ["rule:commits.md", "rule:minimal-code.md", "skill:detection-sweep", "agent:code-reviewer.md"];
  fc.assert(
    fc.property(fc.shuffledSubarray(tokens, { minLength: 1 }), (subset) => {
      const shuffled = [...subset].reverse();
      assert(canonicalHash(subset) === canonicalHash(shuffled), "the hash must not depend on the token order");
    }),
  );
});

/** Any key the selector may receive, valid or not. */
const anyKey = fc.oneof(
  fc.constantFrom("up", "down", "j", "k", "space", "a", "return", "escape", "q", "x", "1", ""),
  fc.string({ maxLength: 3 }),
);

test("no key sequence can put the selector in an impossible state", () => {
  const flat: Item[] = [
    { kind: "rule", name: "commits.md", when: "always", reason: "r1" },
    { kind: "rule", name: "minimal-code.md", when: "always", reason: "r2" },
    { kind: "skill", name: "detection-sweep", when: "always", reason: "s1" },
  ];
  fc.assert(
    fc.property(fc.array(fc.record({ name: anyKey, ctrl: fc.boolean() }), { maxLength: 40 }), (keys) => {
      const state: SelectorState = { flat, checked: new Set(), cursor: 0 };
      for (const key of keys) {
        applySelectorKey(state, key);
        assert(Number.isInteger(state.cursor), "the cursor must stay an integer");
        assert(state.cursor >= 0 && state.cursor < flat.length, `the cursor must stay in range (got ${state.cursor})`);
        for (const item of state.checked) assert(flat.includes(item), "only listed items may be checked");
      }
    }),
  );
});

finish("properties");
