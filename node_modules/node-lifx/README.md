# LIFX Node.js Library

[![NPM Version](https://img.shields.io/npm/v/node-lifx.svg)](https://www.npmjs.com/package/node-lifx)
[![Build Status](https://img.shields.io/travis/MariusRumpf/node-lifx/master.svg)](https://travis-ci.org/MariusRumpf/node-lifx)
[![Build status](https://img.shields.io/appveyor/ci/MariusRumpf/node-lifx/master.svg)](https://ci.appveyor.com/project/MariusRumpf/node-lifx)
[![Dependency Status](https://img.shields.io/versioneye/d/nodejs/node-lifx.svg)](https://www.versioneye.com/nodejs/node-lifx/)
[![Inline docs](http://inch-ci.org/github/mariusrumpf/node-lifx.svg?branch=master)](http://inch-ci.org/github/mariusrumpf/node-lifx)
[![codecov.io](https://img.shields.io/codecov/c/github/MariusRumpf/node-lifx/master.svg)](http://codecov.io/github/MariusRumpf/node-lifx?branch=master)


A Node.js implementation of the [LIFX protocol](https://github.com/LIFX/lifx-protocol-docs). Developed to work with a minimum firmware version of 2.0.

This library is not, in any way, affiliated or related to LiFi Labs, Inc.. Use it at your own risk.

## Installation

```sh
$ npm install node-lifx --save
```

## Compatibility

Node.js 0.12+ and io.js are tested and supported on Mac, Linux and Windows.

## Usage
The file `cli.js` contains a working example.

### Client
The library uses a client for network communication. This client handles communication with all lights in the network.
```js
var LifxClient = require('node-lifx').Client;
var client = new LifxClient();

client.init();
```
The `Client` object is an EventEmitter and emmits events whenever any changes occur. This can be a new light discovery, a light sending a message or similar.  
The client starts discovery of lights right after it is initialized with the `init` method. If a new light is found the client emmits a `light-new` event. This event contains the light as an object on which methods can be called then:

```js
var LifxClient = require('node-lifx').Client;
var client = new LifxClient();

client.on('light-new', function(light) {
  // Change light state here
});

client.init();
```

### Changing light state
The states of a light can be changed with different methods:

#### `light.on([duration], [callback])`
This turns a light on.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`duration` | int | 0 | Turning on will be faded over the time (in milliseconds).
`callback` | function | null | `function(error) {}` Called after the command has reached the light or after `client.resendMaxTimes` with `client.resendPacketDelay` in case it has not. `error` is `null` in case of success and given if the sending has failed.
_Note: Using callback multiplies network load for this command by two or more times._

Usage examples:
```js
light.on(); // Turns the light off instantly
light.on(2000); // Fading the light off over two seconds
```

#### `light.off([duration], [callback])`
This turns a light off.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`duration` | int | 0 | Turning off will be faded over the time (in milliseconds).
`callback` | function | null | `function(error) {}` Called after the command has reached the light or after `client.resendMaxTimes` with `client.resendPacketDelay` in case it has not. `error` is `null` in case of success and given if the sending has failed.
_Note: Using callback multiplies network load for this command by two or more times._

Usage examples:
```js
light.off(); // Turns the light off instantly
light.off(2000); // Fading the light off over two seconds
```

#### `light.color(hue, saturation, brightness, [kelvin], [duration], [callback])`
Changes the color off a light.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`hue` | int | | Between 0 and 360, representing the color hue in degree which changes the color.
`saturation` | int | | Between 0 and 100, representing the color intensity from 0% to 100%.
`brightness` | int | | Between 0 and 100, representing the light brightness from 0% to 100%.
`kelvin` | int | 3500 | Between 2500 and 9000, representing the color temperature.
`duration` | int | 0 | Fade the color to the new value over time (in milliseconds).
`callback` | function | null | `function(error) {}` Called after the command has reached the light or after `client.resendMaxTimes` with `client.resendPacketDelay` in case it has not. `error` is `null` in case of success and given if the sending has failed.
_Note: Using callback multiplies network load for this command by two or more times._

Usage examples:
```js
light.color(0, 100, 50); // Set to red at 50% brightness
light.color(50, 50, 80, 3500, 2000); // Set to a light green at 80% brightness over next two seconds
```

### Requesting light state and info
Infos of the state and spec of the light can be requested with the following methods:

#### `light.getState(callback)`
Requests general info from a light, this includes color, label and power state. This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`

Example result:
```js
null,
{
  color: { hue: 120, saturation: 0, brightness: 100, kelvin: 8994 },
  power: 0,
  label: 'Kitchen'
}
```

#### `light.getPower(callback)`
Requests current power state (on or off). This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`

Example result:
```js
null,
0 // off
```

#### `light.getFirmwareVersion(callback)`
Requests the firmware version from a light (minor and major version). This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`

Example result:
```js
null,
{
  majorVersion: 2,
  minorVersion: 1
}
```

#### `light.getHardwareVersion(callback)`
Requests the hardware version from a light (vendor, product and version). This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`

Example result:
```js
null,
{
  vendorId: 1,
  vendorName: 'LIFX',
  productId: 1,
  productName: 'Original 1000',
  version: 6
}
```

#### `light.getFirmwareInfo(callback)`
Requests info from the micro controller unit of a light (signal, tx and rx). This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`

Example result:
```js
null,
{
  signal: 0,
  tx: 0,
  rx: 0
}
```

#### `light.getWifiInfo(callback)`
Requests wifi info from a light (signal, tx and rx). This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`

Example result:
```js
null,
{
  signal: 0.000009999999747378752,
  tx: 16584,
  rx: 12580
}
```

#### `light.getWifiVersion(callback)`
Requests the wifi firmware version from the light (minor and major version). This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`

Example result:
```js
null,
{
  majorVersion: 2,
  minorVersion: 1
}
```

#### `light.getAmbientLight(callback)`
Requests the ambient light value in flux from the light. This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`


Example result:
```js
null,
10
```

### Labels
Labels of lights can be requested and set using the following methods:

#### `light.getLabel(callback, [cache])`
Requests the label of a light. This function is asynchronous.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`callback` | function | | `function(error, data) {}`
`cache`    | boolean  | false | Use the last known value for the label and and do not request from the light again

Example result:
```js
null,
'Kitchen'
```

#### `light.setLabel(label, [callback])`
Sets a new label for a light.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`label` | string | | New Label with 32 bit size maximum (which is a length of 32 with non unicode chars).
`callback` | function | null | `function(error) {}` Called after the command has reached the light or after `client.resendMaxTimes` with `client.resendPacketDelay` in case it has not. `error` is `null` in case of success and given if the sending has failed.
_Note: Using callback multiplies network load for this command by two or more times._


Usage examples:
```js
light.setLabel('Bedroom Light');
light.setLabel('Kitchen Light 4', function(err) {
  if (err) { throw err; }
  console.log('New light label has been set');
});
```

### Get a light
#### `client.light(identifier)`
Find a light in the list off all lights by ip, label or id.

Option | Type | Default | Description
------ | ---- | ------- | -----------
`identifier` | string | | Light label (case sensitive) `client.light('Kitchen')`, the ip address `client.light('192.168.2.102')` or the light id `client.light('0123456789012')`

Returns a light object that can then be used to call methods on it. For example `client.light('192.168.2.102').on()`.

### Get all lights

#### `client.lights([filter])`
Get a list of all known lights

Option | Type | Default | Description
------ | ---- | ------- | -----------
`filter` | string | null | Filter list of lights to return only active (`null` or `'on'`), inactive (`'off'`) or all (`''`)

### Client events
The following events might be thrown by the client.

#### `light-new`
This event is thrown when there is a new light discovery that has not been seen at runtime before. This event is provided with the new light object.  
`client.on('light-new', function(light) {});`

#### `light-offline`
This event is thrown when a light hasn't been discovered for a time. The light given is no longer expected to be reachable.  
`client.on('light-offline', function(light) {});`

#### `light-online`
This event is thrown when a light is discovered again after being offline.  
`client.on('light-online', function(light) {});`

### Start / Stop discovery
The discovery for each client can be started and stopped at runtime using these commands:

#### `client.startDiscovery()`
Starts the discovery process.

#### `client.stopDiscovery()`
Stops the discovery process.

### Client settings
For the initialization of the client different settings can be provided. This is an example with the default options:

```js
var LifxClient = require('node-lifx').Client;
var client = new LifxClient();

// ...

client.init({
  lightOfflineTolerance: 3, // A light is offline if not seen for the given amount of discoveries
  messageHandlerTimeout: 45000, // in ms, if not answer in time an error is provided to get methods
  startDiscovery: true, // start discovery after initialization
  resendPacketDelay: 150, // delay between packages if light did not receive a packet (for setting methods with callback)
  resendMaxTimes: 3, // resend packages x times if light did not receive a packet (for setting methods with callback)
  debug: false // logs all messages in console if turned on
});
```
