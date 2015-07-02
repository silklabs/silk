/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let getprop = require('./util').getprop;

const ALL = new Set([
  'btle-peripheral',
  'wifi-needs-fwreload'
]);

function validateCaps(...caps) {
  let invalidCaps = caps.filter(cap => !ALL.has(cap));
  if (invalidCaps.length) {
    invalidCaps.forEach(cap => console.log('Invalid capability', cap));
    throw 'Invalid device capability configuration';
  }
  return new Set(caps);
}

function getDeviceCaps() {
  switch (getprop('ro.boot.hardware')) {
  case 'mako':
    return validateCaps('btle-peripheral', 'wifi-needs-fwreload');
  case 'shamu':
    return validateCaps('btle-peripheral');
  default:
    return validateCaps();
  }
}

module.exports = getDeviceCaps();
