import { Bench } from 'tinybench'
import vhost from 'vhost'

// A no-op response object and next; handlers must not do real I/O so we
// measure only the middleware's matching + req.vhost population cost.
const res = {}
function noop () {}
function handle () {}

// Build a fresh request per scenario. Reusing one object is fine because the
// middleware only reads req.headers.host and writes req.vhost.
function reqWith (host) {
  return { headers: { host } }
}

// Middlewares under test.
const staticMw = vhost('mail.example.com', handle)
const wildcardMw = vhost('*.example.com', handle)
const regexpMw = vhost(/user-(bob|joe)\.([^.]+)\.example\.com/, handle)

// Pre-built requests.
const staticHit = reqWith('mail.example.com')
const staticMiss = reqWith('other.example.com')
const wildcardHit = reqWith('foo.example.com')
const regexpHit = reqWith('user-bob.team.example.com')
const noHost = reqWith(undefined)

const bench = new Bench({ time: 1000, warmupTime: 200, warmupIterations: 100 })

bench
  .add('static match', () => {
    staticHit.vhost = undefined
    staticMw(staticHit, res, noop)
  })
  .add('static no-match', () => {
    staticMiss.vhost = undefined
    staticMw(staticMiss, res, noop)
  })
  .add('wildcard match', () => {
    wildcardHit.vhost = undefined
    wildcardMw(wildcardHit, res, noop)
  })
  .add('regexp match', () => {
    regexpHit.vhost = undefined
    regexpMw(regexpHit, res, noop)
  })
  .add('no Host header', () => {
    noHost.vhost = undefined
    staticMw(noHost, res, noop)
  })

await bench.run()

const rows = bench.tasks.map((t) => ({
  scenario: t.name,
  'ops/sec': Math.round(t.result.hz).toLocaleString('en-US'),
  'ns/op': (t.result.mean * 1e6).toFixed(1),
  samples: t.result.samples.length
}))

console.table(rows)

// Emit a machine-readable line so a wrapper can capture results if desired.
console.log('\nJSON:' + JSON.stringify(bench.tasks.map((t) => ({
  scenario: t.name,
  hz: t.result.hz,
  nsPerOp: t.result.mean * 1e6
}))))
