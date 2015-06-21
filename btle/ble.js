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

"use strict";

var { DeviceEventEmitter } = require('react-native');
var BLECentral = require('NativeModules').BLECentral;

var stringToArrayBuffer = function(str) {
    var ret = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) {
        ret[i] = str.charCodeAt(i);
    }
    // TODO would it be better to return Uint8Array?
    return ret.buffer;
};

var base64ToArrayBuffer = function(b64) {
    return stringToArrayBuffer(atob(b64));
};

function massageMessageNativeToJs(message) {
    if (message.CDVType == 'ArrayBuffer') {
        message = base64ToArrayBuffer(message.data);
    }
    return message;
}

// Cordova 3.6 doesn't unwrap ArrayBuffers in nested data structures
// https://github.com/apache/cordova-js/blob/94291706945c42fd47fa632ed30f5eb811080e95/src/ios/exec.js#L107-L122
function convertToNativeJS(object) {
    Object.keys(object).forEach(function (key) {
        var value = object[key];
        object[key] = massageMessageNativeToJs(value);
        if (typeof(value) === 'object') {
            convertToNativeJS(value);
        }
    });
}

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
      'ble:peripheralDiscovered', p => {
        console.log('DISCOVERED PERIPHERAL');
        fn(p);
      });
  }
}

var connectionListeners = { };
function updateConnectionListener(device_id, fn) {
  if (connectionListeners[device_id]) {
    connectionListeners[device_id].remove();
    delete connectionListeners[device_id];
  }
  if (fn) {
    connectionListeners[device_id] = DeviceEventEmitter.addListener(
      'ble:peripheralConnectionChange', e => {
        if (e.uuid !== device_id) {
          return;
        }
        updateConnectionListener(device_id, null);
        switch (e.type) {
        case 'connect':
          return fn(null, e.peripheral);
        default:
          // If we disconnected while trying to connect, that's an
          // error.  And errors are always errors.
          return fn(e, null);
        }
      });
  }
}

var notifier = (success, failure) => (err, res) => (err ?
                                                    failure && failure(err)
                                                    : success && success(res));

module.exports = {
  scan: function (services, seconds, success, failure) {
    NYI();
  },

  startScan: function (services, success, failure) {
    updateScanListener(success);
    BLECentral.startScan(services);
  },

  stopScan: function (success, failure) {
    updateScanListener(null);
    BLECentral.stopScan();
  },

  list: function (success, failure) {
    NYI();
  },

  // NB: the semantics of these connect/disconnect listeners is a
  // little weird, but it's intended to match that of the
  // com.megster.ble plugin.
  connect: function (device_id, success, failure) {
    updateConnectionListener(device_id, notifier(success, failure));
    BLECentral.connect(device_id);
  },

  disconnect: function (device_id, success, failure) {
    updateConnectionListener(device_id, null);
    BLECentral.disconnect(device_id);
  },

    // Characteristic value comes back as ArrayBuffer in the success callback
    read: function (device_id, service_uuid, characteristic_uuid, success, failure) {
        cordova.exec(success, failure, 'BLE', 'read', [device_id, service_uuid, characteristic_uuid]);
    },

    // value must be an ArrayBuffer
    write: function (device_id, service_uuid, characteristic_uuid, value, success, failure) {
        cordova.exec(success, failure, 'BLE', 'write', [device_id, service_uuid, characteristic_uuid, value]);
    },

    // value must be an ArrayBuffer
    writeWithoutResponse: function (device_id, service_uuid, characteristic_uuid, value, success, failure) {
        cordova.exec(success, failure, 'BLE', 'writeWithoutResponse', [device_id, service_uuid, characteristic_uuid, value]);
    },

    // value must be an ArrayBuffer
    writeCommand: function (device_id, service_uuid, characteristic_uuid, value, success, failure) {
        console.log("WARNING: writeCommand is deprecated, use writeWithoutResponse");
        cordova.exec(success, failure, 'BLE', 'writeWithoutResponse', [device_id, service_uuid, characteristic_uuid, value]);
    },

    // success callback is called on notification
    notify: function (device_id, service_uuid, characteristic_uuid, success, failure) {
        console.log("WARNING: notify is deprecated, use startNotification");
        cordova.exec(success, failure, 'BLE', 'startNotification', [device_id, service_uuid, characteristic_uuid]);
    },

    // success callback is called on notification
    startNotification: function (device_id, service_uuid, characteristic_uuid, success, failure) {
        cordova.exec(success, failure, 'BLE', 'startNotification', [device_id, service_uuid, characteristic_uuid]);
    },

    // success callback is called when the descriptor 0x2902 is written
    stopNotification: function (device_id, service_uuid, characteristic_uuid, success, failure) {
        cordova.exec(success, failure, 'BLE', 'stopNotification', [device_id, service_uuid, characteristic_uuid]);
    },

    // success callback is called on indication.
    indicate: function (device_id, service_uuid, characteristic_uuid, success, failure) {
        cordova.exec(success, failure, 'BLE', 'indicate', [device_id, service_uuid, characteristic_uuid]);
    },

    isConnected: function (device_id, success, failure) {
        cordova.exec(success, failure, 'BLE', 'isConnected', [device_id]);
    },

    isEnabled: function (success, failure) {
        cordova.exec(success, failure, 'BLE', 'isEnabled', []);
    }

};

var TEST = false;//true;
if (TEST) {
  var BLE = module.exports;
  BLE.startScan([ '00000000-1111-2222-3333-444444444444', ],
                p => console.log('DISCOVERED', p),
                err => console.log('SCAN ERROR:', err));
  setTimeout(() => {
    BLE.stopScan();
    BLE.connect('00000000-1111-2222-3333-444444444444',
                () => console.log('CONNECTED'),
                err => console.log('CONNECTED ERROR', err));
    setTimeout(() => {
      BLE.disconnect('00000000-1111-2222-3333-444444444444',
                     () => console.log('CONNECTED'),
                     err => console.log('CONNECTED ERROR', err));
    }, 1000);
  }, 1000);
}
