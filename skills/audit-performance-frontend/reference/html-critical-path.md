# Grid — HTML & Critical Path

Category 1 · 4 questions (PF-01 to PF-04).

## Table of contents

- [PF-01 — DOM structure and WebKit parsing](#pf-01--dom-structure-and-webkit-parsing--criticality-must)
- [PF-02 — Eliminating render-blocking](#pf-02--eliminating-render-blocking--criticality-must)
- [PF-03 — DOM batching and layout thrashing](#pf-03--dom-batching-and-layout-thrashing--criticality-must)
- [PF-04 — Loading attributes and network priority](#pf-04--loading-attributes-and-network-priority--criticality-should)

---

### PF-01 — DOM structure and WebKit parsing · Criticality: **MUST**

**Analyze:** DOM depth, node count, use of `document.write()`, `<head>` ordering

**Verification commands:**
```bash
# Look for document.write
grep -ri "document\.write" . --include="*.ts" --include="*.js" --include="*.vue" --include="*.jsx" --include="*.tsx" 2>/dev/null | grep -v node_modules | head -10
# Estimate DOM depth (component nesting)
grep -rn "<template>" . --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
# Look for DOM audits
grep -ri "dom.*depth\|dom.*size\|dom.*node" . --include="*.ts" --include="*.js" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- DOM depth < 32 levels (WebKit fast-path)
- Node count < 1500 for critical views
- No `document.write()` (disables the preload scanner)
- Optimal `<head>` ordering (meta charset, viewport, critical CSS, preconnect)
- Parsing in ~4KB chunks

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No measurement of DOM depth or size. |
| 1 | No `document.write()` anywhere in the codebase. |
| 2 | Maximum DOM depth on critical views < 32 levels. |
| 3 | Automated DOM depth/size audit integrated in CI. |
| 4 | Continuous monitoring of DOM complexity in production (RUM or synthetic). |

---

### PF-02 — Eliminating render-blocking · Criticality: **MUST**

**Analyze:** Blocking scripts and CSS, inlined critical CSS, critical-path size

**Verification commands:**
```bash
# Scripts without defer/async
grep -rn "<script " . --include="*.html" --include="*.vue" 2>/dev/null | grep -v "defer\|async\|type=\"module\"" | grep -v node_modules | head -10
# Inlined CSS
grep -rn "<style>" . --include="*.html" 2>/dev/null | grep -v node_modules | head -5
# Critical CSS size
grep -ri "critical.*css\|critters\|penthouse" package.json 2>/dev/null
```

**Check:**
- Every script uses `defer`, `async`, or `type="module"`
- Critical CSS inlined in the `<head>` (< 14KB to fit in 1 RTT)
- `<link rel="modulepreload">` for ES modules (avoids the discovery cascade)
- Total critical-path size < 14.6KB (initial TCP congestion window)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Blocking CSS and JS in the `<head>` with no strategy. |
| 1 | Every script uses `defer` or `async`. |
| 2 | Inlined critical CSS size < 14KB. |
| 3 | Total critical-path size < 14.6KB. |
| 4 | Automatic critical-CSS extraction and inlining in the build pipeline. |

---

### PF-03 — DOM batching and layout thrashing · Criticality: **MUST**

**Analyze:** Interleaved DOM read/write patterns, forced synchronous layouts

**Verification commands:**
```bash
# Layout thrashing patterns (geometric read after DOM write)
grep -rn "offsetTop\|offsetLeft\|offsetWidth\|offsetHeight\|clientWidth\|clientHeight\|getBoundingClientRect\|getComputedStyle\|scrollTop\|scrollLeft" . --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | grep -v node_modules | head -15
# Custom ESLint rules
grep -ri "layout.thrashing\|forced.reflow" . --include="*.js" --include="*.ts" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- read-batch → write-batch pattern applied consistently
- No geometric property read inside a loop that mutates the DOM
- Use of `requestAnimationFrame` to group mutations
- ESLint/linter rule to detect layout thrashing patterns

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | DOM mutations and geometric reads interleaved. |
| 1 | No geometric property read inside a loop that mutates the DOM. |
| 2 | read-batch → write-batch pattern applied consistently. |
| 3 | ESLint rule or custom linter detecting layout thrashing patterns. |
| 4 | Number of forced synchronous layouts per page load in production = 0. |

---

### PF-04 — Loading attributes and network priority · Criticality: **SHOULD**

**Analyze:** `fetchpriority`, `loading`, `decoding` attributes, resource hints

**Verification commands:**
```bash
grep -rn "fetchpriority\|loading=\|decoding=\|preconnect\|dns-prefetch\|modulepreload" . --include="*.html" --include="*.vue" --include="*.tsx" --include="*.jsx" 2>/dev/null | grep -v node_modules | head -10
```

**Check:**
- `fetchpriority="high"` on the LCP element
- `loading="lazy"` on below-the-fold images (not on first-viewport images)
- `decoding="sync"` on LCP images
- `<link rel="preconnect">` for critical third-party domains

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No priority attributes. |
| 1 | `loading="lazy"` on all below-the-fold images. |
| 2 | `fetchpriority="high"` on the LCP element. |
| 3 | Documented priority strategy with optimized preload ordering. |
| 4 | Automated LCP analysis in CI deriving priorities. |
