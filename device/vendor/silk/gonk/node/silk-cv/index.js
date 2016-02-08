'use strict';

let nativepath;
if (process.platform === 'android') {
  nativepath = './build/silk-cv.node';
} else {
  nativepath = './build/Release/silk-cv.node';
}
module.exports = require(nativepath);
