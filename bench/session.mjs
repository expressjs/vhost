// One benchmark session. Run as a fresh process so JIT/GC state is independent
// between sessions:
//
//   node bench/session.mjs <length>
//
// Times <length> iterations of each scenario for both the v3 baseline and the
// current build, and prints a single JSON line of ns/op figures on stdout.
// All human-readable orchestration lives in run-matrix.mjs.

import { createRequire } from 'node:module'
import vhostNew from 'vhost'

const require = createRequire(import.meta.url)
const vhostOld = require('./v3-baseline.cjs')

const length = Number(process.argv[2] || 100000)

const res = {}
const noop = () => {}
const handle = () => {}
const reqWith = (host) => ({ headers: { host } })

function build (vhost) {
  return {
    'static match': [vhost('mail.example.com', handle), reqWith('mail.example.com')],
    'static no-match': [vhost('mail.example.com', handle), reqWith('other.example.com')],
    'wildcard match': [vhost('*.example.com', handle), reqWith('foo.example.com')],
    'wildcard match (prefix)': [vhost('user-*.example.com', handle), reqWith('user-bob.example.com')],
    'wildcard no-match (short)': [vhost('*.example.com', handle), reqWith('x.io')],
    'wildcard no-match (suffix)': [vhost('*.example.com', handle), reqWith('foo.example.org')],
    'multi-star match': [vhost('*.*.com', handle), reqWith('foo.bar.com')],
    'regexp match': [vhost(/user-(bob|joe)\.([^.]+)\.example\.com/, handle), reqWith('user-bob.team.example.com')],
    'no Host': [vhost('mail.example.com', handle), reqWith(undefined)]
  }
}

// Time a single uninterrupted loop of `length` calls; return ns per op.
function timeOne (mw, req) {
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < length; i++) {
    req.vhost = undefined
    mw(req, res, noop)
  }
  return Number(process.hrtime.bigint() - t0) / length
}

const SCENARIOS = [
  'static match',
  'static no-match',
  'wildcard match',
  'wildcard match (prefix)',
  'wildcard no-match (short)',
  'wildcard no-match (suffix)',
  'multi-star match',
  'regexp match',
  'no Host'
]
const old = build(vhostOld)
const nw = build(vhostNew)

// Warm both implementations so the timed loop measures steady-state JIT output.
for (const s of SCENARIOS) {
  timeOne(...old[s])
  timeOne(...nw[s])
}

const out = { length, scenarios: {} }
for (const s of SCENARIOS) {
  // Interleave old/new per scenario so each pair sees the same machine state.
  const o = timeOne(...old[s])
  const n = timeOne(...nw[s])
  out.scenarios[s] = { old: o, new: n }
}

process.stdout.write(JSON.stringify(out) + '\n')
