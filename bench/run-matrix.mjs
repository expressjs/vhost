// Run the session benchmark across multiple lengths and multiple independent
// sessions (fresh processes), then aggregate mean / min / max / spread.
//
//   node bench/run-matrix.mjs [sessions] [lengths...]
//   node bench/run-matrix.mjs 8 10000 100000 1000000   # defaults
//
// Prints a per-length table comparing the v3 baseline against the current
// build, and a machine-readable JSON blob at the end (captured into
// BENCHMARKS.md). Each session is a separate `node bench/session.mjs <length>`
// process, so run-to-run variance reflects real cross-session noise rather than
// one warmed-up JIT.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sessionScript = join(__dirname, 'session.mjs')

const argv = process.argv.slice(2)
const sessions = Number(argv[0] || 8)
const lengths = (argv.length > 1 ? argv.slice(1) : ['10000', '100000', '1000000']).map(Number)

function runSession (length) {
  const stdout = execFileSync(process.execPath, [sessionScript, String(length)], {
    encoding: 'utf8'
  })
  return JSON.parse(stdout.trim().split('\n').pop())
}

// Discover scenarios from the session output (keeps in sync with session.mjs).
const SCENARIOS = Object.keys(runSession(lengths[0]).scenarios)

function stats (values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return { mean, min, max, sd: Math.sqrt(variance) }
}

function fmt (n) {
  return n.toFixed(1)
}

const report = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  sessions,
  lengths,
  results: {}
}

for (const length of lengths) {
  // Collect `sessions` independent runs at this length.
  const runs = []
  for (let i = 0; i < sessions; i++) {
    runs.push(runSession(length))
  }

  console.log(`\n=== length ${length.toLocaleString()} iterations/scenario, ${sessions} sessions ===`)
  console.log(
    'scenario'.padEnd(16),
    'old mean'.padStart(10),
    'new mean'.padStart(10),
    'new min'.padStart(9),
    'new max'.padStart(9),
    'speedup'.padStart(8),
    'new ±sd%'.padStart(9)
  )

  report.results[length] = {}
  for (const s of SCENARIOS) {
    const oldStat = stats(runs.map((r) => r.scenarios[s].old))
    const newStat = stats(runs.map((r) => r.scenarios[s].new))
    const speedup = oldStat.mean / newStat.mean
    const sdPct = (newStat.sd / newStat.mean) * 100

    report.results[length][s] = {
      old: oldStat,
      new: newStat,
      speedup
    }

    console.log(
      s.padEnd(16),
      fmt(oldStat.mean).padStart(10),
      fmt(newStat.mean).padStart(10),
      fmt(newStat.min).padStart(9),
      fmt(newStat.max).padStart(9),
      (speedup.toFixed(2) + 'x').padStart(8),
      ('±' + sdPct.toFixed(1) + '%').padStart(9)
    )
  }
}

console.log('\nJSON:' + JSON.stringify(report))
