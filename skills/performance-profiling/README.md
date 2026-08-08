# performance-profiling

A protocol for finding out why something is slow, and for proving that a fix
actually helped.

## What it is for

You have a program that misses a latency target, grows in memory, or regressed
between two releases, and you do not yet know why. Or someone hands you a patch
labelled "30% faster" and you need to know whether that number means anything.

The skill covers the whole loop: state the target, measure the noise, profile at
macro level, read the profile correctly, check what a CPU profile cannot see,
narrow down by dichotomy, isolate one hypothesis, compare A/B with statistics that
hold up, and lock the result in against future regressions.

It is language-agnostic in the body, with per-ecosystem command sheets in
`reference/`.

## What it is not for

- Scoring frontend rendering maturity against a grid → `audit-performance-frontend`
- Capacity planning, load testing, scaling strategy → `audit-architecture` (SC-01..07)
- Checking whether production latency is monitored → `audit-observability` (ob-07/08)
- A live production incident → `production-incident-diagnostic`
- Code that is wrong rather than slow → `superpowers:systematic-debugging`

## The three failures it prevents

1. **Optimizing code that does not matter.** Without a macro profile, effort goes
   where it is convenient rather than where the time is. Amdahl's ceiling, computed
   before writing code, kills most bad ideas for free.
2. **Reporting an effect smaller than the noise.** A 5% improvement on a machine
   with a 15% noise floor is not an improvement, whatever the p-value says. Hence
   the rule of measuring the same code twice before measuring anything else.
3. **Answering a latency question with a CPU profile.** A CPU profile shows time
   *on* the CPU and structurally hides every wait: locks, channels, syscalls,
   scheduler starvation. Flat CPU with rising latency is the signature.

## Files

| File | Contents |
|---|---|
| `SKILL.md` | The protocol, the rationalization table, the exit condition |
| `reference/statistics.md` | Noise floor, interleaving, reading benchstat, multiple testing |
| `reference/go.md` | pprof (CPU/heap/block/mutex), labels, runtime/trace, escape analysis, PGO |
| `reference/node-web.md` | `--cpu-prof`, clinic, heap snapshots, event loop delay, Web Vitals |
| `reference/native.md` | perf, flame graphs, differential flame graphs, hardware counters, callgrind |
| `reference/tracy.md` | When Tracy fits, its MCP server, and when to stay away |

## A note on Tracy

Tracy is included because it is excellent at something the sampling profilers are
bad at: showing you the *individual* slow occurrence rather than an average. That
matters for frame-based and real-time workloads.

It is also included with an explicit warning. Its client is C/C++/Lua, with usable
Rust bindings; the only Go binding is pinned to Tracy 0.9 and Windows-only. On a
Go or Node stack, `pprof` and the platform tools are the shorter path, and
`reference/tracy.md` says so rather than pretending otherwise.

## Output

A report with one entry per hypothesis. Each carries a verdict (**confirmed,
refuted, or inconclusive**), the numbers, the sample count, the p-value, and
a verbatim command that reproduces it.

"Inconclusive" is a first-class outcome. A campaign that refutes three of its own
hypotheses is worth more than one that confirms all eight.
