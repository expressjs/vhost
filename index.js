
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
 *  The `server` may be a Connect server or
 *  a regular Node `http.Server`.
 *
 * @param {String} hostname
 * @param {Server} server
 * @return {Function}
 * @api public
 */

module.exports = function vhost(hostname, server){
  if (!hostname) throw new Error('vhost hostname required');
  if (!server) throw new Error('vhost server required');

  // create regular expression for hostname
  var regexp = hostregexp(hostname)

  return function vhost(req, res, next){
    if (!req.headers.host) return next();
    var host = req.headers.host.split(':')[0];
    if (!regexp.test(host)) return next();
    if ('function' == typeof server) return server(req, res, next);
    server.emit('request', req, res);
  };
};

/**
 * Generate RegExp for given hostname string.
 *
 * @param (string} str
 * @api private
 */

function hostregexp(str){
  // escape special RegExp characters (except "*")
  var source = str.replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1')

  // anchor matching
  source = '^' + source + '$'

  // replace wildcard
  source = source.replace(/\*/g, '(?:.*?)')

  return new RegExp(source, 'i')
}
