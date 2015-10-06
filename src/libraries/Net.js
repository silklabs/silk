/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let { NativeModules } = require('react-native');
let { SLKUtil } = NativeModules;

module.exports = {
  getInfo: function() {
    return new Promise((resolve, reject) =>
                       SLKUtil.getNetInfo((err, info) =>
                                          err ? reject(err) : resolve(info)));
  },
};
