# Grid — Assets, Cache & Network

Category 5 · 4 questions (PF-23 to PF-26).

## Table of contents

- [PF-23 — Critical rendering path and network budget](#pf-23--critical-rendering-path-and-network-budget--criticality-must)
- [PF-24 — Asset compression and encoding](#pf-24--asset-compression-and-encoding--criticality-should)
- [PF-25 — Multi-layer cache strategy](#pf-25--multi-layer-cache-strategy--criticality-should)
- [PF-26 — Optimized font loading](#pf-26--optimized-font-loading--criticality-should)

---

### PF-23 — Critical rendering path and network budget · Criticality: **MUST**

**Analyze:** Critical-path size, number of RTTs, Early Hints, server push

**Verification commands:**
```bash
# Main bundle size
ls -lh dist/*.js dist/*.css public/*.js public/*.css 2>/dev/null | head -10
# Build analysis
grep -ri "rollup-plugin-visualizer\|webpack-bundle-analyzer\|source-map-explorer" package.json 2>/dev/null
# Early Hints / server push
grep -ri "103\|early.hints\|server.push\|link.*preload" . --include="*.ts" --include="*.rs" --include="*.conf" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- Critical path < 14KB (1 initial TCP RTT congestion window)
- Critical CSS inlined in the HTML
- 103 Early Hints or server push for critical resources
- TTFB < 30ms local / < 50ms production

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Critical path > 100KB, no network strategy. |
| 1 | Critical resources identified and listed. |
| 2 | Critical path < 14KB (1 RTT), critical CSS inlined. |
| 3 | 103 Early Hints or server push, TTFB < 30ms local. |
| 4 | Sub-100ms guaranteed, CI checks the 14KB budget. |

---

### PF-24 — Asset compression and encoding · Criticality: **SHOULD**

**Analyze:** Brotli/gzip, image format, srcset, SVG sprites

**Verification commands:**
```bash
# Compression
grep -ri "brotli\|br\|gzip\|compress" . --include="*.conf" --include="*.yml" --include="*.ts" --include="*.rs" 2>/dev/null | head -5
# Modern image formats
find . -name "*.avif" -o -name "*.webp" 2>/dev/null | grep -v node_modules | head -5
# srcset
grep -rn "srcset\|picture" . --include="*.html" --include="*.vue" --include="*.tsx" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- Brotli level 11 for pre-compressed static assets
- AVIF > WebP > JPEG for images
- `<img srcset>` with resolution descriptors
- SVG sprites with `<symbol>` and `<use href>`

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No compression or basic gzip, images not optimized. |
| 1 | Gzip enabled, images resized. |
| 2 | Brotli 11 for static, AVIF/WebP, srcset. |
| 3 | SVG sprites, calibrated dynamic compression. |
| 4 | Per-asset size budget in CI, compression ratio monitored. |

---

### PF-25 — Multi-layer cache strategy · Criticality: **SHOULD**

**Analyze:** Cache-Control headers, contenthash, Service Worker, PageCache, stale-while-revalidate

**Verification commands:**
```bash
# Cache headers
grep -ri "cache.control\|max-age\|immutable\|stale.while.revalidate\|no-cache\|no-store" . --include="*.ts" --include="*.rs" --include="*.conf" --include="*.yml" 2>/dev/null | head -10
# Service Worker
find . -name "sw.*" -o -name "service-worker*" -o -name "workbox*" 2>/dev/null | grep -v node_modules | head -5
# Contenthash
grep -ri "contenthash\|chunkhash\|hash" vite.config.* webpack.config.* rollup.config.* 2>/dev/null | head -5
```

**Check:**
- Immutable assets with contenthash: `Cache-Control: public, max-age=31536000, immutable`
- HTML: `Cache-Control: no-cache` (always revalidated)
- `stale-while-revalidate` to serve the cache immediately + revalidate in the background
- All 5 cache layers used (MemoryCache, PageCache, Disk, SW, HTTP 304)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No cache strategy, default headers. |
| 1 | Basic Cache-Control on static assets. |
| 2 | Contenthash + immutable, no-cache on HTML. |
| 3 | All 5 cache layers used, PageCache validated. |
| 4 | Cache hit rate monitored, CI checks headers. |

---

### PF-26 — Optimized font loading · Criticality: **SHOULD**

**Analyze:** Subsetting, unicode-range, font-display: optional, preload, adjusted fallback

**Verification commands:**
```bash
grep -rn "font-display\|unicode-range\|preload.*font\|font.*preload" . --include="*.css" --include="*.html" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
```

**Check:**
- WOFF2 + `font-display: optional` + preload (zero layout shift if cached)
- Subsetting with `unicode-range` (Latin ~20KB vs ~100KB+ full)
- Fallback adjusted with `size-adjust`, `ascent-override`, `descent-override`
- Font-related CLS = 0

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Full fonts with no strategy, FOUT/FOIT. |
| 1 | WOFF2 + font-display configured. |
| 2 | Subsetting + unicode-range, adjusted fallback. |
| 3 | Zero font CLS, font-display: optional. |
| 4 | Glyphs audited automatically, font budget in CI. |
