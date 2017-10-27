# Bluetooth Low Energy example

This is the example from our [early look video](https://www.youtube.com/watch?v=XtRIyt7JZio), in here we are using Bluetooth LE to interact with the LiFx light bulb based on their proximity.

The Silk program's code goes like this:

```js
'use strict';

const log = require('silk-log')('main');
log.info('hello world');

/////////////////////////////////////////

const lifxApi = require('node-lifx');
let light = null;
let lifx = new lifxApi.Client();
lifx.init();

lifx.on('light-new', newLight => {
  log.info(`Found Lifx light ${newLight.id}`);
  light = newLight;
  setLight(30);
});

function setLight(brightness) {
  if (light) {
    light.on();
    light.color(190, 88, brightness);
  }
}

////////////////////////////////////////////////

const noble = require('noble');
noble.on('stateChange', state => {
  if (state === 'poweredOn') {
    noble.startScanning([], true);
  }
});

noble.on('discover', peripheral => {
  let name = peripheral.advertisement.localName;
  if (name === 'myAdvertisement') {
    log.info(`discovered ${name} rssi: ${peripheral.rssi}`);
    setLight(peripheral.rssi + 100);
  }
});
```

And on the computer, an `advertise.js` should look like this:


```js
var bleno = require('bleno');

bleno.on('stateChange', state => {
  if (state === 'poweredOn') {
    bleno.startAdvertising('myAdvertisement', ['ffff']);
  }
});
```
