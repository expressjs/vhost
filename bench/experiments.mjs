// Experiment: can the static-hostname match be made faster while staying
// byte-for-byte behavior-identical? Each variant builds the SAME anchored,
// case-insensitive regexp as the shipped code and only changes how a static
// (no-'*') hostname decides "match or not". Run:
//
//   node bench/experiments.mjs <length> <sessions>
//
// Emits one JSON line of ns/op per variant. bench/run-experiments.mjs spawns
// sessions and aggregates. Correctness is asserted up front (cheap) so a
// behavior-breaking variant fails loudly instead of posting a fast-but-wrong
// number.

import assert from 'node:assert'

const length = Number(process.argv[2] || 1000000)

const ASTERISK_REGEXP = /\*/g
const ASTERISK_REPLACE = '([^.]+)'
const END_ANCHORED_REGEXP = /(?:^|[^\\])(?:\\\\)*\$$/
const ESCAPE_REGEXP = /([.+?^=!:${}()|[\]/\\])/g
const ESCAPE_REPLACE = '\\$1'

function isregexp (val) {
  return Object.prototype.toString.call(val) === '[object RegExp]'
}

function isAscii (str) {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0x7f) return false
  }
  return true
}

function hostregexp (val) {
  let source = !isregexp(val)
    ? String(val).replace(ESCAPE_REGEXP, ESCAPE_REPLACE).replace(ASTERISK_REGEXP, ASTERISK_REPLACE)
    : val.source
  if (source[0] !== '^') source = '^' + source
  if (!END_ANCHORED_REGEXP.test(source)) source += '$'
  return new RegExp(source, 'i')
}

function hostnameof (host) {
  if (!host) return undefined
  const offset = host[0] === '[' ? host.indexOf(']') + 1 : 0
  const index = host.indexOf(':', offset)
  return index !== -1 ? host.substring(0, index) : host
}

// --- Variant V0: shipped behavior (regexp.test) -------------------------
function makeV0 (hostname, handle) {
  const regexp = hostregexp(hostname)
  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const name = hostnameof(host)
    if (!name || !regexp.test(name)) return next()
    const obj = Object.create(null)
    obj.host = host
    obj.hostname = name
    obj.length = 0
    req.vhost = obj
    handle(req, res, next)
  }
}

// --- Variant V1: `name === lowered` accept-prefilter, else regexp -------
// Only ever ACCEPTS early; any non-equal input falls through to the identical
// regexp.test, so behavior is provably preserved.
function makeV1 (hostname, handle) {
  const regexp = hostregexp(hostname)
  const lowered = hostname.toLowerCase()
  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const name = hostnameof(host)
    if (!name) return next()
    if (name !== lowered && !regexp.test(name)) return next()
    const obj = Object.create(null)
    obj.host = host
    obj.hostname = name
    obj.length = 0
    req.vhost = obj
    handle(req, res, next)
  }
}

// --- Variant V2: single-pass ASCII fold compare, regex fallback ---------
// Length mismatch is a proven non-match (simple folding is 1:1, no astral char
// folds to ASCII). Non-ASCII code unit at a pattern position -> defer to regex.
function makeV2 (hostname, handle) {
  const regexp = hostregexp(hostname)
  const lowered = hostname.toLowerCase()
  const asciiPattern = isAscii(hostname)
  const llen = lowered.length

  function matches (name) {
    if (!asciiPattern) return regexp.test(name)
    if (name.length !== llen) return false
    for (let i = 0; i < llen; i++) {
      let c = name.charCodeAt(i)
      if (c > 127) return regexp.test(name) // could fold to ASCII (e.g. Kelvin)
      if (c >= 65 && c <= 90) c += 32
      if (c !== lowered.charCodeAt(i)) return false
    }
    return true
  }

  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const name = hostnameof(host)
    if (!name || !matches(name)) return next()
    const obj = Object.create(null)
    obj.host = host
    obj.hostname = name
    obj.length = 0
    req.vhost = obj
    handle(req, res, next)
  }
}

// --- Variant V3: ASCII-gated length-check + exact-equal + regex fallback -
// Combines V1's lowercase-hit win and V2's no-match win without V2's per-char
// loop on the matching path. ALL shortcuts gated on an ASCII pattern: only then
// is simple case folding guaranteed length-preserving (no `İ`->`i̇`, no astral
// folds) and is `name === lowered` a safe accept. Non-ASCII patterns defer
// wholly to regexp.test.
function makeV3 (hostname, handle) {
  const regexp = hostregexp(hostname)
  const asciiPattern = isAscii(hostname)
  const lowered = asciiPattern ? hostname.toLowerCase() : null
  const llen = lowered === null ? -1 : lowered.length

  function matches (name) {
    if (!asciiPattern) return regexp.test(name)
    if (name.length !== llen) return false // length-preserving fold => proven miss
    if (name === lowered) return true // proven hit (ASCII, 1:1 fold)
    return regexp.test(name) // mixed case: identical fallback
  }

  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const name = hostnameof(host)
    if (!name || !matches(name)) return next()
    const obj = Object.create(null)
    obj.host = host
    obj.hostname = name
    obj.length = 0
    req.vhost = obj
    handle(req, res, next)
  }
}

const VARIANTS = { V0: makeV0, V1: makeV1, V2: makeV2, V3: makeV3 }

// --- Correctness gate: every variant must agree with V0 on a battery -----
const KELVIN = String.fromCodePoint(0x212a) // U+212A folds to ASCII 'k'
const DOTLESS_I_UP = String.fromCodePoint(0x0130) // 'İ' .toLowerCase() => 'i̇' (2 chars!)
const CASES = [
  ['mail.example.com', 'mail.example.com', true],
  ['mail.example.com', 'MAIL.EXAMPLE.COM', true],
  ['mail.example.com', 'Mail.Example.Com', true],
  ['mail.example.com', 'mail.example.com:8080', true],
  ['mail.example.com', 'other.example.com', false],
  ['mail.example.com', 'mail.example.co', false],
  ['mail.example.com', 'mail.example.comX', false],
  ['k.com', KELVIN + '.com', false], // Kelvin must NOT match ASCII k
  ['k.com', 'k.com', true],
  // Length-changing fold: an ungated `name===pattern.toLowerCase()` prefilter
  // would build a 2-char `lowered` and could mis-handle this; the regex (and any
  // length-gated variant) treats it as a non-match against the 1-char pattern.
  ['i.com', DOTLESS_I_UP + '.com', false],
  ['[::1]', '[::1]', true],
  ['[::1]', '[::1]:8080', true],
  ['a+b.com', 'a+b.com', true],
  ['a+b.com', 'aaab.com', false],
  ['café.example', 'café.example', true], // non-ASCII pattern
  ['café.example', 'CAFÉ.example', true] // non-ASCII, case-insensitive via regex
]

for (const [name, key] of Object.entries(VARIANTS)) {
  for (const [pattern, host, expectMatch] of CASES) {
    const req = { headers: { host } }
    let handled = false
    const mw = key(pattern, () => { handled = true })
    mw(req, {}, () => {})
    assert.strictEqual(
      handled, expectMatch,
      `${name}: pattern=${JSON.stringify(pattern)} host=${JSON.stringify(host)} expected match=${expectMatch}`
    )
  }
}

// --- Timing ------------------------------------------------------------
const res = {}
const noop = () => {}
const handle = () => {}
const reqWith = (host) => ({ headers: { host } })

// Two representative request shapes for the static path: an already-lowercase
// host (the realistic common case) and a mixed-case host (regex still needed).
const SCENARIOS = {
  'static lower hit': (mk) => [mk('mail.example.com', handle), reqWith('mail.example.com')],
  'static mixed hit': (mk) => [mk('mail.example.com', handle), reqWith('MAIL.example.com')],
  'static no-match': (mk) => [mk('mail.example.com', handle), reqWith('other.example.com')]
}

function timeOne (mw, req) {
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < length; i++) {
    req.vhost = undefined
    mw(req, res, noop)
  }
  return Number(process.hrtime.bigint() - t0) / length
}

// warm
for (const make of Object.values(VARIANTS)) {
  for (const build of Object.values(SCENARIOS)) timeOne(...build(make))
}

const out = { length, results: {} }
for (const [vname, make] of Object.entries(VARIANTS)) {
  out.results[vname] = {}
  for (const [sname, build] of Object.entries(SCENARIOS)) {
    out.results[vname][sname] = timeOne(...build(make))
  }
}
process.stdout.write(JSON.stringify(out) + '\n')
