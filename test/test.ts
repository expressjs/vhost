import * as vhost from "../index"
import * as connect from "connect"

const app = connect()

// Using string hostname
vhost("*.example.com", app)

// Using regex hostname
vhost(/(.*)\.example.com/, app)

// Using request handler
vhost("*.example.com",  (req, res, next) => {
  req.vhost[0] === 'foo'
  req.vhost[1] === 'bar'
  req.vhost.host === 'foo.bar.example.com:8080'
  req.vhost.hostname === 'foo.bar.example.com'
  req.vhost.length === 2
})