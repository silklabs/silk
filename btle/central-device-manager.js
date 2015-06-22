/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// TODO: import weave-api for real
//var api = require('weave-api');
var api = {
  btleConfigService: {
    state: {
      UNREGISTERED: 0,
      REGISTERING: 1,
      REGISTERED: 2,
      ERROR: 3
    },
    uuid: {
      ConfigService: 'fb349b5f8000008000100000efbe0000',
      StateCharacteristic: '259a43754b8748548ef386be0f6faa68',
      RssiCharacteristic: '803ce13fa50f4370a7e7af45a78788b8',
      CurveCharacteristic: 'b3615a405497431fbf71e7949ff3ad2c',
      PeripheralKeyCharacteristic: 'cebebab40e874de988b4cacaa0af6dfb',
      CentralKeyCharacteristic: '6e1de318302b4e90b0d4232b8cda3c67',
      AccessPointCharacteristic: '8e3ea52bbcbf40d18fdcb40d45dcdd3e',
      SecretCharacteristic: 'cb6def342d794d12886351b17fea3bf1',
      ErrorDescriptionCharacteristic: '47be732080e44d29913dfc9083d2eba3',
    }
  },

  crypto: {
    create: () => {
      return {
        exportPublic: () => 'key',
        deriveShared: () => 'shared',
        encrypt: (text) => Promise.resolve(text),
        decrypt: (text) => text,
      };
    },
  },
};

var Buffer = require('buffer').Buffer;
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var decls = api.btleConfigService;
var normUuid = require('./util').normUuid;

function stateToString(state) {
  switch (state) {
  case decls.state.UNREGISTERED:
    return 'unregistered';
  case decls.state.REGISTERNIG:
    return 'registering';
  case decls.state.REGISTERED:
    return 'registered';
  case decls.state.ERROR:
    return 'error';
  default:
    return '???';
  };
}

function DeviceManager(scanner, wifiHelper) {
  EventEmitter.call(this);
  this.devices = { };
  this.scanner = scanner;
  this.wifiHelper = wifiHelper;
  this.scanner.on('discover', this._onPeripheralDiscovered.bind(this));
}
util.inherits(DeviceManager, EventEmitter);

DeviceManager.prototype.start = function() {
  this.scanner.startScanning();
};

DeviceManager.prototype.stop = function() {
  this.scanner.stopScanning();
};

DeviceManager.prototype.enumerateDevices = function() {
  var devs = this.devices;
  return Object.keys(devs).map(function(id) { return devs[id]; });
};

DeviceManager.prototype._onPeripheralDiscovered = function(p) {
  if (!p.advertisement || !p.advertisement.services
      || !p.advertisement.services.some(function(u) {
          return normUuid(u) === normUuid(decls.uuid.ConfigService); })) {
    //console.log('(Ignoring non-configurable peripheral '+ p.id +')');
    return;
  }

  p.prettyName = p.advertisement.localName;
  p.state = 'discovered';
  this.devices[p.id] = p;  
  this.emit('discover', p);

  var self = this;
  var central;
  p.connect().then(function() {
    // TODO: listen for disconnect
    p.state = 'connected';
    self.emit('connect', p);
    // TODO: register for notify on state charc
    return p.readCharacteristic(decls.uuid.StateCharacteristic);
  }).then(function(data) {
    var state = data.readUInt8(0);
    p.state = stateToString(state);
    self.emit('stateChange', p);
    // TODO handle ERROR state?
    if (state !== decls.state.UNREGISTERED) {
      // TODO disconnect here?
      return Promise.reject('Peripheral not register-able');
    }
    return new Promise(function(resolve) {
      // Wait until we're close enough to the peripheral so that we
      // can be sure it'll accept our connection.
      // TODO: this should be a notification
      var updateRssiInterval = setInterval(function() {
        p.readCharacteristic(decls.uuid.RssiCharacteristic).then(
          function(data) {
            var rssi = -data.readUInt8(0);
            p.rssi = rssi;
            self.emit('rssi', p);
            if (rssi < -40) {
              return;
            }
            clearInterval(updateRssiInterval);
            resolve();
          });
      }, 500);
    });
  }).then(function() {
    return p.writeCharacteristic(decls.uuid.CurveCharacteristic,
                                 new Buffer('curve25519', 'utf8'));
  }).then(function() {
    // TODO: get this from state charc notify
    p.state = 'registering';
    self.emit('stateChange', p);
    central = api.crypto.create('curve25519');
    return p.writeCharacteristic(decls.uuid.CentralKeyCharacteristic,
                                 new Buffer(central.exportPublic(), 'binary'));
  }).then(function() {
    return p.readCharacteristic(decls.uuid.PeripheralKeyCharacteristic);
  }).then(function(data) {
    var key = data.toString('binary');
    central.deriveShared(key);
    return self.wifiHelper.getWifiNetwork();
  }).then(function(network) {
    Promise.all([
      central.encrypt(network.ssid).then(function(ct) {
        return p.writeCharacteristic(decls.uuid.AccessPointCharacteristic,
                                     new Buffer(ct, 'utf8'));
      }),
      central.encrypt(network.secret).then(function(ct) {
        return p.writeCharacteristic(decls.uuid.SecretCharacteristic,
                                     new Buffer(ct, 'utf8'));
      })
    ]).then(function() {
      // TODO: get this from state charc notify
      p.state = 'registered';
      self.emit('stateChange', p);
      setTimeout(function() {
        p.disconnect();
        delete self.devices[p.id];
        self.emit('disconnect', p);
      }, 2000);
    });
  });
};

module.exports = DeviceManager;
