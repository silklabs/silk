/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var ble = require('./ble');
var EventEmitter = require('events').EventEmitter;
var normUuid = require('./util').normUuid;

const debug = require('debug');
const log = {
  debug: debug('silk:ble-central:debug'),
  info: debug('silk:ble-central:info'),
  warn: debug('silk:ble-central:warn'),
};

function BLECentral() {
  EventEmitter.call(this);

  var self = this;
  ble.registerDisconnectListener(
    function(p) {
      self.emit('disconnect', p.id);
    },
    function(err) {
      log.warn('disconnect listener error: ' + err);
    }
  );
}

BLECentral.prototype = Object.create(EventEmitter.prototype);

BLECentral.prototype.startScanning = function() {
  var self = this;
  ble.startScan(
    [],
    function(p) {
      self.emit('discover', new PeripheralCordova(p));
    },
    function(err) {
      log.warn('startScanning error: ' + err);
    });
};

BLECentral.prototype.stopScanning = function() {
  ble.stopScan();
};

function PeripheralCordova(p) {
  var serviceUuids = (p.advertising && p.advertising.kCBAdvDataServiceUUIDs) ?
                     p.advertising.kCBAdvDataServiceUUIDs : [];
  this.id = p.id;
  this.name = p.name;
  this.rssi = p.rssi;
  this.advertisement = {
    services: serviceUuids,
    localName: ((p.advertising ? p.advertising.kCBAdvDataLocalName : null)
                || '???'),
  };
  this._charcs = { };
  this._pendingReads = { };
  this._pendingWrites = { };
}

PeripheralCordova.prototype = {
  connect: function() {
    var self = this;
    return new Promise(function(resolve, reject) {
      ble.connect(
        self.id,
        function(p) {
          p.characteristics.forEach(function(charc) {
            self._charcs[normUuid(charc.characteristic)] = charc;
          });
          return resolve();
        },
        function(err) {
          return reject(err);
        });
    });
  },

  disconnect: function() {
    var self = this;
    return new Promise(function(resolve, reject) {
      ble.disconnect(self.id, resolve, reject);
    });
  },

  readCharacteristic: function(uuid) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var charc = self._charcs[uuid];
      if (!charc) {
        return reject('Unknown characteristic "' + uuid + '"');
      }

      // ble doesn't handle multiple reads to same peripheral/uuid combo
      // grrrr... save and issue all resolves/rejects when promise is fulfilled
      if (!(uuid in self._pendingReads)) {
        self._pendingReads[uuid] = [];
      }
      var pendingRead = self._pendingReads[uuid];
      pendingRead.push({resolve: resolve, reject: reject});

      // TODO: check read-able?
      ble.read(
        self.id,
        charc.service,
        charc.characteristic,
        (data) => {
          pendingRead.forEach((pr) => pr.resolve(data));
          self._pendingReads[uuid] = [];
        },
        (err) => {
          pendingRead.forEach((pr) => pr.reject(err));
          self._pendingReads[uuid] = [];
        }
      );
    });
  },

  writeCharacteristic: function(uuid, data) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var charc = self._charcs[uuid];
      if (!charc) {
        return reject('Unknown characteristic "' + uuid + '"');
      }

      // ble doesn't handle multiple write to same peripheral/uuid combo,
      // show warning.
      if (uuid in self._pendingWrites) {
        log.warn('multiple pending writes not supported', self.id, uuid);
      }
      self._pendingWrites[uuid] = true; // note pending write

      // TODO: check write-able?
      // TODO: any benefit to using write-with-response?
      ble./*write*/writeWithoutResponse(
        self.id,
        charc.service,
        charc.characteristic,
        data,
        function() {
          delete self._pendingWrites[uuid];
          resolve(data);
        },
        function(err) {
          delete self._pendingWrites[uuid];
          reject(err);
        }
      );
    });
  },
};

module.exports = new BLECentral();
