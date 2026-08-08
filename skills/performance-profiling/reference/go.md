# Reference - Profiling Go

Commands and reading grid for a Go performance campaign. Every command below has
been run against a real project; none is illustrative.

## Table of contents

- [Which profile answers which question](#which-profile-answers-which-question)
- [Collecting profiles](#collecting-profiles)
- [Reading a CPU profile](#reading-a-cpu-profile)
- [Off-CPU: block and mutex](#off-cpu-block-and-mutex)
- [Memory: allocation vs retention](#memory-allocation-vs-retention)
- [pprof labels](#pprof-labels)
- [Execution trace](#execution-trace)
- [Escape analysis and inlining](#escape-analysis-and-inlining)
- [Benchmark hygiene](#benchmark-hygiene)
- [Regression guard in CI](#regression-guard-in-ci)

---

## Which profile answers which question

| Question | Profile | Why |
|---|---|---|
| Where does CPU time go? | `-cpuprofile` | on-CPU only |
| Why is latency high while CPU is flat? | `-blockprofile`, trace | waiting is invisible to CPU profiles |
| Which lock is contended? | `-mutexprofile` | attributes contention to a lock site |
| What allocates? | `-memprofile` + `-alloc_objects` | allocation rate, GC pressure |
| What is retained? | `-memprofile` + `-inuse_space` | leaks, unbounded growth |
| Why don't my goroutines run? | `runtime/trace` | scheduler latency, GC pauses |
| Does this escape to the heap? | `-gcflags='-m'` | compile-time, no run needed |

The single most common mistake is answering a latency question with a CPU
profile. A CPU profile shows time *on* the CPU and structurally hides every
wait: locks, channels, syscalls, scheduler starvation.

## Collecting profiles

From a benchmark (preferred: reproducible, isolated):

```bash
go test -run='^$' -bench='^BenchmarkHotPath$' -benchtime=5s \
  -cpuprofile=/tmp/cpu.out -memprofile=/tmp/mem.out ./bench/
```

Block and mutex profiles need a sampling rate; they are off by default:

```bash
go test -run='^$' -bench='^BenchmarkFanout$' -benchtime=5s \
  -blockprofile=/tmp/block.out -mutexprofile=/tmp/mutex.out ./bench/
```

In a long-running service, expose `net/http/pprof` and pull on demand. Restrict
the endpoint (internal interface, auth, or a flag), since it exposes internals and
allows anyone to trigger a costly capture.

```bash
go tool pprof -top http://localhost:6060/debug/pprof/profile?seconds=30
go tool pprof -top http://localhost:6060/debug/pprof/heap
```

CPU profiling costs roughly 5-10% overhead: fine to enable on demand, not to
leave running. Heap profiles are cheap enough for continuous use. Capture for at
least 10-30 seconds and **under representative load**, because a profile of an idle
service profiles the idle loop.

## Reading a CPU profile

```bash
go tool pprof -top -nodecount=20 /tmp/cpu.out   # ranking
go tool pprof -list='funcName' /tmp/cpu.out     # line-by-line inside one function
go tool pprof -http=: /tmp/cpu.out              # flame graph in a browser
```

Two columns, two different questions:

- **flat**: time in this function's own instructions. High flat = this code is
  the work.
- **cum**: time in this function *and everything it calls*. High cum with low
  flat = a dispatcher; the cost is below it.

Optimize on `flat`. Navigate on `cum`.

Cut the noise once you know what you are looking for:

```bash
go tool pprof -top -focus='mypackage' /tmp/cpu.out
go tool pprof -top -ignore='runtime\.' /tmp/cpu.out
```

Apply Amdahl before touching anything: a function at 8% cumulative caps your
achievable gain at 8%, however brilliant the rewrite.

## Off-CPU: block and mutex

Both need enabling, in the benchmark or in `TestMain`:

```go
runtime.SetBlockProfileRate(1)     // every blocking event (expensive; 1000+ in prod)
runtime.SetMutexProfileFraction(1) // every contention event
```

- **block**: time spent waiting on channels, `sync` primitives, timer channels.
- **mutex**: contention on mutexes, attributed to the *holder* site.

The signature of a lock-bound system: flat CPU, growing latency, and a mutex
profile dominated by one lock. Confirm with a scaling run: if per-operation cost
*rises* with parallelism, you are serialized:

```bash
go test -run='^$' -bench='^BenchmarkX$' -cpu=1,2,4,8,12 -count=10 ./bench/
```

## Memory: allocation vs retention

Two distinct questions, two flags:

```bash
go tool pprof -alloc_objects -top /tmp/mem.out  # what allocates most often -> GC pressure
go tool pprof -alloc_space   -top /tmp/mem.out  # what allocates the most bytes
go tool pprof -inuse_space   -top /tmp/mem.out  # what is still held -> leak hunting
```

For retention that survives GC, `runtime.MemStats` around a workload is blunt but
decisive, and immune to CPU noise:

```go
runtime.GC()
var before runtime.MemStats
runtime.ReadMemStats(&before)
// ... workload ...
runtime.GC()
var after runtime.MemStats
runtime.ReadMemStats(&after)
retained := int64(after.HeapAlloc) - int64(before.HeapAlloc)
```

Always run a **control**, the same workload without the suspected component.
A control that retains ~0 turns "it grows" into proof.

## pprof labels

Labels turn a flat profile into a queryable one. Attach the dimension you will
want to slice by, be it tenant, endpoint, job kind or pipeline stage:

```go
import "runtime/pprof"

pprof.Do(ctx, pprof.Labels("endpoint", "/checkout", "tenant", tenantID),
    func(ctx context.Context) {
        handleRequest(ctx)
    })
```

Then slice:

```bash
go tool pprof -tagfocus='endpoint=/checkout' -top /tmp/cpu.out
go tool pprof -tagignore='tenant=internal'   -top /tmp/cpu.out
```

Labels propagate to goroutines started inside the labelled call. They apply to
CPU and goroutine profiles; **heap profiles do not carry them**. Cost is a small
per-call map association, negligible on a request path, best avoided inside a
per-element inner loop.

Without labels, a profile of a multi-tenant service says "JSON decoding is 30%".
With them, it says "JSON decoding is 30%, and 27 of those points are one tenant".

## Execution trace

When the question is *ordering* rather than *volume*:

```bash
go test -run='^$' -bench='^BenchmarkX$' -trace=/tmp/trace.out ./bench/
go tool trace /tmp/trace.out
```

What to look for: thick red GC bands, long chains of blocked goroutines, gaps
where goroutines are runnable but not running (scheduler pressure), and long
unbroken network waits. The trace also exposes a scheduler-latency profile that
no other tool provides.

## Escape analysis and inlining

Compile-time, no execution required:

```bash
go build -gcflags='-m' ./... 2>&1 | grep 'escapes to heap'
go build -gcflags='-m -m' ./... 2>&1 | grep 'yourfile.go:4[0-9]:'
go build -gcflags='-m' ./... 2>&1 | grep 'cannot inline'
```

This settles "does this closure allocate?" without a benchmark. Beware the
inverse inference: a closure that does *not* escape can still cost real time if
it blocks inlining of the surrounding call. Measure, don't deduce.

## Benchmark hygiene

```go
func BenchmarkThing(b *testing.B) {
    setup()          // outside the timed region
    b.ReportAllocs()
    b.ResetTimer()   // discard setup cost
    for i := 0; i < b.N; i++ {
        sink = thing(i)   // assign to a package-level sink: prevents elimination
    }
}
```

- `b.ResetTimer()` after setup, `b.StopTimer()`/`StartTimer()` around per-iteration
  setup.
- Assign results to a package-level variable, or the compiler may delete the work.
- `b.RunParallel` for contention; it is the only way to see serialization.
- Benchmark the **steady state**. A ring buffer behaves differently once full,
  so fill it before `ResetTimer`.
- `-benchmem` always. Allocation counts are stable where timings are not.

## Regression guard in CI

Without a guard, every gain is reclaimed within months.

```bash
go test -run='^$' -bench=. -count=10 -benchmem ./bench/ > new.txt
git stash && go test -run='^$' -bench=. -count=10 -benchmem ./bench/ > base.txt && git stash pop
benchstat base.txt new.txt
```

`benchstat` exits 0 regardless of the delta, so the gate is on its output. Keep
the threshold loose (10-20%), because a CI runner is a noisy machine and a flaky perf
gate gets disabled within a month, which is worse than no gate.

Go also supports profile-guided optimization: commit a representative
`default.pgo` next to `main` and the compiler uses it for inlining decisions.
Typical gains are a few percent, for no code change.
