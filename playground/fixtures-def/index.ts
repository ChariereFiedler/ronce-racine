/**
 * The fixture definitions, one module per fixture.
 *
 * They live here rather than inside setup.ts so that adding a fixture never
 * edits the materializer, and two scenarios added in parallel never collide on
 * the same file. setup.ts reads BASES and writes them to disk.
 */
import { auditTarget } from "./bases/audit-target.js";
import { backendNode } from "./bases/backend-node.js";
import { buggyApp } from "./bases/buggy-app.js";
import { designSystem } from "./bases/design-system.js";
import { flawedApp } from "./bases/flawed-app.js";
import { frontendVue } from "./bases/frontend-vue.js";
import { fullstackCi } from "./bases/fullstack-ci.js";
import { incident } from "./bases/incident.js";
import { maturity } from "./bases/maturity.js";
import { minimalGo } from "./bases/minimal-go.js";
import { mixedVocabulary } from "./bases/mixed-vocabulary.js";
import { platform } from "./bases/platform.js";
import { service } from "./bases/service.js";
import { shippedFeature } from "./bases/shipped-feature.js";
import { incidentFirstFailure } from "./overlays/incident-first-failure.js";
import { surface } from "./bases/surface.js";
import { shopfront } from "./bases/shopfront.js";

/**
 * A count the fixture guarantees, checked with the gates' own semantics. A
 * scenario computes `grep_count: 3` against the tree as it stands; declaring
 * the same count here makes a later content edit fail in the fixture tests
 * rather than silently move what a gate measures.
 */
export interface FixtureInvariant { pattern: string; in?: string; count: number }

/**
 * A patch on a file as the previous commit left it, so a history does not have
 * to restate the file to change three lines of it.
 *
 * `find` matches EXACTLY ONCE or materialisation fails: an anchor that matches
 * nothing yields a commit with no diff, which is the "the previous fixes did
 * nothing" failure this suite already guards against, dressed as a patch; an
 * anchor that matches twice patches whichever occurrence came first, which is
 * not a decision an author made.
 */
export type FileEdit = { find: string; replace: string } | { append: string };

/**
 * One step of a fixture's history.
 *
 * The three primitives are what a realistic history needs and no more:
 * `changes` restates a file, `edits` patch one in place, `deletes` removes one.
 * Without the last two, a 30-commit history over 15-40 line files is thousands
 * of lines of escaped literals - every touched file restated in full by every
 * later commit - and editing one line means propagating it by hand through all
 * of them. `deletes` is also the only way to write the commonest shape of all:
 * a move, which is a write plus a removal.
 *
 * A step must produce a real diff. An empty commit reads as "the previous fixes
 * did nothing", a different lesson from "the previous fixes treated symptoms" -
 * and agents do notice the difference.
 */
export interface CommitStep {
  message: string;
  /** Files rewritten in full. */
  changes?: Record<string, string>;
  /** Files patched relative to their content at this point in the history. */
  edits?: Record<string, FileEdit[]>;
  /** Paths this commit removes. Each must exist, or the "move" moved nothing. */
  deletes?: string[];
}

export interface Fixture {
  name: string;
  why: string;
  files: Record<string, string>;
  /** History layered on top of the initial commit. See CommitStep. */
  extraCommits?: CommitStep[];
  /**
   * Files written AFTER the commits and never added, so the repo ships with a
   * dirty worktree over an empty index. Everything else is `git add -A`'d, so
   * this is the only way to express "there is a change, and nothing is staged"
   * - the premise of commit-readiness-review/nothing-staged.
   */
  unstaged?: Record<string, string>;
  /** Counts this fixture guarantees. See FixtureInvariant. */
  invariants?: FixtureInvariant[];
}

/**
 * A fixture expressed as a delta on a base, so 69 scenarios do not each carry a
 * full tree. `files` are merged over the base's (same key = replacement), and
 * the base's history is replayed before the overlay's own commits.
 *
 * The merge itself stays a pure override - `files` can replace a base file but
 * never remove one, so a scenario that needs a base file gone declares a new
 * base. Removal belongs to the HISTORY instead (CommitStep.deletes), where a
 * disappearing path is a diff an agent can read rather than a silent absence.
 */
export interface Overlay {
  /** The fixture directory name, e.g. audit-target-gateway. */
  name: string;
  /** A BASES entry name. */
  base: string;
  why: string;
  files: Record<string, string>;
  /** Default true: replay the base's extraCommits before the overlay's. */
  inheritCommits?: boolean;
  extraCommits?: CommitStep[];
  unstaged?: Record<string, string>;
  /**
   * Appended to whatever the base's invariants still guarantee. An overlay
   * that rewrites a file loses the base's invariants keyed on it, because an
   * inherited count over rewritten content is a stale claim, not a guarantee.
   */
  invariants?: FixtureInvariant[];
}

/** Materialisation order, kept as it was when they lived in one array. */
export const BASES: Fixture[] = [
  frontendVue,
  backendNode,
  fullstackCi,
  flawedApp,
  minimalGo,
  buggyApp,
  shippedFeature,
  mixedVocabulary,
  designSystem,
  auditTarget,
  incident,
  platform,
  maturity,
  service,
  surface,
  shopfront,
];

/** Overlay fixtures, one module per scenario that needs its own history. */
export const OVERLAYS: Overlay[] = [incidentFirstFailure];

/** Every path one history step writes, patches or removes. */
function touchedBy(step: CommitStep): string[] {
  return [...Object.keys(step.changes ?? {}), ...Object.keys(step.edits ?? {}), ...(step.deletes ?? [])];
}

/** Flattens an overlay into the plain Fixture shape setup.ts materialises. */
export function resolve(overlay: Overlay): Fixture {
  const base = BASES.find((b) => b.name === overlay.base);
  if (!base) throw new Error(`${overlay.name}: unknown base "${overlay.base}"`);
  const inherited = overlay.inheritCommits === false ? [] : (base.extraCommits ?? []);

  // Every path the overlay touches, whether in the tree or through a commit.
  // A patched or deleted file counts as touched for the same reason a rewritten
  // one does: an inherited count over content the overlay changed is a stale
  // claim, and over content it removed it is unmeasurable.
  const rewritten = new Set([
    ...Object.keys(overlay.files),
    ...(overlay.extraCommits ?? []).flatMap(touchedBy),
  ]);
  const keptInvariants = (base.invariants ?? []).filter((inv) => !inv.in || !rewritten.has(inv.in));

  return {
    name: overlay.name,
    why: overlay.why,
    files: { ...base.files, ...overlay.files },
    extraCommits: [...inherited, ...(overlay.extraCommits ?? [])],
    unstaged: { ...base.unstaged, ...overlay.unstaged },
    invariants: [...keptInvariants, ...(overlay.invariants ?? [])],
  };
}
