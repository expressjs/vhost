var assert = require('assert')
var http = require('http')
var request = require('supertest')
var vhost = require('..')

describe('vhost(hostname, server)', function () {
  it('should route by Host', function (done) {
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

  it('should route by `req.hostname` (express v4)', function (done) {
    var vhosts = []

    vhosts.push(vhost('anotherhost.com', anotherhost))
    vhosts.push(vhost('loki.com', loki))

    var app = createServer(vhosts, null, function (req) {
      req.hostname = 'anotherhost.com'
    })

    function anotherhost (req, res) { res.end('anotherhost') }
    function loki (req, res) { res.end('loki') }

    request(app)
    .get('/')
    .set('Host', 'tobi.com')
    .expect(200, 'anotherhost', done)
  })

  it('should route by `req.host` (express v3)', function (done) {
    var vhosts = []

    vhosts.push(vhost('anotherhost.com', anotherhost))
    vhosts.push(vhost('loki.com', loki))

    var app = createServer(vhosts, null, function (req) {
      req.host = 'anotherhost.com'
    })

    function anotherhost (req, res) { res.end('anotherhost') }
    function loki (req, res) { res.end('loki') }

    request(app)
    .get('/')
    .set('Host', 'tobi.com')
    .expect(200, 'anotherhost', done)
  })

  it('should ignore port in Host', function (done) {
    var app = createServer('tobi.com', function (req, res) {
      res.end('tobi')
    })

    request(app)
      .get('/')
      .set('Host', 'tobi.com:8080')
      .expect(200, 'tobi', done)
  })

  it('should support IPv6 literal in Host', function (done) {
    var app = createServer('[::1]', function (req, res) {
      res.end('loopback')
    })

    request(app)
      .get('/')
      .set('Host', '[::1]:8080')
      .expect(200, 'loopback', done)
  })

  it('should support IPv6 literal in `req.host` with port (express v5)', function (done) {
    var app = createServer('[::1]', function (req, res) {
      res.end('loopback')
    }, function (req) {
      req.host = '[::1]:8080'
    })

    request(app)
    .get('/')
    .expect(200, 'loopback', done)
  })

  it('should support IPv6 literal in `req.hostname` (express v4)', function (done) {
    var app = createServer('[::1]', function (req, res) {
      res.end('loopback')
    }, function (req) {
      req.hostname = '[::1]'
    })

    request(app)
    .get('/')
    .expect(200, 'loopback', done)
  })

  it('should support IPv6 literal in `req.host` without port (express v3)', function (done) {
    var app = createServer('[::1]', function (req, res) {
      res.end('loopback')
    }, function (req) {
      req.host = '[::1]'
    })

    request(app)
    .get('/')
    .expect(200, 'loopback', done)
  })

  it('should 404 unless matched', function (done) {
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

  it('should 404 without Host header', function (done) {
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

  describe('arguments', function () {
    describe('hostname', function () {
      it('should be required', function () {
        assert.throws(vhost.bind(), /hostname.*required/)
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
    it('should support wildcards', function (done) {
      var app = createServer('*.ferrets.com', function (req, res) {
        res.end('wildcard!')
      })

      request(app)
        .get('/')
        .set('Host', 'loki.ferrets.com')
        .expect(200, 'wildcard!', done)
    })

    it('should restrict wildcards to single part', function (done) {
      var app = createServer('*.ferrets.com', function (req, res) {
        res.end('wildcard!')
      })

      request(app)
        .get('/')
        .set('Host', 'foo.loki.ferrets.com')
        .expect(404, done)
    })

    it('should treat dot as a dot', function (done) {
      var app = createServer('a.b.com', function (req, res) {
        res.end('tobi')
      })

      request(app)
        .get('/')
        .set('Host', 'aXb.com')
        .expect(404, done)
    })

    it('should match entire string', function (done) {
      var app = createServer('.com', function (req, res) {
        res.end('commercial')
      })

      request(app)
        .get('/')
        .set('Host', 'foo.com')
        .expect(404, done)
    })

    it('should populate req.vhost', function (done) {
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
  })

  describe('with RegExp hostname', function () {
    it('should match using RegExp', function (done) {
      var app = createServer(/[tl]o[bk]i\.com/, function (req, res) {
        res.end('tobi')
      })

      request(app)
        .get('/')
        .set('Host', 'toki.com')
        .expect(200, 'tobi', done)
    })

    it('should match entire hostname', function (done) {
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

    it('should populate req.vhost', function (done) {
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
    // This allows you to perform changes to the request/response
    // objects before our assertions
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
