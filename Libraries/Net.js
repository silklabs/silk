/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var { DeviceEventEmitter } = require('react-native');
var Buffer = require('buffer').Buffer;
var SLKUtil = require('NativeModules').SLKUtil;

module.exports = {
  getInfo: function() {
    return new Promise((resolve, reject) =>
                       SLKUtil.getNetInfo((err, info) =>
                                          err ? reject(err) : resolve(info)));
  },
};
