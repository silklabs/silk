/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var ble = require('./ble');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var normUuid = require('./util').normUuid;

function BLECentral() {
  EventEmitter.call(this);
}
util.inherits(BLECentral, EventEmitter);

BLECentral.prototype.startScanning = function() {
  var self = this;
  ble.startScan(
    [],
    function(p) {
      self.emit('discover', new PeripheralCordova(p));
    },
    function(err) {
      console.log('Error: '+ err);
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
      ble.disconnect(self.id,
                     function() { resolve(); },
                     function(err) { reject(err); });
    });
  },

  readCharacteristic: function(uuid) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var charc = self._charcs[uuid];
      if (!charc) {
        return reject('Unknown characteristic "'+ uuid +'"');
      }
      // TODO: check read-able?
      ble.read(self.id, charc.service, charc.characteristic,
               function(data) {
                 resolve(data);
               },
               function(err) {
                 reject(err);
               });
    });
  },

  writeCharacteristic: function(uuid, data) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var charc = self._charcs[uuid];
      if (!charc) {
        return reject('Unknown characteristic "'+ uuid +'"');
      }
      // TODO: check write-able?
      // TODO: any benefit to using write-with-response?
      ble./*write*/writeWithoutResponse(
        self.id, charc.service, charc.characteristic, data,
        function() {
          resolve();
        },
        function(err) {
          reject(err);
        });
    });
  },
};

module.exports = new BLECentral();
