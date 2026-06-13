4.0.0 / 2026-06-10
==================

  * Rewrite in TypeScript; ship ESM only with bundled type declarations
  * Drop support for Node.js below 24; require Node.js 24 or newer
  * **Breaking:** package is now ESM (`import vhost from 'vhost'`); `require()` is
    no longer supported
  * perf: fast path for static (non-wildcard) hostnames avoids capture allocation
  * No change to matching behavior or the `req.vhost` contract

3.0.2 / 2015-10-12
==================

  * perf: hoist regular expressions
  * perf: use single regular expression for anchor checking

3.0.1 / 2015-07-19
==================

  * perf: enable strict mode

3.0.0 / 2014-08-29
==================

  * Remove support for sub-http servers; use the `handle` function

2.0.0 / 2014-06-08
==================

  * Accept `RegExp` object for `hostname`
  * Provide `req.vhost` object
  * Remove old invocation of `server.onvhost`
  * String `hostname` with `*` behaves more like SSL certificates
    - Matches 1 or more characters instead of zero
    - No longer matches "." characters
  * Support IPv6 literal in `Host` header

1.0.0 / 2014-03-05
==================

  * Genesis from `connect`
