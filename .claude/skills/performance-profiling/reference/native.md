# Reference - Profiling native code (C, C++, Rust)

System-level profiling with `perf` and friends. Attaches to a running process
without recompiling, which is the main advantage over instrumentation profilers.

## Table of contents

- [perf: the essentials](#perf-the-essentials)
- [Flame graphs](#flame-graphs)
- [Getting readable symbols](#getting-readable-symbols)
- [Off-CPU analysis](#off-cpu-analysis)
- [Hardware counters](#hardware-counters)
- [Cachegrind and callgrind](#cachegrind-and-callgrind)
- [Rust specifics](#rust-specifics)

---

## perf: the essentials

```bash
perf record -F 99 -g -- ./myprogram          # sample a command
perf record -F 99 -g -p <pid> -- sleep 30    # sample a running process
perf report                                   # interactive TUI
perf report --stdio --sort=overhead           # non-interactive
```

- `-F 99`: 99 Hz. Deliberately not 100: an even frequency risks locking onto
  periodic activity and aliasing the result.
- `-g`: capture call graphs. Add `--call-graph dwarf` when frame pointers are
  missing (slower, larger, but works on optimized builds).
- 30 seconds under representative load beats 5 minutes on an idle process.

May require `sysctl kernel.perf_event_paranoid=1` (or `-1`) to sample as a
non-root user.

## Flame graphs

```bash
perf record -F 99 -g -- ./myprogram
perf script > out.perf
stackcollapse-perf.pl out.perf > out.folded
flamegraph.pl out.folded > flame.svg
```

Reading rules, in order of how often they are got wrong:

- **Width = total time in that frame.** Wide is expensive.
- **The x-axis is alphabetical, not chronological.** A flame graph says nothing
  about ordering. Use a trace for that.
- **Plateaus at the top are where CPU actually is.** A tall narrow tower is deep
  call nesting, not cost.
- Look for the widest frame *you own*. Wide `libc` frames are usually a symptom
  of your call pattern, not of libc.

**Differential flame graphs** compare two versions: red = worse, blue = better.
This is the single most efficient way to localize a regression between releases,
and it is cheap enough to generate nightly (Netflix does exactly that).

```bash
difffolded.pl before.folded after.folded | flamegraph.pl > diff.svg
```

## Getting readable symbols

A profile full of hex addresses is a wasted capture. Fix it before sampling:

- Build with `-g` (debug info). It is orthogonal to `-O2`, keep both.
- Keep frame pointers: `-fno-omit-frame-pointer`. Costs ~1% and makes `-g`
  stack walking reliable.
- C++ names come out mangled: `perf report` demangles, `perf script` may not,
  so pipe through `c++filt`.
- Rust: `--release` with `debug = true` in the profile section.
- JIT runtimes need a `/tmp/perf-<pid>.map` file to resolve generated code.

## Off-CPU analysis

CPU profiles hide waiting. When the process is slow but not busy:

```bash
perf record -e sched:sched_switch -g -p <pid> -- sleep 30   # context switches
perf sched latency --sort max                                # scheduler delays
```

With BCC/bpftrace, `offcputime` is the direct answer:

```bash
offcputime-bpfcc -p <pid> 30 > offcpu.folded
```

Combining an on-CPU and an off-CPU flame graph accounts for the whole wall clock.
Either alone accounts for half the story.

## Hardware counters

When the code is CPU-bound and you need to know *why*:

```bash
perf stat -e cycles,instructions,cache-misses,branch-misses ./myprogram
perf stat -d ./myprogram      # detailed: includes IPC and cache levels
```

- **IPC** (instructions per cycle) below ~1 suggests stalling on memory, branches
  or dependencies.
- **cache-misses** relative to references points at layout and access patterns.
  This is where data-oriented restructuring pays, and where micro-optimizing
  instruction counts does not.
- **branch-misses** points at unpredictable branches in a hot loop.

Do not chase counters before a profile has told you which loop matters. Counters
explain a known hot spot; they do not find it.

## Cachegrind and callgrind

Simulation rather than sampling: exact instruction counts, no sampling error, and
**deterministic**, which makes them uniquely good for CI regression gates, since
they are immune to machine noise.

```bash
valgrind --tool=callgrind ./myprogram
callgrind_annotate callgrind.out.<pid>
kcachegrind callgrind.out.<pid>       # GUI
```

The cost is a 20-100x slowdown, and the numbers are *simulated* instruction
counts, not wall time. Use them to compare two versions, never to state absolute
performance.

## Rust specifics

```bash
cargo install flamegraph && cargo flamegraph --bench my_bench
cargo bench                                  # criterion: statistics built in
cargo asm my_crate::my_function              # inspect generated assembly
```

`criterion` handles warmup, outlier detection and confidence intervals, and keeps
history between runs to flag regressions. It is the closest equivalent to
`benchstat` in the Rust ecosystem.

For `Cargo.toml`, profile a release build with symbols:

```toml
[profile.release]
debug = true          # symbols, without disabling optimization
```

Rust is also one of the ecosystems where Tracy integration is genuinely usable.
See `reference/tracy.md`.
