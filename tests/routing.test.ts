#!/usr/bin/env tsx
/**
 * Tests of the disambiguation lint itself.
 *
 * The lint's own output ("10 cases route correctly") proves nothing about the
 * lint: a checker that always returns "no failures" prints exactly the same
 * line. These cases run it against situations whose verdict is known.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, initWork, finish, ROOT } from "./helpers.js";
import { ROUTING_CASES, routingFailures, scorePrompt, words } from "../tools/routing-cases.js";

initWork();

function realSkills(): { dir: string; description: string }[] {
  const skillsDir = join(ROOT, "skills");
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const raw = readFileSync(join(skillsDir, e.name, "SKILL.md"), "utf8");
      return { dir: e.name, description: /^description: (.*)$/m.exec(raw)?.[1] ?? "" };
    });
}

test("the declared cases pass against the real descriptions", () => {
  const fails = routingFailures(ROUTING_CASES, realSkills());
  assert(fails.length === 0, `routing cases failing: ${fails.join(" | ")}`);
});

test("a case pointing at the wrong skill is reported", () => {
  // The mirror image of a real case: the prompt is about vocabulary, so
  // expecting the modeling skill to win must fail.
  const inverted = [{
    prompt: "three names for the same thing in this codebase, fix the vocabulary",
    expect: "domain-modeling-design",
    against: ["domain-glossary"],
  }];
  assert(routingFailures(inverted, realSkills()).length === 1, "an inverted case must be reported");
});

test("a tie is a failure, not a pass", () => {
  // Two skills nothing in the prompt touches both score 0. Requiring a STRICT
  // win is what makes that a failure - the property the mutation flips.
  const tied = [{ prompt: "zzzz qqqq wwww", expect: "domain-glossary", against: ["performance-profiling"] }];
  assert(routingFailures(tied, realSkills()).length === 1, "a 0-0 tie must not count as beating the neighbour");
});

test("an unknown expected skill is reported rather than silently skipped", () => {
  const bogus = [{ prompt: "anything at all", expect: "no-such-skill", against: ["domain-glossary"] }];
  const fails = routingFailures(bogus, realSkills());
  assert(fails.length === 1 && fails[0].includes("not a skill"), "an unknown skill must be named as such");
});

test("a verbatim quoted trigger outranks incidental vocabulary overlap", () => {
  const skills = [
    { dir: "alpha", description: 'Use when whatever. Triggers on "run the widget sweep".' },
    { dir: "beta", description: "Use when run the sweep widget whatever thing happens with words." },
  ];
  const alpha = scorePrompt("please run the widget sweep now", skills[0], ["alpha", "beta"]);
  const beta = scorePrompt("please run the widget sweep now", skills[1], ["alpha", "beta"]);
  assert(alpha > beta, `a quoted trigger must win: alpha=${alpha}, beta=${beta}`);
});

test("a description redirecting to another skill does not borrow its vocabulary", () => {
  const dirs = ["writing-robust-tests", "comprehensive-test-strategy"];
  const redirecting = {
    dir: "comprehensive-test-strategy",
    description: "Use when defining a strategy. Not for writing the tests of one file - that is `writing-robust-tests`.",
  };
  const withRedirect = scorePrompt("write robust tests", redirecting, dirs);
  const withoutRedirect = scorePrompt("write robust tests", { ...redirecting, description: redirecting.description.replace("- that is `writing-robust-tests`.", "") }, dirs);
  assert(withRedirect <= withoutRedirect, "naming another skill must not raise your own score");
});

test("stemming folds a plural, stopwords are dropped", () => {
  assert(words("aggregates").includes("aggregate"), "a plural must reach its singular");
  assert(!words("this that with from").length, "stopwords must not score");
  assert(!words("a to of in").length, "words under four letters must not score");
});

finish("routing");
