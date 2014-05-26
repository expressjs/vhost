
var connect = require('connect')
var http = require('http');
var request = require('supertest');

var vhost = require('..');

describe('vhost()', function(){
  it('should route by Host', function(done){
    var app = connect()
      , tobi = connect()
      , loki = connect();

    app.use(vhost('tobi.com', tobi));
    app.use(vhost('loki.com', loki));

    tobi.use(function(req, res){ res.end('tobi') });
    loki.use(function(req, res){ res.end('loki') });

    request(app.listen())
    .get('/')
    .set('Host', 'tobi.com')
    .expect('tobi', done);
  })

  it('should support http.Servers', function(done){
    var app = connect()
      , tobi = http.createServer(function(req, res){ res.end('tobi') })
      , loki = http.createServer(function(req, res){ res.end('loki') })

    app.use(vhost('tobi.com', tobi));
    app.use(vhost('loki.com', loki));

    request(app.listen())
    .get('/')
    .set('Host', 'loki.com')
    .expect('loki', done);
  })

  it('should 404 unless matched', function(done){
    var app = connect()
      , tobi = http.createServer(function(req, res){ res.end('tobi') })
      , loki = http.createServer(function(req, res){ res.end('loki') })

    app.use(vhost('tobi.com', tobi));
    app.use(vhost('loki.com', loki));

    request(app.listen())
    .get('/')
    .set('Host', 'ferrets.com')
    .expect(404, done);
  })

  it('should treat dot as a dot', function(done){
    var app = connect()
      , tobi = http.createServer(function(req, res){ res.end('tobi') })

    app.use(vhost('a.b.com', tobi));

    request(app.listen())
    .get('/')
    .set('Host', 'aXb.com')
    .expect(404, done);
  })

  describe('when using wildcards', function(){

    it('should match arbitrary subdomain', function(done){
      var app  = connect()
        , loki = http.createServer(function(req, res){ res.end('loki') })

      app.use(vhost('*.ferrets.com', loki));

      request(app.listen())
      .get('/')
      .set('Host', 'loki.ferrets.com')
      .expect('loki', done);
    })

    it('should take precedence over vhosts created afterward', function(done){
      var app  = connect()
        , tobi = http.createServer(function(req, res){ res.end('tobi') })
        , loki = http.createServer(function(req, res){ res.end('loki') })

      app.use(vhost('*.ferrets.com', loki));
      app.use(vhost('tobi.ferrets.com', tobi));

      request(app.listen())
      .get('/')
      .set('Host', 'tobi.ferrets.com')
      .expect('loki', done);
    })

    it('should not take precedence over vhosts created beforehand', function(done){
      var app  = connect()
        , tobi = http.createServer(function(req, res){ res.end('tobi') })
        , loki = http.createServer(function(req, res){ res.end('loki') })

      app.use(vhost('tobi.ferrets.com', tobi));
      app.use(vhost('*.ferrets.com', loki));

      request(app.listen())
      .get('/')
      .set('Host', 'tobi.ferrets.com')
      .expect('tobi', done);
    })

    it('should return the matched subdomain name', function(done){
      var app  = connect()
        , loki = http.createServer(function(req, res){ res.end( req.vhost ) })

      app.use(vhost('*.ferrets.com', loki));

      request(app.listen())
      .get('/')
      .set('Host', 'loki.ferrets.com')
      .expect('loki', done);
    })

  })
})
