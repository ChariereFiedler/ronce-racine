# Reference - Measurement statistics

How to compare two performance measurements without fooling yourself. This is
the part practitioners skip, and it is where most wrong optimizations come from.

## Table of contents

- [The smallest detectable effect](#the-smallest-detectable-effect)
- [Interleaving A and B](#interleaving-a-and-b)
- [Reading benchstat](#reading-benchstat)
- [Multiple testing - the cardinal sin](#multiple-testing---the-cardinal-sin)
- [Sample size](#sample-size)
- [When the machine is noisy anyway](#when-the-machine-is-noisy-anyway)
- [Reporting rules](#reporting-rules)

---

## The smallest detectable effect

**Measure the noise before measuring the effect.** Run the *same*, unmodified
code twice and compare the two runs. Whatever difference shows up is your noise
floor: no effect smaller than it can ever be claimed on this machine, in this
state.

```bash
go test -run='^$' -bench=. -count=15 ./bench/ > noise-A.txt
go test -run='^$' -bench=. -count=15 ./bench/ > noise-B.txt
benchstat noise-A.txt noise-B.txt   # A vs A: everything here is noise
```

A clean idle machine typically lands under ~2%. A loaded laptop can exceed 10%.
Both are workable, but only if you know which one you are on, because the noise
floor decides what conclusions are available to you:

| Noise floor | What you can still conclude |
|---|---|
| < 2% | Fine-grained work: a 5% regression is detectable |
| 2-10% | Only substantial effects: >20% deltas |
| > 10% | Allocation counts and memory retention only - **do not report timing deltas** |

Allocation counts (`allocs/op`) and retained-heap measurements are far more
robust to load than timings. On a noisy machine, pivot to them rather than
abandoning the campaign.

### What this looks like when it goes wrong

Real output, from a loaded workstation (load average ~50 on 12 cores), comparing
a benchmark suite **against itself** (same commit, same binary, nothing changed):

```
                                 │  noise-A.txt  │            noise-B.txt             │
                                 │    sec/op     │   sec/op     vs base               │
PublishSubjectFanout/observers=1   135.20n ± 20%   61.28n ± 5%  -54.67% (p=0.000 n=15)
PipeMapFilter-12                    319.6n ± 11%   195.6n ± 11%  -38.80% (p=0.000 n=15)
geomean                             128.4n          96.53n       -24.84%

                                 │     B/op      │  B/op    vs base                   │
PublishSubjectFanout/observers=1    0.000 ± 0%     0.000 ± 0%   ~ (p=1.000 n=15) ¹
ReplaySubjectBounded-12             32.00 ± 0%     32.00 ± 0%   ~ (p=1.000 n=15) ¹
¹ all samples are equal
```

A 25% geometric-mean "improvement", p=0.000, from changing nothing at all. Had
this been run as a patched-vs-base comparison, every number would have looked
like a triumph.

Note the second table: over the same runs, `B/op` is identical to the byte, on
every benchmark. That is the whole argument for pivoting to allocation metrics
when the machine will not cooperate, and for never skipping the A-vs-A step,
which cost ten minutes and invalidated an afternoon of timing claims.

## Interleaving A and B

Never run all of A then all of B. Thermal drift, background jobs and CPU
frequency scaling all vary over minutes, and a sequential layout maps that drift
directly onto your A/B axis: you measure the passage of time, not the patch.

```bash
for i in $(seq 1 10); do
  go test -run='^$' -bench=. -count=1 ./bench/ >> A.txt   # baseline
  (cd ../patched && go test -run='^$' -bench=. -count=1 ./bench/) >> B.txt
done
benchstat A.txt B.txt
```

Alternating means any drift hits both arms equally and lands in the variance
instead of the difference.

### What it buys you

Same machine, same benchmarks, same A-vs-A comparison as the section above. Only
the protocol changed (interleaved instead of sequential, `taskset -c 6-11` to pin
the cores, run once the machine had calmed down):

| Protocol | A vs A geomean | verdict |
|---|---|---|
| Sequential, loaded machine | **-24.84%** | p=0.000 on 8 of 10 benchmarks, all of it fake |
| Interleaved + pinned cores | **-0.11%** | `~` (p=0.98, p=0.60), correctly finds nothing |

A noise floor of 0.1% instead of 25%, for two changes costing nothing. The same
suite then measured a real patch at -37% geomean, a claim that would have been
worthless under the first protocol and is solid under the second.

Pin the cores, alternate the arms. It is the cheapest quality improvement
available in performance work.

## Reading benchstat

`benchstat` uses non-parametric statistics: median for summaries, Mann-Whitney U
for A/B comparison. It makes no assumption that your samples are normally
distributed, which they are not.

```
                │   base.txt   │            patched.txt             │
                │    sec/op    │   sec/op     vs base               │
ObserverNext-12   17.84n ± 2%   13.02n ± 3%  -27.02% (p=0.000 n=10)
SubscriberNext-12 30.10n ± 4%   29.88n ± 5%        ~ (p=0.315 n=10)
```

- `± 2%`: variation across the samples. If this is large, the measurement is
  unstable and the comparison is weak regardless of the p-value.
- `p=0.000`: probability the observed difference is chance alone. Below 0.05 is
  the usual bar.
- `~`: benchstat found no statistically significant difference. **This is a
  result, and it is often the correct one.** Report it as "no measurable effect",
  not as "inconclusive, needs more runs".
- `n=10`: samples retained after outlier removal. If it drops well below your
  `-count`, the run was polluted.

## Multiple testing - the cardinal sin

**Never re-run a benchmark until it reports significance.** At p<0.05, one run in
twenty shows a "significant" difference by pure chance. Re-rolling until you like
the answer manufactures exactly that false positive, and it is the single most
common statistical error in performance work.

Decide `-count` and the number of repetitions *before* looking at results. If a
comparison comes back `~`, the honest conclusion is that the effect, if there is
one at all, is below your noise floor.

The same applies across benchmarks: comparing 20 benchmarks at once means ~1
false positive is expected. A lone significant result in a large suite, with no
mechanism to explain it, is probably noise.

## Sample size

- `-count=10` is the practical minimum for benchstat.
- `-count=20` when the noise floor is above 5%.
- `-benchtime` raises per-sample iterations; it reduces within-sample noise but
  does **not** replace repeated runs: only `-count` gives benchstat its samples.
- More samples narrow the confidence interval; they do not fix a biased setup.
  Ten thousand runs of a benchmark measuring the wrong thing measure the wrong
  thing very precisely.

## When the machine is noisy anyway

You cannot always get a quiet machine. In order of preference:

1. **Pivot the metric.** Allocation counts, retained heap and object counts are
   near-immune to CPU load. Prefer them.
2. **Pin the CPUs.** `taskset -c 0-3` on the benchmark, keeping other work off
   those cores.
3. **Raise `-count` and interleave.** More samples plus alternation converts
   drift into variance instead of bias.
4. **Report the constraint.** State the load average and the measured noise floor
   next to the numbers, so a reader can judge them.

What you must not do is report a 5% delta from a machine whose noise floor is
15%, whatever the p-value says.

## Reporting rules

Every reported measurement carries:

- the **command** that produces it, verbatim and re-runnable
- the **noise floor** of the machine at the time
- the **sample count** and the **p-value** for any A/B claim
- a **verdict**: confirmed / refuted / **inconclusive**

"Inconclusive" is a first-class outcome. A campaign that refutes three of its own
hypotheses is worth more than one that confirms all eight.
