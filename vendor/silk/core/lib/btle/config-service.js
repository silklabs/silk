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

import assert from 'assert';
import { btleConfigService as decls, crypto } from '../api';
import { Descriptor, Characteristic, PrimaryService } from 'bleno';
import makeLog from '../log';
import makeVibrator from '../vibrator';
import { processthrow } from '../util';

const log = makeLog('config-service');
const vibrator = makeVibrator();

class DescriptionDescriptor extends Descriptor {
  constructor(text) {
    super({
      uuid: '2901',
      value: text,
    });
  }
}

// value: enum { Unregistered, Registering, Registered, Error }
class StateCharacteristic extends Characteristic {
  static uuid = decls.uuid.StateCharacteristic

  service = null

  constructor() {
    super({
      uuid: StateCharacteristic.uuid,
      properties: ['notify', 'read'],
      descriptors: [
        new DescriptionDescriptor('State of registration.'),
      ],
    });
  }

  onReadRequest(offset, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    // It's OK for clients to request our state without passing through
    // the proximity gate.
    let data = new Buffer(1);
    data.writeUInt8(this.service.state, 0);
    callback(this.RESULT_SUCCESS, data);
  }
}

class ServerConnectionStatusCharacteristic extends Characteristic {
  static uuid = decls.uuid.ServerConnectionStatusCharacteristic

  service = null

  constructor() {
    super({
      uuid: ServerConnectionStatusCharacteristic.uuid,
      properties: ['notify', 'read'],
      descriptors: [
        new DescriptionDescriptor('Connection Status'),
      ],
    });
  }

  onReadRequest(offset, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    let data = new Buffer(this.service.serverConnectionStatus, 'utf8');
    callback(this.RESULT_SUCCESS, data);
  }
}

class RssiCharacteristic extends Characteristic {
  static uuid = decls.uuid.RssiCharacteristic

  service = null

  constructor() {
    super({
      uuid: RssiCharacteristic.uuid,
      properties: ['notify', 'read'],
      descriptors: [
        new DescriptionDescriptor('Rssi at device <-- client.'),
      ],
    });
  }

  onReadRequest(offset, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    // It's OK for clients to request our rssi without passing through
    // the proximity gate.
    let data = new Buffer(1);
    data.writeUInt8(-this.service.rssi, 0);
    callback(this.RESULT_SUCCESS, data);
  }

  // TODO: notify
}

class CurveCharacteristic extends Characteristic {
  static uuid = decls.uuid.CurveCharacteristic

  service = null

  constructor() {
    super({
      uuid: CurveCharacteristic.uuid,
      properties: ['write', 'writeWithoutResponse'],
      descriptors: [
        new DescriptionDescriptor('Elliptic curve to use for crypto.'),
      ],
    });
  }

  onWriteRequest(data, offset, withoutResponse, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    this.service.useECCurve(data.toString('utf8'));
    callback(this.RESULT_SUCCESS);
  }
}

class PeripheralKeyCharacteristic extends Characteristic {
  static uuid = decls.uuid.PeripheralKeyCharacteristic

  service = null

  constructor() {
    super({
      uuid: PeripheralKeyCharacteristic.uuid,
      properties: ['notify', 'read'],
      descriptors: [
        new DescriptionDescriptor('Session key of peripheral device.'),
      ],
    });
  }

  onReadRequest(offset, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }

    // TODO lock down other characteristics, ensure we've passed the
    // proximity gate. There's no real harm that out-of-order
    // reads/writes can cause, but they might be evidence of
    // malfeasance.
    this.service.proximityPromise.then(() => {
      callback(this.RESULT_SUCCESS,
               new Buffer(this.service.getKey(), 'binary'));
    })
    .catch(processthrow);
  }
}

class CentralKeyCharacteristic extends Characteristic {
  static uuid = decls.uuid.CentralKeyCharacteristic

  service = null

  constructor() {
    super({
      uuid: CentralKeyCharacteristic.uuid,
      properties: ['write', 'writeWithoutResponse'],
      descriptors: [
        new DescriptionDescriptor('Session key of central device.'),
      ],
    });
  }

  onWriteRequest(data, offset, withoutResponse, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    this.service.useCentralKey(data.toString('binary'));
    callback(this.RESULT_SUCCESS);
  }
}

class AccessPointCharacteristic extends Characteristic {
  static uuid = decls.uuid.AccessPointCharacteristic

  service = null

  constructor() {
    super({
      uuid: AccessPointCharacteristic.uuid,
      properties: ['write', 'writeWithoutResponse'],
      descriptors: [
        new DescriptionDescriptor('Access point to register (encrypted).'),
      ],
    });
  }

  onWriteRequest(data, offset, withoutResponse, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    this.service.setAccessPoint(data.toString('binary'));
    callback(this.RESULT_SUCCESS);
  }
}

class SecretCharacteristic extends Characteristic {
  static uuid = decls.uuid.SecretCharacteristic

  service = null

  constructor() {
    super({
      uuid: SecretCharacteristic.uuid,
      properties: ['write', 'writeWithoutResponse'],
      descriptors: [
        new DescriptionDescriptor('Secret of access point (encrypted).'),
      ],
    });
  }

  onWriteRequest(data, offset, withoutResponse, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    this.service.setSecret(data.toString('binary'));
    callback(this.RESULT_SUCCESS);
  }
}

class DeviceIdCharacteristic extends Characteristic {
  static uuid = decls.uuid.DeviceIdCharacteristic

  service = null

  constructor() {
    super({
      uuid: DeviceIdCharacteristic.uuid,
      properties: ['read'],
      descriptors: [
        new DescriptionDescriptor('Device ID.'),
      ],
    });
  }

  onReadRequest(offset, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    callback(this.RESULT_SUCCESS, new Buffer(this.service.deviceId, 'hex'));
  }
}

class ErrorDescriptionCharacteristic extends Characteristic {
  static uuid = decls.uuid.ErrorDescriptionCharacteristic

  service = null

  constructor() {
    super({
      uuid: ErrorDescriptionCharacteristic.uuid,
      properties: ['notify', 'read'],
      descriptors: [
        new DescriptionDescriptor('Description of most recent error.')
      ]
    });
  }

  onReadRequest(offset, callback) {
    if (offset) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    callback(this.RESULT_SUCCESS, new Buffer(this.service.errorMessage, 'utf8'));
  }
}

class VibratePatternCharacteristic extends Characteristic {
  static uuid = decls.uuid.VibratePatternCharacteristic

  service = null

  constructor() {
    super({
      uuid: VibratePatternCharacteristic.uuid,
      properties: ['write', 'writeWithoutResponse'],
      descriptors: [
        new DescriptionDescriptor('16-bit LE on/off vibrate pattern.'),
      ]
    });
  }

  onWriteRequest(data, offset, withoutResponse, callback) {
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
  }
}

class ConfigService extends PrimaryService {
  static uuid = decls.uuid.ConfigService

  static STATE_UNREGISTERED = decls.state.UNREGISTERED
  static STATE_REGISTERING = decls.state.REGISTERING
  static STATE_REGISTERED = decls.state.REGISTERED
  static STATE_ERROR = decls.state.ERROR

  ap = null
  serverConnectionStatus = ''
  crypto = null
  errorMessage = ''
  secret = null
  unsecured = false
  rssi = -80
  resolveProximityPromise = null
  proximityPromise = null
  state = ConfigService.STATE_UNREGISTERED

  constructor(id) {
    super({
      uuid: ConfigService.uuid,
      characteristics: [
        new StateCharacteristic(),
        new ServerConnectionStatusCharacteristic(),
        new RssiCharacteristic(),
        new CurveCharacteristic(),
        new PeripheralKeyCharacteristic(),
        new CentralKeyCharacteristic(),
        new AccessPointCharacteristic(),
        new SecretCharacteristic(),
        new DeviceIdCharacteristic(),
        new ErrorDescriptionCharacteristic(),
        new VibratePatternCharacteristic(),
      ],
    });
    this.characteristics.forEach(characteristic => {
      characteristic.service = this;
    });
    this.deviceId = id;
    this.clearState();
  }

  clearState() {
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
  }

  changeState(state) {
    log.info('Changing state to ' + state);
    // TODO: notify
    this.state = state;
    this.emit('stateChange', state);
  }

  updateRssi(rssi) {
    this.rssi = rssi;
    if (rssi < -40) {
      return;
    }
    if (this.resolveProximityPromise) {
      this.resolveProximityPromise.call(null);
      this.resolveProximityPromise = null;
    }
  }

  getKey() {
    return this.crypto ? this.crypto.exportPublic() : '';
  }

  useECCurve(curve) {
    assert(!this.crypto);

    log.info('Using elliptic curve "' + curve + '"');
    this.crypto = crypto.create(curve);
    this.changeState(ConfigService.STATE_REGISTERING);
  }

  useCentralKey(key) {
    assert(this.crypto);

    log.info('Deriving session key from central key');
    this.crypto.deriveShared(key);
  }

  setAccessPoint(apEnc) {
    if (this.crypto) {
      log.info('Decrypting access point ...');
      this.ap = this.crypto.decrypt(apEnc);
    } else {
      this.ap = apEnc;
    }

    this.checkDone();
  }

  setSecret(secretEnc) {
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
  }

  checkDone() {
    if (!(this.ap && (this.secret || this.unsecured))) {
      return;
    }
    log.info('Finished registering wifi!');
    // TODO persist
    this.changeState(ConfigService.STATE_REGISTERED);
    // TODO notify to stop BLE service
  }
}

export default function(id) {
  return new ConfigService(id);
}
