# Grid - JavaScript Engine & Runtime JSC

Category 3 · 9 questions (PF-10 to PF-18).

## Table of contents

- [PF-10 - Monomorphism, JSC Structures and inline caches](#pf-10--monomorphism-jsc-structures-and-inline-caches--criticality-must)
- [PF-11 - NaN-boxing and JSC value representation](#pf-11--nan-boxing-and-jsc-value-representation--criticality-should)
- [PF-12 - JSC compilation tiers (LLInt → Baseline → DFG → FTL)](#pf-12--jsc-compilation-tiers-llint--baseline--dfg--ftl--criticality-should)
- [PF-13 - Deoptimization and JSC bailouts](#pf-13--deoptimization-and-jsc-bailouts--criticality-must)
- [PF-14 - Functions, closures and call cost](#pf-14--functions-closures-and-call-cost--criticality-should)
- [PF-15 - Arrays and JSC internal representation](#pf-15--arrays-and-jsc-internal-representation--criticality-should)
- [PF-16 - Strings, RegExp and AtomStringTable](#pf-16--strings-regexp-and-atomstringtable--criticality-could)
- [PF-17 - Event loop, microtasks and scheduling](#pf-17--event-loop-microtasks-and-scheduling--criticality-must)
- [PF-18 - Weak references and memory cache management](#pf-18--weak-references-and-memory-cache-management--criticality-could)

---

### PF-10 - Monomorphism, JSC Structures and inline caches · Criticality: **MUST**

**Analyze:** Object shape consistency, call-site polymorphism, use of `delete`

**Verification commands:**
```bash
# Use of delete (breaks JSC Structures)
grep -rn "\bdelete\b " . --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | grep -v node_modules | grep -v test | head -10
# Objects with variable shapes
grep -rn "Object\.assign\|{\.\.\.obj}" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -10
```

**Check:**
- Consistent constructors (same properties, same order)
- No `delete` on hot paths (use `obj.prop = undefined`)
- Monomorphic call sites (always the same type passed)
- ≤ 3 inline properties for critical objects (beyond that → butterfly allocation)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Objects created with different shapes, `delete` used. |
| 1 | Consistent constructors, no `delete` on hot paths. |
| 2 | Monomorphism verified, ≤ 3 inline properties for critical objects. |
| 3 | Zero megamorphism in profiling, stable Structure watchpoints. |
| 4 | IC hit rate > 99%, butterfly allocations minimized. |

---

### PF-11 - NaN-boxing and JSC value representation · Criticality: **SHOULD**

**Analyze:** Numeric type consistency, int32 overflow, boxing/unboxing

**Verification commands:**
```bash
# Mixed numeric types
grep -rn "Math\.imul\|Math\.fround\|>>>.*0\|\\|0" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -5
# parseInt / parseFloat patterns
grep -rn "parseInt\|parseFloat\|Number(" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -10
```

**Check:**
- Consistent numeric types on the hot path (all int32 or all double)
- No uncontrolled int32 overflow (→ double conversion → deopt)
- `Math.imul()` for critical int32 multiplications
- No unnecessary boxing/unboxing

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No awareness of boxing, mixed numeric types. |
| 1 | Consistent numeric types (all int or all float). |
| 2 | Hot path verified int32, no uncontrolled overflow. |
| 3 | `Math.imul()` used for critical int32 multiplications. |
| 4 | Zero unnecessary boxing/unboxing in JIT profiling. |

---

### PF-12 - JSC compilation tiers (LLInt → Baseline → DFG → FTL) · Criticality: **SHOULD**

**Analyze:** Warm-up of critical functions, hot function size, inlining

**Verification commands:**
```bash
# Long functions (risk of non-inlining if > 100 bytecodes)
grep -rn "function\|=>" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -10
# Warm-up patterns
grep -ri "warm.up\|preheat\|prefetch\|pre.compile" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- Hot-path functions identified and < 100 bytecodes (DFG inlining threshold)
- Warm-up of critical functions during loading (before the first paint)
- Awareness of compilation tiers (LLInt → Baseline → DFG → FTL)
- FTL reached on the critical path before the first render

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No knowledge of the JIT, no warm-up. |
| 1 | Awareness of tiers, hot-path functions identified. |
| 2 | Warm-up of critical functions during loading, hot functions < 100 bytecodes. |
| 3 | FTL reached on critical path before first paint. |
| 4 | Systematic JIT profiling, zero hot function in Baseline at render time. |

---

### PF-13 - Deoptimization and JSC bailouts · Criticality: **MUST**

**Analyze:** Type stability, OSR exits, bailouts, branch prediction

**Verification commands:**
```bash
# Unstable types (polymorphic functions)
grep -rn "typeof\|instanceof" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -10
# Patterns that break type guards
grep -rn "arguments\b\|eval(" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -5
```

**Check:**
- Stable types on the hot path (no dynamic type switching)
- No `delete`, no array holes, no `arguments` object
- Zero bailout on the critical path
- Guaranteed monomorphism for perfect CPU branch prediction

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Unstable types, frequent undetected bailouts. |
| 1 | Stable types on the hot path, no `delete`, no holes. |
| 2 | Zero bailout on the critical path. |
| 3 | Guaranteed monomorphism across the whole hot path. |
| 4 | JIT profiling in CI, deopt budget = 0 on the critical render path. |

---

### PF-14 - Functions, closures and call cost · Criticality: **SHOULD**

**Analyze:** Arrow functions in loops, closures capturing variables, `.bind()`, `.call()`, `.apply()`

**Verification commands:**
```bash
# Arrow functions in forEach/map (allocation per iteration)
grep -rn "\.forEach(\|\.map(\|\.filter(" . --include="*.ts" --include="*.js" 2>/dev/null | grep "=>" | grep -v node_modules | grep -v test | head -10
# eval and Function constructor
grep -rn "\beval(\|new Function(" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- Named function reference passed to iterators (no inline arrow)
- Closures audited, `.bind()` once only (not inside a render loop)
- No `eval()` or `new Function()` (prevents inlining)
- Inlining verified on critical call sites

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Arrow functions in loops, `eval()` present. |
| 1 | Named function reference passed to iterators. |
| 2 | Closures audited, bind once only. |
| 3 | Inlining verified on critical call sites. |
| 4 | Zero closure allocation on the hot path. |

---

### PF-15 - Arrays and JSC internal representation · Criticality: **SHOULD**

**Analyze:** Array homogeneity, sparse arrays, indexing type, TypedArrays

**Verification commands:**
```bash
# delete on an array index (→ ArrayStorage)
grep -rn "delete.*\[" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -5
# TypedArrays
grep -rn "Float32Array\|Int32Array\|Uint8Array\|ArrayBuffer" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -10
# Array preallocation
grep -rn "new Array(" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- Homogeneous arrays (no mix of int/string/object)
- No holes, no `delete` on indices
- Pre-allocation for known sizes (`new Array(n)`)
- TypedArrays for intensive numeric data

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Sparse arrays, mixed types, `delete` on indices. |
| 1 | Homogeneous arrays, no holes, no `delete`. |
| 2 | Indexing type verified Int32 or Double, pre-allocation for known sizes. |
| 3 | Zero array in ArrayStorage, `Array.prototype` unmodified. |
| 4 | Indexing-type transitions audited in CI, TypedArray across the whole hot path. |

---

### PF-16 - Strings, RegExp and AtomStringTable · Criticality: **COULD**

**Analyze:** Concatenation in loops, dangerous RegExp, JSON.parse vs literals

**Verification commands:**
```bash
# String concatenation in loops
grep -rn "+=" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -10
# RegExp with nested quantifiers (backtracking risk)
grep -rn "new RegExp\|/.*+.*+\|/.*\*.*\*" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- `array.join()` instead of concatenation in a loop
- No nested quantifiers in RegExp (`(a+)+`)
- `JSON.parse()` for large static objects (faster than literals)
- Static (atomized) object keys rather than dynamic ones

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Concatenation in loops, RegExp not audited. |
| 1 | `array.join` used, no nested quantifiers. |
| 2 | String representation understood, JSON.parse for large objects, RegExp compiled. |
| 3 | Zero unresolved rope on the hot path. |
| 4 | String allocation budget measured, RegExp profiled. |

---

### PF-17 - Event loop, microtasks and scheduling · Criticality: **MUST**

**Analyze:** Use of `requestAnimationFrame`, microtask starvation, frame budget, long tasks

**Verification commands:**
```bash
# setTimeout as a scheduler (anti-pattern)
grep -rn "setTimeout.*0\|setTimeout.*,\s*0" . --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | grep -v node_modules | grep -v test | head -10
# requestAnimationFrame
grep -rn "requestAnimationFrame\|requestIdleCallback" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -5
# MessageChannel scheduler
grep -rn "MessageChannel\|scheduler\.postTask\|queueMicrotask" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -5
```

**Check:**
- `requestAnimationFrame` for DOM mutations
- `MessageChannel` as a scheduler (not `setTimeout(0)` → clamped to 4ms)
- JS frame budget < 6ms (16.67ms total @60fps)
- No microtask starvation (Promise cascade blocking the paint)
- Zero long task > 50ms

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Microtask starvation, `setTimeout` as a scheduler. |
| 1 | `requestAnimationFrame` used for DOM mutations. |
| 2 | JS frame budget < 6ms, `MessageChannel` for scheduling. |
| 3 | `scheduler.postTask()` where available, zero microtask starvation. |
| 4 | Total frame budget < 10ms, zero long task > 50ms. |

---

### PF-18 - Weak references and memory cache management · Criticality: **COULD**

**Analyze:** Use of `WeakMap`/`WeakSet`/`WeakRef`/`FinalizationRegistry`, caches without eviction

**Verification commands:**
```bash
grep -rn "WeakMap\|WeakSet\|WeakRef\|FinalizationRegistry" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -10
# Map/Set as a cache without eviction (potential leak)
grep -rn "new Map()\|new Set()" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | grep -v test | head -10
```

**Check:**
- `WeakMap` for object-keyed caches
- `WeakRef` for heavy-data caches with a fallback
- `FinalizationRegistry` for native resources (WebGL textures)
- No `Map`/`Set` used as a cache without an eviction policy

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Map/Set as a cache without eviction, no cleanup. |
| 1 | WeakMap used for object-keyed caches. |
| 2 | WeakRef for heavy-data caches with a fallback. |
| 3 | FinalizationRegistry for native resources. |
| 4 | Zero cache-related memory leak, cache hit rate monitored. |
