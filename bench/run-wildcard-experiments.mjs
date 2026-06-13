// Spawn N independent sessions of bench/wildcard-experiments.mjs and aggregate.
//
//   node bench/run-wildcard-experiments.mjs [sessions] [length]

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const script = join(__dirname, 'wildcard-experiments.mjs')

const sessions = Number(process.argv[2] || 15)
const length = Number(process.argv[3] || 1000000)

function run () {
  const out = execFileSync(process.execPath, [script, String(length)], { encoding: 'utf8' })
  return JSON.parse(out.trim().split('\n').pop())
}

const runs = []
for (let i = 0; i < sessions; i++) {
  runs.push(run())
  process.stderr.write(`\rsession ${i + 1}/${sessions}   `)
}
process.stderr.write('\n')

const variants = Object.keys(runs[0].results)
const scenarios = Object.keys(runs[0].results[variants[0]])

function median (xs) {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

console.log(`${length.toLocaleString()} iters/scenario, ${sessions} sessions — median ns/op (speedup vs WV0)\n`)
console.log(['scenario'.padEnd(28)].concat(variants.map((v) => v.padStart(15))).join(''))
for (const s of scenarios) {
  const base = median(runs.map((r) => r.results.WV0[s]))
  const cells = [s.padEnd(28)]
  for (const v of variants) {
    const m = median(runs.map((r) => r.results[v][s]))
    const rel = v === 'WV0' ? '' : ' ' + (base / m).toFixed(2) + 'x'
    cells.push((m.toFixed(1) + rel).padStart(15))
  }
  console.log(cells.join(''))
}
console.log('\nWV0 shipped · WV1 min-length prefilter · WV2 single-* matcher · WV3 single-* suffix-first')
