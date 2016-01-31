'use strict';

let nativepath;
if (process.platform === 'android') {
  nativepath = './build/silk-cmt.node';
} else {
  nativepath = './build/Release/silk-cmt.node';
}
module.exports = require(nativepath).NodeCmt;
