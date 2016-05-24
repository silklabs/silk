/*!
 * global-prefix <https://github.com/jonschlinkert/global-prefix>
 *
 * Copyright (c) 2015 Jon Schlinkert.
 * Licensed under the MIT license.
 */

'use strict';

/**
 * This is the code used internally by npm to
 * resolve the global prefix.
 */

var isWindows = require('is-windows');
var path = require('path');
var prefix;

if (process.env.PREFIX) {
  prefix = process.env.PREFIX;
} else if (isWindows === true || isWindows()) {
  // c:\node\node.exe --> prefix=c:\node\
  prefix = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm')
    : path.dirname(process.execPath);
} else {
  // /usr/local/bin/node --> prefix=/usr/local
  prefix = path.dirname(path.dirname(process.execPath));

  // destdir only is respected on Unix
  if (process.env.DESTDIR) {
    prefix = path.join(process.env.DESTDIR, prefix);
  }
}

module.exports = prefix;
