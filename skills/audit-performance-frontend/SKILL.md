---
name: audit-performance-frontend
description: Low-level frontend performance audit. Use when auditing frontend rendering performance, WebKit internals, JSC optimization, DOM structure, CSS rendering pipeline, memory/GC, cache strategy, or profiling methodology. Triggers on "audit performance", "audit frontend", "audit perf", "audit rendering", "audit webkit", "audit jsc".
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: audit
---

## When ME and not audit-industrialisation

- **ME** when: an audit scoped to this domain only
- **audit-industrialisation** instead if: a cross-domain global audit — it orchestrates every audit (including ME) and produces a consolidated report

> For a full project audit, use `audit-industrialisation` rather than invoking each skill separately.

---

# Low-Level Frontend Performance Audit

## Overview

Audit a project's frontend performance maturity, targeting sub-100ms rendering. Covers the integrity of the rendering pipeline: DOM structure, CSS rendering, JS engine internals (JSC), memory and GC management, network/cache strategy, and profiling tooling. Micro-optimization oriented, for embedded or real-time contexts running on WebKit.

**29 questions** split across **6 categories**:

| Category | Questions | Grid |
|-------|-----------|--------|
| 1 — HTML & Critical Path | 4 (PF-01 to PF-04) | [reference/html-critical-path.md](reference/html-critical-path.md) |
| 2 — CSS & Rendering Pipeline | 5 (PF-05 to PF-09) | [reference/css-rendering-pipeline.md](reference/css-rendering-pipeline.md) |
| 3 — JavaScript Engine & Runtime JSC | 9 (PF-10 to PF-18) | [reference/js-engine-runtime.md](reference/js-engine-runtime.md) |
| 4 — Memory & Garbage Collection | 4 (PF-19 to PF-22) | [reference/memory-gc.md](reference/memory-gc.md) |
| 5 — Assets, Cache & Network | 4 (PF-23 to PF-26) | [reference/assets-cache-network.md](reference/assets-cache-network.md) |
| 6 — Profiling & Tooling | 3 (PF-27 to PF-29) | [reference/profiling-tooling.md](reference/profiling-tooling.md) |

## Scoring

- Each scored question gets a level from 0 to 4.
- Questions marked **N/A** are excluded from the calculation.
- **Global score** = sum of levels / number of scored questions (excluding N/A).
- Criticality weighting:
  - **MUST** (weight 3): PF-01, PF-02, PF-03, PF-06, PF-10, PF-13, PF-17, PF-23, PF-27, PF-28, PF-29
  - **SHOULD** (weight 2): PF-04, PF-05, PF-07, PF-09, PF-11, PF-12, PF-14, PF-15, PF-19, PF-20, PF-21, PF-22, PF-24, PF-25, PF-26
  - **COULD** (weight 1): PF-08, PF-16, PF-18

## Audit protocol

1. **Detect the project type**: SPA, SSR, PWA, embedded WebKit, component library.
2. **Category 1 — HTML**: scan for `document.write`, measure DOM depth, check blocking scripts and priority attributes.
3. **Category 2 — CSS**: audit selectors, animations, compositing, custom properties, fonts.
4. **Category 3 — JS Engine**: look for polymorphism patterns, `delete`, arrow functions in loops, `eval`, sparse arrays.
5. **Category 4 — Memory**: check allocations in loops, event listeners without cleanup, caches without eviction.
6. **Category 5 — Assets**: measure critical-path size, check compression, cache headers, font loading.
7. **Category 6 — Profiling**: check instrumentation, metrics, performance CI.
8. **Run the verification commands** for each question (see grids).
9. **Assign a level** (0-4) per question with justification and confidence level.
10. **Mark N/A** the non-applicable questions (e.g. PF-10 to PF-18 if there is no custom JS, just a framework).
11. **Produce the report** (output format below).

### Variants by project type

**SSR application (Nuxt, Next.js)**
- **PF-01 to PF-04**: Fully applicable, the server generates the initial HTML
- **PF-23**: Adapted — TTFB includes server render time

**UI component library**
- **PF-23 to PF-26**: N/A (no control over deployment)
- **PF-27 to PF-29**: Adapted — component performance benchmarks

**Static site (11ty, Hugo, Astro)**
- **PF-10 to PF-18**: Often N/A (little custom JS)
- **PF-01 to PF-09, PF-23 to PF-29**: Fully applicable

**Embedded WebKit application (WKWebView, Electron)**
- Every question applies with the standard grid
- Particular focus on PF-10 to PF-22 (memory/CPU constraints)

## Grids by category

Each grid contains, per question: statement, criticality, elements to analyze, bash verification commands, points to check, and a 0-4 level table.

- [reference/html-critical-path.md](reference/html-critical-path.md) — **Category 1, HTML & Critical Path**, 4 questions (PF-01 to PF-04)
- [reference/css-rendering-pipeline.md](reference/css-rendering-pipeline.md) — **Category 2, CSS & Rendering Pipeline**, 5 questions (PF-05 to PF-09)
- [reference/js-engine-runtime.md](reference/js-engine-runtime.md) — **Category 3, JavaScript Engine & Runtime JSC**, 9 questions (PF-10 to PF-18)
- [reference/memory-gc.md](reference/memory-gc.md) — **Category 4, Memory & Garbage Collection**, 4 questions (PF-19 to PF-22)
- [reference/assets-cache-network.md](reference/assets-cache-network.md) — **Category 5, Assets, Cache & Network**, 4 questions (PF-23 to PF-26)
- [reference/profiling-tooling.md](reference/profiling-tooling.md) — **Category 6, Profiling & Tooling**, 3 questions (PF-27 to PF-29)

## Output format

```markdown
## Frontend Performance — Global score: X.X/4 (Y questions scored out of 29)

### Summary
[2-3 sentences summarizing frontend performance maturity]
[Detected project type: SPA / SSR / PWA / embedded / static]

### Detail by question

#### Category 1 — HTML & Critical Path

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| PF-01 | DOM structure and parsing | MUST | X | high/medium/low | ... |
| PF-02 | Render-blocking | MUST | X | high/medium/low | ... |
| PF-03 | Layout thrashing | MUST | X | high/medium/low | ... |
| PF-04 | Loading & priority | SHOULD | X | high/medium/low | ... |

#### Category 2 — CSS & Rendering Pipeline

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| PF-05 | CSS selectors | SHOULD | X | high/medium/low | ... |
| PF-06 | Layout triggers | MUST | X | high/medium/low | ... |
| PF-07 | Paint & GPU | SHOULD | X | high/medium/low | ... |
| PF-08 | Custom properties | COULD | X | high/medium/low | ... |
| PF-09 | Font rendering | SHOULD | X | high/medium/low | ... |

#### Category 3 — JavaScript Engine & Runtime

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| PF-10 | JSC monomorphism | MUST | X | high/medium/low | ... |
| PF-11 | NaN-boxing | SHOULD | X | high/medium/low | ... |
| PF-12 | JSC compilation tiers | SHOULD | X | high/medium/low | ... |
| PF-13 | Deoptimization | MUST | X | high/medium/low | ... |
| PF-14 | Functions & closures | SHOULD | X | high/medium/low | ... |
| PF-15 | JSC arrays | SHOULD | X | high/medium/low | ... |
| PF-16 | Strings & RegExp | COULD | X | high/medium/low | ... |
| PF-17 | Event loop | MUST | X | high/medium/low | ... |
| PF-18 | Weak references | COULD | X | high/medium/low | ... |

#### Category 4 — Memory & GC

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| PF-19 | GC Riptide | SHOULD | X | high/medium/low | ... |
| PF-20 | Allocation pressure | SHOULD | X | high/medium/low | ... |
| PF-21 | Memory leaks | SHOULD | X | high/medium/low | ... |
| PF-22 | GPU memory | SHOULD | X | high/medium/low | ... |

#### Category 5 — Assets, Cache & Network

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| PF-23 | Network critical path | MUST | X | high/medium/low | ... |
| PF-24 | Compression & encoding | SHOULD | X | high/medium/low | ... |
| PF-25 | Multi-layer cache | SHOULD | X | high/medium/low | ... |
| PF-26 | Font loading | SHOULD | X | high/medium/low | ... |

#### Category 6 — Profiling & Tooling

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| PF-27 | Methodical profiling | MUST | X | high/medium/low | ... |
| PF-28 | Sub-100ms metrics | MUST | X | high/medium/low | ... |
| PF-29 | Performance regression CI | MUST | X | high/medium/low | ... |

### Strengths
- ...

### Weaknesses
- ...

### Recommendations
1. [MUST] ...
2. [SHOULD] ...
3. [COULD] ...

### Non-auditable items
- [List the items impossible to verify by static analysis: runtime metrics, JIT profiling, real GC pauses, real-world VRAM, etc.]
```

## Exit condition

- [ ] Project type detected and matching variant applied
- [ ] All 29 questions reviewed (scored 0-4 or marked N/A with justification)
- [ ] Verification commands run for each scored question
- [ ] Confidence level assigned per question
- [ ] Global score computed (excluding N/A)
- [ ] Report produced in the output format, with strengths/weaknesses, prioritized recommendations, and non-auditable items

## Changelog

- 1.0.0 (2026-06-19) — initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition); audit grids in reference/ (progressive disclosure)
