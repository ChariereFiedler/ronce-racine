# Grid — Memory & Garbage Collection

Category 4 · 4 questions (PF-19 to PF-22).

## Table of contents

- [PF-19 — JSC GC (Riptide) and pauses](#pf-19--jsc-gc-riptide-and-pauses--criticality-should)
- [PF-20 — Reducing allocation pressure](#pf-20--reducing-allocation-pressure--criticality-should)
- [PF-21 — Memory leaks and detached DOM](#pf-21--memory-leaks-and-detached-dom--criticality-should)
- [PF-22 — GPU memory and compositing budget](#pf-22--gpu-memory-and-compositing-budget--criticality-should)

---

### PF-19 — JSC GC (Riptide) and pauses · Criticality: **SHOULD**

**Analyze:** Allocation rate, GC pauses, heap size, Eden vs Full collection

**Verification commands:**
```bash
# Allocations in loops (GC pressure)
grep -rn "new \|Object\.create\|\.map(\|\.filter(\|\.reduce(\|\.slice(\|\.concat(\|{\.\.\.}" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -15
```

**Check:**
- Awareness of the Riptide GC model (concurrent, mostly non-moving)
- Eden GC < 1ms (few allocations between collections)
- Full GC < 5ms (heap under control)
- Per-frame allocation budget documented

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No awareness of the GC, massive allocations in loops. |
| 1 | Knowledge of the GC model, obvious allocations reduced. |
| 2 | Eden GC < 1ms, allocation rate measured. |
| 3 | Full GC < 5ms, per-frame allocation budget documented. |
| 4 | GC pauses invisible, zero allocation in the render loop. |

---

### PF-20 — Reducing allocation pressure · Criticality: **SHOULD**

**Analyze:** Object pooling, invisible allocations, SoA vs AoS, TypedArrays

**Verification commands:**
```bash
# Object pooling
grep -ri "pool\|reuse\|recycle" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -5
# Invisible allocations
grep -rn "\.map(\|\.filter(\|\.slice(\|\.concat(\|{\.\.\.}" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | wc -l
```

**Check:**
- Object pooling for animation loops
- Invisible allocations identified (`{...obj}`, `.map()`, `.filter()`, `.slice()`)
- `for` loops instead of `.map()`/`.filter()` on the hot path
- Struct-of-Arrays (SoA) pattern for linear data

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Allocations in loops, no pooling. |
| 1 | Object pooling implemented, `for` loops instead of `.map()`/`.filter()`. |
| 2 | Invisible allocations audited, TypedArrays for numeric data. |
| 3 | SoA pattern for linear data, zero intermediate allocation. |
| 4 | Allocation budget measured per frame, zero GC trigger in the render loop. |

---

### PF-21 — Memory leaks and detached DOM · Criticality: **SHOULD**

**Analyze:** Event listeners, closures, setInterval/setTimeout, detached DOM trees

**Verification commands:**
```bash
# Event listeners without cleanup
grep -rn "addEventListener" . --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | grep -v node_modules | grep -v test | head -10
# setInterval without clear
grep -rn "setInterval" . --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10
# removeEventListener
grep -rn "removeEventListener" . --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- Event listeners cleaned up (especially on `window`, `document`)
- `setInterval`/`setTimeout` cleaned up in components
- No detached DOM trees (node removed from the DOM but still referenced by JS)
- 7× + snapshot pattern to detect leaks

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No memory monitoring, undetected leaks. |
| 1 | Occasional heap snapshots, listeners cleaned up manually. |
| 2 | 7× + snapshot pattern in place, zero detached DOM tree. |
| 3 | Automated memory non-regression tests. |
| 4 | Heap stable over 1000 iterations, CI memory regression tests. |

---

### PF-22 — GPU memory and compositing budget · Criticality: **SHOULD**

**Analyze:** VRAM consumed, layer count, canvas backing store, content-visibility

**Verification commands:**
```bash
# Canvas (backing store in RAM + GPU)
grep -rn "<canvas\|getContext\|CanvasRenderingContext" . --include="*.ts" --include="*.js" --include="*.vue" --include="*.html" 2>/dev/null | grep -v node_modules | head -5
# content-visibility
grep -rn "content-visibility" . --include="*.css" --include="*.vue" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- Layer count and total VRAM known
- VRAM < 50% of the device budget (~64-128MB)
- `content-visibility: auto` on off-screen layers
- Canvas at minimal required size (no CSS scaling)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | VRAM not measured, layers not audited. |
| 1 | Layer count and total VRAM known. |
| 2 | < 20 layers, VRAM < 50% of the budget. |
| 3 | `content-visibility: auto` on off-screen layers. |
| 4 | VRAM monitored in CI, zero texture tiling. |
