# Reference - Tracy Profiler

Tracy is a real-time, nanosecond-resolution, remote telemetry profiler. It is
hybrid: **instrumentation** (zones you declare) plus **sampling** (call stacks it
captures on its own). It ships an MCP server, so an agent can query a capture
directly.

This page exists as much to say **when not to use Tracy** as when to use it.

## Table of contents

- [When Tracy is the right tool](#when-tracy-is-the-right-tool)
- [When it is not](#when-it-is-not)
- [Language support, honestly](#language-support-honestly)
- [Zones](#zones)
- [The MCP server](#the-mcp-server)
- [Tracy vs sampling profilers](#tracy-vs-sampling-profilers)

---

## When Tracy is the right tool

- **Frame-based workloads.** Games, renderers, audio, simulation: anything with
  a recurring budget ("16.6 ms per frame"). Tracy is built around frame marks and
  shows you the frame that blew the budget, not an average.
- **You need per-occurrence data, not aggregates.** A sampling profiler tells you
  a function costs 3% overall. Tracy shows you *that one call* that took 40 ms at
  frame 8213. For tail latency and hitches, this is the difference between a lead
  and nothing.
- **Nanosecond-scale work.** Zone overhead is a few tens of nanoseconds, low
  enough to instrument tight code.
- **CPU and GPU on one timeline.** OpenGL, Vulkan, Direct3D 12, OpenCL zones are
  correlated with CPU zones, which is hard to get any other way.
- **Live observation.** Connect to a running process and watch the timeline move.
- **Context switches, lock contention, memory events** are first-class.

## When it is not

- **Server-side request/response workloads.** No frames, no fixed budget. A
  continuous profiler (Pyroscope, Parca, Polar Signals) with labels answers
  "which endpoint costs what" far better.
- **You cannot recompile.** Tracy requires linking its client and, for anything
  useful, adding zone macros. `perf` attaches to a running process without touching it.
- **Production, permanently.** Tracy targets a developer session with a profiler
  UI attached, not a fleet.
- **Managed runtimes.** See below.

## Language support, honestly

Tracy's client is C++, with first-class support for **C, C++ and Lua**. Bindings
exist for Rust (`tracy_full`, `tracing-tracy`) and are in real use.

**For Go, there is effectively no usable path.** The only binding, `grzesl/gotracy`,
is pinned to Tracy 0.9 and documented as Windows-only. On a Go/Linux stack, use
`pprof` + `runtime/trace` (see `reference/go.md`). They are better integrated,
free, and answer the same questions for that workload shape. Do not spend a day
wiring Tracy into a Go service; you will lose.

Same reasoning for Python, Java and .NET: their own ecosystems (py-spy, async-profiler,
dotnet-trace) are the shorter path.

## Zones

The instrumentation unit. A zone is a named, timed scope; Tracy nests them into a
timeline.

```cpp
void UpdatePhysics() {
    ZoneScoped;                        // zone named after the function
    ZoneText(entityName, strlen(entityName));   // per-occurrence text
    ZoneValue(entityCount);                     // per-occurrence number
    // ...
}

void RenderFrame() {
    ZoneScopedN("Render");             // explicit name
    // ...
    FrameMark;                         // frame boundary
}
```

Zone-placement heuristics, in order:

1. One zone per **phase** of the frame or request first (update, render, I/O).
   Coarse zones tell you which phase is over budget; that is usually enough.
2. Descend only into the phase that is over budget. Instrumenting everything
   up front produces a timeline you cannot read and measurable overhead.
3. Add `ZoneText`/`ZoneValue` for the dimension you will want to filter on:
   entity name, batch size, tenant. This is Tracy's equivalent of pprof labels,
   and the same rule applies: without it you get "physics is slow", with it you
   get "physics is slow for one entity type".
4. Never put a zone in a loop running millions of iterations per frame. Zone
   the loop, not the body.

## The MCP server

Merged upstream (`wolfpld/tracy` PR #1347, May 2026). It lets an agent query
captures through Tracy's own analysis engine rather than by eyeballing the UI.

Architecture: a Python sidecar exposing the C++ `Worker` class through pybind11,
served over FastMCP/SSE with per-session isolated worker instances.

Tools exposed:

| Tool | Role |
|---|---|
| `list_captures` | enumerate available capture files |
| `load_capture` | load a `.tracy` file from disk |
| `live_connect` | attach to a running Tracy session |
| `eval` | evaluate Python against the trace context object (`ctx`) |

The design is deliberate: rather than a fixed set of curated queries, `eval`
exposes a programming interface over zones, GPU zones, frames, plots, messages,
locks, source locations and summary statistics. Powerful, and open-ended enough
that you should state your question precisely before querying.

Requires Python, pybind11 and FastMCP, and a Tracy built with the server module
(`start_mcp.sh`). Not part of a default build.

**Verify before relying on it**: this is recent, and the upstream note flags that
future "Tracy Assist" work may reshape the interface.

## Tracy vs sampling profilers

| | Tracy | perf / pprof |
|---|---|---|
| Data | every instrumented occurrence | statistical sample |
| Setup | recompile + zone macros | attach, nothing to change |
| Tail latency | shows the individual outlier | averages it away |
| Coverage | only what you instrumented (+ sampling) | everything, uniformly |
| Overhead | tens of ns per zone | ~1-10% |
| Best at | frames, hitches, GPU/CPU correlation | "where does time go overall" |

They are complementary. The usual sequence: sample first to find the region,
instrument that region with zones to understand its per-occurrence behaviour.
Reaching for zones before you know where the cost is means instrumenting the
wrong code precisely.
