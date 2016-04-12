/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 */

'use strict';

function leftPad(number, targetLength) {
  let output = number + '';
  while (output.length < targetLength) {
    output = '0' + output;
  }
  return output;
}

function createArray(length) {
  let arr = new Array(length || 0);
  let i = length;

  if (arguments.length > 1) {
    let args = Array.prototype.slice.call(arguments, 1);
    while(i--) {
      arr[length - 1 - i] = createArray.apply(this, args);
    }
  }
  return arr;
}

function printbbs(bb) {
  for (let i = 0; i < bb.length; i++) {
    console.log(`{${i}} = `);
    let bbi = bb[i];
    if (!Array.isArray(bbi)) {
      console.log(`    ${JSON.stringify(bbi)}`);
      continue;
    }
    if (!bbi.length) {
      console.log('  []');
    } else {
      console.log('  [');
    }
    for (let j = 0; j < bbi.length; j++) {
      console.log(`    ${JSON.stringify(bbi[j])}`);
    }
    if (bbi.length) {
      console.log('  ]');
    }
    console.log('');
  }
}

module.exports = {
  leftPad,
  createArray,
  printbbs,
};

