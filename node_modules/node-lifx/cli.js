'use strict';

var Lifx = require('./lib/lifx').Client;
var client = new Lifx();

client.on('error', function(err) {
  console.log('LIFX error:\n' + err.stack);
  client.destroy();
});

client.on('message', function(msg, rinfo) {
  if (typeof msg.type === 'string') {
    // Known packages send by the lights as broadcast
    switch (msg.type) {
      case 'echoResponse':
      case 'getOwner':
      case 'stateOwner':
      case 'getGroup':
      case 'getVersion':
      case 'stateGroup':
      case 'getLocation':
      case 'stateLocation':
      case 'stateTemperature':
        console.log(msg, ' from ' + rinfo.address);
        break;
      default:
        break;
    }
  } else {
    // Unknown message type
    console.log(msg, ' from ' + rinfo.address);
  }
});

client.on('light-new', function(light) {
  console.log('New light found. ID:' + light.id + ', IP:' + light.address + ':' + light.port);
});

client.on('light-online', function(light) {
  console.log('Light back online. ID:' + light.id + ', IP:' + light.address + ':' + light.port);
});

client.on('light-offline', function(light) {
  console.log('Light offline. ID:' + light.id + ', IP:' + light.address + ':' + light.port);
});

client.on('listening', function() {
  var address = client.address();
  console.log(
    'Started LIFX listening on ' +
    address.address + ':' + address.port + '\n'
  );
});

client.init();
