# Reference - Profiling Node.js and the browser

Covers server-side Node and the browser runtime. For low-level rendering audits
(WebKit/JSC internals, DOM, CSS pipeline), use the `audit-performance-frontend`
skill instead. This page is about *investigating* a specific slowdown, not
scoring maturity.

## Table of contents

- [Node: which tool for which question](#node-which-tool-for-which-question)
- [Node: CPU profile](#node-cpu-profile)
- [Node: heap and leaks](#node-heap-and-leaks)
- [Node: the event loop](#node-the-event-loop)
- [Browser: measuring in the field](#browser-measuring-in-the-field)
- [Browser: the profiler](#browser-the-profiler)
- [Benchmarking JS honestly](#benchmarking-js-honestly)

---

## Node: which tool for which question

| Question | Tool |
|---|---|
| Where does CPU go? | `node --cpu-prof`, Chrome DevTools |
| What is retained? | `node --heapsnapshot-signal`, heap snapshots |
| What allocates? | `--heap-prof` |
| Why is latency spiky while CPU is low? | event loop delay, async hooks |
| Which async call is slow? | `clinic bubbleprof`, OpenTelemetry spans |
| Is it Node at all? | measure at the edge first |

## Node: CPU profile

Built in, no dependency:

```bash
node --cpu-prof --cpu-prof-dir=./profiles app.js
# writes CPU.<date>.<pid>.cpuprofile, open in Chrome DevTools (Performance > Load profile)
```

On a running process, without restarting it:

```bash
node --inspect app.js
# chrome://inspect > Open dedicated DevTools > Profiler > Start
```

`clinic` wraps this with opinionated output and is the fastest way to a verdict:

```bash
npx clinic doctor -- node app.js     # diagnoses the category of problem first
npx clinic flame -- node app.js      # flame graph
npx clinic bubbleprof -- node app.js # async flow: where the awaits go
```

`clinic doctor` is the right first move: it tells you whether you have a CPU
problem, an event-loop problem, an I/O problem or a GC problem. Answering that
question before profiling saves the classic mistake of CPU-profiling an I/O-bound
service.

## Node: heap and leaks

```bash
node --heapsnapshot-signal=SIGUSR2 app.js
kill -USR2 <pid>    # snapshot at will
```

Leak-hunting method: take a snapshot, exercise the suspect path N times, force GC,
take a second snapshot, and compare in DevTools (**Comparison** view). Objects
whose count grows with N and never returns are your leak. One snapshot in
isolation proves nothing: you need the delta and a control.

```bash
node --expose-gc -e "global.gc()"   # deterministic GC for measurement
```

## Node: the event loop

The failure mode invisible to CPU profiles: a synchronous block starves every
pending callback. Symptom is p99 latency far above p50 while CPU sits low.

```js
import { monitorEventLoopDelay } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 10 });
h.enable();
setInterval(() => {
  console.log('loop delay p99 (ms):', h.percentile(99) / 1e6);
  h.reset();
}, 5000);
```

Sustained delay above a few milliseconds means something is blocking: a large
`JSON.parse`, a synchronous `fs` call, a regex backtracking, a crypto call on the
main thread. Move it to a worker thread or make it async rather than
micro-optimizing around it.

## Browser: measuring in the field

Lab measurements mislead; real users are on worse networks and worse devices.
Collect from the field:

```js
import { onLCP, onINP, onCLS } from 'web-vitals';
onLCP(m => beacon('lcp', m.value));
onINP(m => beacon('inp', m.value));   // INP replaced FID as the responsiveness metric
onCLS(m => beacon('cls', m.value));
```

For a specific interaction, mark it yourself:

```js
performance.mark('search:start');
await search(q);
performance.mark('search:end');
performance.measure('search', 'search:start', 'search:end');
```

Long tasks are what actually breaks responsiveness:

```js
new PerformanceObserver(list => {
  for (const e of list.getEntries()) console.warn('long task', e.duration, e.attribution);
}).observe({ type: 'longtask', buffered: true });
```

Always report **percentiles**, never means. A mean interaction time hides the
p95 that users complain about.

## Browser: the profiler

Chrome DevTools > Performance. Read it in this order:

1. **Main thread track**: find the long tasks (>50 ms, flagged red).
2. **Bottom-Up**, scoped to one long task: where self time goes.
3. **Call Tree**: the path that got there.
4. **Layout/Recalculate Style** entries: if they dominate, the problem is DOM
   thrashing, not JS. Look for a read-write-read pattern on layout properties.

Throttle CPU 4-6x and network to Slow 4G. An unthrottled profile on a developer
machine describes a device none of your users have.

`--enable-precise-memory-info` and the `measureUserAgentSpecificMemory()` API give
memory numbers; both need a secure context and are approximate.

## Benchmarking JS honestly

JIT compilation makes naive JS benchmarks nearly worthless: the first iterations
run interpreted, then the optimizer kicks in, and dead-code elimination may delete
your whole benchmark.

- Use a harness that handles warmup and statistics: `tinybench`, `mitata`,
  `benchmark.js`. Do not hand-roll `Date.now()` loops.
- Consume the result (assign to a global, or return it) so it is not eliminated.
- Discard warmup iterations explicitly.
- Beware `performance.now()` resolution: clamped and jittered in browsers for
  security. Measure many iterations, not one.
- Same statistical rules as everywhere else. See `reference/statistics.md`.
