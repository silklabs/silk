var url     = require("url");
var http    = require("http");
var dgram   = require("dgram");
var util    = require("util");
var events  = require("events");

// SSDP
const SSDP_PORT = 1900;
const BROADCAST_ADDR = "239.255.255.250";
const SSDP_MSEARCH   = "M-SEARCH * HTTP/1.1\r\nHost:"+BROADCAST_ADDR+":"+SSDP_PORT+"\r\nST:%st\r\nMan:\"ssdp:discover\"\r\nMX:3\r\n\r\n";
const SSDP_ALIVE = 'ssdp:alive';
const SSDP_BYEBYE = 'ssdp:byebye';
const SSDP_UPDATE = 'ssdp:update';
const SSDP_ALL = 'ssdp:all';

// Map SSDP notification sub type to emitted events 
const UPNP_NTS_EVENTS = {
  'ssdp:alive': 'DeviceAvailable',
  'ssdp:byebye': 'DeviceUnavailable',
  'ssdp:update': 'DeviceUpdate'
};

var debug;
if (process.env.NODE_DEBUG && /upnp/.test(process.env.NODE_DEBUG)) {
  debug = function(x) { console.error('UPNP: %s', x); };

} else {
  debug = function() { };
}

function ControlPoint() {
  events.EventEmitter.call(this);
  this.server = dgram.createSocket('udp4');
  var self = this;
  this.server.on('message', function(msg, rinfo) {self.onRequestMessage(msg, rinfo);});
  this._initParsers();
  this.server.bind(SSDP_PORT);
  this.server.addMembership(BROADCAST_ADDR); //fixed issue #2
}
util.inherits(ControlPoint, events.EventEmitter);
exports.ControlPoint = ControlPoint;

/**
 * Message handler for HTTPU request.
 */
ControlPoint.prototype.onRequestMessage = function(msg, rinfo) {
  var ret = this.requestParser.execute(msg, 0, msg.length);
  if (!(ret instanceof Error)) {
    var req = this.requestParser.incoming;
    switch (req.method) {
      case 'NOTIFY':
        debug('NOTIFY ' + req.headers.nts + ' NT=' + req.headers.nt + ' USN=' + req.headers.usn);
        var event = UPNP_NTS_EVENTS[req.headers.nts];
        if (event) {
          this.emit(event, req.headers);
        }
        break;
    };
  }
};

/**
 * Message handler for HTTPU response.
 */
ControlPoint.prototype.onResponseMessage = function(msg, rinfo){
  var ret = this.responseParser.execute(msg, 0, msg.length);
  if (!(ret instanceof Error)) {
    var res = this.responseParser.incoming;
    if (res.statusCode == 200) {
      debug('RESPONSE ST=' + res.headers.st + ' USN=' + res.headers.usn);
      this.emit('DeviceFound', res.headers);
    }
  }
}

/**
 * Initialize HTTPU response and request parsers.
 */
ControlPoint.prototype._initParsers = function() {
  var self = this;
  if (!self.requestParser) {
    self.requestParser = http.parsers.alloc();
    self.requestParser.reinitialize('request');
    self.requestParser.onIncoming = function(req) {

    };
    self.requestParser.socket = { }; //fix for issue #3
  }
  if (!self.responseParser) {
    self.responseParser = http.parsers.alloc();
    self.responseParser.reinitialize('response');
    self.responseParser.onIncoming = function(res) {

    };
  }
};

/**
 * Send an SSDP search request.
 * 
 * Listen for the <code>DeviceFound</code> event to catch found devices or services.
 * 
 * @param String st
 *  The search target for the request (optional, defaults to "ssdp:all"). 
 */
ControlPoint.prototype.search = function(st) {
  if (typeof st !== 'string') {
    st = SSDP_ALL;
  }
  var message = new Buffer(SSDP_MSEARCH.replace('%st', st), "ascii");
  var client = dgram.createSocket("udp4");
  client.bind(); // So that we get a port so we can listen before sending
  // Set a server to listen for responses
  var server = dgram.createSocket('udp4');
  var self = this;
  server.on('message', function(msg, rinfo) {self.onResponseMessage(msg, rinfo);});
  server.bind(client.address().port);

  // Broadcast request
  client.send(message, 0, message.length, SSDP_PORT, BROADCAST_ADDR);
  debug('REQUEST SEARCH ' + st);
  client.close();

  // MX is set to 3, wait for 1 additional sec. before closing the server
  setTimeout(function(){
    server.close();
  }, 4000);
}

/**
 * Terminates this ControlPoint.
 */
ControlPoint.prototype.close = function() {
  this.server.close();
  http.parsers.free(this.requestParser);
  http.parsers.free(this.responseParser);
}

/* TODO Move these stuff to a separated module/project */

//some const strings - dont change
const GW_ST    = "urn:schemas-upnp-org:device:InternetGatewayDevice:1";
const WANIP = "urn:schemas-upnp-org:service:WANIPConnection:1";
const OK    = "HTTP/1.1 200 OK";
const SOAP_ENV_PRE = "<?xml version=\"1.0\"?>\n<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>";
const SOAP_ENV_POST = "</s:Body></s:Envelope>";

function searchGateway(timeout, callback) {
  var clients = {};
  var t;
  
  if (timeout) {
    t = setTimeout(function() {
      callback(new Error("searchGateway() timed out"));
    }, timeout);
  }
  
  var cp = new ControlPoint();
  cp.on('DeviceFound', function(headers) {
    var l = url.parse(headers.location);
    l.port = l.port || (l.protocol == "https:" ? 443 : 80);
    // Early return if this location is already processed 
    if (clients[l.href]) return;

    // Retrieve device/service description
    var client = clients[l.href] = http.createClient(l.port, l.hostname);
    var request = client.request("GET", l.pathname, {
      "Host": l.hostname
    });
    request.addListener('response', function (response) {
      if (response.statusCode !== 200) {
        callback(new Error("Unexpected response status code: " + response.statusCode));
      }
      var resbuf = "";
      response.setEncoding("utf8");
      response.addListener('data', function (chunk) { resbuf += chunk;});
      response.addListener("end", function() {
        resbuf = resbuf.substr(resbuf.indexOf(WANIP) + WANIP.length);
        var ipurl = resbuf.match(/<controlURL>(.+?)<\/controlURL>/i)[1].trim()
        clearTimeout(t);
        var controlUrl = url.parse(ipurl);
        controlUrl.__proto__ = l;
        console.log(controlUrl);
        callback(null, new Gateway(controlUrl.port, controlUrl.hostname, controlUrl.pathname));
      });
    });
    request.end();
  });
  
  cp.search(GW_ST);
}
exports.searchGateway = searchGateway;

function Gateway(port, host, path) {
  this.port = port;
  this.host = host;
  this.path = path;
}

// Retrieves the values of the current connection type and allowable connection types.
Gateway.prototype.GetConnectionTypeInfo = function(callback) {
  this._getSOAPResponse(
    "<u:GetConnectionTypeInfo xmlns:u=\"" + WANIP + "\">\
    </u:GetConnectionTypeInfo>",
    "GetConnectionTypeInfo",
    function(err, response) {
      if (err) return callback(err);
      var rtn = {};
      try {
        rtn['NewConnectionType'] = this._getArgFromXml(response.body, "NewConnectionType", true);
        rtn['NewPossibleConnectionTypes'] = this._getArgFromXml(response.body, "NewPossibleConnectionTypes", true);
      } catch(e) {
        return callback(e);
      }
      callback.apply(null, this._objToArgs(rtn));
    }
  );
}

Gateway.prototype.GetExternalIPAddress = function(callback) {
  this._getSOAPResponse(
    "<u:GetExternalIPAddress xmlns:u=\"" + WANIP + "\">\
    </u:GetExternalIPAddress>",
    "GetExternalIPAddress",
    function(err, response) {
      if (err) return callback(err);
      var rtn = {};
      try {
        rtn['NewExternalIPAddress'] = this._getArgFromXml(response.body, "NewExternalIPAddress", true);
      } catch(e) {
        return callback(e);
      }
      callback.apply(null, this._objToArgs(rtn));
    }
  );
}

Gateway.prototype.AddPortMapping = function(protocol, extPort, intPort, host, description, callback) {
  this._getSOAPResponse(
    "<u:AddPortMapping \
    xmlns:u=\""+WANIP+"\">\
    <NewRemoteHost></NewRemoteHost>\
    <NewExternalPort>"+extPort+"</NewExternalPort>\
    <NewProtocol>"+protocol+"</NewProtocol>\
    <NewInternalPort>"+intPort+"</NewInternalPort>\
    <NewInternalClient>"+host+"</NewInternalClient>\
    <NewEnabled>1</NewEnabled>\
    <NewPortMappingDescription>"+description+"</NewPortMappingDescription>\
    <NewLeaseDuration>0</NewLeaseDuration>\
    </u:AddPortMapping>",
    "AddPortMapping",
    function(err, response) {
      if (err) return callback(err);
    }
  );
}

Gateway.prototype._getSOAPResponse = function(soap, func, callback) {
  var self = this;
  var s = new Buffer(SOAP_ENV_PRE+soap+SOAP_ENV_POST, "utf8");
  var client = http.createClient(this.port, this.host);
  var request = client.request("POST", this.path, {
    "Host"           : this.host + (this.port != 80 ? ":" + this.port : ""),
    "SOAPACTION"     : '"' + WANIP + '#' + func + '"',
    "Content-Type"   : "text/xml",
    "Content-Length" : s.length
  });
  request.addListener('error', function(error) {
    callback.call(self, error);
  });
  request.addListener('response', function(response) {
    if (response.statusCode === 402) {
      return callback.call(self, new Error("Invalid Args"));
    } else if (response.statusCode === 501) {
      return callback.call(self, new Error("Action Failed"));      
    }
    response.body = "";
    response.setEncoding("utf8");
    response.addListener('data', function(chunk) { response.body += chunk });
    response.addListener('end', function() {
      callback.call(self, null, response);
    });
  });
  request.end(s);
}

// Formats an Object of named arguments, and returns an Array of return
// values that can be used with "callback.apply()".
Gateway.prototype._objToArgs = function(obj) {
  var wrapper;
  var rtn = [null];
  for (var i in obj) {
    if (!wrapper) {
      wrapper = new (obj[i].constructor)(obj[i]);
      wrapper[i] = obj[i];
      rtn.push(wrapper);
    } else {
      wrapper[i] = obj[i];
      rtn.push(obj[i]);
    }
  }
  return rtn;
}

Gateway.prototype._getArgFromXml = function(xml, arg, required) {
  var match = xml.match(new RegExp("<"+arg+">(.+?)<\/"+arg+">"));
  if (match) {
    return match[1];
  } else if (required) {
    throw new Error("Invalid XML: Argument '"+arg+"' not given.");
  }
}
