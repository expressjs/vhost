/*!
 * vhost
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * Copyright(c) 2025 vhost contributors
 * MIT Licensed
 */

/**
 * The object assigned to `req.vhost` when a request matches.
 *
 * Numeric keys `0..length-1` hold the captured wildcard / RegExp group values.
 */
export interface VHost {
  /**
   * The host value the request was routed by: `req.hostname` when the
   * framework provided one, otherwise the raw `Host` header (port included).
   */
  host: string
  /** The routed host with any port stripped. */
  hostname: string
  /** The number of captured wildcards / RegExp groups. */
  length: number
  /** Captured values, indexed `0..length-1`. */
  [index: number]: string
}

/**
 * The minimal request shape the middleware needs. `http.IncomingMessage` and
 * the Express / connect request objects are all structurally assignable to it,
 * so consumers pass their real request without casting.
 */
export interface VHostRequest {
  headers: { host?: string | undefined }
  /**
   * Framework-resolved hostname, e.g. Express 5's `req.hostname`. When present
   * it takes precedence over the `Host` header, so the middleware works behind
   * reverse proxies when `trust proxy` resolves `X-Forwarded-Host`.
   */
  hostname?: string | undefined
  vhost?: VHost
}

/** A middleware / handler function, framework-agnostic over the response type. */
export type VHostHandle<Req extends VHostRequest = VHostRequest, Res = unknown> = (
  req: Req,
  res: Res,
  next: (err?: unknown) => void
) => void

const ASTERISK_REGEXP = /\*/g
const ASTERISK_REPLACE = '([^.]+)'
const END_ANCHORED_REGEXP = /(?:^|[^\\])(?:\\\\)*\$$/
const ESCAPE_REGEXP = /([.+?^=!:${}()|[\]/\\])/g
const ESCAPE_REPLACE = '\\$1'

/**
 * Create a vhost middleware that hands the request to `handle` when the
 * incoming `Host` matches `hostname`, otherwise calls `next()`.
 *
 * @param hostname A literal hostname (with optional `*` wildcards) or a RegExp.
 * @param handle The handler invoked as `handle(req, res, next)` on a match.
 */
export default function vhost<Req extends VHostRequest = VHostRequest, Res = unknown> (
  hostname: string | RegExp,
  handle: VHostHandle<Req, Res>
): VHostHandle<Req, Res> {
  if (!hostname) {
    throw new TypeError('argument hostname is required')
  }

  if (!handle) {
    throw new TypeError('argument handle is required')
  }

  if (typeof handle !== 'function') {
    throw new TypeError('argument handle must be a function')
  }

  // Compile the same anchored, case-insensitive RegExp the library has always
  // used. A static string (no '*') compiles to a zero-group RegExp.
  const regexp = hostregexp(hostname)

  // Fast path: an exact hostname has no captures, so the result is always the
  // fixed shape { host, hostname, length: 0 } and matching is a boolean test.
  //
  // For an *ASCII* literal we can decide most requests without touching the
  // regex, while staying byte-for-byte identical to `regexp.test(name)`:
  //   - Different length => guaranteed non-match. RegExp `i` uses Unicode
  //     *simple* case folding, which is 1:1 (length-preserving) and never folds
  //     an astral or multi-char sequence into an ASCII pattern, so a length
  //     mismatch can never be a match.
  //   - `name === lowered` => guaranteed match (ASCII, 1:1 fold).
  //   - otherwise (mixed case) => defer to the identical `regexp.test`.
  // This is gated on an ASCII pattern because non-ASCII case folding can change
  // length (e.g. 'İ'.toLowerCase() is two code units) and because code points
  // such as U+212A (Kelvin) fold to ASCII under the regex but NOT under
  // toLowerCase() — so a naive lowercase compare would change matching. Non-
  // ASCII patterns therefore fall back wholly to the regex.
  const isStatic = typeof hostname === 'string' && hostname.indexOf('*') === -1

  if (isStatic) {
    const asciiPattern = isAscii(hostname)
    const lowered = hostname.toLowerCase()
    const loweredLen = lowered.length

    const isMatch = asciiPattern
      ? (name: string): boolean => {
          if (name.length !== loweredLen) return false
          return name === lowered || regexp.test(name)
        }
      : (name: string): boolean => regexp.test(name)

    return function vhost (req, res, next) {
      const host = hostof(req)

      if (!host) {
        return next()
      }

      const name = hostnameof(host)

      if (!name || !isMatch(name)) {
        return next()
      }

      const obj = Object.create(null) as VHost
      obj.host = host
      obj.hostname = name
      obj.length = 0

      req.vhost = obj
      handle(req, res, next)
    }
  }

  // Wildcard string path. The result carries the captured groups, so the regex
  // (and its capture extraction) is still the matcher — but a match can never be
  // shorter than the pattern's literal characters plus one char per `*`, so a
  // cheap length check rejects too-short hostnames before running the regex.
  // This only ever *rejects*; anything long enough falls through to the
  // identical regex path, so behaviour is unchanged. (Replacing the regex with a
  // hand-rolled string matcher was tried and measured slower: the contract's
  // `Object.create(null)` result allocation dominates and dwarfs any saving from
  // avoiding `exec`, so the extra string work was pure overhead — see
  // BENCHMARKS.md.)
  if (typeof hostname === 'string') {
    // Each `*` matches >= 1 character and every other character is a literal, so
    // the shortest possible match has exactly `hostname.length` characters (one
    // per `*` plus every literal). Shorter hostnames cannot match.
    const minLen = hostname.length

    return function vhost (req, res, next) {
      const host = hostof(req)

      if (!host) {
        return next()
      }

      const name = hostnameof(host)

      if (!name || name.length < minLen) {
        return next()
      }

      const vhostdata = vhostof(host, name, regexp)

      if (!vhostdata) {
        return next()
      }

      req.vhost = vhostdata
      handle(req, res, next)
    }
  }

  // RegExp hostname: unchanged regex path.
  return function vhost (req, res, next) {
    const host = hostof(req)

    if (!host) {
      return next()
    }

    const name = hostnameof(host)

    if (!name) {
      return next()
    }

    const vhostdata = vhostof(host, name, regexp)

    if (!vhostdata) {
      return next()
    }

    req.vhost = vhostdata
    handle(req, res, next)
  }
}

/**
 * Get the host value to route by: the framework-resolved `req.hostname`
 * (Express 5, respects `trust proxy` / `X-Forwarded-Host`) when present,
 * otherwise the raw `Host` header.
 */
function hostof (req: VHostRequest): string | undefined {
  return req.hostname || req.headers.host
}

/**
 * Get the hostname (port stripped) from a raw `Host` header value, handling
 * IPv6 literals such as `[::1]:8080`. Values from `req.hostname` are already
 * port-free (and IPv6 literals stay bracketed), so re-parsing them here is a
 * no-op.
 */
function hostnameof (host: string): string | undefined {
  if (!host) {
    return undefined
  }

  const offset = host[0] === '['
    ? host.indexOf(']') + 1
    : 0
  const index = host.indexOf(':', offset)

  return index !== -1
    ? host.substring(0, index)
    : host
}

/** Determine whether a value is a RegExp (cross-realm safe). */
function isregexp (val: unknown): boolean {
  return Object.prototype.toString.call(val) === '[object RegExp]'
}

/** Determine whether every code unit of a string is ASCII (<= 0x7f). */
function isAscii (str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0x7f) {
      return false
    }
  }
  return true
}

/**
 * Build the anchored, case-insensitive RegExp for a hostname value. String
 * values have their RegExp metacharacters escaped and `*` turned into a
 * single-label capture; RegExp values are reused and forced to anchor.
 */
function hostregexp (val: string | RegExp): RegExp {
  let source = !isregexp(val)
    ? String(val).replace(ESCAPE_REGEXP, ESCAPE_REPLACE).replace(ASTERISK_REGEXP, ASTERISK_REPLACE)
    : (val as RegExp).source

  // force leading anchor matching
  if (source[0] !== '^') {
    source = '^' + source
  }

  // force trailing anchor matching
  if (!END_ANCHORED_REGEXP.test(source)) {
    source += '$'
  }

  return new RegExp(source, 'i')
}

/**
 * Match the (already extracted, port-stripped) `hostname` against `regexp` and
 * build the `req.vhost` object, copying any capture groups onto numeric keys.
 * `host` is the raw header value used for `obj.host`.
 */
function vhostof (host: string, hostname: string, regexp: RegExp): VHost | undefined {
  const match = regexp.exec(hostname)

  if (!match) {
    return undefined
  }

  const obj = Object.create(null) as VHost

  obj.host = host
  obj.hostname = hostname
  obj.length = match.length - 1

  for (let i = 1; i < match.length; i++) {
    obj[i - 1] = match[i] as string
  }

  return obj
}
