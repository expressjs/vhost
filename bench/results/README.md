# Benchmark results

Stored output of `node bench/collect.mjs` (a.k.a. `npm run bench:collect`). Each run
compares the pinned v3 baseline (`bench/v3-baseline.cjs`) against the current build across
several iteration lengths, using N independent `node` processes per length (one process =
one independent JIT/GC session).

Each run lives in its own timestamped folder (`<UTC-ISO>/`) so repeated runs accumulate
rather than overwrite:

| file | contents |
| --- | --- |
| `meta.json` | node version, platform, session count, lengths, timestamp, baseline/candidate labels |
| `raw-<length>.json` | every individual session's ns/op, per scenario, for old + new — the unaggregated data |
| `summary.json` | aggregated mean / median / min / max / sd / speedup per scenario |
| `summary.md` | the same tables, human-readable |

`speedup` is `old mean ÷ new mean`; lower ns/op is better.

## Reading the numbers

Prefer the **median** when `±sd%` is high: a single OS-scheduler hiccup in one session can
inflate the mean and the max (e.g. a stray 296ns sample in an otherwise ~145ns scenario),
but the median stays robust. The `static match`/`static no-match` scenarios use a lowercase
Host — the realistic common case the ASCII fast path targets.

To reproduce:

```sh
npm run build           # ensure dist/ is current
npm run bench:collect   # 25 sessions × {10k,100k,1M}
```
