# vhost benchmarks

Measures the per-request cost of the middleware returned by `vhost(...)`: hostname
matching plus `req.vhost` population. Handlers are no-ops so only the library's work
is timed.

```sh
# quick single-process snapshot (tinybench)
node bench/index.mjs

# rigorous comparison: N independent sessions × several iteration lengths
node bench/run-matrix.mjs 8 10000 100000 1000000
```

Lower ns/op is better. Numbers are machine- and load-dependent — what matters is the
relative change between versions measured on the same machine. Per-op figures are
comparable across the CJS baseline and the ESM build because module-load cost is paid
once per process, not per operation.

The v3 implementation is pinned at `bench/v3-baseline.cjs` (a copy of the original
`index.js`) so the old-vs-new comparison stays reproducible after the rewrite.

Environment: Node.js v24.15.0, darwin, arm64 (Apple Silicon).

## Baseline — v3.0.2 (`index.js`, CommonJS)

Every request runs `RegExp.exec` and, on a match, allocates a capture array and loops
to copy groups onto `req.vhost` — even for an exact static hostname with no captures.

| scenario        |      ops/sec | ns/op |
| --------------- | -----------: | ----: |
| static match    |   11,666,664 |  88.5 |
| static no-match |   23,946,474 |  40.9 |
| wildcard match  |    6,779,127 | 160.7 |
| regexp match    |    5,896,864 | 195.2 |
| no Host header  |   35,641,036 |  21.2 |

`static match` is the hot path optimized in v4: an exact hostname like
`mail.example.com`, the overwhelmingly common real-world usage.

## v4.0.0 (`dist/index.js`, TypeScript, ESM)

For a static (no-`*`) hostname the middleware writes `req.vhost` directly with
`length: 0`, skipping `exec`'s capture array, the group-copy loop, and the result
allocation on a miss. Matching uses an **ASCII-gated decision** that is provably
identical to `regexp.test()`:

- For an ASCII literal pattern, the precompiled lowercase form `lowered` and its
  length are cached. At request time:
  - `name.length !== lowered.length` → **definite non-match**. RegExp `i` uses Unicode
    *simple* case folding, which is 1:1 (length-preserving) and never folds a multi-char
    or astral sequence into an ASCII pattern character, so a length mismatch can never be
    a match. This rejects misses without touching the regex.
  - `name === lowered` → **definite match** (ASCII, 1:1 fold).
  - otherwise (mixed case) → defer to the **identical** `regexp.test(name)`.
- For a non-ASCII literal pattern, matching defers wholly to `regexp.test`, because
  non-ASCII folds can change length (e.g. `'İ'.toLowerCase()` is two code units) and
  code points such as U+212A (Kelvin) fold to ASCII under the regex but not under
  `toLowerCase()`. A naive lowercase compare would change matching — so it is never used.

Wildcard string hostnames keep the `exec` + capture path but gain a cheap, always-safe
minimum-length reject: a match can never be shorter than the pattern's literal characters
plus one character per `*`, so a too-short hostname is rejected before the regex runs (it
only ever rejects; long-enough hosts fall through to the identical regex). RegExp hostnames
are unchanged. The contract is byte-for-byte preserved: the full 56-case suite passes
unchanged against the build, including regression tests for the Kelvin sign, the `İ`
length-changing fold, and wildcard prefix/suffix capture + case-insensitivity.

### Multi-session matrix: v3 baseline vs v4

`node bench/collect.mjs 25 10000 100000 1000000` — 25 independent sessions (one fresh
`node` process each, so independent JIT/GC state) per length. The table below is the
**100,000-iteration** length, which had the lowest variance in this run; the full sweep
(all three lengths, raw per-session data) is stored under `bench/results/`. `old`/`new`
are mean ns/op; the **median** is shown too because a single OS-scheduler spike can inflate
the mean/max (prefer the median when `±sd%` is high). `speedup` is `old mean ÷ new mean`.
The `static`/`wildcard` scenarios use a lowercase Host — the realistic common case.

| scenario                   | old mean | new mean | new median | speedup | ±sd% |
| -------------------------- | -------: | -------: | ---------: | ------: | ---: |
| static match               |     84.5 |     61.8 |       61.4 |   1.37× | 3.4% |
| static no-match            |     27.5 |     14.3 |       14.2 |   1.92× | 5.0% |
| wildcard match             |    149.7 |    149.6 |      149.5 |   1.00× | 2.0% |
| wildcard match (prefix)    |    151.0 |    151.7 |      150.8 |   1.00× | 3.3% |
| wildcard no-match (short)  |     29.7 |     13.5 |       13.4 |   2.20× | 2.7% |
| wildcard no-match (suffix) |     33.6 |     33.3 |       33.1 |   1.01× | 2.0% |
| multi-star match           |    163.2 |    163.2 |      163.0 |   1.00× | 1.7% |
| regexp match               |    166.6 |    166.1 |      165.3 |   1.00× | 1.8% |
| no Host header             |      7.3 |      5.9 |        5.9 |   1.24× | 1.8% |

**Reading the results.**

- **Static** match **~1.37×**, no-match **~1.9×**, no-Host **~1.24×** — the ASCII-gated
  decision (above) deciding most requests without the regex.
- **Wildcard short no-match ~2.2×** — the minimum-length reject fires before the regex.
- **Wildcard match / prefix / suffix / multi-star, and RegExp: ~1.0×** — neutral, no
  regression. The regex still does the matching and capture here; only too-short hosts are
  short-circuited. (At 1,000,000 iterations a couple of these means dip to ~0.93–0.94× from
  single OS-scheduler spikes — their medians stay 1.00–1.01×, which is why medians are
  reported alongside means.)

### What did *not* work on the wildcard path

A hand-rolled single-`*` string matcher (decompose `PREFIX*SUFFIX`, compare prefix/suffix
with an ASCII case-fold loop, slice out the capture, fall back to the regex for
multi-`*`/non-ASCII) *looked* ~1.5× faster on matches in isolation — but that was a
**measurement artifact**: the prototype built `req.vhost` as a fast object literal, whereas
the contract requires `Object.create(null)` populated incrementally. Once the prototype
used the real allocation, the matcher came out **0.62–0.71× (30–38% slower)** on matches,
because the null-prototype result allocation dominates the per-request cost and dwarfs any
saving from skipping `exec`. So the wildcard change is limited to the always-safe
minimum-length reject. The experiment lives in `bench/wildcard-experiments.mjs` (variants
WV1–WV4, each fuzz-checked for identical captures against the regex) with the lesson
documented at the top of the file.

