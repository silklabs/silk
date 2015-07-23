/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let port = process.env.PORT || 5000;
let log = require('./log')('main');

require('./server')(port, function () {
  log.info('server is running at localhost: ' + port);
});
