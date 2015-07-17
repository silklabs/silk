/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// TODO: import silk-api for real
//var api = require('silk-api');
var api = {
  btleConfigService: {
    state: {
      UNREGISTERED: 0,
      REGISTERING: 1,
      REGISTERED: 2,
      ERROR: 3
    },
    uuid: {
      ConfigService: 'beef',
      StateCharacteristic: '259a43754b8748548ef386be0f6faa68',
      RssiCharacteristic: '803ce13fa50f4370a7e7af45a78788b8',
      CurveCharacteristic: 'b3615a405497431fbf71e7949ff3ad2c',
      PeripheralKeyCharacteristic: 'cebebab40e874de988b4cacaa0af6dfb',
      CentralKeyCharacteristic: '6e1de318302b4e90b0d4232b8cda3c67',
      AccessPointCharacteristic: '8e3ea52bbcbf40d18fdcb40d45dcdd3e',
      SecretCharacteristic: 'cb6def342d794d12886351b17fea3bf1',
      ErrorDescriptionCharacteristic: '47be732080e44d29913dfc9083d2eba3',
      VibratePatternCharacteristic: '385a2b58191211e5b60b1697f925ec7b',
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
  this._ensureConfigured(p);
};

DeviceManager.prototype._ensureConfigured = function(p) {
  this._connect(p).then(() => {
    return p.readCharacteristic(decls.uuid.StateCharacteristic);
  }).then(data => {
    var state = data.readUInt8(0);
    p.state = stateToString(state);
    this.emit('stateChange', p);
    // TODO handle ERROR state?
    if (state !== decls.state.UNREGISTERED) {
      // TODO disconnect here?  should we ever get here?
      return Promise.reject('Peripheral not register-able');
    }
    return this._passProximityGate(p);
  }).then(resumeToken => {    
    return this._configureWithoutCrypto(p, resumeToken);
  });
};

DeviceManager.prototype._passProximityGate = function(p) {
  return this._waitForProximity(p).then(() => {
    console.log('Passed proximity gate; disconnecting');
    // TODO: get resume token from config service itself
    var resumeToken = 'TODO-IMPLEMENT-ME';
    return resumeToken;
  });
};

/**
 * Wait until we're close enough to the peripheral so that we
 * can be sure it'll accept our connection.
 */
DeviceManager.prototype._waitForProximity = function(p) {
  return new Promise(resolve => {
    // TODO: this should be a notification
    var updateRssiInterval = setInterval(() => {
      p.readCharacteristic(decls.uuid.RssiCharacteristic).then(data => {
        var rssi = -data.readUInt8(0);
        p.rssi = rssi;
        this.emit('rssi', p);
        if (rssi < -40) {
          // RSSI at or below `min` gets a duty cycle of 0, and at or
          // above `max` is a duty cycle of 1.0.  The cycle scales
          // linearly with RSSI in between.
          var min = -70, max = -40;
          var scaled = (rssi - min) / (max - min);
          var duty = Math.min(1.0, Math.max(0.0, scaled));
          // Set the period to fill 500ms (RSSI poll interval), and be
          // long enough so that a 0.1 change in duty cycle is
          // approximately perceptible to the user.
          var period = 250;
          var pattern = new Uint16Array([
            period * duty, period * (1 - duty),
            period * duty, period * (1 - duty)
          ]);
          // TODO: let the UI at the next level up be responsible for
          // this
          p.writeCharacteristic(decls.uuid.VibratePatternCharacteristic,
                                new Buffer(new Uint8Array(pattern.buffer)));
          return;
        }
        clearInterval(updateRssiInterval);
        resolve();
      }, err => {
        console.log('Error reading rssi', err);
        clearInterval(updateRssiInterval);
        this._disconnect(p).then(() => this._ensureConfigured(p));
      });
    }, 500);
  });
};

DeviceManager.prototype._configureWithoutCrypto = function(p, resumeToken) {
  var network = null;
  // Disconnect peripheral while we're getting Wi-Fi credentials from
  // the user.  This works around random timeouts observed while BLE
  // remains connected.
  return this._disconnect(p).then(() => {
    console.log('Disconnecting peripheral before getting wifi info ...');
    return this.wifiHelper.getWifiNetwork();
  }).then(net => {
    console.log('Got network info, reconnecting ...');
    network = net;
    return this._connect(p);
  }).then(() => {
    return this._resumeSession(p, resumeToken);
  }).then(() => {
    console.log('Writing wifi info to peripheral ...');
    return Promise.all([
      p.writeCharacteristic(decls.uuid.AccessPointCharacteristic,
                            new Buffer(network.ssid, 'utf8')),
      p.writeCharacteristic(decls.uuid.SecretCharacteristic,
                            new Buffer(network.secret, 'utf8')),
    ]);
  }).then(() => {
    // TODO: get this from state charc notify
    p.state = 'registered';
    this.emit('stateChange', p);
    console.log(' ... finished configuring, disconnecting');
    setTimeout(() => this._disconnect(p), 2000);
  }).catch(() => this._disconnect(p).then(() => this._ensureConfigured(p)));
};

DeviceManager.prototype._resumeSession = function(p, token) {
  console.log(`Resuming session for peripheral with token ${token} ...`);
  // TODO: use `token` to actually resume the session; on the device
  // side, config-service sessions persist across reconnects (which is
  // a bug).
  return Promise.resolve();
};

DeviceManager.prototype._connect = function(p) {
  p.prettyName = p.advertisement.localName;
  p.state = 'discovered';
  this.devices[p.id] = p;  
  this.emit('discover', p);
  return p.connect().then(() => {
    p.state = 'connected';
    this.emit('connect', p);
  });
};

DeviceManager.prototype._disconnect = function(p) {
  return p.disconnect().then(() => {
    delete this.devices[p.id];
    this.emit('disconnect', p);
  });
};

/*
function configureWithCrypto() {
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
}
*/

module.exports = DeviceManager;
