/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

'use strict';

let nativepath;
if (process.platform === 'android') {
  nativepath = './build/caffe.node';
} else {
  nativepath = '../build/Release/caffe.node';
}
module.exports = require(nativepath);
