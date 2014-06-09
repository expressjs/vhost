
/*!
 * vhost
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Jonathan Ong
 * MIT Licensed
 */

/**
 * vhost:
 *
 *   Setup vhost for the given `hostname` and `server`.
 *
 *     connect()
 *       .use(connect.vhost('foo.com', fooApp))
 *       .use(connect.vhost('bar.com', barApp))
 *       .use(connect.vhost('*.com', mainApp))
 *
 *  The `server` may be a Connect server, a callable function,
 *  or a regular Node `http.Server`.
 *
 * @param {string|RegExp} hostname
 * @param {function|Server} server
 * @return {Function}
 * @api public
 */

module.exports = function vhost(hostname, server){
  if (!hostname) {
    throw new TypeError('argument hostname is required')
  }

  if (!server) {
    throw new Error('argument server is required')
  }

  // create a handle for the server
  var handle = createHandle(server)

  // create regular expression for hostname
  var regexp = hostregexp(hostname)

  return function vhost(req, res, next){
    var host = req.headers.host

    if (!host) {
      return next()
    }

    var index = host.indexOf(':')
    var hostname = index !== -1
      ? host.substr(0, index)
      : host

    if (!regexp.test(hostname)) {
      return next()
    }

    handle(req, res, next)
  };
};

/**
 * Create handle to server.
 *
 * @param {function|Server} server
 * @return {function}
 * @api private
 */

function createHandle(server){
  if (typeof server === 'function') {
    // callable servers are the handle
    return server
  } else if (typeof server.emit === 'function') {
    // emit request event on server
    return function handle(req, res) {
      server.emit('request', req, res)
    }
  }

  throw new TypeError('argument server is unsupported')
}

/**
 * Determine if object is RegExp.
 *
 * @param (object} val
 * @return {boolean}
 * @api private
 */

function isregexp(val){
  return Object.prototype.toString.call(val) === '[object RegExp]'
}

/**
 * Generate RegExp for given hostname value.
 *
 * @param (string|RegExp} val
 * @api private
 */

function hostregexp(val){
  var source = !isregexp(val)
    ? String(val).replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replace(/\*/g, '(?:[^\.]+)')
    : val.source

  // force leading anchor matching
  if (source[0] !== '^') {
    source = '^' + source
  }

  // force trailing anchor matching
  source = source.replace(/(\\*)(.)$/, function(s, b, c){
    return c !== '$' || b.length % 2 === 1
      ? s + '$'
      : s
  })

  return new RegExp(source, 'i')
}
