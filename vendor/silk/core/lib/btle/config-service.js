/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

//
// Algorithm:
//
//   Peripheral starts in the Unregistered state.  Central sets up to
//   be notified on mutation of Peripheral Key.  Central writes Curve
//   to initiate registration.  Peripheral enters Registering state.
//   Peripheral and Central simultaneously generate session keys based
//   on Curve using ECDH.  Peripheral notifies Peripheral Key after
//   generation, and Central writes Central Key.  Central and
//   Peripheral compute AES session key by hashing ECDH shared secret
//   using SHA-256.  Central chooses secure random IV and encodes wifi
//   AP name, writing it to Access Point.  Central chooses secure
//   random IV and encodes wifi secret (if any), writing it to Secret.
//   If there's no wifi secret, Central writes 0-length buffer to
//   Secret to indicate open network.
//

let api = require('../api');
let assert = require('assert');
let bleno = require('bleno');
let events = require('events');
let log = require('../log')('config-service');
let util = require('util');
import { processthrow } from '../util';
let vibrator = require('../vibrator')();
const decls = api.btleConfigService;

// TODO: can we use ES6 class sugar and still interoperate with bleno
// super-classes?
function DescriptionDescriptor(text) {
  bleno.Descriptor.call(this, {
    uuid: '2901',
    value: text
  });
}

// value: enum { Unregistered, Registering, Registered, Error }
function StateCharacteristic(service) {
  StateCharacteristic.super_.call(this, {
    uuid: StateCharacteristic.uuid,
    properties: ['notify', 'read'],
    descriptors: [
      new DescriptionDescriptor('State of registration.')
    ]
  });
  this.service = service;
}
util.inherits(StateCharacteristic, bleno.Characteristic);
StateCharacteristic.uuid = decls.uuid.StateCharacteristic;

StateCharacteristic.prototype.onReadRequest = function(offset, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  // It's OK for clients to request our state without passing through
  // the proximity gate.
  let data = new Buffer(1);
  data.writeUInt8(this.service.state, 0);
  callback(this.RESULT_SUCCESS, data);
};

function ServerConnectionStatusCharacteristic(service) {
  ServerConnectionStatusCharacteristic.super_.call(this, {
    uuid: ServerConnectionStatusCharacteristic.uuid,
    properties: ['notify', 'read'],
    descriptors: [
      new DescriptionDescriptor('Connection Status')
    ]
  });
  this.service = service;
}
util.inherits(ServerConnectionStatusCharacteristic, bleno.Characteristic);
ServerConnectionStatusCharacteristic.uuid = decls.uuid.ServerConnectionStatusCharacteristic;

ServerConnectionStatusCharacteristic.prototype.onReadRequest = function(offset, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  let data = new Buffer(this.service.serverConnectionStatus, 'utf8');
  callback(this.RESULT_SUCCESS, data);
};

function RssiCharacteristic(service) {
  RssiCharacteristic.super_.call(this, {
    uuid: RssiCharacteristic.uuid,
    properties: ['notify', 'read'],
    descriptors: [
      new DescriptionDescriptor('Rssi at device <-- client.')
    ]
  });
  this.service = service;
}
util.inherits(RssiCharacteristic, bleno.Characteristic);
RssiCharacteristic.uuid = decls.uuid.RssiCharacteristic;

RssiCharacteristic.prototype.onReadRequest = function(offset, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  // It's OK for clients to request our rssi without passing through
  // the proximity gate.
  let data = new Buffer(1);
  data.writeUInt8(-this.service.rssi, 0);
  callback(this.RESULT_SUCCESS, data);
};
// TODO: notify

function CurveCharacteristic(service) {
  CurveCharacteristic.super_.call(this, {
    uuid: CurveCharacteristic.uuid,
    properties: ['write', 'writeWithoutResponse'],
    descriptors: [
      new DescriptionDescriptor('Elliptic curve to use for crypto.'),
    ]
  });
  this.service = service;
}
util.inherits(CurveCharacteristic, bleno.Characteristic);
CurveCharacteristic.uuid = decls.uuid.CurveCharacteristic;

CurveCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  this.service.useECCurve(data.toString('utf8'));
  callback(this.RESULT_SUCCESS);
};

function PeripheralKeyCharacteristic(service) {
  PeripheralKeyCharacteristic.super_.call(this, {
    uuid: PeripheralKeyCharacteristic.uuid,
    properties: ['notify', 'read'],
    descriptors: [
      new DescriptionDescriptor('Session key of peripheral device.')
    ]
  });
  this.service = service;
}
util.inherits(PeripheralKeyCharacteristic, bleno.Characteristic);
PeripheralKeyCharacteristic.uuid = decls.uuid.PeripheralKeyCharacteristic;

PeripheralKeyCharacteristic.prototype.onReadRequest = function(offset, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }

  // TODO lock down other characteristics, ensure we've passed the
  // proximity gate. There's no real harm that out-of-order
  // reads/writes can cause, but they might be evidence of
  // malfeasance.
  this.service.proximityPromise.then(() => {
    callback(this.RESULT_SUCCESS, new Buffer(this.service.getKey(), 'binary'));
  })
  .catch(processthrow);
};

function CentralKeyCharacteristic(service) {
  CentralKeyCharacteristic.super_.call(this, {
    uuid: CentralKeyCharacteristic.uuid,
    properties: ['write', 'writeWithoutResponse'],
    descriptors: [
      new DescriptionDescriptor('Session key of central device.')
    ]
  });
  this.service = service;
}
util.inherits(CentralKeyCharacteristic, bleno.Characteristic);
CentralKeyCharacteristic.uuid = decls.uuid.CentralKeyCharacteristic;

CentralKeyCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  this.service.useCentralKey(data.toString('binary'));
  callback(this.RESULT_SUCCESS);
};

function AccessPointCharacteristic(service) {
  AccessPointCharacteristic.super_.call(this, {
    uuid: AccessPointCharacteristic.uuid,
    properties: ['write', 'writeWithoutResponse'],
    descriptors: [
      new DescriptionDescriptor('Access point to register (encrypted).')
    ]
  });
  this.service = service;
}
util.inherits(AccessPointCharacteristic, bleno.Characteristic);
AccessPointCharacteristic.uuid = decls.uuid.AccessPointCharacteristic;

AccessPointCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  this.service.setAccessPoint(data.toString('binary'));
  callback(this.RESULT_SUCCESS);
};

function SecretCharacteristic(service) {
  SecretCharacteristic.super_.call(this, {
    uuid: SecretCharacteristic.uuid,
    properties: ['write', 'writeWithoutResponse'],
    descriptors: [
      new DescriptionDescriptor('Secret of access point (encrypted).')
    ]
  });
  this.service = service;
}
util.inherits(SecretCharacteristic, bleno.Characteristic);
SecretCharacteristic.uuid = decls.uuid.SecretCharacteristic;

SecretCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  this.service.setSecret(data.toString('binary'));
  callback(this.RESULT_SUCCESS);
};

function DeviceIdCharacteristic(service) {
  DeviceIdCharacteristic.super_.call(this, {
    uuid: DeviceIdCharacteristic.uuid,
    properties: ['read'],
    descriptors: [
      new DescriptionDescriptor('Device ID.')
    ]
  });
  this.service = service;
}
util.inherits(DeviceIdCharacteristic, bleno.Characteristic);
DeviceIdCharacteristic.uuid = decls.uuid.DeviceIdCharacteristic;

DeviceIdCharacteristic.prototype.onReadRequest = function(offset, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  callback(this.RESULT_SUCCESS, new Buffer(this.service.deviceId, 'hex'));
};

function ErrorDescriptionCharacteristic(service) {
  ErrorDescriptionCharacteristic.super_.call(this, {
    uuid: ErrorDescriptionCharacteristic.uuid,
    properties: ['notify', 'read'],
    descriptors: [
      new DescriptionDescriptor('Description of most recent error.')
    ]
  });
  this.service = service;
}
util.inherits(ErrorDescriptionCharacteristic, bleno.Characteristic);
ErrorDescriptionCharacteristic.uuid = decls.uuid.ErrorDescriptionCharacteristic;

ErrorDescriptionCharacteristic.prototype.onReadRequest = function(offset, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_OFFSET);
  }
  callback(this.RESULT_SUCCESS, new Buffer(this.service.errorMessage, 'utf8'));
};

function VibratePatternCharacteristic(service) {
  VibratePatternCharacteristic.super_.call(this, {
    uuid: VibratePatternCharacteristic.uuid,
    properties: ['write', 'writeWithoutResponse'],
    descriptors: [
      new DescriptionDescriptor('16-bit LE on/off vibrate pattern.'),
    ]
  });
  this.service = service;
}
util.inherits(VibratePatternCharacteristic, bleno.Characteristic);
VibratePatternCharacteristic.uuid = decls.uuid.VibratePatternCharacteristic;

VibratePatternCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  if (offset) {
    return callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
  }
  if (data.length % 2 === 1) {
    return callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
  }

  let pattern = [];
  for (let i = 0; i < data.length / 2; i++) {
    pattern[i] = data.readUInt16LE(i * 2);
  }
  log.debug(`Issuing vibrator pattern: [${pattern.toString()}]`);
  vibrator.pattern(...pattern);
  callback(this.RESULT_SUCCESS);
};


function ConfigService(id) {
  bleno.PrimaryService.call(this, {
    uuid: ConfigService.uuid,
    characteristics: [
      new StateCharacteristic(this),
      new ServerConnectionStatusCharacteristic(this),
      new RssiCharacteristic(this),
      new CurveCharacteristic(this),
      new PeripheralKeyCharacteristic(this),
      new CentralKeyCharacteristic(this),
      new AccessPointCharacteristic(this),
      new SecretCharacteristic(this),
      new DeviceIdCharacteristic(this),
      new ErrorDescriptionCharacteristic(this),
      new VibratePatternCharacteristic(this),
    ],
  });
  events.EventEmitter.call(this);
  this.deviceId = id;
  this.clearState();
}
util.inherits(ConfigService, bleno.PrimaryService);
util.inherits(ConfigService, events.EventEmitter);

ConfigService.STATE_UNREGISTERED = decls.state.UNREGISTERED;
ConfigService.STATE_REGISTERING = decls.state.REGISTERING;
ConfigService.STATE_REGISTERED = decls.state.REGISTERED;
ConfigService.STATE_ERROR = decls.state.ERROR;
ConfigService.uuid = decls.uuid.ConfigService;
ConfigService.characteristicUuidToName = { };
ConfigService.characteristicUuidToName[StateCharacteristic.uuid] = 'state';
ConfigService.characteristicUuidToName[ServerConnectionStatusCharacteristic.uuid] = 'serverConnectionStatus';
ConfigService.characteristicUuidToName[RssiCharacteristic.uuid] = 'rssi';
ConfigService.characteristicUuidToName[CurveCharacteristic.uuid] = 'curve';
ConfigService.characteristicUuidToName[PeripheralKeyCharacteristic.uuid] = 'peripheralKey';
ConfigService.characteristicUuidToName[CentralKeyCharacteristic.uuid] = 'centralKey';
ConfigService.characteristicUuidToName[AccessPointCharacteristic.uuid] = 'accessPoint';
ConfigService.characteristicUuidToName[SecretCharacteristic.uuid] = 'secret';
ConfigService.characteristicUuidToName[DeviceIdCharacteristic.uuid] = 'deviceId';
ConfigService.characteristicUuidToName[ErrorDescriptionCharacteristic.uuid] = 'errorDescription';
ConfigService.characteristicUuidToName[VibratePatternCharacteristic.uuid] = 'vibratePattern';

ConfigService.prototype.clearState = function() {
  log.info('Clearing state');

  this.ap = null;
  this.serverConnectionStatus = '';
  this.crypto = null;
  this.errorMessage = '';
  this.secret = null;
  this.unsecured = false;
  this.rssi = -80;
  this.resolveProximityPromise = null;
  this.proximityPromise = new Promise(resolve => {
    this.resolveProximityPromise = resolve;
  });

  this.changeState(ConfigService.STATE_UNREGISTERED);
};

ConfigService.prototype.changeState = function(state) {
  log.info('Changing state to ' + state);
  // TODO: notify
  this.state = state;
  this.emit('stateChange', state);
};

ConfigService.prototype.updateRssi = function(rssi) {
  this.rssi = rssi;
  if (rssi < -40) {
    return;
  }
  if (this.resolveProximityPromise) {
    this.resolveProximityPromise.call(null);
    this.resolveProximityPromise = null;
  }
};

ConfigService.prototype.getKey = function() {
  return this.crypto ? this.crypto.exportPublic() : '';
};

ConfigService.prototype.useECCurve = function(curve) {
  assert(!this.crypto);

  log.info('Using elliptic curve "' + curve + '"');
  this.crypto = api.crypto.create(curve);
  this.changeState(ConfigService.STATE_REGISTERING);
};

ConfigService.prototype.useCentralKey = function(key) {
  assert(this.crypto);

  log.info('Deriving session key from central key');
  this.crypto.deriveShared(key);
};

ConfigService.prototype.setAccessPoint = function(apEnc) {
  if (this.crypto) {
    log.info('Decrypting access point ...');
    this.ap = this.crypto.decrypt(apEnc);
  } else {
    this.ap = apEnc;
  }

  this.checkDone();
};

ConfigService.prototype.setSecret = function(secretEnc) {
  if (secretEnc.length === 0) {
    log.info('  ... no secret, unsecured network');
    this.unsecured = true;
  } else if (this.crypto) {
    log.info('Decrypting secret ...');
    this.secret = this.crypto.decrypt(secretEnc);
  } else {
    this.secret = secretEnc;
  }

  this.checkDone();
};

ConfigService.prototype.checkDone = function() {
  if (!(this.ap && (this.secret || this.unsecured))) {
    return;
  }
  log.info('Finished registering wifi!');
  // TODO persist
  this.changeState(ConfigService.STATE_REGISTERED);
  // TODO notify to stop BLE service
};

module.exports = id => new ConfigService(id);
