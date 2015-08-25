/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let getprop = require('./util').getprop;
let log = require('./log')('caps');

const ALL = new Set([
  'dev-input-hack',
  'notification-light',
]);

function validateCaps(...caps) {
  let invalidCaps = caps.filter(cap => !ALL.has(cap));
  if (invalidCaps.length) {
    invalidCaps.forEach(cap => log.warn('Invalid capability', cap));
    throw 'Invalid device capability configuration';
  }
  return new Set(caps);
}

function getDeviceCaps() {
  switch (getprop('ro.boot.hardware')) {
  case 'mako':
    return validateCaps('dev-input-hack', 'notification-light');
  case 'shamu':
    return validateCaps('dev-input-hack');
  default:
    return validateCaps();
  }
}

module.exports = getDeviceCaps();
