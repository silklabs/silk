/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

require('../device-keygen.js');

var localStorage = require('localStorage');
console.log("localStorage.setItem('device-key', JSON.stringify(" + localStorage.getItem('device-key') + ");");
