# Grid - Profiling & Tooling

Category 6 · 3 questions (PF-27 to PF-29).

## Table of contents

- [PF-27 - Methodical profiling and instrumentation](#pf-27--methodical-profiling-and-instrumentation--criticality-must)
- [PF-28 - Sub-100ms performance metrics](#pf-28--sub-100ms-performance-metrics--criticality-must)
- [PF-29 - Automated performance regression](#pf-29--automated-performance-regression--criticality-must)

---

### PF-27 - Methodical profiling and instrumentation · Criticality: **MUST**

**Analyze:** Use of `performance.mark/measure`, PerformanceObserver, CPU throttling, methodology

**Verification commands:**
```bash
grep -rn "performance\.mark\|performance\.measure\|PerformanceObserver\|longtask" . --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
# Lighthouse / WebPageTest in CI
grep -ri "lighthouse\|webpagetest\|pagespeed\|web-vitals" package.json .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null | head -5
```

**Check:**
- `performance.mark()`/`performance.measure()` instrumented on the critical path
- `PerformanceObserver` with `entryTypes: ['longtask']` to detect blocks > 50ms
- Methodical profiling: median over N runs, pre-run GC, JIT warm-up
- Benchmarks with CPU throttling enabled (4× or 6× slowdown)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No profiling, optimizations by feel. |
| 1 | Occasional profiling with Web Inspector. |
| 2 | `performance.mark/measure` instrumented, longtask observer, benchmarks with warm-up. |
| 3 | Methodical profiling (median, pre-run GC, JIT warm-up). |
| 4 | Automated profiling in CI, multi-run regression detection. |

---

### PF-28 - Sub-100ms performance metrics · Criticality: **MUST**

**Analyze:** Core Web Vitals, custom metrics, per-phase budgets

**Verification commands:**
```bash
grep -ri "web-vitals\|lcp\|fcp\|cls\|tbt\|inp\|ttfb" . --include="*.ts" --include="*.js" --include="*.vue" --include="*.yml" 2>/dev/null | grep -v node_modules | head -10
# Performance budgets
grep -ri "performance.*budget\|lighthouse.*budget\|budget\.json" . 2>/dev/null | head -5
```

**Check:**
- TTFB < 30ms local / < 50ms production
- FCP < 80ms (20ms margin for sub-100ms)
- TBT = 0ms (target)
- CLS = 0 (absolute target)
- Custom metric for end-to-end measurement of the render pipeline

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No metric measured. |
| 1 | TTFB and FCP measured manually. |
| 2 | Core Web Vitals measured, custom metrics, TBT < 50ms. |
| 3 | TBT = 0ms, CLS = 0, FCP < 80ms. |
| 4 | Sub-100ms guaranteed in CI, regression alerting, per-phase budget. |

---

### PF-29 - Automated performance regression · Criticality: **MUST**

**Analyze:** Performance CI, Lighthouse CI, bundle size monitoring, heap regression detection

**Verification commands:**
```bash
# Lighthouse CI
grep -ri "lhci\|lighthouse.ci\|@lhci\|lighthouserc" . --include="*.yml" --include="*.yaml" --include="*.json" 2>/dev/null | head -5
# Bundle size monitoring
grep -ri "bundlesize\|size-limit\|bundlewatch" package.json 2>/dev/null
# Performance budgets in CI
grep -ri "performance\|budget\|regression" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null | head -10
```

**Check:**
- Lighthouse or equivalent in CI
- Blocking performance budgets (not just informational)
- Multi-run statistical comparison (median of 5+ runs) to absorb variance
- Bundle size monitoring with alerts
- Heap regression detection (before/after snapshots)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No performance CI. |
| 1 | Lighthouse in CI, reviewed manually. |
| 2 | Performance budgets in CI, bundle size alerting. |
| 3 | Multi-run statistical comparison (median 5+ runs), heap regression detection. |
| 4 | Full pipeline: metrics, allocations, bundle, layers, frame budget. |
