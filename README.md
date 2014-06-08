# vhost

[![NPM version](https://badge.fury.io/js/vhost.svg)](http://badge.fury.io/js/vhost)
[![Build Status](https://travis-ci.org/expressjs/vhost.svg?branch=master)](https://travis-ci.org/expressjs/vhost)

Previously `connect.vhost()`.

## Install

```sh
$ npm install vhost
```

## API

```js
var vhost = require('vhost')
```

### vhost(hostname, server)

Create a new middleware function to hand off request to `server` when the incoming
host for the request matches `hostname`.

`hostname` can be a string or a RegExp object. When `hostname` is a string it can
contain `*` to match 1 or more characters in that section of the hostname. When
`hostname` is a RegExp, it will be forced to case-insensitive (since hostnames are)
and will be forced to match based on the start and end of the hostname.

## Examples

### using with connect for static serving

```js
var connect = require('connect')
var serveStatic = require('serve-static')
var vhost = require('vhost')

var mailapp = connect()

// add middlewares to mailapp for mail.example.com

// create app to serve static files on subdomain
var staticapp = connect()
staticapp.use(serveStatic('public'))

// create main app
var app = connect()

// add vhost routing to main app for mail
app.use(vhost('mail.example.com', mailapp))

// route static assets for "assets-*" subdomain to get
// around max host connections limit on browsers
app.use(vhost('assets-*.example.com', staticapp))

// add middlewares and main usage to app

app.listen(3000)
```

## License

The MIT License (MIT)

Copyright (c) 2014 Jonathan Ong me@jongleberry.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
