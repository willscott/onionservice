Onion Service
=============

Binds and listens for connections on a tor Onion Service. Meant to behave
identically to Node’s http.Server.

```javascript
var express = require('express');
var onion = require('onionservice');

var app = express();

var server = onion.createServer(app).listen(80);
```

# Safety

Node.js is not known to be a particularly hardened code base, and it is
inadvisable to use this code base in security-critical situations. In addition,
it is worth understanding the NPM package dependencies in a code base and the
exposure to vulnerability associated with large code bases with varied lineage.

OnionService is none-the-less an effective tool when used correctly. In addition
to hidden web services, Onion Services provide NAT avoidance capabilities and
the ability to easily construct P2P overlays. In these circumstances, use a
random high port for listening to limit risk of crawling, and don't publish
addresses publicly.

# `createServer([options], [handler])`

The key material used for construction of the onion service will be directory-
local, and will remain stable across runs. It can be configured with additional
keys in the `options` object, which has the following defaults:

```javascript
{
  cacheKeyMaterial: true,
  keyMaterial: path.join(process.cwd(), ".onionservice")
}
```

If `cacheKeyMaterial` is `false`, a new onion address will be generated each
time the application is run.

If `keyMaterial` is a string, it will be interpreted as a file path, and used
to read and write key material. If it is a (duplex) stream, key material will be
read from the stream, and updated material will be written back.

# `server.address()`
Returns the bound onion address, the family name, and the port of the server.
Useful for learning the generated onion. Returns an object with three
properties, e.g.
`{ port: 80, family: 'Onion', address: '3g2upl4pq6kufc4m.onion'}`

Example:
```javascript
var server = onion.createServer((socket) => {
  socket.end('Onion\n');
});

// Listen on a random port.
server.listen(() => {
  address = server.address();
  console.log('Opened server on %j', address);
});
```
