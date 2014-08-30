
var http = require('http')
var request = require('supertest')
var should = require('should')
var vhost = require('..')

describe('vhost(hostname, server)', function(){
  it('should route by Host', function(done){
    var vhosts = []

    vhosts.push(vhost('tobi.com', tobi))
    vhosts.push(vhost('loki.com', loki))

    var app = createServer(vhosts)

    function tobi(req, res) { res.end('tobi') }
    function loki(req, res) { res.end('loki') }

    request(app)
    .get('/')
    .set('Host', 'tobi.com')
    .expect(200, 'tobi', done)
  })

  it('should ignore port in Host', function(done){
    var app = createServer('tobi.com', function (req, res) {
      res.end('tobi')
    })

    request(app)
    .get('/')
    .set('Host', 'tobi.com:8080')
    .expect(200, 'tobi', done)
  })

  it('should support IPv6 literal in Host', function(done){
    var app = createServer('[::1]', function (req, res) {
      res.end('loopback')
    })

    request(app)
    .get('/')
    .set('Host', '[::1]:8080')
    .expect(200, 'loopback', done)
  })

  it('should 404 unless matched', function(done){
    var vhosts = []

    vhosts.push(vhost('tobi.com', tobi))
    vhosts.push(vhost('loki.com', loki))

    var app = createServer(vhosts)

    function tobi(req, res) { res.end('tobi') }
    function loki(req, res) { res.end('loki') }

    request(app.listen())
    .get('/')
    .set('Host', 'ferrets.com')
    .expect(404, done)
  })

  it('should 404 without Host header', function(done){
    var vhosts = []

    vhosts.push(vhost('tobi.com', tobi))
    vhosts.push(vhost('loki.com', loki))

    var app = createServer(vhosts)

    function tobi(req, res) { res.end('tobi') }
    function loki(req, res) { res.end('loki') }

    request(app.listen())
    .get('/')
    .unset('Host')
    .expect(404, done)
  })

  describe('arguments', function(){
    describe('hostname', function(){
      it('should be required', function(){
        vhost.bind().should.throw(/hostname.*required/)
      })

      it('should accept string', function(){
        vhost.bind(null, 'loki.com', function(){}).should.not.throw()
      })

      it('should accept RegExp', function(){
        vhost.bind(null, /loki\.com/, function(){}).should.not.throw()
      })
    })

    describe('handle', function(){
      it('should be required', function(){
        vhost.bind(null, 'loki.com').should.throw(/handle.*required/)
      })

      it('should accept function', function(){
        vhost.bind(null, 'loki.com', function(){}).should.not.throw()
      })

      it('should reject plain object', function(){
        vhost.bind(null, 'loki.com', {}).should.throw(/handle.*function/)
      })
    })
  })

  describe('with string hostname', function(){
    it('should support wildcards', function(done){
      var app = createServer('*.ferrets.com', function(req, res){
        res.end('wildcard!')
      })

      request(app)
      .get('/')
      .set('Host', 'loki.ferrets.com')
      .expect(200, 'wildcard!', done)
    })

    it('should restrict wildcards to single part', function(done){
      var app = createServer('*.ferrets.com', function(req, res){
        res.end('wildcard!')
      })

      request(app)
      .get('/')
      .set('Host', 'foo.loki.ferrets.com')
      .expect(404, done)
    })

    it('should treat dot as a dot', function(done){
      var app = createServer('a.b.com', function(req, res){
        res.end('tobi')
      })

      request(app)
      .get('/')
      .set('Host', 'aXb.com')
      .expect(404, done)
    })

    it('should match entire string', function(done){
      var app = createServer('.com', function(req, res){
        res.end('commercial')
      })

      request(app)
      .get('/')
      .set('Host', 'foo.com')
      .expect(404, done)
    })

    it('should populate req.vhost', function(done){
      var app = createServer('user-*.*.com', function(req, res){
        var keys = Object.keys(req.vhost).sort()
        var arr = keys.map(function(k){ return [k, req.vhost[k]] })
        res.end(JSON.stringify(arr))
      })

      request(app)
      .get('/')
      .set('Host', 'user-bob.foo.com:8080')
      .expect(200, '[["0","bob"],["1","foo"],["host","user-bob.foo.com:8080"],["hostname","user-bob.foo.com"],["length",2]]', done)
    })
  })

  describe('with RegExp hostname', function(){
    it('should match using RegExp', function(done){
      var app = createServer(/[tl]o[bk]i\.com/, function(req, res){
        res.end('tobi')
      })

      request(app)
      .get('/')
      .set('Host', 'toki.com')
      .expect(200, 'tobi', done)
    })

    it('should match entire hostname', function(done){
      var vhosts = []

      vhosts.push(vhost(/\.tobi$/, tobi))
      vhosts.push(vhost(/^loki\./, loki))

      var app = createServer(vhosts)

      function tobi(req, res) { res.end('tobi') }
      function loki(req, res) { res.end('loki') }

      request(app)
      .get('/')
      .set('Host', 'loki.tobi.com')
      .expect(404, done)
    })

    it('should populate req.vhost', function(done){
      var app = createServer(/user-(bob|joe)\.([^\.]+)\.com/, function(req, res){
        var keys = Object.keys(req.vhost).sort()
        var arr = keys.map(function(k){ return [k, req.vhost[k]] })
        res.end(JSON.stringify(arr))
      })

      request(app)
      .get('/')
      .set('Host', 'user-bob.foo.com:8080')
      .expect(200, '[["0","bob"],["1","foo"],["host","user-bob.foo.com:8080"],["hostname","user-bob.foo.com"],["length",2]]', done)
    })
  })
})

function createServer(hostname, server) {
  var vhosts = !Array.isArray(hostname)
    ? [vhost(hostname, server)]
    : hostname

  return http.createServer(function onRequest(req, res) {
    var index = 0

    function next(err) {
      var vhost = vhosts[index++]

      if (!vhost || err) {
        res.statusCode = err ? (err.status || 500) : 404
        res.end(err ? err.message : 'oops')
        return
      }

      vhost(req, res, next)
    }

    next()
  })
}
