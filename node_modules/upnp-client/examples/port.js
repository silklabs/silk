var exec  = require("child_process").exec;
var Step = require("step");
var upnp = require("../lib/upnp");

var timeout = 5000; //ms
var internalIp;
var internalPort = 8080;
var externalIp;
var externalPort = 8081;
var start = Date.now();

Step(
  function getInternalIp() {
    console.log("Fetching Internal IP ... ");
    start = Date.now();
    exec("netstat -n -t | awk '{print $4}' | grep -o \"[0-9]*\\.[0-9]*\\.[0-9]*\\.[0-9]*\" | grep -v \"127.0.0.1\" | sort -u", this);
  },
  function foundInternalIp(err, stdout) {
    if (err) throw err;

    internalIp = stdout.trim();
    console.log("Found internal IP address: " + internalIp + " ("+(Date.now() - start)+" ms)\n");
    return internalIp;
  },
  function searchForGateway(err, internalIp) {
    if (err) throw err;

    console.log("Searching for UPnP Gateway ("+timeout+" ms timeout)...");
    start = Date.now();
    upnp.searchGateway(timeout, this);    
  },
  function foundGateway(err, gateway) {
    if (err) throw err;

    console.log("Found Gateway: "+gateway.host + ":"+gateway.port+" ("+(Date.now() - start)+" ms)!\n");
    return gateway;
  },
  function getExternalIp(err, gateway) {
    if (err) throw err;

    console.log("Fetching External IP ... ");
    start = Date.now();
    gateway.GetExternalIPAddress(this.parallel());
    this.parallel()(null, gateway);
  },
  function foundExternalIp(err, externalIP, gateway) {
    if (err) throw err;
    
    externalIp = externalIP;
    console.log("Found external IP address: " + externalIp + " ("+(Date.now() - start)+" ms)\n");
    return gateway;
  },
  function addPortMapping(err, gateway) {
    if (err) throw err;

    console.log("Mapping port "+externalIp+":"+externalPort+" \u2192 "+internalIp+":"+internalPort+" ... ");
    gateway.AddPortMapping(
        "TCP"               // or "UDP"
      , externalPort        // External port
      , internalPort        // Internal Port
      , internalIp          // Internal Host (ip address of your pc)
      , "my web server"     // Description.
      , this);
  },
  function(err, body) {
    if (err) throw err;
  
    console.log("Success!");
  }
);
