/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

const debug = require('debug');
const log = {
  debug: debug('silk:central-device-manager:debug'),
  info: debug('silk:central-device-manager:info'),
  warn: debug('silk:central-device-manager:warn'),
};

// TODO: import silk-api for real
//var api = require('silk-api');
var api = {
  btleConfigService: {
    state: {
      UNREGISTERED: 0,
      REGISTERING: 1,
      REGISTERED: 2,
      ERROR: 3,
    },
    uuid: {
      ConfigService: 'beef',
      StateCharacteristic: '259a43754b8748548ef386be0f6faa68',
      ServerConnectionStatusCharacteristic: '595d664ac5314245a7a89aeae6883cfe',
      RssiCharacteristic: '803ce13fa50f4370a7e7af45a78788b8',
      CurveCharacteristic: 'b3615a405497431fbf71e7949ff3ad2c',
      PeripheralKeyCharacteristic: 'cebebab40e874de988b4cacaa0af6dfb',
      CentralKeyCharacteristic: '6e1de318302b4e90b0d4232b8cda3c67',
      AccessPointCharacteristic: '8e3ea52bbcbf40d18fdcb40d45dcdd3e',
      SecretCharacteristic: 'cb6def342d794d12886351b17fea3bf1',
      DeviceIdCharacteristic: '3f0497ec81b24850a2579237bcf8591a',
      ErrorDescriptionCharacteristic: '47be732080e44d29913dfc9083d2eba3',
      VibratePatternCharacteristic: '385a2b58191211e5b60b1697f925ec7b',
    },
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

var decls = api.btleConfigService;
var normUuid = require('./util').normUuid;

function stateToString(state) {
  switch (state) {
  case decls.state.UNREGISTERED:
    return 'unregistered';
  case decls.state.REGISTERING:
    return 'registering';
  case decls.state.REGISTERED:
    return 'registered';
  case decls.state.ERROR:
    return 'error';
  default:
    return '???';
  }
}

function rejectFwd(e) {
  return Promise.reject(e);
}

function DeviceManager(scanner, getWifiConfig) {
  EventEmitter.call(this);
  this.devices = { };
  this.scanner = scanner;
  this.getWifiConfig = getWifiConfig;
  this.scanner.on('discover', this._onPeripheralDiscovered.bind(this));
  this.scanner.on('disconnect', this._onPeripheralDisconnected.bind(this));
}
DeviceManager.prototype = Object.create(EventEmitter.prototype);

DeviceManager.prototype.start = function() {
  log.info('startScanning');
  this.scanner.startScanning();
};

DeviceManager.prototype.stop = function() {
  log.info('stopScanning');
  this.scanner.stopScanning();
};

DeviceManager.prototype.enumerateDevices = function() {
  return Object.keys(this.devices).map((id) => this.devices[id]);
};

DeviceManager.prototype._onPeripheralDiscovered = function(p) {
  if (!p.advertisement || !p.advertisement.services
      || !p.advertisement.services.some(function(u) {
          return normUuid(u) === normUuid(decls.uuid.ConfigService); })) {
    //log.debug('(Ignoring non-configurable peripheral '+ p.id +')');
    return;
  }

  if (p.id in this.devices) {
    log.debug('already discovered peripheral', p.id);
    p = this.devices[p.id];
  } else {
    log.info('discovered Silk peripheral:', p.id);
    p.prettyName = p.advertisement.localName;
    p.serverConnectionStatus = '';
    p.error = '';
    p.state = 'discovered';
    p.connected = false;
    p.configuring = false;
    this.devices[p.id] = p;
    this.emit('discover', p);
  }

  if (!p.connected) {
    this._connect(p)
    .catch(err => {
      // unable to connect to peripheral. disconnect to force rescan
      // so that we can try again if the peripheral is still there
      log.warn(`connect to ${p.id} failed. disconnect and retry`, err);
      this._disconnect(p);
    });
  }
};

DeviceManager.prototype._onPeripheralDisconnected = function(id) {
  if (!(id in this.devices)) {
    log.debug('unknown peripheral disconnected:', id);
    return;
  }
  let p = this.devices[id];

  log.info('disconnected from peripheral:', p.id);
  clearTimeout(p._pollStatusTimer);
  p.state = 'disconnected';
  p.connected = false;
  this.emit('disconnect', p);

  // Subsequent advertisements are not received after disconnecting from
  // the peripheral. Workaround this by restarting scanning.
  this.stop();
  this.start();
};

DeviceManager.prototype._readStateCharacteristic = function(p) {
  return p.readCharacteristic(decls.uuid.StateCharacteristic)
  .then(data => {
    var state = stateToString(data.readUInt8(0));

    if (p.state !== state) {
      log.debug('new peripheral state:', p.id, state);
      p.state = state;
      this.emit('stateChange', p);

      if (p.state === 'unregistered' && !p.configuring) {
        this._configureDevice(p).catch(() => {});
      }
    }
    return state;
  }, rejectFwd);
};

DeviceManager.prototype._readServerConnectionStatusCharacteristic = function(p) {
  return p.readCharacteristic(decls.uuid.ServerConnectionStatusCharacteristic)
  .then(data => {
    var serverConnectionStatus = data.toString('utf8');

    if (p.serverConnectionStatus !== serverConnectionStatus) {
      log.debug('new connection status', p.id, serverConnectionStatus);
      p.serverConnectionStatus = serverConnectionStatus;
      this.emit('statusChange', p);
    }
    return serverConnectionStatus;
  }, rejectFwd);
};

DeviceManager.prototype._readErrorDescriptionCharacteristic = function(p) {
  return p.readCharacteristic(decls.uuid.ErrorDescriptionCharacteristic)
  .then(data => {
    var error = data.toString('utf8');

    if (p.error !== error) {
      log.debug('new peripheral error', p.id, error);
      p.error = error;
      this.emit('errorChange', p);
    }
    return error;
  }, rejectFwd);
};

DeviceManager.prototype._pollStatus = function(p) {
  clearTimeout(p._pollStatusTimer);
  p._pollStatusTimer = setTimeout(() => {
    this._readStateCharacteristic(p)
    .then(() => this._readServerConnectionStatusCharacteristic(p), rejectFwd)
    .then(() => this._readErrorDescriptionCharacteristic(p), rejectFwd)
    .then(() => this._pollStatus(p), rejectFwd)
    .catch(e => {
      log.debug('cant read from device, likely not there, disconnect', e);
      this._disconnect(p);
    });
  }, 500);
  return Promise.resolve();
};

DeviceManager.prototype._configureDevice = function(p) {
  p.configuring = true;
  return this._passProximityGate(p)
  .then(resumeToken => this._configureWithoutCrypto(p, resumeToken), rejectFwd)
  .then(() => p.configuring = false, rejectFwd)
  .catch(() => {
    p.configuring = false;
    log.warn('error configuring, disconnect and retry');
    this._disconnect(p);
    return Promise.reject(new Error('error configuring'));
  });
};

DeviceManager.prototype._passProximityGate = function(p) {
  return this._waitForProximity(p)
  .then(() => {
    log.debug('Passed proximity gate');
    // TODO: get resume token from config service itself
    var resumeToken = 'TODO-IMPLEMENT-ME';
    return resumeToken;
  }, rejectFwd);
};

/**
 * Wait until we're close enough to the peripheral so that we
 * can be sure it'll accept our connection.
 */
DeviceManager.prototype._waitForProximity = function(p) {
  return new Promise((resolve, reject) => {
    // TODO: this should be a notification
    var updateRssiInterval = setInterval(() => {
      p.readCharacteristic(decls.uuid.RssiCharacteristic)
      .then(data => {
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
          // Set the period to fill 100ms (RSSI poll interval), and be
          // long enough so that a 0.1 change in duty cycle is
          // approximately perceptible to the user.
          var period = 100;
          var pattern = new Uint16Array([period * duty, period * (1 - duty)]);
          // TODO: let the UI at the next level up be responsible for
          // this
          p.writeCharacteristic(decls.uuid.VibratePatternCharacteristic,
                                new Buffer(new Uint8Array(pattern.buffer)))
          .then(() => {}, () => {
            clearInterval(updateRssiInterval);
            log.debug('error writing vibrate pattern', p.id);
            reject(new Error('error writting vibrate pattern'));
          });
          return;
        }
        clearInterval(updateRssiInterval);
        resolve();
      }, rejectFwd)
      .catch(err => {
        clearInterval(updateRssiInterval);
        log.debug('Error reading rssi', err, p.id);
        reject(new Error('Error reading rssi'));
      });
    }, 100);
  });
};

DeviceManager.prototype._configureWithoutCrypto = function(p, resumeToken) {
  var network = null;
  return this.getWifiConfig()
  .then(net => {
    log.debug('Got network info');
    network = net;
    return this._readStateCharacteristic(p);
  }, rejectFwd)
  .then(state => {
    if (state === 'registered') {
      // Some time may have passed since getting network info. Don't proceed
      // if we are now registered (or can't read state cause we are longer
      // connected to device)
      log.debug('Device is registered, bailing on configuration');
      return Promise.reject(Error('Device is registered'));
    }

    log.debug('Writing wifi info to peripheral ...');
    return Promise.all([
      p.writeCharacteristic(decls.uuid.AccessPointCharacteristic,
                            new Buffer(network.ssid, 'utf8')),
      p.writeCharacteristic(decls.uuid.SecretCharacteristic,
                            new Buffer(network.secret, 'utf8')),
    ]);
  }, rejectFwd)
  .then(() => {
    log.info('finished configuring');
  }, rejectFwd);
};

DeviceManager.prototype._resumeSession = function(p, token) {
  log.debug(`Resuming session for peripheral with token ${token} ...`);
  // TODO: use `token` to actually resume the session; on the device
  // side, config-service sessions persist across reconnects (which is
  // a bug).
  return Promise.resolve();
};

DeviceManager.prototype._connect = function(p) {
  log.info('connecting to peripheral:', p.id);
  return p.connect()
  .then(() => p.readCharacteristic(decls.uuid.DeviceIdCharacteristic), rejectFwd)
  .then(id => {
    p.deviceId = id.toString('hex');
    log.info(`read device ID ${p.deviceId}`);
  }, rejectFwd)
  .then(() => this._pollStatus(p), rejectFwd) // TODO: change to notify
  .then(() => {
    log.info('connected to peripheral:', p.id);
    p.state = 'connected';
    p.connected = true;
    this.emit('connect', p);
  }, rejectFwd);
};

DeviceManager.prototype._disconnect = function(p) {
  return p.disconnect();
};

/*
TODO: this probably will not work post configure refactor
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
