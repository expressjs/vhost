# Benchmark run 2026-06-13T07-13-20-615Z

- Node: v24.15.0 · darwin/arm64
- Sessions per length: **25** (independent processes)
- Baseline: `bench/v3-baseline.cjs` (v3.0.2) · Candidate: current build

ns/op, lower is better. `speedup` = old mean ÷ new mean.

## 10,000 iterations / scenario

| scenario | old mean | new mean | new median | new min | new max | speedup | new ±sd% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| static match | 82.1 | 70.3 | 69.8 | 66.6 | 75.9 | 1.17× | 3.4% |
| static no-match | 28.8 | 22.7 | 22.8 | 22.2 | 23.7 | 1.27× | 1.8% |
| wildcard match | 155.4 | 146.9 | 145.0 | 142.4 | 159.5 | 1.06× | 2.8% |
| wildcard match (prefix) | 151.5 | 149.8 | 147.7 | 145.1 | 169.9 | 1.01× | 3.7% |
| wildcard no-match (short) | 29.3 | 12.8 | 12.7 | 12.5 | 13.8 | 2.28× | 2.3% |
| wildcard no-match (suffix) | 33.4 | 35.2 | 32.7 | 32.3 | 60.9 | 0.95× | 21.4% |
| multi-star match | 163.5 | 164.2 | 162.0 | 156.5 | 185.0 | 1.00× | 4.1% |
| regexp match | 166.7 | 177.5 | 175.8 | 167.2 | 194.9 | 0.94× | 3.6% |
| no Host | 7.1 | 6.2 | 5.6 | 5.3 | 8.4 | 1.14× | 17.7% |

## 100,000 iterations / scenario

| scenario | old mean | new mean | new median | new min | new max | speedup | new ±sd% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| static match | 84.5 | 61.8 | 61.4 | 58.7 | 66.2 | 1.37× | 3.4% |
| static no-match | 27.5 | 14.3 | 14.2 | 13.8 | 17.6 | 1.92× | 5.0% |
| wildcard match | 149.7 | 149.6 | 149.5 | 144.8 | 159.8 | 1.00× | 2.0% |
| wildcard match (prefix) | 151.0 | 151.7 | 150.8 | 146.4 | 173.0 | 1.00× | 3.3% |
| wildcard no-match (short) | 29.7 | 13.5 | 13.4 | 13.1 | 14.8 | 2.20× | 2.7% |
| wildcard no-match (suffix) | 33.6 | 33.3 | 33.1 | 32.7 | 36.2 | 1.01× | 2.0% |
| multi-star match | 163.2 | 163.2 | 163.0 | 159.6 | 172.7 | 1.00× | 1.7% |
| regexp match | 166.6 | 166.1 | 165.3 | 161.2 | 174.7 | 1.00× | 1.8% |
| no Host | 7.3 | 5.9 | 5.9 | 5.8 | 6.1 | 1.24× | 1.8% |

## 1,000,000 iterations / scenario

| scenario | old mean | new mean | new median | new min | new max | speedup | new ±sd% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| static match | 86.7 | 63.0 | 62.5 | 59.1 | 74.9 | 1.38× | 5.7% |
| static no-match | 28.0 | 14.7 | 14.2 | 14.0 | 23.4 | 1.91× | 12.5% |
| wildcard match | 153.2 | 151.2 | 150.5 | 146.4 | 162.7 | 1.01× | 2.9% |
| wildcard match (prefix) | 153.0 | 163.4 | 151.2 | 148.0 | 417.3 | 0.94× | 31.9% |
| wildcard no-match (short) | 29.9 | 13.5 | 13.3 | 13.2 | 15.0 | 2.21× | 3.2% |
| wildcard no-match (suffix) | 34.1 | 33.6 | 33.2 | 32.9 | 38.1 | 1.01× | 3.2% |
| multi-star match | 163.5 | 176.5 | 163.1 | 159.6 | 399.9 | 0.93× | 27.2% |
| regexp match | 169.1 | 174.5 | 165.9 | 162.0 | 283.1 | 0.97× | 15.8% |
| no Host | 7.4 | 6.0 | 5.9 | 5.8 | 6.9 | 1.24× | 3.8% |

