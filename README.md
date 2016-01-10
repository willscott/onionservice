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
