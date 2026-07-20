#!/usr/bin/env tsx
/**
 * Unit tests of the interactive selector's keyboard logic (applySelectorKey).
 * The TTY rendering/raw-mode shell is not testable without a PTY; the state
 * transitions - the part that decides WHAT gets installed - are covered here.
 */
import { test, assert, initWork, finish } from "./helpers.js";
import { applySelectorKey, type Item, type SelectorState } from "../install.js";

initWork();

function items(): Item[] {
  return [
    { kind: "rule", name: "commits.md", when: "always", reason: "r1" },
    { kind: "rule", name: "minimal-code.md", when: "always", reason: "r2" },
    { kind: "skill", name: "detection-sweep", when: "always", reason: "s1" },
  ];
}
function state(checkedIdx: number[] = []): SelectorState {
  const flat = items();
  return { flat, checked: new Set(checkedIdx.map((i) => flat[i])), cursor: 0 };
}

test("navigation wraps in both directions (up/down and vim k/j)", () => {
  const s = state();
  const cursorAfter = (key: string): number => { applySelectorKey(s, { name: key }); return s.cursor; };
  assert(cursorAfter("up") === 2, "up from 0 must wrap to the end");
  assert(cursorAfter("down") === 0, "down from the end must wrap to 0");
  assert(cursorAfter("j") === 1, "j must move down");
  assert(cursorAfter("k") === 0, "k must move up");
});

test("space toggles the item under the cursor", () => {
  const s = state();
  applySelectorKey(s, { name: "space" });
  assert(s.checked.has(s.flat[0]), "space must check an unchecked item");
  applySelectorKey(s, { name: "space" });
  assert(!s.checked.has(s.flat[0]), "space must uncheck a checked item");
});

test("'a' toggles the whole group of the cursor's kind", () => {
  const s = state([0]); // one of the two rules already checked
  applySelectorKey(s, { name: "a" });
  assert(s.checked.has(s.flat[0]) && s.checked.has(s.flat[1]), "a must check the whole partially-checked group");
  assert(!s.checked.has(s.flat[2]), "the other kind must not be touched");
  applySelectorKey(s, { name: "a" });
  assert(!s.checked.has(s.flat[0]) && !s.checked.has(s.flat[1]), "a must clear a fully-checked group");
});

test("enter confirms, q and ctrl-c cancel, unknown keys continue", () => {
  const s = state();
  assert(applySelectorKey(s, { name: "return" }) === "confirm", "enter must confirm");
  assert(applySelectorKey(s, { name: "q" }) === "cancel", "q must cancel");
  assert(applySelectorKey(s, { name: "c", ctrl: true }) === "cancel", "ctrl-c must cancel");
  assert(applySelectorKey(s, { name: "x" }) === "continue", "unknown key must be a no-op");
  assert(applySelectorKey(s, {}) === "continue", "empty keypress must be a no-op");
});

finish("selector");
