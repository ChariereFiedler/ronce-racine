# `audit-performance-frontend`

> Score a project's low-level frontend performance maturity - DOM, CSS pipeline, JSC engine, memory/GC, network/cache, profiling - on a 0-4 scale, targeting sub-100ms rendering, with prioritized, evidence-backed recommendations.

| | |
|---|---|
| **Type** | Skill (on-demand audit) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | Bash (grep, find, ls) - read-only static inspection; progressive-disclosure grids in [`reference/`](reference/) |

## What it is

`audit-performance-frontend` is one domain audit in a family of maturity audits. It takes a repository and produces a structured assessment of how well the frontend is built for speed at the level the browser actually cares about: DOM shape, the CSS rendering pipeline, JavaScriptCore (JSC/WebKit) engine behavior, memory and garbage collection, the network critical path, and profiling discipline.

The domain is broken into **29 questions** (`PF-01` … `PF-29`) across 6 categories. Each question carries a criticality (`MUST` / `SHOULD` / `COULD`), a set of bash commands that gather objective evidence, an explicit checklist, and a 0-4 level rubric. The skill runs the commands, reads the relevant source, scores each question with a confidence level, and emits a report with an overall (optionally weighted) score.

It is deliberately micro-optimization oriented - aimed at embedded or real-time WebKit contexts (WKWebView, Electron) and any project chasing a sub-100ms render - rather than at generic Lighthouse-score advice.

## Why it exists

Frontend performance is usually audited from the outside (a Lighthouse number) and rarely from the inside (why the number is what it is). This skill inspects the mechanisms that produce the number:

- **Objective first** - every question starts from commands (`grep` for `document.write`, layout-thrashing reads, `delete` on hot paths, `will-change` in static CSS, missing `defer`/`async`, uncleaned listeners), so a score is anchored to what is actually in the repo.
- **Engine-aware** - the JSC category (`PF-10` … `PF-18`) scores the things that make or break the JIT: monomorphic shapes, NaN-boxing, compilation tiers, deopt/bailouts, closure allocation, array indexing types, the event loop. These rarely show up in a black-box audit.
- **Honest about confidence** - much of real performance (JIT profiling, actual GC pauses, real-world VRAM, runtime metrics) cannot be settled by static analysis. The skill marks those `low` confidence and lists them as non-auditable rather than inventing a number.
- **Prioritized** - criticality weighting means a render-blocking critical path (`MUST`) outranks unscoped custom properties (`COULD`) in the recommendations.

## When it triggers

Invoke it for a **domain-scoped** frontend performance audit. Trigger phrases: "audit performance", "audit frontend", "audit perf", "audit rendering", "audit webkit", "audit jsc".

For a **full multi-domain** project audit, use [`audit-industrialisation`](../audit-industrialisation/) instead - it orchestrates every domain audit (this one included) and consolidates the results. Do not invoke each domain skill by hand for a global audit.

## How it works

The approach, at a glance - the supplementary tables below (grids per category, confidence tags) are the parts worth keeping close; the full step-by-step protocol lives in [`SKILL.md`](SKILL.md).

### 1. Detect the project type

Identify whether the project is a SPA, SSR app, PWA, embedded WebKit app, or component library. The type selects a variant that marks whole categories N/A - e.g. a static site with no custom JS makes `PF-10` … `PF-18` N/A; a component library makes the network category `PF-23` … `PF-26` N/A.

### 2. Gather evidence per question

For each of `PF-01` … `PF-29`, run the verification commands from the matching reference grid and read the relevant CSS/JS/HTML and build config.

| Category | Reference | Questions |
|----------|-----------|-----------|
| HTML & Critical Path | [`reference/html-critical-path.md`](reference/html-critical-path.md) | PF-01 … PF-04 |
| CSS & Rendering Pipeline | [`reference/css-rendering-pipeline.md`](reference/css-rendering-pipeline.md) | PF-05 … PF-09 |
| JavaScript Engine & Runtime JSC | [`reference/js-engine-runtime.md`](reference/js-engine-runtime.md) | PF-10 … PF-18 |
| Memory & Garbage Collection | [`reference/memory-gc.md`](reference/memory-gc.md) | PF-19 … PF-22 |
| Assets, Cache & Network | [`reference/assets-cache-network.md`](reference/assets-cache-network.md) | PF-23 … PF-26 |
| Profiling & Tooling | [`reference/profiling-tooling.md`](reference/profiling-tooling.md) | PF-27 … PF-29 |

### 3. Score each question

Assign a level 0-4 from the rubric, with a confidence tag:

- **high** - verified by a command or direct file reading
- **medium** - inferred from structure/config, not deeply verified
- **low** - needs runtime measurement or profiling (JIT tiers, GC pauses, VRAM, Core Web Vitals under load)

Mark a question **N/A** when the project profile makes it irrelevant (see the variant in step 1).

### 4. Compute the domain score

- Simple domain score = average of scored questions (N/A excluded), reported as "X scored out of 29".
- Weighted score = `sum(level × weight) / sum(weight)` where `MUST`=3, `SHOULD`=2, `COULD`=1 (the per-question weight assignments are in [`SKILL.md`](SKILL.md)).

### 5. Emit the report

The standard output (see [`SKILL.md`](SKILL.md)) includes a summary with the detected project type, a per-question table (code / question / criticality / level / confidence / justification), strengths, weaknesses, recommendations tagged `[MUST]`/`[SHOULD]`/`[COULD]`, and an explicit list of non-auditable items.

## Worked example

> Auditing `acme-app`, a Vue SPA rendered inside a WKWebView, chasing a sub-100ms first paint.

1. **Detect** - embedded WebKit application → every category applies, with extra focus on the JSC and memory categories (`PF-10` … `PF-22`).
2. **PF-02** - `grep` finds three `<script>` tags in `index.html` without `defer`/`async`. Render-blocking, no critical-CSS inlining. Level **0**, confidence **high**. Because `PF-02` is a `MUST`, this drives a top recommendation.
3. **PF-10** - hot-path objects are built with `Object.assign` and a couple of `delete` calls, breaking JSC Structure stability. Level **1**, confidence **medium** (shape stability inferred statically, not JIT-profiled).
4. **PF-21** - several `addEventListener` on `window` with no matching `removeEventListener` in the component teardown → likely detached-DOM leaks. Level **1**, confidence **medium**.
5. **PF-19/PF-27/PF-28** - real GC pauses and Core Web Vitals under load can't be derived from the repo. Levels tentative, confidence **low**, listed under non-auditable items ("requires runtime profiling and RUM").
6. **Report** - weighted overall score, with `[MUST] Add defer/async and inline critical CSS to unblock acme-app's first paint` first in the recommendations.

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) - orchestrator that runs all domain audits and consolidates them; use it for a full audit.
- [`audit-report`](../audit-report/) - template and scoring rules for the consolidated report.
- [`audit-observability`](../audit-observability/) - logging, metrics, tracing, and alerting; complements the runtime performance metrics this skill can only measure statically.
- [`audit-quality`](../audit-quality/) - QA/DevOps and code quality; overlaps on performance CI and regression gating (`PF-29`).
