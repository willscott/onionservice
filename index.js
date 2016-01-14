/**
 * Monkeypatching of the http.Server interface to bind locally on a random
 * localhost-only high-port - fronted by a tor onoon service.
 */

var connecttor = require('connecttor');
var split = require('split');
var fs = require('fs');
var http = require('http');
var path = require('path');

function toNumber(x) { return (x = Number(x)) >= 0 ? x : false; }

/**
 * Read a file or stream to recover a stored keyblob.
 */
var getKeyBlob = function (stream, cb) {
  if (typeof stream === "string") {
    if (fs.existsSync(stream)) {
      stream = fs.createReadStream(stream);
    } else {
      return cb("");
    }
  }
  var data = "";
  stream.on('readable', function () {
    var dat = stream.read();
    if (dat.length === 0) {
      cb(data);
    } else {
      data =+ dat.toString("hex");
    }
  });
};

var setKeyBlob = function (stream, blob) {
  if (typeof stream === "string") {
    stream = fs.createWriteStream(stream);
  }
  stream.end(blob);
};

var onListening = function () {
  this._onionInternalAddress = this.address();

  this.address = function () {
    return this._onionAddress || {};
  };

  // For older 0.2.6 tor.
  this._setconfAttach = function (key) {
    var hsdir = path.join(process.cwd(), ".tor.hs");
    if (!fs.existsSync(hsdir)) {
      fs.mkdirSync(hsdir, '770');
      // Set permissions.
      if (process.platform === 'linux') {
        var posix = require('posix');
        var knownTorGroups = ['debian-tor', 'toranon'];
        for (var i = 0; i < knownTorGroups.length; i += 1) {
          try {
            var torid = posix.getgrnam(knownTorGroups[i]);
            var stats = fs.statSync(hsdir);
            fs.chownSync(hsdir, stats.uid, torid.gid);
            break;
          } catch (e) {
            continue;
          }
        }
      }
    } else if (this._onionOpts.cacheKeyMaterial === false) {
      fs.unlinkSync(path.join(process.cwd(), ".tor.hs", "private_key"));
    }
    if (key && key.length) {
      var data = JSON.parse(key);
      fs.writeFileSync(path.join(process.cwd(), ".tor.hs", "hostname"), data.name);
      fs.writeFileSync(path.join(process.cwd(), ".tor.hs", "private_key"), data.pk);
    }
    // Tor will write 'hostname' and 'private_key' files into this dir.
    var cmd = "SETCONF HiddenServiceDir " + path.join(process.cwd(), ".tor.hs") + "\n" +
        "SETCONF HiddenServicePort " + this._onionPort +
        " 127.0.0.1:" + this._onionInternalAddress.port + "\n";
    this._onionSocket.write(cmd);
  }.bind(this);

  this._getConfInfo = function () {
    var data = {};
    data.host = fs.readFileSync(path.join(process.cwd(), ".tor.hs", "hostname"));
    if (this._onionOpts.cacheKeyMaterial !== false) {
      data.pk = fs.readFileSync(path.join(process.cwd(), ".tor.hs", "private_key"));
    }
    return data;
  };

  // For newer 0.2.7 tor.
  this._onionAttach = function (key) {
    var cmd = "ADD_ONION ";
    if (key && key.length) {
      cmd += key + " ";
    } else {
      cmd += "NEW:BEST ";
    }
    if (this._onionOpts.cacheKeyMaterial === false) {
      cmd += "Flags=DiscardPK ";
    }
    cmd += "Port=" + this._onionPort + "," + this._onionInternalAddress.port + "\r\n";
    this._onionSocket.write(cmd);
  }.bind(this);

  connecttor.connect(function (controlSocket) {
    if (!controlSocket) {
      this.emit('error', new Error("Onion Connection failed."));
      this.close();
    }

    this._onionSocket = controlSocket;
    // Tor will associate the onion with our control socket that asked for it.
    // Closing at the same time as the server means they clean up together.
    this._onionSocket.on('close', this.close.bind(this));
    this.on('close', this._onionSocket.end.bind(this._onionSocket));

    this._onionSocket.pipe(split()).on("data", function (line) {
      if (line.indexOf("250-version=") === 0) {
        // Response to "GETINFO version" query.
        var attach;
        if (line.indexOf("0.2.6") > 0) {
          this._onionVersion = "26";
          attach = this._setconfAttach;
        } else {
          this._onionVersion = "27";
          attach = this._onionAttach;
        }
        if (this._onionOpts.keyMaterial) {
          getKeyBlob(this._onionOpts.keyMaterial, attach.bind(this));
        } else {
          attach();
        }
      } else if (line.indexOf("250-ServiceID=") === 0) {
        this._onionAddress = {
          family: 'Onion',
          address: line.substr(14) + ".onion",
          port: this._onionPort
        };
      } else if (line.indexOf("250-PrivateKey=") === 0) {
        var keyBlob = line.substr(15).trim();
        setKeyBlob(this._onionOpts.keyMaterial, keyBlob);
      } else if (line.indexOf("250 OK") === 0) {
        if (this._onionVersion === "26") {
          var info = this._getConfInfo();
          this._onionAddress = {
            family: 'Onion',
            address: info.host,
            port: this._onionPort
          };
          setKeyBlob(this._onionOpts.keyMaterial, JSON.serialize(info));
        }
        this.emit('listening');
      } else {
        // Unexpected condition. raise.
        this.emit('error', new Error(line));
      }
    }.bind(this));

    this._onionSocket.write("GETINFO version\n");
  }.bind(this));
};

var listen = function(httpListen, options) {
  // based on https://github.com/nodejs/node/blob/v5.4.0/lib/net.js#L1312
  var lastArg = arguments[arguments.length - 1];
  if (typeof lastArg === 'function') {
    this.once('listening', lastArg);
  }

  this._onionPort = toNumber(arguments[2]);
  if (this._onionPort === 0) {
    this._onionPort = Math.floor(Math.random() * 0xFFFF);
  }
  this._onionOpts = options || {};
  if (!this._onionOpts.keyMaterial) {
    this._onionOpts.keyMaterial = path.join(process.cwd(), ".onionservice");
  }

  // capture first 'listening' event to instead cue starting the onion.
  var realEmit = this.emit;
  this.emit = function() {
    if (arguments[0] === 'listening') {
      onListening.call(this);
      this.emit = realEmit;
    } else {
      realEmit.apply(this, arguments);
    }
  }.bind(this);

  // Assign arbitrary high port on localhost for the http server.
  httpListen.call(this, 0, '127.0.0.1');
};

var createServer = function (options, requestListener) {
  if (typeof options === 'function' && !requestListener) {
    requestListener = options;
    options = {};
  }
  var server = http.createServer(requestListener);
  server.listen = listen.bind(server, server.listen, options);
  return server;
};

exports.createServer = createServer;
