/**
 * Disambiguation cases: a realistic user sentence, and the ONE skill it must
 * route to.
 *
 * The `triggers` lint answers a weaker question - does each skill rank in the
 * top 3 for its own quoted phrases. That passes while two neighbours remain
 * interchangeable, which is the actual risk of a 36-skill surface: the families
 * below overlap by design (three bug skills, ten audit skills, two test-strategy
 * skills), and a user sentence has to land on one of them, not on the family.
 *
 * Rules for adding a case:
 * - Write what a user would actually type, not a phrase copied from the
 *   description. A case that quotes the trigger verbatim tests nothing.
 * - Only add cases where a WRONG answer is genuinely plausible. Pairing a
 *   frontend skill against a database one proves nothing.
 * - When a case fails, the fix is usually the description, not the case.
 */
export interface RoutingCase {
  prompt: string;
  expect: string;
  /** The neighbours this case exists to separate it from. */
  against: string[];
}

export const ROUTING_CASES: RoutingCase[] = [
  // The bug family: three skills, three genuinely different moments.
  {
    prompt: "the export is broken and nobody knows why yet - reproduce it and find the root cause",
    expect: "bug-triage-structured",
    against: ["bug-ticket-root-cause", "recurring-bug-root-cause"],
  },
  {
    prompt: "I found a regression, write it up as a ticket, we are not fixing it now",
    expect: "bug-ticket-root-cause",
    against: ["bug-triage-structured", "recurring-bug-root-cause"],
  },
  {
    prompt: "this is the fourth fix on the same module in two weeks, encore ce bug",
    expect: "recurring-bug-root-cause",
    against: ["bug-triage-structured", "bug-ticket-root-cause"],
  },

  // Testing: writing tests for one file vs deciding what the project tests.
  {
    prompt: "this module has no tests, write some",
    expect: "writing-robust-tests",
    against: ["comprehensive-test-strategy", "audit-testing"],
  },
  {
    prompt: "define what we test at which level across the project, by risk",
    expect: "comprehensive-test-strategy",
    against: ["writing-robust-tests", "audit-testing"],
  },

  // Naming vocabulary vs designing the model. Added with domain-glossary.
  {
    prompt: "three names for the same thing in this codebase, fix the vocabulary",
    expect: "domain-glossary",
    against: ["domain-modeling-design", "recording-decisions"],
  },
  {
    prompt: "where should this business rule live, and what are the aggregates",
    expect: "domain-modeling-design",
    against: ["domain-glossary", "ddd-backend-implementation"],
  },

  // "Is it done" - proving it works vs trying to break it.
  {
    prompt: "the feature is implemented and the tests pass, can I close the ticket",
    expect: "validating-features-end-to-end",
    against: ["adversarial-feature-challenge", "comprehensive-test-strategy"],
  },
  {
    prompt: "try to break this feature before we ship it, find what I missed",
    expect: "adversarial-feature-challenge",
    against: ["validating-features-end-to-end", "detection-sweep"],
  },

  // Performance: one slowdown to explain vs a maturity grid to score.
  {
    prompt: "this endpoint is slow under load, find the bottleneck",
    expect: "performance-profiling",
    against: ["audit-performance-frontend", "audit-architecture"],
  },
];

// Deliberately scored on the WHOLE description, not on the quoted triggers: a
// real user sentence never contains a trigger phrase verbatim, so matching
// triggers alone scores every neighbour identically on the words of their
// folder names. This is lexical overlap, not a model of how Claude routes - a
// floor that catches two descriptions no wording can tell apart, never a
// promise about live behavior.
// Le scoring vit dans `hooks/skill-scoring.ts`, avec le hook qui tourne en
// session. Il a longtemps existé en double — cette version, riche et tenue par
// 208 cas de test, et celle du hook, un substring sans seuil : l'algorithme sous
// test n'était pas l'algorithme sous charge. Une seule implémentation, mesurée
// ici, exécutée là-bas.
import { scorePrompt, type SkillVocab } from "../hooks/skill-scoring.ts";
export { words, quotedPhrases, scorePrompt, MIN_SCORE, type SkillVocab } from "../hooks/skill-scoring.ts";

/**
 * Cases judged against the neighbours they declare, not against the whole
 * catalog: "is it ahead of the three skills it is confusable with" is a
 * question this scoring can answer honestly. "Is it rank 1 out of 36" is not -
 * an unrelated skill sharing two common words would decide it.
 */
export function routingFailures(cases: RoutingCase[], skills: SkillVocab[]): string[] {
  const dirs = skills.map((s) => s.dir);
  const fails: string[] = [];
  for (const c of cases) {
    if (!dirs.includes(c.expect)) {
      fails.push(`"${c.prompt}" → expects ${c.expect}, which is not a skill`);
      continue;
    }
    const score = (dir: string): number => {
      const s = skills.find((x) => x.dir === dir);
      return s ? scorePrompt(c.prompt, s, dirs) : 0;
    };
    const mine = score(c.expect);
    const lost = c.against.filter((rival) => !(mine > score(rival)));
    if (lost.length) {
      fails.push(`"${c.prompt}" → ${c.expect}(${mine}) does not beat ${lost.map((r) => `${r}(${score(r)})`).join(", ")}`);
    }
  }
  return fails;
}
