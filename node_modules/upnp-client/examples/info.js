var Step = require("step");
var upnp = require("../lib/upnp");

var timeout = 5000; //ms
var internalIp;
var internalPort = 8080;
var externalIp;
var externalPort = 8081;
var start = Date.now();

Step(
  function searchForGateway() {
    console.log("Searching for UPnP Gateway ("+timeout+" ms timeout)...");
    start = Date.now();
    upnp.searchGateway(timeout, this);    
  },
  function foundGateway(err, gateway) {
    if (err) throw err;

    console.log("Found Gateway: "+gateway.host + ":"+gateway.port+" ("+(Date.now() - start)+" ms)!\n");
    return gateway;
  },
  function getConnectionTypeInfo(err, gateway) {
    if (err) throw err;

    console.log("Getting Connection Type Info ... ");
    start = Date.now();
    gateway.GetConnectionTypeInfo(this.parallel());
    this.parallel()(null, gateway);
  },
  function(err, info, gateway) {
    if (err) throw err;
    
    for (var i in info) {
      if (!isNaN(i)) continue;
      console.log(i +": " + info[i]);
    }
  }
);
