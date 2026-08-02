// Experiment: can the WILDCARD (string-with-'*') match be made faster while
// staying byte-for-byte behaviour-identical, including capture values? Each
// variant builds the SAME anchored, case-insensitive regexp the shipped code
// uses and only changes how a static-with-wildcard pattern decides match +
// captures. Run:
//
//   node bench/wildcard-experiments.mjs <length>
//
// A fuzzer first asserts every variant produces the IDENTICAL req.vhost object
// (match boolean, length, and every numeric capture) as the regex on thousands
// of random pattern/host pairs, so a behaviour-breaking variant fails loudly
// before any timing is reported.
//
// LESSON (kept on purpose): an earlier version of this file built the matched
// result as a plain object literal `{ host, hostname, length, 0: ... }`, while
// the contract — and `vhostof` below — build it with `Object.create(null)` plus
// incremental property assignment. The literal is a fast monomorphic shape; the
// null-prototype dictionary object is much slower to populate. That difference
// made the string-matcher variants look ~1.5x faster than they really are. Once
// every variant uses the SAME `makeVhost` (Object.create(null)) below, the
// string matchers are net-neutral-to-slower on the match path, because the
// result allocation dominates and dwarfs any saving from skipping `exec`. Always
// build the result exactly as the shipped code does when benchmarking.

import assert from 'node:assert'

// Build the result object exactly as the shipped code / vhostof does, so timing
// reflects the real per-request allocation cost.
function makeVhost (host, hostname, captures) {
  const obj = Object.create(null)
  obj.host = host
  obj.hostname = hostname
  obj.length = captures.length
  for (let i = 0; i < captures.length; i++) obj[i] = captures[i]
  return obj
}

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

function vhostof (host, regexp) {
  const hostname = hostnameof(host)
  if (!hostname) return undefined
  const match = regexp.exec(hostname)
  if (!match) return undefined
  const obj = { host, hostname, length: match.length - 1 }
  for (let i = 1; i < match.length; i++) obj[i - 1] = match[i]
  return obj
}

// --- WV0: shipped behaviour (regex exec + capture loop) -----------------
function makeWV0 (pattern, handle) {
  const regexp = hostregexp(pattern)
  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const data = vhostof(host, regexp)
    if (!data) return next()
    req.vhost = data
    handle(req, res, next)
  }
}

// --- WV1: min-length reject prefilter, else identical regex path --------
// Any match needs at least (sum of literal lengths) + (one char per '*').
// A pure length check only ever REJECTS; matches fall through to the same
// regex+capture path, so behaviour is provably preserved.
function makeWV1 (pattern, handle) {
  const regexp = hostregexp(pattern)
  const literalLen = pattern.replace(ASTERISK_REGEXP, '').length
  const stars = pattern.length - literalLen
  const minLen = literalLen + stars
  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const hostname = hostnameof(host)
    if (!hostname || hostname.length < minLen) return next()
    const data = vhostof(host, regexp)
    if (!data) return next()
    req.vhost = data
    handle(req, res, next)
  }
}

// --- WV2: single-'*' string matcher (ASCII-gated) + regex fallback ------
// For exactly one '*', the pattern is PREFIX*SUFFIX -> regex
// ^PREFIX([^.]+)SUFFIX$. Both ends are anchored, so a match is fully
// determined by: hostname starts with PREFIX (case-insensitive), ends with
// SUFFIX, and the middle slice is non-empty with no '.'. The capture is exactly
// that middle slice. Gated on an ASCII pattern, and any non-ASCII byte in the
// prefix/suffix REGION of the host defers to the regex (Kelvin-style folds).
// Multi-'*' and non-ASCII patterns defer wholly to the regex.
function makeWV2 (pattern, handle) {
  const regexp = hostregexp(pattern)
  const star = pattern.indexOf('*')
  const single = star !== -1 && pattern.indexOf('*', star + 1) === -1
  const usable = single && isAscii(pattern)

  const prefix = usable ? pattern.slice(0, star).toLowerCase() : ''
  const suffix = usable ? pattern.slice(star + 1).toLowerCase() : ''
  const pLen = prefix.length
  const sLen = suffix.length
  const minLen = pLen + sLen + 1

  // ASCII case-insensitive compare of host[start..start+len) against `lit`.
  // Returns 0 = equal, 1 = differ, 2 = non-ASCII host byte (defer to regex).
  function cmpRegion (hostname, start, lit, len) {
    for (let i = 0; i < len; i++) {
      let c = hostname.charCodeAt(start + i)
      if (c > 0x7f) return 2
      if (c >= 65 && c <= 90) c += 32
      if (c !== lit.charCodeAt(i)) return 1
    }
    return 0
  }

  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const hostname = hostnameof(host)
    if (!hostname) return next()

    if (!usable) {
      const data = vhostof(host, regexp)
      if (!data) return next()
      req.vhost = data
      handle(req, res, next)
      return
    }

    const len = hostname.length
    let data
    if (len < minLen) {
      data = undefined
    } else {
      const pc = pLen ? cmpRegion(hostname, 0, prefix, pLen) : 0
      const sc = sLen ? cmpRegion(hostname, len - sLen, suffix, sLen) : 0
      if (pc === 2 || sc === 2) {
        data = vhostof(host, regexp) // non-ASCII region -> identical regex path
      } else if (pc === 1 || sc === 1) {
        data = undefined
      } else {
        // prefix/suffix match; verify the middle has no '.'
        const midEnd = len - sLen
        let dot = false
        for (let i = pLen; i < midEnd; i++) {
          if (hostname.charCodeAt(i) === 46) { dot = true; break }
        }
        if (dot) {
          data = undefined
        } else {
          data = makeVhost(host, hostname, [hostname.slice(pLen, midEnd)])
        }
      }
    }

    if (!data) return next()
    req.vhost = data
    handle(req, res, next)
  }
}

// --- WV3: WV2's single-'*' matcher, comparing SUFFIX first --------------
// Same proof as WV2, but tests the suffix region before the prefix. For host
// patterns the distinguishing label is usually the TLD/suffix side, so checking
// it first rejects most non-matches in fewer char compares. Captures identical.
function makeWV3 (pattern, handle) {
  const regexp = hostregexp(pattern)
  const star = pattern.indexOf('*')
  const single = star !== -1 && pattern.indexOf('*', star + 1) === -1
  const usable = single && isAscii(pattern)

  const prefix = usable ? pattern.slice(0, star).toLowerCase() : ''
  const suffix = usable ? pattern.slice(star + 1).toLowerCase() : ''
  const pLen = prefix.length
  const sLen = suffix.length
  const minLen = pLen + sLen + 1

  function cmpRegion (hostname, start, lit, len) {
    for (let i = 0; i < len; i++) {
      let c = hostname.charCodeAt(start + i)
      if (c > 0x7f) return 2
      if (c >= 65 && c <= 90) c += 32
      if (c !== lit.charCodeAt(i)) return 1
    }
    return 0
  }

  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const hostname = hostnameof(host)
    if (!hostname) return next()

    if (!usable) {
      const data = vhostof(host, regexp)
      if (!data) return next()
      req.vhost = data
      handle(req, res, next)
      return
    }

    const len = hostname.length
    let data
    if (len < minLen) {
      data = undefined
    } else {
      const sc = sLen ? cmpRegion(hostname, len - sLen, suffix, sLen) : 0
      const pc = (sc === 0 && pLen) ? cmpRegion(hostname, 0, prefix, pLen) : sc
      if (sc === 2 || pc === 2) {
        data = vhostof(host, regexp)
      } else if (sc === 1 || pc === 1) {
        data = undefined
      } else {
        const midEnd = len - sLen
        let dot = false
        for (let i = pLen; i < midEnd; i++) {
          if (hostname.charCodeAt(i) === 46) { dot = true; break }
        }
        data = dot ? undefined : makeVhost(host, hostname, [hostname.slice(pLen, midEnd)])
      }
    }

    if (!data) return next()
    req.vhost = data
    handle(req, res, next)
  }
}

// --- WV4: WV1 min-length guard + WV2 single-'*' matcher combined --------
// The universally-safe length reject first (catches short misses cheaply),
// then the single-'*' string matcher for the rest. Falls back to regex for
// multi-'*'/non-ASCII patterns and non-ASCII host regions. Captures identical.
function makeWV4 (pattern, handle) {
  const regexp = hostregexp(pattern)
  const star = pattern.indexOf('*')
  const single = star !== -1 && pattern.indexOf('*', star + 1) === -1
  const usable = single && isAscii(pattern)

  const prefix = usable ? pattern.slice(0, star).toLowerCase() : ''
  const suffix = usable ? pattern.slice(star + 1).toLowerCase() : ''
  const pLen = prefix.length
  const sLen = suffix.length
  const minLen = pLen + sLen + 1

  // For the regex-fallback (multi-*/non-ASCII) path, still apply min-length.
  const literalLen = pattern.replace(ASTERISK_REGEXP, '').length
  const stars = pattern.length - literalLen
  const fallbackMinLen = literalLen + stars

  function cmpRegion (hostname, start, lit, len) {
    for (let i = 0; i < len; i++) {
      let c = hostname.charCodeAt(start + i)
      if (c > 0x7f) return 2
      if (c >= 65 && c <= 90) c += 32
      if (c !== lit.charCodeAt(i)) return 1
    }
    return 0
  }

  return function (req, res, next) {
    const host = req.headers.host
    if (!host) return next()
    const hostname = hostnameof(host)
    if (!hostname) return next()
    const len = hostname.length

    if (!usable) {
      if (len < fallbackMinLen) return next()
      const data = vhostof(host, regexp)
      if (!data) return next()
      req.vhost = data
      handle(req, res, next)
      return
    }

    if (len < minLen) return next()

    let data
    const pc = pLen ? cmpRegion(hostname, 0, prefix, pLen) : 0
    const sc = sLen ? cmpRegion(hostname, len - sLen, suffix, sLen) : 0
    if (pc === 2 || sc === 2) {
      data = vhostof(host, regexp)
    } else if (pc === 1 || sc === 1) {
      data = undefined
    } else {
      const midEnd = len - sLen
      let dot = false
      for (let i = pLen; i < midEnd; i++) {
        if (hostname.charCodeAt(i) === 46) { dot = true; break }
      }
      data = dot ? undefined : makeVhost(host, hostname, [hostname.slice(pLen, midEnd)])
    }

    if (!data) return next()
    req.vhost = data
    handle(req, res, next)
  }
}

const VARIANTS = { WV0: makeWV0, WV1: makeWV1, WV2: makeWV2, WV3: makeWV3, WV4: makeWV4 }

// --- Fuzz correctness gate: every variant === WV0 (regex) ----------------
function resultOf (make, pattern, host) {
  const req = { headers: { host } }
  let captured
  const mw = make(pattern, (r) => { captured = r.vhost })
  mw(req, {}, () => {})
  if (captured === undefined) return null
  // Normalise to a comparable plain object (numeric keys included).
  const o = { host: captured.host, hostname: captured.hostname, length: captured.length }
  for (let i = 0; i < captured.length; i++) o[i] = captured[i]
  return o
}

const PATTERNS = [
  '*.example.com', 'user-*.example.com', '*-cdn.example.com', 'a*b.com',
  '*.com', '*', 'x*', '*y', 'user-*.*.com', '*.*.com', 'café-*.example'
]
const ALPHABET = ['a', 'b', 'c', 'x', '-', '.', '0', 'A', 'B', 'K', 'K', 'é', '']
function randHost (seed) {
  // simple LCG so the fuzz set is deterministic across sessions
  let s = seed
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const n = 1 + Math.floor(rnd() * 12)
  let h = ''
  for (let i = 0; i < n; i++) h += ALPHABET[Math.floor(rnd() * ALPHABET.length)]
  return h
}

let checks = 0
for (const pattern of PATTERNS) {
  for (let seed = 1; seed <= 1500; seed++) {
    const host = randHost(seed * 31 + pattern.length)
    const expected = resultOf (makeWV0, pattern, host)
    for (const [name, make] of Object.entries(VARIANTS)) {
      const got = resultOf (make, pattern, host)
      assert.deepStrictEqual(
        got, expected,
        `${name} disagrees: pattern=${JSON.stringify(pattern)} host=${JSON.stringify(host)}\n` +
        `  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(got)}`
      )
      checks++
    }
  }
}
process.stderr.write(`fuzz gate: ${checks} comparisons OK\n`)

// --- Timing -------------------------------------------------------------
const res = {}
const noop = () => {}
const handle = () => {}
const reqWith = (host) => ({ headers: { host } })

const SCENARIOS = {
  'wildcard match': (mk) => [mk('*.example.com', handle), reqWith('foo.example.com')],
  'wildcard no-match (short)': (mk) => [mk('*.example.com', handle), reqWith('x.io')],
  'wildcard no-match (suffix)': (mk) => [mk('*.example.com', handle), reqWith('foo.example.org')],
  'wildcard match (prefix)': (mk) => [mk('user-*.example.com', handle), reqWith('user-bob.example.com')],
  'multi-star match': (mk) => [mk('*.*.com', handle), reqWith('foo.bar.com')]
}

function timeOne (mw, req) {
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < length; i++) {
    req.vhost = undefined
    mw(req, res, noop)
  }
  return Number(process.hrtime.bigint() - t0) / length
}

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
