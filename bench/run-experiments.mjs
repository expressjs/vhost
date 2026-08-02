// Spawn N independent sessions of bench/experiments.mjs and aggregate, so the
// variant comparison reflects cross-session variance rather than one warm JIT.
//
//   node bench/run-experiments.mjs [sessions] [length]

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const script = join(__dirname, 'experiments.mjs')

const sessions = Number(process.argv[2] || 8)
const length = Number(process.argv[3] || 1000000)

function run () {
  const out = execFileSync(process.execPath, [script, String(length)], { encoding: 'utf8' })
  return JSON.parse(out.trim().split('\n').pop())
}

const runs = []
for (let i = 0; i < sessions; i++) runs.push(run())

const variants = Object.keys(runs[0].results)
const scenarios = Object.keys(runs[0].results[variants[0]])

function mean (xs) { return xs.reduce((a, b) => a + b, 0) / xs.length }
function sd (xs) { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) }

console.log(`${length.toLocaleString()} iters/scenario, ${sessions} sessions — ns/op (mean, ±sd%)\n`)
const header = ['scenario'.padEnd(18)].concat(variants.map((v) => v.padStart(16))).join('')
console.log(header)
for (const s of scenarios) {
  const cells = [s.padEnd(18)]
  const v0mean = mean(runs.map((r) => r.results.V0[s]))
  for (const v of variants) {
    const xs = runs.map((r) => r.results[v][s])
    const m = mean(xs)
    const rel = v === 'V0' ? '' : ' ' + (v0mean / m).toFixed(2) + 'x'
    cells.push((m.toFixed(1) + '±' + ((sd(xs) / m) * 100).toFixed(0) + '%' + rel).padStart(16))
  }
  console.log(cells.join(''))
}
console.log('\n(xN = speedup vs V0, the currently shipped regexp.test path)')
