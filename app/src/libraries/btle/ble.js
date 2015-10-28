/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// (c) 2014 Don Coleman
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

var { DeviceEventEmitter, NativeModules } = require('react-native');
var BLECentral = NativeModules.BLECentral;
var Buffer = require('buffer').Buffer;

function NYI() {
    throw 'Not yet implemented, sorry!';
}

var scanListener = null;
function updateScanListener(fn) {
  if (scanListener) {
    scanListener.remove();
    scanListener = null;
  }
  if (fn) {
    scanListener = DeviceEventEmitter.addListener(
      'ble:peripheralDiscovered', p => fn(null, p));
  }
}

var disconnectListener = null;
function updateDisconnectListener(fn) {
  if (disconnectListener) {
    disconnectListener.remove();
    disconnectListener = null;
  }
  if (fn) {
    disconnectListener = DeviceEventEmitter.addListener(
      'ble:peripheralDisconnected', p => fn(null, p));
  }
}

var notifier = (success, failure) => (err, res) => (err ?
                                                    failure && failure(err)
                                                    : success && success(res));

function writeCharacteristic(device_id, service_uuid, characteristic_uuid,
                             value, awaitResponse, success, failure) {
  var valueB64 = value.toString('base64');
  BLECentral.write(device_id, service_uuid, characteristic_uuid, valueB64,
                   awaitResponse, notifier(success, failure));
}

module.exports = {
  scan: function (services, seconds, success, failure) {
    NYI();
  },

  startScan: function (services, success, failure) {
    updateScanListener(notifier(success, failure));
    BLECentral.startScan(services);
  },

  stopScan: function (success, failure) {
    updateScanListener(null);
    BLECentral.stopScan();
  },

  registerDisconnectListener: function (success, failure) {
    updateDisconnectListener(notifier(success, failure));
  },

  unregisterDisconnectListener: function (success, failure) {
    updateDisconnectListener(null);
  },

  connect: function (device_id, success, failure) {
    BLECentral.connect(device_id, notifier(success, failure));
  },

  disconnect: function (device_id, success, failure) {
    BLECentral.disconnect(device_id, notifier(success, failure));
  },

  // Characteristic value comes back as Buffer in the success callback
  read: function (device_id, service_uuid, characteristic_uuid,
                  success, failure) {
    var successBuffer = (dataB64) =>
          success && success(new Buffer(dataB64, 'base64'));
    BLECentral.read(device_id, service_uuid, characteristic_uuid,
                    notifier(successBuffer, failure));
  },

  write: function (device_id, service_uuid, characteristic_uuid, value,
                   success, failure) {
    writeCharacteristic(device_id, service_uuid, characteristic_uuid, value,
                        true/*response*/, success, failure);
  },

  writeWithoutResponse: function (device_id, service_uuid,
                                  characteristic_uuid, value,
                                  success, failure) {
    writeCharacteristic(device_id, service_uuid, characteristic_uuid, value,
                        false/*no response*/, success, failure);
  },

  // success callback is called on notification
  startNotification: function (device_id, service_uuid, characteristic_uuid, success, failure) {
    NYI();
  },

  stopNotification: function (device_id, service_uuid, characteristic_uuid, success, failure) {
    NYI();
  },

  // success callback is called on indication.
  indicate: function (device_id, service_uuid, characteristic_uuid, success, failure) {
    NYI();
  },

  isConnected: function (device_id, success, failure) {
    NYI();
  },

  isEnabled: function (success, failure) {
    NYI();
  }
};
