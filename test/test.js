
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

  it('should route with RegExp', function(done){
    var app = connect()
      , tobi = connect()

    app.use(vhost(/[tl]o[bk]i\.com/, tobi));

    tobi.use(function(req, res){ res.end('tobi') });

    request(app.listen())
    .get('/')
    .set('Host', 'toki.com')
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

  it('should support wildcards', function(done){
    var app = connect()
      , tobi = http.createServer(function(req, res){ res.end('tobi') })
      , loki = http.createServer(function(req, res){ res.end('loki') })

    app.use(vhost('*.ferrets.com', loki));
    app.use(vhost('tobi.ferrets.com', tobi));

    request(app.listen())
    .get('/')
    .set('Host', 'loki.ferrets.com')
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
})
