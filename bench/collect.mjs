// Collect a full benchmark run and persist it for later review.
//
//   node bench/collect.mjs [sessions] [lengths...]
//   node bench/collect.mjs 25 10000 100000 1000000   # defaults
//
// Spawns `sessions` independent `node bench/session.mjs <length>` processes per
// length (one process = one independent JIT/GC session) comparing the pinned v3
// baseline against the current build. Writes, into bench/results/<run-id>/:
//
//   meta.json          - node version, platform, sessions, lengths, timestamp
//   raw-<length>.json  - every session's ns/op for every scenario (old + new)
//   summary.json       - aggregated mean/min/max/sd/median/speedup per scenario
//   summary.md         - the same as human-readable tables
//
// The run-id is a UTC timestamp so repeated runs accumulate instead of clobber.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sessionScript = join(__dirname, 'session.mjs')

const argv = process.argv.slice(2)
const sessions = Number(argv[0] || 25)
const lengths = (argv.length > 1 ? argv.slice(1) : ['10000', '100000', '1000000']).map(Number)

const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = join(__dirname, 'results', runId)
mkdirSync(outDir, { recursive: true })

function runSession (length) {
  const stdout = execFileSync(process.execPath, [sessionScript, String(length)], { encoding: 'utf8' })
  return JSON.parse(stdout.trim().split('\n').pop())
}

// Discover the scenario list from the session itself so this stays in sync with
// bench/session.mjs without a duplicated hardcoded list.
const SCENARIOS = Object.keys(runSession(lengths[0]).scenarios)

function aggregate (values) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  const median = n % 2
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  return {
    mean,
    median,
    min: sorted[0],
    max: sorted[n - 1],
    sd: Math.sqrt(variance),
    sdPct: (Math.sqrt(variance) / mean) * 100
  }
}

const meta = {
  runId,
  timestamp: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  sessions,
  lengths,
  scenarios: SCENARIOS,
  baseline: 'bench/v3-baseline.cjs (v3.0.2)',
  candidate: 'package "vhost" entry (current build)'
}
writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')

const summary = { meta, results: {} }
const mdLines = [
  `# Benchmark run ${runId}`,
  '',
  `- Node: ${process.version} · ${process.platform}/${process.arch}`,
  `- Sessions per length: **${sessions}** (independent processes)`,
  `- Baseline: \`bench/v3-baseline.cjs\` (v3.0.2) · Candidate: current build`,
  '',
  'ns/op, lower is better. `speedup` = old mean ÷ new mean.',
  ''
]

for (const length of lengths) {
  const runs = []
  for (let i = 0; i < sessions; i++) {
    runs.push(runSession(length))
    process.stderr.write(`\r${length} iters: session ${i + 1}/${sessions}   `)
  }
  process.stderr.write('\n')

  // Persist every raw session for this length.
  writeFileSync(
    join(outDir, `raw-${length}.json`),
    JSON.stringify({ length, sessions, runs }, null, 2) + '\n'
  )

  summary.results[length] = {}
  mdLines.push(`## ${length.toLocaleString()} iterations / scenario`, '')
  mdLines.push('| scenario | old mean | new mean | new median | new min | new max | speedup | new ±sd% |')
  mdLines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')

  for (const s of SCENARIOS) {
    const oldAgg = aggregate(runs.map((r) => r.scenarios[s].old))
    const newAgg = aggregate(runs.map((r) => r.scenarios[s].new))
    const speedup = oldAgg.mean / newAgg.mean
    summary.results[length][s] = { old: oldAgg, new: newAgg, speedup }
    mdLines.push(
      `| ${s} | ${oldAgg.mean.toFixed(1)} | ${newAgg.mean.toFixed(1)} | ${newAgg.median.toFixed(1)} | ` +
      `${newAgg.min.toFixed(1)} | ${newAgg.max.toFixed(1)} | ${speedup.toFixed(2)}× | ${newAgg.sdPct.toFixed(1)}% |`
    )
  }
  mdLines.push('')
}

writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
writeFileSync(join(outDir, 'summary.md'), mdLines.join('\n') + '\n')

// Console echo of the summary tables.
console.log(mdLines.join('\n'))
console.log(`\nSaved to bench/results/${runId}/`)
