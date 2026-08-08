---
name: performance-profiling
description: Use when something is slow, memory-hungry or contended and the cause is not yet established - a latency or throughput target is missed, a benchmark regressed, a service grows in memory, or someone proposes an optimization that has not been measured. Triggers on "profile this", "why is this slow", "find the bottleneck", "optimize the hot path", "performance regression", "profile mon code", "pourquoi c'est lent", "trouve le goulot d'étranglement", "flamegraph", "benchstat".
version: 1.0.0
metadata:
  last-reviewed: 2026-07-29
  category: audit
---

# Performance Profiling - measure, then change, then measure again

> If the current repo has its own performance skill or a documented benchmark
> harness, it wins - it knows the representative workload, which is the hardest
> part to get right.

## When ME and not X

- **ME** when: something is slow and you do not yet know why, or an optimization
  is proposed and its effect is not established
- **audit-performance-frontend** instead if: scoring frontend rendering maturity
  against a grid (WebKit/JSC, DOM, CSS pipeline) rather than investigating one slowdown
- **audit-architecture** (SC-01..07) instead if: the question is capacity, load
  testing or scaling strategy, not where the time goes
- **audit-observability** (ob-07, ob-08) instead if: the question is whether
  production latency is *monitored*, not what causes it
- **production-incident-diagnostic** instead if: something is on fire right now
- **superpowers:systematic-debugging** instead if: the code is wrong, not slow

## Principle

**No optimization without a measurement that precedes it and a measurement that
follows it.** The output of this skill is not faster code - it is a demonstrated,
quantified, reproducible difference. A campaign that refutes its own hypotheses
is a success; one that confirms every hunch is a warning sign.

Three failures account for most wasted performance work, and the protocol below
exists to prevent them:

1. Optimizing code that does not matter (no macro profile first).
2. Reporting an effect smaller than the measurement noise.
3. Answering a latency question with a CPU profile, which structurally cannot see waiting.

## Context to gather (before acting)

- **The target, as a number.** "It is slow" is not a question. "p99 is 210 ms, we
  need 50" is. Without a number there is no stopping condition and no way to know
  you succeeded. If nobody can give you one, that is the first deliverable.
- **The representative workload.** What input, what concurrency, what data size.
  A profile of an unrepresentative workload optimizes a fiction.
- **The constraint being hit**: CPU, memory, I/O wait, lock contention, or
  scheduler. You do not know yet - but write down the hypothesis so you can be
  proven wrong.
- **The measurement environment** and how noisy it is (step 1).
- Existing benchmarks, harnesses and past profiles: read `Makefile`, `package.json`,
  `bench/`, CI config before writing anything new.

## Protocol

```
- [ ] 0. State the question and the numeric success criterion
- [ ] 1. Stabilize the bench and measure the noise floor
- [ ] 2. Macro profile under representative load - before any micro work
- [ ] 3. Read the profile: self vs cumulative, apply Amdahl
- [ ] 4. Check off-CPU as well as on-CPU
- [ ] 5. Add labels/zones to make the profile queryable
- [ ] 6. Narrow down by dichotomy (ablation / bisection / bracketing)
- [ ] 7. One falsifiable hypothesis + the micro-benchmark that isolates it
- [ ] 8. A/B honestly: interleaved, count>=10, benchstat, read the p-value
- [ ] 9. Re-measure at macro level - a micro gain invisible at macro is not a gain
- [ ] 10. Lock it in with a CI regression guard
```

### 0. State the question and the criterion

Write both down before touching a profiler. The criterion decides when you stop -
without it, a performance campaign expands until someone gets bored.

### 1. Stabilize the bench and measure the noise floor

**Run the unmodified code twice and compare the two runs.** The difference is
your noise floor: no effect below it can be claimed, on this machine, today.

Close competing workloads, check the load average, prefer a fixed CPU governor.
If the machine cannot be quiet, do not abandon the campaign - **pivot to metrics
that resist noise**: allocation counts, retained heap, object counts, instruction
counts. They answer many questions and barely move under load.

Details and thresholds: `reference/statistics.md`.

### 2. Macro before micro

Profile the whole system under representative load first. Micro-optimizing before
the macro profile is the most expensive mistake in this protocol, because it is
invisible: the code gets faster and the program does not.

### 3. Read the profile properly

**self** (own instructions) vs **cumulative** (self + callees). Optimize on self,
navigate on cumulative.

Then apply **Amdahl before writing any code**: a function at 8% cumulative caps
the achievable gain at 8%. Compute that ceiling and decide whether the work is
worth it - this single step kills most bad optimization ideas for free.

Watch for Gregg's *street light anti-method*: profiling the component you know how
to profile rather than the one holding the time.

### 4. On-CPU and off-CPU

A CPU profile shows time **on** the CPU. It cannot show waiting - locks, channels,
syscalls, scheduler starvation. Flat CPU with rising latency is the signature, and
a CPU profile will happily show you a plausible, irrelevant hot spot.

Get the block/mutex profile, the execution trace, or an off-CPU flame graph. If
per-operation cost *rises* with parallelism, you are serialized, not slow.

### 5. Instrument with labels or zones

Attach the dimension you will want to slice by - tenant, endpoint, job kind,
pipeline stage - so the profile becomes queryable:

- Go: `pprof.Do` + `pprof.Labels`, then `-tagfocus`
- Native/games: Tracy zones, `ZoneText`/`ZoneValue`
- Distributed: OpenTelemetry spans

Without labels a profile says "JSON decoding is 30%". With them: "30%, and 27
points of it are one tenant". Instrument phases first, descend only into the phase
that is over budget - instrumenting everything produces an unreadable timeline and
real overhead.

### 6. Dichotomy

Three complementary forms:

- **Ablation** - remove one stage, keep everything else, compare against a control.
  The control is not optional; it is what turns "it grows" into proof.
- **Bisection** - `git bisect run` driven by a performance predicate to find the
  commit that introduced a regression.
- **Bracketing** - measure a deliberately degraded version (the operation removed
  entirely) to get the upper bound on any possible gain, before doing the work.

### 7. One falsifiable hypothesis at a time

State it so it can fail: "removing X saves at least N ns/op". Write the smallest
benchmark that isolates it, with a control arm. Two changes at once means an
uninterpretable result.

### 8. A/B honestly

`-count >= 10`, **interleave the A and B runs** (never all-A then all-B - thermal
drift maps straight onto your comparison), compare with a statistical tool, read
the p-value.

**Never re-run until it becomes significant.** At p<0.05 one run in twenty is
significant by chance; re-rolling manufactures exactly that false positive. "No
measurable effect" is a valid, publishable result.

### 9. Re-measure at macro level

Take the macro measurement from step 2 again. A micro gain that does not show up
at macro level was either irrelevant (Amdahl) or noise. Report the macro number,
not the micro one.

### 10. Lock it in

A gain with no regression guard is reclaimed within months. Add a CI comparison
against the base branch with a **loose** threshold (10-20%): a flaky performance
gate gets disabled, which is worse than no gate.

## Templates

Report one line per hypothesis, and make the verdict explicit:

```markdown
### H<n> - <hypothesis stated so it can fail>

| | |
|---|---|
| **Verdict** | confirmed / refuted / inconclusive |
| **Measured** | <numbers, with units and sample count> |
| **Significance** | p=<value>, n=<samples>, noise floor <x>% |
| **Command** | `<verbatim, re-runnable>` |
| **Consequence** | <what this changes - or explicitly: nothing> |
```

## Pitfalls & rationalizations

| Excuse | Reality |
|--------|---------|
| "It is obviously the N+1 query / the regex / the lock" | Obvious causes are wrong often enough that measuring costs less than being wrong. Profile first. |
| "I will profile after making the obvious fixes" | Then you will never know whether the fix did anything, and you will keep it forever regardless. |
| "The micro-benchmark shows +30%" | On what fraction of total time? A 30% gain on 2% of runtime is 0.6%. Compute Amdahl before celebrating. |
| "CPU is at 100%, so it is CPU-bound" | It can be spinning on a lock or thrashing GC. Check off-CPU before rewriting the algorithm. |
| "The machine is a bit busy but the delta is huge" | Then measure the noise floor and show the delta exceeds it. If it does, fine - that takes five minutes. |
| "benchstat says `~`, let me run it again" | That is multiple testing. Decide the sample count in advance; `~` is the answer. |
| "No time to set up a control" | Without a control you have a number, not a result. The control is usually the same command minus one flag. |
| "I will measure it in production later" | You will not, and by then three other changes will have shipped. |
| "The profiler overhead distorts everything" | ~5-10% for CPU sampling, uniformly distributed. It shifts absolute values, not the ranking you are reading. |
| "It is faster on my machine" | One machine, one run, no noise floor, no p-value. That is an anecdote. |

## Exit condition

- [ ] Numeric success criterion stated before any measurement
- [ ] Noise floor measured (same code twice) and reported next to every result
- [ ] Macro profile collected under representative load, before any micro work
- [ ] Off-CPU checked, not only CPU
- [ ] Every hypothesis carries an explicit verdict: confirmed / refuted / **inconclusive**
- [ ] Every A/B claim reports sample count and p-value, from interleaved runs
- [ ] Every reported number has a verbatim, re-runnable command
- [ ] Any gain confirmed at macro level, not only in the micro-benchmark
- [ ] Regression guard added, or its absence explicitly accepted

## Tooling

- `reference/statistics.md` - noise floor, interleaving, reading benchstat, multiple testing
- `reference/go.md` - pprof (CPU/heap/block/mutex), labels, runtime/trace, escape analysis, PGO
- `reference/node-web.md` - `--cpu-prof`, clinic, heap snapshots, event loop delay, Web Vitals
- `reference/native.md` - perf, flame graphs, differential flame graphs, hardware counters, callgrind
- `reference/tracy.md` - when Tracy is the right tool, its MCP server, and when to stay away

## Changelog

- 1.0.0 (2026-07-29) - initial versioned release
