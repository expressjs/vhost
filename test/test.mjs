import assert from 'node:assert'
import http from 'node:http'
import { describe, it } from 'node:test'
import request from 'supertest'
import vhost from 'vhost'

describe('vhost(hostname, server)', function () {
  it('should route by Host', function (_, done) {
    var vhosts = []

    vhosts.push(vhost('tobi.com', tobi))
    vhosts.push(vhost('loki.com', loki))

    var app = createServer(vhosts)

    function tobi (req, res) { res.end('tobi') }
    function loki (req, res) { res.end('loki') }

    request(app)
      .get('/')
      .set('Host', 'tobi.com')
      .expect(200, 'tobi', done)
  })

  it('should ignore port in Host', function (_, done) {
    var app = createServer('tobi.com', function (req, res) {
      res.end('tobi')
    })

    request(app)
      .get('/')
      .set('Host', 'tobi.com:8080')
      .expect(200, 'tobi', done)
  })

  it('should support IPv6 literal in Host', function (_, done) {
    var app = createServer('[::1]', function (req, res) {
      res.end('loopback')
    })

    request(app)
      .get('/')
      .set('Host', '[::1]:8080')
      .expect(200, 'loopback', done)
  })

  it('should support IPv6 literal in Host without a port', function (_, done) {
    var app = createServer('[::1]', function (req, res) {
      res.end(JSON.stringify({ host: req.vhost.host, hostname: req.vhost.hostname }))
    })

    request(app)
      .get('/')
      .set('Host', '[::1]')
      .expect(200, '{"host":"[::1]","hostname":"[::1]"}', done)
  })

  it('should keep the port on req.vhost.host but strip it from hostname', function (_, done) {
    var app = createServer('tobi.com', function (req, res) {
      res.end(JSON.stringify({ host: req.vhost.host, hostname: req.vhost.hostname }))
    })

    request(app)
      .get('/')
      .set('Host', 'tobi.com:8080')
      .expect(200, '{"host":"tobi.com:8080","hostname":"tobi.com"}', done)
  })

  it('should 404 unless matched', function (_, done) {
    var vhosts = []

    vhosts.push(vhost('tobi.com', tobi))
    vhosts.push(vhost('loki.com', loki))

    var app = createServer(vhosts)

    function tobi (req, res) { res.end('tobi') }
    function loki (req, res) { res.end('loki') }

    request(app)
      .get('/')
      .set('Host', 'ferrets.com')
      .expect(404, done)
  })

  it('should 404 without Host header', function (_, done) {
    var vhosts = []

    vhosts.push(vhost('tobi.com', tobi))
    vhosts.push(vhost('loki.com', loki))

    var server = createServer(vhosts)
    var listeners = server.listeners('request')

    server.removeAllListeners('request')
    listeners.unshift(function (req) { req.headers.host = undefined })
    listeners.forEach(function (l) { server.addListener('request', l) })

    function tobi (req, res) { res.end('tobi') }
    function loki (req, res) { res.end('loki') }

    request(server)
      .get('/')
      .expect(404, 'no vhost for "undefined"', done)
  })

  it('should route the second vhost when the first does not match', function (_, done) {
    var vhosts = []

    vhosts.push(vhost('tobi.com', tobi))
    vhosts.push(vhost('loki.com', loki))

    var app = createServer(vhosts)

    function tobi (req, res) { res.end('tobi') }
    function loki (req, res) { res.end('loki') }

    request(app)
      .get('/')
      .set('Host', 'loki.com')
      .expect(200, 'loki', done)
  })

  it('should call handle with (req, res, next)', function (_, done) {
    var app = http.createServer(function onRequest (req, res) {
      var mw = vhost('tobi.com', function (hreq, hres, hnext) {
        assert.strictEqual(hreq, req)
        assert.strictEqual(hres, res)
        assert.strictEqual(typeof hnext, 'function')
        res.end('ok')
      })

      mw(req, res, function () {
        res.statusCode = 404
        res.end('not handled')
      })
    })

    request(app)
      .get('/')
      .set('Host', 'tobi.com')
      .expect(200, 'ok', done)
  })

  it('should leave req.vhost undefined when no Host header', function (_, done) {
    var app = http.createServer(function onRequest (req, res) {
      req.headers.host = undefined

      var mw = vhost('tobi.com', function (req, res) {
        res.end('handled')
      })

      mw(req, res, function () {
        res.end(String(req.vhost))
      })
    })

    request(app)
      .get('/')
      .expect(200, 'undefined', done)
  })

  describe('with req.hostname (express 5 / reverse proxy)', function () {
    it('should route by req.hostname over the Host header', function (_, done) {
      var vhosts = []

      vhosts.push(vhost('proxied.com', proxied))
      vhosts.push(vhost('direct.com', direct))

      var app = createServer(vhosts, null, function (req) {
        // what express 5 provides with `trust proxy` from X-Forwarded-Host
        req.hostname = 'proxied.com'
      })

      function proxied (req, res) { res.end('proxied') }
      function direct (req, res) { res.end('direct') }

      request(app)
        .get('/')
        .set('Host', 'direct.com')
        .expect(200, 'proxied', done)
    })

    it('should reflect the routed value on req.vhost.host and hostname', function (_, done) {
      var app = createServer('proxied.com', function (req, res) {
        res.end(JSON.stringify({ host: req.vhost.host, hostname: req.vhost.hostname }))
      }, function (req) {
        req.hostname = 'proxied.com'
      })

      request(app)
        .get('/')
        .set('Host', 'direct.com:8080')
        .expect(200, '{"host":"proxied.com","hostname":"proxied.com"}', done)
    })

    it('should match a wildcard against req.hostname and capture from it', function (_, done) {
      var app = createServer('*.proxied.com', function (req, res) {
        res.end(JSON.stringify([req.vhost.length, req.vhost[0], req.vhost.hostname]))
      }, function (req) {
        req.hostname = 'foo.proxied.com'
      })

      request(app)
        .get('/')
        .set('Host', 'direct.com')
        .expect(200, '[1,"foo","foo.proxied.com"]', done)
    })

    it('should match a RegExp against req.hostname', function (_, done) {
      var app = createServer(/user-(bob|joe)\.proxied\.com/, function (req, res) {
        res.end(JSON.stringify([req.vhost.length, req.vhost[0]]))
      }, function (req) {
        req.hostname = 'user-bob.proxied.com'
      })

      request(app)
        .get('/')
        .set('Host', 'direct.com')
        .expect(200, '[1,"bob"]', done)
    })

    it('should 404 when req.hostname does not match', function (_, done) {
      var app = createServer('proxied.com', function (req, res) {
        res.end('proxied')
      }, function (req) {
        // Host header would match, but the resolved hostname wins
        req.hostname = 'other.com'
      })

      request(app)
        .get('/')
        .set('Host', 'proxied.com')
        .expect(404, done)
    })

    it('should fall back to the Host header when req.hostname is empty', function (_, done) {
      var app = createServer('direct.com', function (req, res) {
        res.end('direct')
      }, function (req) {
        req.hostname = ''
      })

      request(app)
        .get('/')
        .set('Host', 'direct.com')
        .expect(200, 'direct', done)
    })

    it('should not re-strip a portless IPv6 req.hostname', function (_, done) {
      // req.hostname is already port-free; re-parsing the bracketed literal
      // must be a no-op, not mangle it to an empty string
      var app = createServer('[::1]', function (req, res) {
        res.end(JSON.stringify({ host: req.vhost.host, hostname: req.vhost.hostname }))
      }, function (req) {
        req.hostname = '[::1]'
      })

      request(app)
        .get('/')
        .set('Host', 'direct.com:8080')
        .expect(200, '{"host":"[::1]","hostname":"[::1]"}', done)
    })

    it('should call next() when neither req.hostname nor Host is present', function (_, done) {
      var app = http.createServer(function onRequest (req, res) {
        req.headers.host = undefined

        var mw = vhost('proxied.com', function (req, res) {
          res.end('handled')
        })

        mw(req, res, function () {
          res.end('next:' + String(req.vhost))
        })
      })

      request(app)
        .get('/')
        .expect(200, 'next:undefined', done)
    })
  })

  describe('arguments', function () {
    describe('hostname', function () {
      it('should be required', function () {
        assert.throws(vhost.bind(), /hostname.*required/)
      })

      it('should reject the empty string', function () {
        assert.throws(vhost.bind(null, '', function () {}), /hostname.*required/)
      })

      it('should accept string', function () {
        assert.doesNotThrow(vhost.bind(null, 'loki.com', function () {}))
      })

      it('should accept RegExp', function () {
        assert.doesNotThrow(vhost.bind(null, /loki\.com/, function () {}))
      })
    })

    describe('handle', function () {
      it('should be required', function () {
        assert.throws(vhost.bind(null, 'loki.com'), /handle.*required/)
      })

      it('should accept function', function () {
        assert.doesNotThrow(vhost.bind(null, 'loki.com', function () {}))
      })

      it('should reject plain object', function () {
        assert.throws(vhost.bind(null, 'loki.com', {}), /handle.*function/)
      })
    })
  })

  describe('with string hostname', function () {
    it('should support wildcards', function (_, done) {
      var app = createServer('*.ferrets.com', function (req, res) {
        res.end('wildcard!')
      })

      request(app)
        .get('/')
        .set('Host', 'loki.ferrets.com')
        .expect(200, 'wildcard!', done)
    })

    it('should restrict wildcards to single part', function (_, done) {
      var app = createServer('*.ferrets.com', function (req, res) {
        res.end('wildcard!')
      })

      request(app)
        .get('/')
        .set('Host', 'foo.loki.ferrets.com')
        .expect(404, done)
    })

    it('should require a wildcard to match at least one character', function (_, done) {
      var app = createServer('*.example.com', function (req, res) {
        res.end('wildcard!')
      })

      request(app)
        .get('/')
        .set('Host', '.example.com')
        .expect(404, done)
    })

    it('should capture a single wildcard', function (_, done) {
      var app = createServer('*.example.com', function (req, res) {
        res.end(JSON.stringify([req.vhost.length, req.vhost[0]]))
      })

      request(app)
        .get('/')
        .set('Host', 'foo.example.com')
        .expect(200, '[1,"foo"]', done)
    })

    it('should capture a wildcard with both a prefix and a suffix', function (_, done) {
      var app = createServer('user-*.example.com', function (req, res) {
        res.end(JSON.stringify([req.vhost.length, req.vhost[0]]))
      })

      request(app)
        .get('/')
        .set('Host', 'user-bob.example.com')
        .expect(200, '[1,"bob"]', done)
    })

    it('should 404 a single-wildcard host with the wrong suffix', function (_, done) {
      var app = createServer('*.example.com', function (req, res) {
        res.end('wildcard!')
      })

      request(app)
        .get('/')
        .set('Host', 'foo.example.org')
        .expect(404, done)
    })

    it('should 404 a single-wildcard host with the wrong prefix', function (_, done) {
      var app = createServer('user-*.example.com', function (req, res) {
        res.end('wildcard!')
      })

      request(app)
        .get('/')
        .set('Host', 'admin-bob.example.com')
        .expect(404, done)
    })

    it('should preserve wildcard case-insensitivity on prefix and suffix', function (_, done) {
      var app = createServer('user-*.example.com', function (req, res) {
        res.end(req.vhost[0])
      })

      request(app)
        .get('/')
        .set('Host', 'USER-Bob.EXAMPLE.COM')
        .expect(200, 'Bob', done)
    })

    it('should match a non-ASCII host against a wildcard via the regex path', function () {
      // Non-ASCII bytes in the literal region defer to the regex (proper
      // Unicode folding). Invoked directly: raw Unicode is not a valid Host
      // header. café-* with host "café-bob.example" must capture "bob".
      var captured
      var mw = vhost('café-*.example', function (req) { captured = req.vhost })
      var req = { headers: { host: 'café-bob.example' } }
      mw(req, {}, function () {})

      assert.ok(captured, 'should match non-ASCII prefix via regex')
      assert.strictEqual(captured.length, 1)
      assert.strictEqual(captured[0], 'bob')
    })

    it('should fold a wildcard suffix like the i-flag, not toLowerCase', function () {
      // U+212A KELVIN in the host suffix region must NOT match ASCII "k" — the
      // fast path defers to the regex on the non-ASCII byte. (Direct call: the
      // byte is rejected by the HTTP client.)
      var kelvin = 'foo.' + String.fromCodePoint(0x212a) + '.com'
      var handled = false
      var mw = vhost('*.k.com', function () { handled = true })
      var req = { headers: { host: kelvin } }
      mw(req, {}, function () {})

      assert.strictEqual(handled, false, 'Kelvin suffix must not match ASCII k')
      assert.strictEqual(req.vhost, undefined)
    })

    it('should treat dot as a dot', function (_, done) {
      var app = createServer('a.b.com', function (req, res) {
        res.end('tobi')
      })

      request(app)
        .get('/')
        .set('Host', 'aXb.com')
        .expect(404, done)
    })

    it('should match a trailing dot literally', function (_, done) {
      var app = createServer('a.b.', function (req, res) {
        res.end('trailing dot')
      })

      request(app)
        .get('/')
        .set('Host', 'a.b.')
        .expect(200, 'trailing dot', done)
    })

    it('should not match a trailing-dot pattern without the dot', function (_, done) {
      var app = createServer('a.b.', function (req, res) {
        res.end('trailing dot')
      })

      request(app)
        .get('/')
        .set('Host', 'a.b')
        .expect(404, done)
    })

    it('should match entire string', function (_, done) {
      var app = createServer('.com', function (req, res) {
        res.end('commercial')
      })

      request(app)
        .get('/')
        .set('Host', 'foo.com')
        .expect(404, done)
    })

    it('should treat "+" as a literal', function (_, done) {
      var app = createServer('a+b.com', function (req, res) {
        res.end('plus')
      })

      request(app)
        .get('/')
        .set('Host', 'a+b.com')
        .expect(200, 'plus', done)
    })

    it('should not interpret "+" as a quantifier', function (_, done) {
      var app = createServer('a+b.com', function (req, res) {
        res.end('plus')
      })

      request(app)
        .get('/')
        .set('Host', 'aaab.com')
        .expect(404, done)
    })

    it('should escape regexp metacharacters', function (_, done) {
      var app = createServer('a(b)?[c].com', function (req, res) {
        res.end('meta')
      })

      request(app)
        .get('/')
        .set('Host', 'a(b)?[c].com')
        .expect(200, 'meta', done)
    })

    it('should match case-insensitively', function (_, done) {
      var app = createServer('mail.example.com', function (req, res) {
        res.end(req.vhost.hostname)
      })

      request(app)
        .get('/')
        .set('Host', 'MAIL.EXAMPLE.COM')
        .expect(200, 'MAIL.EXAMPLE.COM', done)
    })

    it('should fold case like the i-flag, not toLowerCase', function () {
      // U+212A KELVIN SIGN lowercases to "k" via String#toLowerCase but does
      // NOT match /k/i. A toLowerCase-based fast path would wrongly match.
      // Node's HTTP client rejects this byte in a real Host header, so the
      // middleware is invoked directly with a fabricated request.
      var kelvin = String.fromCodePoint(0x212a) + '.com'
      var handled = false
      var nexted = false

      var mw = vhost('k.com', function () { handled = true })
      var req = { headers: { host: kelvin } }

      mw(req, {}, function () { nexted = true })

      assert.strictEqual(handled, false, 'handle must not run for Kelvin sign')
      assert.strictEqual(nexted, true, 'next must be called')
      assert.strictEqual(req.vhost, undefined)
    })

    it('should not match a length-changing case fold', function () {
      // U+0130 LATIN CAPITAL I WITH DOT ABOVE lowercases to "i" + a combining
      // dot (two code units), so it must not match the single-char "i". This
      // guards the ASCII fast path's length check. Invoked directly because the
      // byte is rejected by the HTTP client.
      var dotted = String.fromCodePoint(0x0130) + '.com'
      var handled = false

      var mw = vhost('i.com', function () { handled = true })
      var req = { headers: { host: dotted } }

      mw(req, {}, function () {})

      assert.strictEqual(handled, false, 'İ must not match ASCII i')
      assert.strictEqual(req.vhost, undefined)
    })

    it('should match a mixed-case static host (fast-path regex fallback)', function (_, done) {
      var app = createServer('mail.example.com', function (req, res) {
        res.end('hit:' + req.vhost.length)
      })

      request(app)
        .get('/')
        .set('Host', 'Mail.Example.Com')
        .expect(200, 'hit:0', done)
    })

    it('should match a non-ASCII static host via the regex path', function () {
      // Non-ASCII literal patterns bypass the ASCII fast path and match through
      // the regex, case-insensitively. Invoked directly: the raw Unicode bytes
      // are not a valid HTTP Host header.
      var mw = vhost('café.example', function (req, res) { res.end = res })
      var lower = { headers: { host: 'café.example' } }
      var upper = { headers: { host: 'CAFÉ.example' } }
      var miss = { headers: { host: 'cafe.example' } }
      var lowerNexted = false
      var upperNexted = false
      var missNexted = false

      mw(lower, {}, function () { lowerNexted = true })
      mw(upper, {}, function () { upperNexted = true })
      mw(miss, {}, function () { missNexted = true })

      assert.strictEqual(lowerNexted, false, 'exact non-ASCII host should match')
      assert.strictEqual(lower.vhost.hostname, 'café.example')
      assert.strictEqual(upperNexted, false, 'non-ASCII host matches case-insensitively')
      assert.strictEqual(missNexted, true, 'ASCII "cafe" must not match "café"')
    })

    it('should not match when Host is only a port', function (_, done) {
      var app = createServer('tobi.com', function (req, res) {
        res.end('tobi')
      })

      request(app)
        .get('/')
        .set('Host', ':8080')
        .expect(404, done)
    })

    it('should preserve case and port on a uppercase Host with port', function (_, done) {
      var app = createServer('tobi.com', function (req, res) {
        res.end(JSON.stringify({ host: req.vhost.host, hostname: req.vhost.hostname }))
      })

      request(app)
        .get('/')
        .set('Host', 'TOBI.COM:1234')
        .expect(200, '{"host":"TOBI.COM:1234","hostname":"TOBI.COM"}', done)
    })

    it('should give req.vhost a null prototype', function (_, done) {
      var app = createServer('tobi.com', function (req, res) {
        res.end(String(Object.getPrototypeOf(req.vhost)))
      })

      request(app)
        .get('/')
        .set('Host', 'tobi.com')
        .expect(200, 'null', done)
    })

    it('should populate req.vhost with no captures for a static hostname', function (_, done) {
      var app = createServer('tobi.com', function (req, res) {
        res.end(JSON.stringify({
          keys: Object.keys(req.vhost).sort(),
          length: req.vhost.length,
          zero: req.vhost[0]
        }))
      })

      request(app)
        .get('/')
        .set('Host', 'tobi.com')
        .expect(200, '{"keys":["host","hostname","length"],"length":0}', done)
    })

    it('should populate req.vhost', function (_, done) {
      var app = createServer('user-*.*.com', function (req, res) {
        var keys = Object.keys(req.vhost).sort()
        var arr = keys.map(function (k) { return [k, req.vhost[k]] })
        res.end(JSON.stringify(arr))
      })

      request(app)
        .get('/')
        .set('Host', 'user-bob.foo.com:8080')
        .expect(200, '[["0","bob"],["1","foo"],["host","user-bob.foo.com:8080"],["hostname","user-bob.foo.com"],["length",2]]', done)
    })

    it('should 404 a multi-wildcard host that does not match', function (_, done) {
      var app = createServer('*.*.com', function (req, res) {
        res.end('multi')
      })

      request(app)
        .get('/')
        .set('Host', 'only-one-label')
        .expect(404, done)
    })

    it('should call next() for a multi-wildcard with no Host header', function (_, done) {
      var app = http.createServer(function onRequest (req, res) {
        req.headers.host = undefined

        var mw = vhost('*.*.com', function (req, res) {
          res.end('handled')
        })

        mw(req, res, function () {
          res.end('next:' + String(req.vhost))
        })
      })

      request(app)
        .get('/')
        .expect(200, 'next:undefined', done)
    })

    it('should call next() for a wildcard with no Host header', function (_, done) {
      var app = http.createServer(function onRequest (req, res) {
        req.headers.host = undefined

        var mw = vhost('*.example.com', function (req, res) {
          res.end('handled')
        })

        mw(req, res, function () {
          res.end('next:' + String(req.vhost))
        })
      })

      request(app)
        .get('/')
        .expect(200, 'next:undefined', done)
    })
  })

  describe('with RegExp hostname', function () {
    it('should match using RegExp', function (_, done) {
      var app = createServer(/[tl]o[bk]i\.com/, function (req, res) {
        res.end('tobi')
      })

      request(app)
        .get('/')
        .set('Host', 'toki.com')
        .expect(200, 'tobi', done)
    })

    it('should match entire hostname', function (_, done) {
      var vhosts = []

      vhosts.push(vhost(/\.tobi$/, tobi))
      vhosts.push(vhost(/^loki\./, loki))

      var app = createServer(vhosts)

      function tobi (req, res) { res.end('tobi') }
      function loki (req, res) { res.end('loki') }

      request(app)
        .get('/')
        .set('Host', 'loki.tobi.com')
        .expect(404, done)
    })

    it('should call next() without a Host header', function (_, done) {
      var app = http.createServer(function onRequest (req, res) {
        req.headers.host = undefined

        var mw = vhost(/foo\.com/, function (req, res) {
          res.end('handled')
        })

        mw(req, res, function () {
          res.end('next:' + String(req.vhost))
        })
      })

      request(app)
        .get('/')
        .expect(200, 'next:undefined', done)
    })

    it('should call next() when the Host has no hostname part', function (_, done) {
      var app = createServer(/foo\.com/, function (req, res) {
        res.end('foo')
      })

      request(app)
        .get('/')
        .set('Host', ':8080')
        .expect(404, done)
    })

    it('should anchor a RegExp already ending in $', function (_, done) {
      var app = createServer(/foo\.com$/, function (req, res) {
        res.end('foo')
      })

      request(app)
        .get('/')
        .set('Host', 'foo.com')
        .expect(200, 'foo', done)
    })

    it('should add an anchor after an escaped trailing $', function (_, done) {
      // /foo\$/ ends in an escaped dollar (a literal "$"), so END_ANCHORED_REGEXP
      // does NOT consider it anchored and a real "$" anchor is appended.
      var app = createServer(/foo\$/, function (req, res) {
        res.end('dollar')
      })

      request(app)
        .get('/')
        .set('Host', 'foo$')
        .expect(200, 'dollar', done)
    })

    it('should not double-anchor a RegExp starting with ^', function (_, done) {
      var app = createServer(/^foo\.com/, function (req, res) {
        res.end('foo')
      })

      request(app)
        .get('/')
        .set('Host', 'foo.com')
        .expect(200, 'foo', done)
    })

    it('should report length 0 for a RegExp with no capture groups', function (_, done) {
      var app = createServer(/foo\.com/, function (req, res) {
        res.end(JSON.stringify({
          keys: Object.keys(req.vhost).sort(),
          length: req.vhost.length
        }))
      })

      request(app)
        .get('/')
        .set('Host', 'foo.com')
        .expect(200, '{"keys":["host","hostname","length"],"length":0}', done)
    })

    it('should populate req.vhost', function (_, done) {
      var app = createServer(/user-(bob|joe)\.([^.]+)\.com/, function (req, res) {
        var keys = Object.keys(req.vhost).sort()
        var arr = keys.map(function (k) { return [k, req.vhost[k]] })
        res.end(JSON.stringify(arr))
      })

      request(app)
        .get('/')
        .set('Host', 'user-bob.foo.com:8080')
        .expect(200, '[["0","bob"],["1","foo"],["host","user-bob.foo.com:8080"],["hostname","user-bob.foo.com"],["length",2]]', done)
    })
  })
})

function createServer (hostname, server, pretest) {
  var vhosts = !Array.isArray(hostname)
    ? [vhost(hostname, server)]
    : hostname

  return http.createServer(function onRequest (req, res) {
    // allows changes to the request/response objects before the middleware,
    // e.g. simulating the `req.hostname` an Express 5 app would provide
    if (pretest) pretest(req, res)

    var index = 0

    function next (err) {
      var vhost = vhosts[index++]

      if (!vhost || err) {
        res.statusCode = err ? (err.status || 500) : 404
        res.end(err ? err.message : 'no vhost for "' + req.headers.host + '"')
        return
      }

      vhost(req, res, next)
    }

    next()
  })
}
