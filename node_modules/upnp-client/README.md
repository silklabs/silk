node-upnp-client
================
### [UPnP][] "Control Point" Library for [NodeJS][].

A module for NodeJS written in JavaScript to interface with UPnP compliant devices.

Usage
-----

This module is still ___alpha___ quality, and it's API is a work-in-progress and
subject to change!

#### Discovery

Discovering UPnP compliant devices on the network is usually the first step in
anything UPnP-related:

``` javascript
var upnp = require("upnp");

// First, create a client instance
var controlPoint = new upnp.ControlPoint();

controlPoint.on("DeviceAvailable", function(device) {
  console.log(device.nt);
    //-> "urn:schemas-upnp-org:device:InternetGatewayDevice:1"
  console.log(device.location);
    //-> "http://192.168.0.1/root.sxml"
});

controlPoint.on("DeviceFound", function(device) {
  console.log(device.st);
    //-> "urn:schemas-upnp-org:device:InternetGatewayDevice:1"
  console.log(device.location);
    //-> "http://192.168.0.1/root.sxml"
}

controlPoint.search('urn:schemas-upnp-org:device:InternetGatewayDevice:1');
```

[UPnP]: http://upnp.org/
[NodeJS]: http://nodejs.org
[WikipediaUPnP]: http://wikipedia.org/wiki/Universal_Plug_and_Play
