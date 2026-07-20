# Grid — CSS & Rendering Pipeline

Category 2 · 5 questions (PF-05 to PF-09).

## Table of contents

- [PF-05 — CSS selectors and WebKit style resolution](#pf-05--css-selectors-and-webkit-style-resolution--criticality-should)
- [PF-06 — Layout triggers and CSS property cost](#pf-06--layout-triggers-and-css-property-cost--criticality-must)
- [PF-07 — Paint, compositing and WebKit GPU](#pf-07--paint-compositing-and-webkit-gpu--criticality-should)
- [PF-08 — CSS custom properties and recalc cost](#pf-08--css-custom-properties-and-recalc-cost--criticality-could)
- [PF-09 — Font rendering and text layout](#pf-09--font-rendering-and-text-layout--criticality-should)

---

### PF-05 — CSS selectors and WebKit style resolution · Criticality: **SHOULD**

**Analyze:** CSS selector complexity, key selector, style recalculation time

**Verification commands:**
```bash
# Universal or deep selectors
grep -rn "\*\s*{" . --include="*.css" --include="*.scss" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
# Deep selectors with descendant combinator
grep -rn ">>>\|/deep/\|::v-deep" . --include="*.vue" --include="*.css" 2>/dev/null | grep -v node_modules | head -10
```

**Check:**
- No universal selectors (`*`) in key position
- Right-to-left evaluation: the key selector (rightmost) is the primary filter
- Style recalculation < 5ms (ideally < 1ms)
- Parallel style resolution active (no `:nth-child`/`:first-child` on critical lists)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Deep, universal, or attribute selectors in key position. |
| 1 | No universal selectors (*) in key position. |
| 2 | Style recalculation time < 5ms. |
| 3 | Parallel style resolution active (no :nth-child/:first-child on critical lists). |
| 4 | Style recalculation < 1ms + CI alert on expensive selectors. |

---

### PF-06 — Layout triggers and CSS property cost · Criticality: **MUST**

**Analyze:** Animated CSS properties, containment, animation cost

**Verification commands:**
```bash
# Animations on layout properties
grep -rn "animation\|transition" . --include="*.css" --include="*.scss" --include="*.vue" 2>/dev/null | grep -v node_modules | grep -iv "transform\|opacity\|filter" | head -10
# Containment
grep -rn "contain:" . --include="*.css" --include="*.scss" --include="*.vue" 2>/dev/null | grep -v node_modules | head -5
# content-visibility
grep -rn "content-visibility" . --include="*.css" --include="*.scss" --include="*.vue" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- Animations only on `transform`, `opacity`, `filter` (Tier 1 — composite only)
- `contain: layout` or `contain: strict` on self-contained subtrees
- `content-visibility: auto` for deferred off-viewport rendering
- No Tier 3/4 properties (width, height, font-size) animated

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Animations on layout properties (width, height, margin). |
| 1 | All animations use only transform, opacity, or filter. |
| 2 | `contain: layout` or `contain: strict` on self-contained subtrees. |
| 3 | Zero tier 3/4 property animated. |
| 4 | Layout time per frame < 2ms. |

---

### PF-07 — Paint, compositing and WebKit GPU · Criticality: **SHOULD**

**Analyze:** Composite layer count, VRAM, will-change, implicit layer promotion

**Verification commands:**
```bash
# will-change in static CSS (anti-pattern)
grep -rn "will-change" . --include="*.css" --include="*.scss" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
# translateZ hack
grep -rn "translateZ(0)\|translate3d(0" . --include="*.css" --include="*.scss" --include="*.vue" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- `will-change` applied dynamically (via JS before the animation, removed after), not in static CSS
- Composite layer count < 20
- VRAM < 64MB (1920×1080 @2×DPR = ~8MB per layer)
- No unwanted implicit layer promotion

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No awareness of layers, `will-change` in static CSS. |
| 1 | Composite layer count known, `will-change` applied dynamically. |
| 2 | < 20 layers, VRAM < 64MB. |
| 3 | Layers audited in CI, implicit promotion eliminated. |
| 4 | Continuous VRAM monitoring, zero paint storm. |

---

### PF-08 — CSS custom properties and recalc cost · Criticality: **COULD**

**Analyze:** Use of `--var`, mutations on `:root`, `@property`, animating custom properties

**Verification commands:**
```bash
grep -rn "@property\|--.*:" . --include="*.css" --include="*.scss" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
grep -rn "setProperty\|style\.set\|:root" . --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
```

**Check:**
- Custom properties scoped as close as possible to the consumer (not global on `:root` if mutated)
- `@property` with `inherits: false` for frequently mutated variables
- Typed `syntax` (`<length>`, `<color>`) to enable GPU animation

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Global custom properties mutated frequently, no use of @property. |
| 1 | Custom properties scoped as close as possible to the consumer. |
| 2 | @property with `inherits: false` for mutated variables. |
| 3 | Zero full style invalidation in profiling. |
| 4 | Custom-property budget documented, CI detects global mutations. |

---

### PF-09 — Font rendering and text layout · Criticality: **SHOULD**

**Analyze:** `font-display`, subsetting, WOFF2, fallback metrics, font CLS

**Verification commands:**
```bash
grep -rn "font-display\|font-face\|woff2\|unicode-range\|size-adjust\|ascent-override" . --include="*.css" --include="*.scss" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
# Font sizes
find . -name "*.woff2" -o -name "*.woff" -o -name "*.ttf" 2>/dev/null | grep -v node_modules | xargs ls -lh 2>/dev/null | head -10
```

**Check:**
- `font-display` explicitly configured (`optional` ideal for zero CLS)
- WOFF2 used (best compression)
- Subsetting with `unicode-range` (Latin ~20KB vs ~100KB+ full)
- Fallback adjusted with `size-adjust`, `ascent-override`, `descent-override`

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Fonts loaded with no strategy, visible FOUT/FOIT, no subsetting. |
| 1 | `font-display` explicitly configured, WOFF2 used. |
| 2 | Subsetting in place, `size-adjust` for the fallback. |
| 3 | Font-related CLS = 0. |
| 4 | Font loading < 50ms, glyphs audited automatically. |
